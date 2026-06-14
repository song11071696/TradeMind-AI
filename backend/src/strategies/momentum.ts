// ============================================================
// TradeMind AI - Momentum Trading Strategy
// ============================================================
// Features: Multi-indicator momentum detection (RSI, MACD,
// MA crossover, ADX), trailing stops, volume confirmation.
// ============================================================
import { randomUUID } from 'crypto';
import type { FusedSignal } from '../types';
import { eventBus } from '../core/event-bus';

export interface MomentumConfig {
  symbol: string;
  fastPeriod: number;
  slowPeriod: number;
  rsiPeriod: number;
  rsiOverbought: number;
  rsiOversold: number;
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
  adxThreshold: number;
  volumeMultiplier: number;
  positionSizePct: number;
  trailingStopPct: number;
  takeProfitPct: number;
  momentumFadeThreshold: number;
}

export interface MomentumIndicators {
  fastMA: number; slowMA: number; rsi: number;
  macdLine: number; macdSignal: number; macdHistogram: number;
  adx: number; volumeRatio: number; momentumScore: number;
}

export interface MomentumState {
  isActive: boolean;
  indicators: MomentumIndicators | null;
  position: { side: 'LONG' | 'SHORT'; entryPrice: number; quantity: number; peak: number; trailingStop: number } | null;
  totalTrades: number; winningTrades: number; totalPnl: number;
}

interface TradeRecord { orderId: string; side: string; price: number; quantity: number; reason: string; pnl: number; timestamp: number; }

export class MomentumStrategy {
  private configs = new Map<string, MomentumConfig>();
  private states = new Map<string, MomentumState>();
  private priceHistory = new Map<string, number[]>();
  private volumeHistory = new Map<string, number[]>();
  private trades = new Map<string, TradeRecord[]>();
  private interval: ReturnType<typeof setInterval> | null = null;

  start(): void {
    eventBus.subscribe('signal.fused', (e) => this.processSignal(e.payload as FusedSignal));
    this.interval = setInterval(() => this.evaluateAll(), 30000);
    console.log('[Momentum] Started');
  }
  stop(): void { if (this.interval) { clearInterval(this.interval); this.interval = null; } }

  addStrategy(cfg: MomentumConfig): void {
    this.configs.set(cfg.symbol, cfg);
    this.states.set(cfg.symbol, { isActive: true, indicators: null, position: null, totalTrades: 0, winningTrades: 0, totalPnl: 0 });
    this.priceHistory.set(cfg.symbol, []);
    this.volumeHistory.set(cfg.symbol, []);
    this.trades.set(cfg.symbol, []);
    console.log(`[Momentum] ${cfg.symbol}: fast=${cfg.fastPeriod}, slow=${cfg.slowPeriod}`);
  }

  static defaultConfig(symbol: string, overrides?: Partial<MomentumConfig>): MomentumConfig {
    return {
      symbol, fastPeriod: 10, slowPeriod: 30, rsiPeriod: 14, rsiOverbought: 70, rsiOversold: 30,
      macdFast: 12, macdSlow: 26, macdSignal: 9, adxThreshold: 25, volumeMultiplier: 1.5,
      positionSizePct: 10, trailingStopPct: 5, takeProfitPct: 15, momentumFadeThreshold: 0.2, ...overrides,
    };
  }

  private processSignal(signal: FusedSignal): void {
    const state = this.states.get(signal.symbol);
    if (!state?.isActive) return;
    const price = signal.contributingSignals[0]?.metadata?.price as number;
    const vol = signal.contributingSignals[0]?.metadata?.volume as number;
    if (price) this.push(this.priceHistory, signal.symbol, price, 500);
    if (vol) this.push(this.volumeHistory, signal.symbol, vol, 500);
    state.indicators = this.calcIndicators(signal.symbol);
    this.evaluate(signal.symbol, signal);
  }

  private calcIndicators(symbol: string): MomentumIndicators {
    const p = this.priceHistory.get(symbol) || [];
    const v = this.volumeHistory.get(symbol) || [];
    const cfg = this.configs.get(symbol)!;
    const fastMA = this.sma(p, cfg.fastPeriod);
    const slowMA = this.sma(p, cfg.slowPeriod);
    const rsi = this.rsi(p, cfg.rsiPeriod);
    const { macdLine, signalLine, histogram } = this.macd(p, cfg.macdFast, cfg.macdSlow, cfg.macdSignal);
    const adx = this.adx(p, 14);
    const avgVol = v.slice(-20).reduce((a, b) => a + b, 0) / Math.max(v.slice(-20).length, 1);
    const volRatio = avgVol > 0 ? (v[v.length - 1] || 0) / avgVol : 1;

    let score = 0;
    score += fastMA > slowMA ? 0.25 : -0.25;
    score += rsi > 50 ? (rsi - 50) / 100 : -(50 - rsi) / 100;
    score += histogram > 0 ? 0.2 : -0.2;
    if (adx > cfg.adxThreshold) score += fastMA > slowMA ? 0.15 : -0.15;

    return { fastMA, slowMA, rsi, macdLine, macdSignal: signalLine, macdHistogram: histogram, adx, volumeRatio: volRatio, momentumScore: Math.max(-1, Math.min(1, score)) };
  }

  private evaluate(symbol: string, signal: FusedSignal): void {
    const cfg = this.configs.get(symbol)!;
    const state = this.states.get(symbol)!;
    const ind = state.indicators!;
    const price = this.price(symbol);

    if (!state.position) {
      if (ind.momentumScore > cfg.momentumFadeThreshold && ind.rsi < cfg.rsiOverbought && ind.adx > cfg.adxThreshold && ind.volumeRatio >= cfg.volumeMultiplier)
        this.enter(symbol, 'LONG', price);
      else if (ind.momentumScore < -cfg.momentumFadeThreshold && ind.rsi > cfg.rsiOversold && ind.adx > cfg.adxThreshold && ind.volumeRatio >= cfg.volumeMultiplier)
        this.enter(symbol, 'SHORT', price);
    } else {
      this.checkExits(symbol, price);
    }
  }

  private enter(symbol: string, side: 'LONG' | 'SHORT', price: number): void {
    const cfg = this.configs.get(symbol)!;
    const state = this.states.get(symbol)!;
    const qty = (cfg.positionSizePct * 1000) / price;
    state.position = { side, entryPrice: price, quantity: qty, peak: price, trailingStop: side === 'LONG' ? price * (1 - cfg.trailingStopPct / 100) : price * (1 + cfg.trailingStopPct / 100) };
    eventBus.emit({ type: 'strategy.decision', source: 'momentum', timestamp: Date.now(), payload: { strategy: 'momentum', action: side === 'LONG' ? 'buy' : 'sell', orderId: randomUUID(), symbol, price, quantity: qty, score: state.indicators!.momentumScore } });
    console.log(`[Momentum] ${symbol}: ${side} @ $${price.toFixed(4)}, score=${state.indicators!.momentumScore.toFixed(2)}`);
  }

  private checkExits(symbol: string, price: number): void {
    const cfg = this.configs.get(symbol)!;
    const state = this.states.get(symbol)!;
    const pos = state.position!;
    const ind = state.indicators!;

    if (pos.side === 'LONG') { pos.peak = Math.max(pos.peak, price); pos.trailingStop = Math.max(pos.trailingStop, pos.peak * (1 - cfg.trailingStopPct / 100)); }
    else { pos.peak = Math.min(pos.peak, price); pos.trailingStop = Math.min(pos.trailingStop, pos.peak * (1 + cfg.trailingStopPct / 100)); }

    let reason: string | null = null;
    const pnlPct = pos.side === 'LONG' ? ((price - pos.entryPrice) / pos.entryPrice) * 100 : ((pos.entryPrice - price) / pos.entryPrice) * 100;

    if (pos.side === 'LONG' && price <= pos.trailingStop) reason = 'trailing_stop';
    else if (pos.side === 'SHORT' && price >= pos.trailingStop) reason = 'trailing_stop';
    if (pnlPct >= cfg.takeProfitPct) reason = 'take_profit';
    if (pos.side === 'LONG' && ind.momentumScore < -cfg.momentumFadeThreshold) reason = 'momentum_fade';
    else if (pos.side === 'SHORT' && ind.momentumScore > cfg.momentumFadeThreshold) reason = 'momentum_fade';

    if (reason) this.exit(symbol, price, reason);
  }

  private exit(symbol: string, price: number, reason: string): void {
    const state = this.states.get(symbol)!;
    const pos = state.position!;
    const pnl = pos.side === 'LONG' ? (price - pos.entryPrice) * pos.quantity : (pos.entryPrice - price) * pos.quantity;
    eventBus.emit({ type: 'strategy.decision', source: 'momentum', timestamp: Date.now(), payload: { strategy: 'momentum', action: pos.side === 'LONG' ? 'sell' : 'buy', orderId: randomUUID(), symbol, price, quantity: pos.quantity, pnl, reason } });
    state.totalTrades++; if (pnl > 0) state.winningTrades++; state.totalPnl += pnl;
    (this.trades.get(symbol) || []).push({ orderId: randomUUID(), side: pos.side === 'LONG' ? 'SELL' : 'BUY', price, quantity: pos.quantity, reason, pnl, timestamp: Date.now() });
    const wr = state.totalTrades > 0 ? ((state.winningTrades / state.totalTrades) * 100).toFixed(0) : '0';
    console.log(`[Momentum] ${symbol}: Exit @ $${price.toFixed(4)} (${reason}), PnL=$${pnl.toFixed(2)}, win=${wr}%`);
    state.position = null;
  }

  private evaluateAll(): void {
    for (const [symbol] of this.configs) {
      const state = this.states.get(symbol);
      if (!state?.isActive) continue;
      state.indicators = this.calcIndicators(symbol);
      if (state.position) this.checkExits(symbol, this.price(symbol));
    }
  }

  // ---- Math helpers ----
  private sma(d: number[], p: number): number { if (d.length < p) return d[d.length - 1] || 0; return d.slice(-p).reduce((a, b) => a + b, 0) / p; }
  private ema(d: number[], p: number): number[] { if (!d.length) return []; const k = 2 / (p + 1); const r = [d[0]]; for (let i = 1; i < d.length; i++) r.push(d[i] * k + r[i - 1] * (1 - k)); return r; }
  private rsi(d: number[], p: number): number {
    if (d.length < p + 1) return 50;
    const c: number[] = []; for (let i = 1; i < d.length; i++) c.push(d[i] - d[i - 1]);
    const r = c.slice(-p); const g = r.filter(x => x > 0); const l = r.filter(x => x < 0).map(Math.abs);
    const ag = g.length ? g.reduce((a, b) => a + b, 0) / p : 0; const al = l.length ? l.reduce((a, b) => a + b, 0) / p : 0.001;
    return 100 - 100 / (1 + ag / al);
  }
  private macd(d: number[], f: number, s: number, sig: number) {
    const ef = this.ema(d, f), es = this.ema(d, s);
    const ml: number[] = []; for (let i = 0; i < d.length; i++) ml.push((ef[i] || 0) - (es[i] || 0));
    const sl = this.ema(ml, sig); const L = ml.length - 1;
    return { macdLine: ml[L] || 0, signalLine: sl[L] || 0, histogram: (ml[L] || 0) - (sl[L] || 0) };
  }
  private adx(d: number[], p: number): number {
    // Proper ADX calculation using Wilder's smoothing method
    // Requires: True Range, +DM, -DM, DI+, DI-, DX, then smooth DX
    if (d.length < p * 2 + 1) return 20;
    const len = d.length;

    // Step 1: Calculate True Range, +DM, -DM for each bar
    const tr: number[] = [];
    const plusDM: number[] = [];
    const minusDM: number[] = [];

    for (let i = 1; i < len; i++) {
      // True Range: max of |high-low|, |high-prevClose|, |low-prevClose|
      // Since we only have close prices, approximate with scaled absolute change
      tr.push(Math.abs(d[i] - d[i - 1]) * 2); // Scale up for volatility proxy

      // Directional Movement (using price direction as proxy)
      const move = d[i] - d[i - 1];
      plusDM.push(move > 0 ? move : 0);
      minusDM.push(move < 0 ? -move : 0);
    }

    // Step 2: Wilder's smoothing (EMA with period p, alpha = 1/p)
    const smoothTR: number[] = [];
    const smoothPlusDM: number[] = [];
    const smoothMinusDM: number[] = [];

    // Initialize with first p values average
    let sTR = tr.slice(0, p).reduce((a, b) => a + b, 0) / p;
    let sPDM = plusDM.slice(0, p).reduce((a, b) => a + b, 0) / p;
    let sMDM = minusDM.slice(0, p).reduce((a, b) => a + b, 0) / p;

    smoothTR.push(sTR);
    smoothPlusDM.push(sPDM);
    smoothMinusDM.push(sMDM);

    for (let i = p; i < tr.length; i++) {
      sTR = sTR - sTR / p + tr[i];
      sPDM = sPDM - sPDM / p + plusDM[i];
      sMDM = sMDM - sMDM / p + minusDM[i];
      smoothTR.push(sTR);
      smoothPlusDM.push(sPDM);
      smoothMinusDM.push(sMDM);
    }

    // Step 3: Calculate DI+ and DI-
    const dx: number[] = [];
    for (let i = 0; i < smoothTR.length; i++) {
      const diPlus = smoothTR[i] > 0 ? (smoothPlusDM[i] / smoothTR[i]) * 100 : 0;
      const diMinus = smoothTR[i] > 0 ? (smoothMinusDM[i] / smoothTR[i]) * 100 : 0;
      const diSum = diPlus + diMinus;
      dx.push(diSum > 0 ? (Math.abs(diPlus - diMinus) / diSum) * 100 : 0);
    }

    // Step 4: Smooth DX to get ADX (Wilder's smoothing)
    if (dx.length < p) return dx.length > 0 ? dx[dx.length - 1] : 20;
    let adx = dx.slice(0, p).reduce((a, b) => a + b, 0) / p;
    for (let i = p; i < dx.length; i++) {
      adx = (adx * (p - 1) + dx[i]) / p;
    }

    return Math.min(100, Math.max(0, adx));
  }
  private push(map: Map<string, number[]>, key: string, val: number, max: number) {
    const arr = map.get(key) || []; arr.push(val); if (arr.length > max) arr.shift(); map.set(key, arr);
  }
  private price(symbol: string): number { const h = this.priceHistory.get(symbol); return h?.length ? h[h.length - 1] : 100; }

  getState(s: string) { return this.states.get(s) || null; }
  getIndicators(s: string) { return this.states.get(s)?.indicators || null; }
  getHistory(s: string, n = 50) { return (this.trades.get(s) || []).slice(-n); }
  setActive(s: string, a: boolean) { const st = this.states.get(s); if (st) st.isActive = a; }
}
