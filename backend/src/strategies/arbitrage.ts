// ============================================================
// TradeMind AI - Cross-DEX Arbitrage Strategy
// ============================================================
// Features: Multi-venue price comparison, gas-aware profit
// calculation, triangular arb detection, flash loan support.
// ============================================================
import { randomUUID } from 'crypto';
import { eventBus } from '../core/event-bus';

export interface ArbitrageConfig {
  symbols: string[];
  venues: string[];
  minSpreadPct: number;
  maxSlippagePct: number;
  gasEstimateBNB: number;
  minProfitAfterGas: number;
  maxTradeSize: number;
  useFlashLoan: boolean;
  flashLoanFeePct: number;
  cooldownMs: number;
  maxConcurrentArbs: number;
  triangularArb: boolean;
  triangularPaths: string[][];
  priceStalenessMs: number;
}

export interface VenuePrice {
  venue: string; symbol: string; bid: number; ask: number;
  midPrice: number; liquidity: number; timestamp: number;
}

export interface ArbOpportunity {
  id: string; type: 'SIMPLE' | 'TRIANGULAR';
  buyVenue: string; sellVenue: string; symbol: string;
  buyPrice: number; sellPrice: number; spreadPct: number;
  estimatedProfit: number; tradeSize: number; route: string[];
  gasCostBNB: number; confidence: number; timestamp: number;
}

export interface ArbState {
  isActive: boolean; activeArbs: number;
  totalExecuted: number; totalProfit: number; totalGasSpent: number;
  successfulArbs: number; failedArbs: number;
  lastArbTime: Map<string, number>;
  priceCache: Map<string, VenuePrice[]>;
  opportunities: ArbOpportunity[];
}

interface ArbExecution {
  id: string; oppId: string; type: string; symbol: string;
  buyVenue: string; sellVenue: string; buyPrice: number; sellPrice: number;
  quantity: number; grossProfit: number; gasCost: number; netProfit: number;
  slippage: number; status: 'SUCCESS' | 'FAILED'; duration: number; timestamp: number;
}

export class ArbitrageStrategy {
  private configs = new Map<string, ArbitrageConfig>();
  private state: ArbState;
  private history: ArbExecution[] = [];
  private scanInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.state = {
      isActive: false, activeArbs: 0, totalExecuted: 0, totalProfit: 0,
      totalGasSpent: 0, successfulArbs: 0, failedArbs: 0,
      lastArbTime: new Map(), priceCache: new Map(), opportunities: [],
    };
  }

  start(): void {
    this.state.isActive = true;
    eventBus.subscribe('signal.generated', (e) => this.processPrice(e.payload));
    this.scanInterval = setInterval(() => this.scan(), 5000);
    console.log('[Arbitrage] Started');
  }
  stop(): void { this.state.isActive = false; if (this.scanInterval) { clearInterval(this.scanInterval); this.scanInterval = null; } }

  addConfig(id: string, cfg: ArbitrageConfig): void {
    this.configs.set(id, cfg);
    for (const s of cfg.symbols) if (!this.state.priceCache.has(s)) this.state.priceCache.set(s, []);
    console.log(`[Arbitrage] Config "${id}": ${cfg.symbols.length} symbols, ${cfg.venues.length} venues, min=${cfg.minSpreadPct}%`);
  }

  static defaultConfig(symbols: string[], venues: string[], overrides?: Partial<ArbitrageConfig>): ArbitrageConfig {
    return {
      symbols, venues, minSpreadPct: 0.5, maxSlippagePct: 0.3, gasEstimateBNB: 0.002,
      minProfitAfterGas: 2.0, maxTradeSize: 5000, useFlashLoan: false, flashLoanFeePct: 0.09,
      cooldownMs: 60000, maxConcurrentArbs: 3, triangularArb: true,
      triangularPaths: [['WBNB', 'BUSD', 'USDT'], ['WBNB', 'ETH', 'BTC']],
      priceStalenessMs: 10000, ...overrides,
    };
  }

  private processPrice(payload: unknown): void {
    const d = payload as { symbol?: string; venue?: string; price?: number; bid?: number; ask?: number; liquidity?: number };
    if (!d.symbol || !d.venue || !d.price) return;
    const arr = this.state.priceCache.get(d.symbol) || [];
    const idx = arr.findIndex(v => v.venue === d.venue);
    const vp: VenuePrice = { venue: d.venue, symbol: d.symbol, bid: d.bid || d.price * 0.999, ask: d.ask || d.price * 1.001, midPrice: d.price, liquidity: d.liquidity || 10000, timestamp: Date.now() };
    if (idx >= 0) arr[idx] = vp; else arr.push(vp);
    this.state.priceCache.set(d.symbol, arr);
  }

  private scan(): void {
    if (!this.state.isActive) return;
    const cfg = this.primaryConfig();
    if (this.state.activeArbs >= cfg.maxConcurrentArbs) return;
    const opps: ArbOpportunity[] = [];
    const now = Date.now();

    // Simple arb
    for (const symbol of cfg.symbols) {
      const vp = (this.state.priceCache.get(symbol) || []).filter(v => now - v.timestamp < cfg.priceStalenessMs);
      if (vp.length < 2) continue;
      for (let i = 0; i < vp.length; i++) {
        for (let j = i + 1; j < vp.length; j++) {
          const o1 = this.evalSimple(symbol, vp[i], vp[j], cfg);
          const o2 = this.evalSimple(symbol, vp[j], vp[i], cfg);
          if (o1) opps.push(o1); if (o2) opps.push(o2);
        }
      }
    }

    // Triangular arb
    if (cfg.triangularArb) {
      for (const path of cfg.triangularPaths) {
        const o = this.evalTriangular(path, cfg);
        if (o) opps.push(o);
      }
    }

    if (opps.length > 0) {
      opps.sort((a, b) => b.estimatedProfit - a.estimatedProfit);
      this.state.opportunities = opps.slice(0, 20);
      if (opps[0].estimatedProfit >= cfg.minProfitAfterGas) this.execute(opps[0]);
    }
  }

  private evalSimple(symbol: string, buy: VenuePrice, sell: VenuePrice, cfg: ArbitrageConfig): ArbOpportunity | null {
    const bp = buy.ask, sp = sell.bid;
    if (sp <= bp) return null;
    const spread = ((sp - bp) / bp) * 100;
    if (spread < cfg.minSpreadPct) return null;
    const size = Math.min(buy.liquidity, sell.liquidity, cfg.maxTradeSize) * 0.5;
    const gasCost = cfg.gasEstimateBNB * this.bnbPrice() * 2;
    const gross = size * (spread / 100);
    let net = gross - gasCost;
    if (cfg.useFlashLoan) net -= size * (cfg.flashLoanFeePct / 100);
    if (net < cfg.minProfitAfterGas) return null;
    const freshness = 1 - (now() - Math.min(buy.timestamp, sell.timestamp)) / cfg.priceStalenessMs;
    const conf = freshness * 0.3 + Math.min(1, Math.min(buy.liquidity, sell.liquidity) / size) * 0.4 + Math.min(1, spread / (cfg.minSpreadPct * 3)) * 0.3;
    return { id: randomUUID(), type: 'SIMPLE', buyVenue: buy.venue, sellVenue: sell.venue, symbol, buyPrice: bp, sellPrice: sp, spreadPct: spread, estimatedProfit: net, tradeSize: size, route: [buy.venue, symbol, sell.venue], gasCostBNB: cfg.gasEstimateBNB * 2, confidence: conf, timestamp: Date.now() };
  }

  private evalTriangular(path: string[], cfg: ArbitrageConfig): ArbOpportunity | null {
    if (path.length < 3) return null;
    let rate = 1; const prices: number[] = []; const venues: string[] = [];
    for (let i = 0; i < path.length; i++) {
      const sym = `${path[i]}/${path[(i + 1) % path.length]}`;
      const vp = this.state.priceCache.get(sym) || [];
      if (!vp.length) return null;
      const best = vp.reduce((a, b) => a.ask < b.ask ? a : b);
      rate *= best.midPrice; prices.push(best.midPrice); venues.push(best.venue);
    }
    const spread = (rate - 1) * 100;
    if (spread < cfg.minSpreadPct) return null;
    const gasCost = cfg.gasEstimateBNB * this.bnbPrice() * path.length;
    const size = Math.min(cfg.maxTradeSize, 2000);
    const net = size * (spread / 100) - gasCost;
    if (net < cfg.minProfitAfterGas) return null;
    return { id: randomUUID(), type: 'TRIANGULAR', buyVenue: venues[0], sellVenue: venues[venues.length - 1], symbol: path.join('→'), buyPrice: prices[0], sellPrice: prices[prices.length - 1], spreadPct: spread, estimatedProfit: net, tradeSize: size, route: path, gasCostBNB: cfg.gasEstimateBNB * path.length, confidence: 0.5, timestamp: Date.now() };
  }

  private execute(opp: ArbOpportunity): void {
    const cfg = this.primaryConfig();
    const last = this.state.lastArbTime.get(opp.symbol) || 0;
    if (Date.now() - last < cfg.cooldownMs) return;
    this.state.activeArbs++;
    this.state.lastArbTime.set(opp.symbol, Date.now());
    const t0 = Date.now();

    console.log(`[Arbitrage] ${opp.type}: ${opp.symbol} ${opp.buyVenue}→${opp.sellVenue}, spread=${opp.spreadPct.toFixed(2)}%, est=$${opp.estimatedProfit.toFixed(2)}`);
    eventBus.emit({ type: 'strategy.decision', source: 'arbitrage', timestamp: Date.now(), payload: { strategy: 'arbitrage', action: 'execute', orderId: randomUUID(), opportunity: { ...opp } } });

    // ⚠️ MOCK DATA: Simulated execution result using Math.random()
    // In production, this would be replaced with real on-chain execution
    const slippage = Math.random() * cfg.maxSlippagePct;
    const ok = slippage < cfg.maxSlippagePct && Math.random() > 0.1;
    const gasCost = opp.gasCostBNB * this.bnbPrice();
    const net = ok ? opp.estimatedProfit * (1 - slippage / opp.spreadPct) : -gasCost;

    this.state.activeArbs--; this.state.totalExecuted++; this.state.totalGasSpent += gasCost;
    if (ok) { this.state.successfulArbs++; this.state.totalProfit += net; } else { this.state.failedArbs++; this.state.totalProfit -= gasCost; }

    this.history.push({ id: randomUUID(), oppId: opp.id, type: opp.type, symbol: opp.symbol, buyVenue: opp.buyVenue, sellVenue: opp.sellVenue, buyPrice: opp.buyPrice, sellPrice: opp.sellPrice, quantity: opp.tradeSize / opp.buyPrice, grossProfit: opp.estimatedProfit + gasCost, gasCost, netProfit: net, slippage, status: ok ? 'SUCCESS' : 'FAILED', duration: Date.now() - t0, timestamp: Date.now() });
    if (this.history.length > 500) this.history.shift();
    console.log(`[Arbitrage] ${ok ? 'OK' : 'FAIL'}: $${net.toFixed(2)}, slip=${slippage.toFixed(3)}%`);
  }

  private primaryConfig(): ArbitrageConfig {
    return Array.from(this.configs.values())[0] || ArbitrageStrategy.defaultConfig(['BTC', 'ETH'], ['pancakeswap', 'biswap']);
  }
  private bnbPrice(): number { const bp = this.state.priceCache.get('BNB'); return bp?.length ? bp[0].midPrice : 600; }

  getState() { return this.state; }
  getOpportunities(n = 20) { return this.state.opportunities.slice(0, n); }
  getHistory(n = 50) { return this.history.slice(-n); }
  getMetrics() {
    const wr = this.state.totalExecuted > 0 ? (this.state.successfulArbs / this.state.totalExecuted) * 100 : 0;
    return { total: this.state.totalExecuted, successRate: wr, profit: this.state.totalProfit, gas: this.state.totalGasSpent, net: this.state.totalProfit - this.state.totalGasSpent, avgPerTrade: this.state.totalExecuted > 0 ? this.state.totalProfit / this.state.totalExecuted : 0 };
  }
  setActive(a: boolean) { this.state.isActive = a; console.log(`[Arbitrage] ${a ? 'ON' : 'OFF'}`); }
}

function now() { return Date.now(); }
