// ============================================================
// TradeMind AI - Mean Reversion Strategy
// ============================================================
// Features: Bollinger Bands, Z-score entry/exit, RSI
// confirmation, regime detection, adaptive lookback.
// ============================================================
import { randomUUID } from 'crypto';
import type { FusedSignal } from '../types';
import { eventBus } from '../core/event-bus';

export interface MeanReversionConfig {
  symbol: string;
  lookbackPeriod: number;
  bbPeriod: number;
  bbStdDev: number;
  zScoreEntry: number;
  zScoreExit: number;
  rsiPeriod: number;
  rsiConfirmLow: number;
  rsiConfirmHigh: number;
  volumeWeight: boolean;
  positionSizePct: number;
  stopLossPct: number;
  regimeAdaptive: boolean;
  cooldownMs: number;
}

export interface MRIndicators {
  mean: number; stdDev: number; upperBand: number; lowerBand: number;
  zScore: number; rsi: number; vwap: number;
  isOversold: boolean; isOverbought: boolean; regime: 'RANGING' | 'TRENDING_UP' | 'TRENDING_DOWN';
}

export interface MRState {
  isActive: boolean; indicators: MRIndicators | null;
  position: { side: 'LONG' | 'SHORT'; entryPrice: number; entryZScore: number; quantity: number; targetPrice: number } | null;
  totalTrades: number; winningTrades: number; totalPnl: number; lastTradeTime: number;
}

interface MRTrade { orderId: string; side: string; entryPrice: number; exitPrice: number; zEntry: number; zExit: number; pnl: number; duration: number; timestamp: number; }

export class MeanReversionStrategy {
  private configs = new Map<string, MeanReversionConfig>();
  private states = new Map<string, MRState>();
  private prices = new Map<string, number[]>();
  private volumes = new Map<string, number[]>();
  private trades = new Map<string, MRTrade[]>();
  private interval: ReturnType<typeof setInterval> | null = null;

  start(): void {
    eventBus.subscribe('signal.fused', (e) => {
      const s = e.payload as FusedSignal;
      const st = this.states.get(s.symbol);
      if (!st?.isActive) return;
      const price = s.contributingSignals[0]?.metadata?.price as number;
      const vol = s.contributingSignals[0]?.metadata?.volume as number;
      if (price) this.push(this.prices, s.symbol, price);
      if (vol) this.push(this.volumes, s.symbol, vol);
    });
    this.interval = setInterval(() => this.evaluateAll(), 20000);
    console.log('[MeanReversion] Started');
  }
  stop(): void { if (this.interval) { clearInterval(this.interval); this.interval = null; } }

  addStrategy(cfg: MeanReversionConfig): void {
    this.configs.set(cfg.symbol, cfg);
    this.states.set(cfg.symbol, { isActive: true, indicators: null, position: null, totalTrades: 0, winningTrades: 0, totalPnl: 0, lastTradeTime: 0 });
    this.prices.set(cfg.symbol, []); this.volumes.set(cfg.symbol, []); this.trades.set(cfg.symbol, []);
    console.log(`[MeanReversion] ${cfg.symbol}: lookback=${cfg.lookbackPeriod}, BB=${cfg.bbPeriod}/${cfg.bbStdDev}σ`);
  }

  static defaultConfig(symbol: string, overrides?: Partial<MeanReversionConfig>): MeanReversionConfig {
    return {
      symbol, lookbackPeriod: 50, bbPeriod: 20, bbStdDev: 2.0, zScoreEntry: 2.0, zScoreExit: 0.5,
      rsiPeriod: 14, rsiConfirmLow: 30, rsiConfirmHigh: 70, volumeWeight: true,
      positionSizePct: 10, stopLossPct: 8, regimeAdaptive: true, cooldownMs: 300000, ...overrides,
    };
  }

  private calcIndicators(symbol: string): MRIndicators {
    const p = this.prices.get(symbol) || [];
    const v = this.volumes.get(symbol) || [];
    const cfg = this.configs.get(symbol)!;
    const cur = p[p.length - 1] || 0;

    const lb = cfg.regimeAdaptive ? this.adaptiveLB(p, cfg.lookbackPeriod) : cfg.lookbackPeriod;
    const recent = p.slice(-lb);
    const mean = cfg.volumeWeight ? this.vwap(p, v, lb) : this.avg(recent);
    const sd = this.stddev(recent, mean);

    const bbP = p.slice(-cfg.bbPeriod);
    const bbMean = this.avg(bbP);
    const bbSd = this.stddev(bbP, bbMean);
    const upper = bbMean + cfg.bbStdDev * bbSd;
    const lower = bbMean - cfg.bbStdDev * bbSd;
    const z = sd > 0 ? (cur - mean) / sd : 0;
    const rsi = this.rsi(p, cfg.rsiPeriod);
    const vwapVal = v.length ? this.vwap(p, v, 50) : cur;
    const regime = this.detectRegime(p, lb);

    return {
      mean, stdDev: sd, upperBand: upper, lowerBand: lower, zScore: z, rsi, vwap: vwapVal,
      isOversold: z < -cfg.zScoreEntry || rsi < cfg.rsiConfirmLow,
      isOverbought: z > cfg.zScoreEntry || rsi > cfg.rsiConfirmHigh, regime,
    };
  }

  private evaluateAll(): void {
    for (const [symbol, cfg] of this.configs) {
      const state = this.states.get(symbol);
      if (!state?.isActive) continue;
      const ind = this.calcIndicators(symbol);
      state.indicators = ind;
      const price = this.prices.get(symbol)?.slice(-1)[0] || 0;

      if (!state.position) {
        if (Date.now() - state.lastTradeTime < cfg.cooldownMs) continue;
        if (ind.regime !== 'RANGING') continue;
        if (ind.isOversold && ind.rsi < cfg.rsiConfirmLow) this.enter(symbol, 'LONG', price, ind.zScore);
        else if (ind.isOverbought && ind.rsi > cfg.rsiConfirmHigh) this.enter(symbol, 'SHORT', price, ind.zScore);
      } else {
        this.checkExits(symbol, price, ind);
      }
    }
  }

  private enter(symbol: string, side: 'LONG' | 'SHORT', price: number, z: number): void {
    const cfg = this.configs.get(symbol)!;
    const state = this.states.get(symbol)!;
    const ind = state.indicators!;
    const qty = (cfg.positionSizePct * 1000) / price;
    const target = ind.mean;
    state.position = { side, entryPrice: price, entryZScore: z, quantity: qty, targetPrice: target };
    state.lastTradeTime = Date.now();
    eventBus.emit({ type: 'strategy.decision', source: 'mean-reversion', timestamp: Date.now(), payload: { strategy: 'mean_reversion', action: side === 'LONG' ? 'buy' : 'sell', orderId: randomUUID(), symbol, price, quantity: qty, zScore: z, target, mean: ind.mean, regime: ind.regime } });
    console.log(`[MeanReversion] ${symbol}: ${side} @ $${price.toFixed(4)}, z=${z.toFixed(2)}, target=$${target.toFixed(4)}`);
  }

  private checkExits(symbol: string, price: number, ind: MRIndicators): void {
    const cfg = this.configs.get(symbol)!;
    const state = this.states.get(symbol)!;
    const pos = state.position!;
    let reason: string | null = null;

    if (pos.side === 'LONG' && ind.zScore >= cfg.zScoreExit) reason = 'z_reverted';
    else if (pos.side === 'SHORT' && ind.zScore <= -cfg.zScoreExit) reason = 'z_reverted';
    if (pos.side === 'LONG' && price >= pos.targetPrice) reason = 'target_hit';
    else if (pos.side === 'SHORT' && price <= pos.targetPrice) reason = 'target_hit';

    const pnlPct = pos.side === 'LONG' ? ((price - pos.entryPrice) / pos.entryPrice) * 100 : ((pos.entryPrice - price) / pos.entryPrice) * 100;
    if (pnlPct <= -cfg.stopLossPct) reason = 'stop_loss';
    if (pos.side === 'LONG' && ind.regime === 'TRENDING_DOWN') reason = 'regime_change';
    else if (pos.side === 'SHORT' && ind.regime === 'TRENDING_UP') reason = 'regime_change';

    if (reason) this.exit(symbol, price, ind.zScore, reason);
  }

  private exit(symbol: string, price: number, z: number, reason: string): void {
    const state = this.states.get(symbol)!;
    const pos = state.position!;
    const pnl = pos.side === 'LONG' ? (price - pos.entryPrice) * pos.quantity : (pos.entryPrice - price) * pos.quantity;
    eventBus.emit({ type: 'strategy.decision', source: 'mean-reversion', timestamp: Date.now(), payload: { strategy: 'mean_reversion', action: pos.side === 'LONG' ? 'sell' : 'buy', orderId: randomUUID(), symbol, price, quantity: pos.quantity, pnl, zEntry: pos.entryZScore, zExit: z, reason } });
    state.totalTrades++; if (pnl > 0) state.winningTrades++; state.totalPnl += pnl;
    (this.trades.get(symbol) || []).push({ orderId: randomUUID(), side: pos.side === 'LONG' ? 'SELL' : 'BUY', entryPrice: pos.entryPrice, exitPrice: price, zEntry: pos.entryZScore, zExit: z, pnl, duration: Date.now() - state.lastTradeTime, timestamp: Date.now() });
    const wr = state.totalTrades > 0 ? ((state.winningTrades / state.totalTrades) * 100).toFixed(0) : '0';
    console.log(`[MeanReversion] ${symbol}: Exit @ $${price.toFixed(4)} (${reason}), PnL=$${pnl.toFixed(2)}, win=${wr}%`);
    state.position = null;
  }

  // ---- Math ----
  private avg(d: number[]): number { return d.length ? d.reduce((a, b) => a + b, 0) / d.length : 0; }
  private stddev(d: number[], m: number): number { if (d.length < 2) return 0; return Math.sqrt(d.reduce((s, v) => s + (v - m) ** 2, 0) / (d.length - 1)); }
  private vwap(p: number[], v: number[], n: number): number {
    const len = Math.min(p.length, v.length, n); if (!len) return p[p.length - 1] || 0;
    let pv = 0, tv = 0; for (let i = 0; i < len; i++) { const pi = p.length - len + i, vi = v.length - len + i; pv += p[pi] * v[vi]; tv += v[vi]; }
    return tv > 0 ? pv / tv : p[p.length - 1];
  }
  private rsi(d: number[], p: number): number {
    if (d.length < p + 1) return 50;
    const c: number[] = []; for (let i = 1; i < d.length; i++) c.push(d[i] - d[i - 1]);
    const r = c.slice(-p); const g = r.filter(x => x > 0); const l = r.filter(x => x < 0).map(Math.abs);
    return 100 - 100 / (1 + (g.length ? g.reduce((a, b) => a + b, 0) / p : 0) / (l.length ? l.reduce((a, b) => a + b, 0) / p : 0.001));
  }
  private detectRegime(p: number[], n: number): 'RANGING' | 'TRENDING_UP' | 'TRENDING_DOWN' {
    if (p.length < n) return 'RANGING';
    const r = p.slice(-n); const change = ((r[r.length - 1] - r[0]) / r[0]) * 100;
    const cv = this.stddev(r, this.avg(r)) / this.avg(r);
    if (cv < 0.02) return 'RANGING'; if (change > 5) return 'TRENDING_UP'; if (change < -5) return 'TRENDING_DOWN';
    return 'RANGING';
  }
  private adaptiveLB(p: number[], base: number): number {
    if (p.length < base * 2) return base;
    const regime = this.detectRegime(p, base * 2);
    return regime !== 'RANGING' ? Math.max(10, Math.floor(base * 0.6)) : base;
  }
  private push(m: Map<string, number[]>, k: string, v: number) { const a = m.get(k) || []; a.push(v); if (a.length > 500) a.shift(); m.set(k, a); }

  getState(s: string) { return this.states.get(s) || null; }
  getIndicators(s: string) { return this.states.get(s)?.indicators || null; }
  getHistory(s: string, n = 50) { return (this.trades.get(s) || []).slice(-n); }
  setActive(s: string, a: boolean) { const st = this.states.get(s); if (st) st.isActive = a; }
}
