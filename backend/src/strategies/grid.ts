// ============================================================
// TradeMind AI - Grid Trading Strategy
// ============================================================
// Features: Automated buy/sell at predefined price levels,
// dynamic grid recalculation, signal-aware bias adjustment.
// ============================================================
import { randomUUID } from 'crypto';
import type { FusedSignal } from '../types';
import { eventBus } from '../core/event-bus';

export interface GridConfig {
  symbol: string;
  upperPrice: number;
  lowerPrice: number;
  gridCount: number;
  orderSizePerGrid: number;
  takeProfitPerGrid: number;
  stopLossPct: number;
  volatilityAdjust: boolean;
  signalAware: boolean;
  rebalanceThresholdPct: number;
}

export interface GridLevel {
  price: number;
  side: 'BUY' | 'SELL';
  status: 'PENDING' | 'FILLED';
  filledPrice: number | null;
  pnl: number;
}

export interface GridState {
  isActive: boolean;
  levels: GridLevel[];
  totalFilled: number;
  totalPnl: number;
  biasDirection: 'NEUTRAL' | 'BULLISH' | 'BEARISH';
  currentPrice: number;
  gridUpper: number;
  gridLower: number;
}

interface GridFillRecord {
  orderId: string;
  level: number;
  side: 'BUY' | 'SELL';
  price: number;
  quantity: number;
  pnl: number;
  timestamp: number;
}

export class GridTradingStrategy {
  private configs = new Map<string, GridConfig>();
  private states = new Map<string, GridState>();
  private fillHistory = new Map<string, GridFillRecord[]>();
  private priceBuffer = new Map<string, number[]>();
  private interval: ReturnType<typeof setInterval> | null = null;

  start(): void {
    eventBus.subscribe('signal.fused', (e) => this.processSignal(e.payload as FusedSignal));
    this.interval = setInterval(() => this.checkAllGrids(), 15000);
    console.log('[Grid] Started');
  }

  stop(): void { if (this.interval) { clearInterval(this.interval); this.interval = null; } }

  addGrid(cfg: GridConfig): void {
    this.configs.set(cfg.symbol, cfg);
    const step = (cfg.upperPrice - cfg.lowerPrice) / cfg.gridCount;
    const mid = (cfg.upperPrice + cfg.lowerPrice) / 2;
    const levels: GridLevel[] = [];
    for (let i = 0; i <= cfg.gridCount; i++) {
      const p = parseFloat((cfg.lowerPrice + step * i).toFixed(6));
      levels.push({ price: p, side: p < mid ? 'BUY' : 'SELL', status: 'PENDING', filledPrice: null, pnl: 0 });
    }
    this.states.set(cfg.symbol, {
      isActive: true, levels, totalFilled: 0, totalPnl: 0,
      biasDirection: 'NEUTRAL', currentPrice: mid, gridUpper: cfg.upperPrice, gridLower: cfg.lowerPrice,
    });
    this.fillHistory.set(cfg.symbol, []);
    console.log(`[Grid] ${cfg.symbol}: ${cfg.gridCount} levels [${cfg.lowerPrice}–${cfg.upperPrice}]`);
  }

  static defaultConfig(symbol: string, price: number, overrides?: Partial<GridConfig>): GridConfig {
    const r = price * 0.15;
    return {
      symbol, upperPrice: price + r, lowerPrice: price - r, gridCount: 20, orderSizePerGrid: 50,
      takeProfitPerGrid: 1.5, stopLossPct: 20, volatilityAdjust: true, signalAware: true,
      rebalanceThresholdPct: 10, ...overrides,
    };
  }

  private processSignal(signal: FusedSignal): void {
    const state = this.states.get(signal.symbol);
    const cfg = this.configs.get(signal.symbol);
    if (!state || !cfg || !state.isActive) return;
    const price = signal.contributingSignals[0]?.metadata?.price as number;
    if (price) { this.recordPrice(signal.symbol, price); state.currentPrice = price; }
    if (cfg.signalAware) {
      state.biasDirection = signal.compositeScore > 0.3 ? 'BULLISH'
        : signal.compositeScore < -0.3 ? 'BEARISH' : 'NEUTRAL';
    }
    if (cfg.volatilityAdjust) this.maybeRebalance(signal.symbol);
  }

  private checkAllGrids(): void {
    for (const [symbol] of this.configs) {
      const state = this.states.get(symbol);
      if (!state?.isActive) continue;
      for (let i = 0; i < state.levels.length; i++) {
        const lv = state.levels[i];
        if (lv.status !== 'PENDING') continue;
        if (lv.side === 'BUY' && state.currentPrice <= lv.price) this.fillLevel(symbol, i);
        else if (lv.side === 'SELL' && state.currentPrice >= lv.price) this.fillLevel(symbol, i);
      }
    }
  }

  private fillLevel(symbol: string, idx: number): void {
    const cfg = this.configs.get(symbol)!;
    const state = this.states.get(symbol)!;
    const lv = state.levels[idx];
    const orderId = randomUUID();
    const qty = cfg.orderSizePerGrid / lv.price;

    if (lv.side === 'SELL') {
      const match = state.levels.slice(0, idx).reverse().find(l => l.side === 'BUY' && l.status === 'FILLED');
      if (match?.filledPrice) lv.pnl = (lv.price - match.filledPrice) * qty;
      state.totalPnl += lv.pnl;
    }

    lv.status = 'FILLED'; lv.filledPrice = lv.price;
    state.totalFilled++;

    eventBus.emit({
      type: 'strategy.decision', source: 'grid-strategy', timestamp: Date.now(),
      payload: { strategy: 'grid', action: lv.side === 'BUY' ? 'grid_buy' : 'grid_sell', orderId, symbol, price: lv.price, quantity: qty, level: idx },
    });

    (this.fillHistory.get(symbol) || []).push({ orderId, level: idx, side: lv.side, price: lv.price, quantity: qty, pnl: lv.pnl, timestamp: Date.now() });
    console.log(`[Grid] ${symbol}: ${lv.side} lv${idx} @ $${lv.price.toFixed(4)}, fills=${state.totalFilled}, PnL=$${state.totalPnl.toFixed(2)}`);
  }

  private maybeRebalance(symbol: string): void {
    const cfg = this.configs.get(symbol)!;
    const state = this.states.get(symbol)!;
    const mid = (state.gridUpper + state.gridLower) / 2;
    const drift = Math.abs(state.currentPrice - mid) / ((state.gridUpper - state.gridLower) / 2) * 100;
    if (drift > cfg.rebalanceThresholdPct || state.currentPrice > state.gridUpper || state.currentPrice < state.gridLower) {
      const buf = this.priceBuffer.get(symbol) || [];
      const vol = buf.length > 10 ? this.volatility(buf) : 0.05;
      const half = state.currentPrice * vol * 2;
      state.gridUpper = state.currentPrice + half;
      state.gridLower = state.currentPrice - half;
      const step = (state.gridUpper - state.gridLower) / cfg.gridCount;
      state.levels = [];
      for (let i = 0; i <= cfg.gridCount; i++) {
        const p = parseFloat((state.gridLower + step * i).toFixed(6));
        state.levels.push({ price: p, side: p < state.currentPrice ? 'BUY' : 'SELL', status: 'PENDING', filledPrice: null, pnl: 0 });
      }
      console.log(`[Grid] ${symbol}: Rebalanced [${state.gridLower.toFixed(2)}–${state.gridUpper.toFixed(2)}]`);
    }
  }

  private recordPrice(symbol: string, price: number): void {
    const buf = this.priceBuffer.get(symbol) || [];
    buf.push(price); if (buf.length > 200) buf.shift();
    this.priceBuffer.set(symbol, buf);
  }

  private volatility(prices: number[]): number {
    const rets: number[] = [];
    for (let i = 1; i < prices.length; i++) rets.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    return Math.sqrt(rets.reduce((s, r) => s + (r - mean) ** 2, 0) / rets.length);
  }

  getState(s: string) { return this.states.get(s) || null; }
  getConfig(s: string) { return this.configs.get(s) || null; }
  getHistory(s: string, n = 50) { return (this.fillHistory.get(s) || []).slice(-n); }
  setActive(s: string, a: boolean) { const st = this.states.get(s); if (st) st.isActive = a; }
}
