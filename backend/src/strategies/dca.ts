// ============================================================
// TradeMind AI - Adaptive DCA (Dollar Cost Averaging) Strategy
// ============================================================
// Features:
//   - Time-based DCA with configurable intervals
//   - Price-drop triggers (buy more when price drops)
//   - Averaging down with progressive sizing
//   - Take-profit targets with partial sells
//   - Signal-aware adjustments (pause in strong downtrends)
// ============================================================
import { randomUUID } from 'crypto';
import type {
  FusedSignal,
  TradingSignal,
  SignalType,
  Strategy,
  StrategyParameters,
  TradeOrder,
  OrderType,
  PortfolioState,
  Position,
} from '../types';
import { eventBus } from '../core/event-bus';

export interface DCAConfig {
  symbol: string;
  baseOrderSize: number;           // Base amount per DCA buy ($) 
  maxOrders: number;               // Maximum number of DCA orders
  maxInvestment: number;           // Maximum total investment ($)
  
  // Price-drop trigger levels (% from initial entry)
  priceDropTriggers: number[];     // e.g., [-3, -6, -10, -15, -20]
  
  // Multiplier at each drop level
  sizeMultipliers: number[];       // e.g., [1.0, 1.2, 1.5, 2.0, 2.5]
  
  // Time-based DCA
  timeIntervalMs: number;          // Minimum time between orders
  useTimeBasedDCA: boolean;        // Enable time-based buying
  
  // Take profit
  takeProfitPct: number;           // % profit target
  partialSellPct: number;          // What % to sell at target (0-1)
  
  // Safety
  stopLossPct: number;             // Stop loss from average entry
  maxDrawdownPct: number;          // Max drawdown before stopping
  
  // Signal awareness
  respectSignals: boolean;         // Pause DCA in strong downtrends
  signalPauseThreshold: number;    // Composite score below which to pause
}

export interface DCAState {
  isActive: boolean;
  totalOrders: number;
  totalInvested: number;
  averageEntryPrice: number;
  currentQuantity: number;
  lastOrderTime: number;
  lastOrderPrice: number;
  initialPrice: number;
  highestPrice: number;
  lowestPrice: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  nextDropTrigger: number | null;
  pendingTakeProfit: boolean;
  pausedBySignal: boolean;
}

interface DCAOrderHistory {
  orderId: string;
  type: 'BUY' | 'SELL';
  price: number;
  quantity: number;
  amount: number;
  trigger: string;  // 'time' | 'drop_N%' | 'take_profit' | 'signal'
  timestamp: number;
}

export class AdaptiveDCAStrategy {
  private configs: Map<string, DCAConfig> = new Map();
  private states: Map<string, DCAState> = new Map();
  private orderHistory: Map<string, DCAOrderHistory[]> = new Map();
  private priceHistory: Map<string, number[]> = new Map();
  private checkInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {}

  start(): void {
    // Subscribe to fused signals for signal-aware DCA
    eventBus.subscribe('signal.fused', (event) => {
      const signal = event.payload as FusedSignal;
      this.processSignal(signal);
    });

    // Periodic check for time-based DCA
    this.checkInterval = setInterval(() => {
      this.checkAllDCAs();
    }, 30000); // Every 30 seconds

    console.log('[Adaptive DCA] Started');
  }

  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  // ===================== Configuration =====================

  /**
   * Add or update a DCA configuration for a symbol
   */
  addDCA(config: DCAConfig): void {
    this.configs.set(config.symbol, config);

    if (!this.states.has(config.symbol)) {
      this.states.set(config.symbol, {
        isActive: true,
        totalOrders: 0,
        totalInvested: 0,
        averageEntryPrice: 0,
        currentQuantity: 0,
        lastOrderTime: 0,
        lastOrderPrice: 0,
        initialPrice: 0,
        highestPrice: 0,
        lowestPrice: Infinity,
        unrealizedPnl: 0,
        unrealizedPnlPct: 0,
        nextDropTrigger: config.priceDropTriggers.length > 0 ? config.priceDropTriggers[0] : null,
        pendingTakeProfit: false,
        pausedBySignal: false,
      });
    }

    if (!this.orderHistory.has(config.symbol)) {
      this.orderHistory.set(config.symbol, []);
    }

    console.log(`[Adaptive DCA] Configured for ${config.symbol}: base=$${config.baseOrderSize}, max=${config.maxOrders} orders`);
  }

  /**
   * Create a default DCA configuration
   */
  static createDefaultConfig(symbol: string, overrides?: Partial<DCAConfig>): DCAConfig {
    return {
      symbol,
      baseOrderSize: 100,
      maxOrders: 10,
      maxInvestment: 2000,
      priceDropTriggers: [-3, -6, -10, -15, -20, -30],
      sizeMultipliers: [1.0, 1.2, 1.5, 2.0, 2.5, 3.0],
      timeIntervalMs: 3600000,     // 1 hour
      useTimeBasedDCA: true,
      takeProfitPct: 8,
      partialSellPct: 0.5,
      stopLossPct: 25,
      maxDrawdownPct: 35,
      respectSignals: true,
      signalPauseThreshold: -0.3,
      ...overrides,
    };
  }

  // ===================== Signal Processing =====================

  private processSignal(signal: FusedSignal): void {
    const state = this.states.get(signal.symbol);
    const config = this.configs.get(signal.symbol);
    if (!state || !config || !state.isActive) return;

    // Update price tracking
    const price = signal.contributingSignals[0]?.metadata?.price as number;
    if (price) {
      this.updatePrice(signal.symbol, price);
    }

    // Signal-aware pause/resume
    if (config.respectSignals) {
      if (signal.compositeScore < config.signalPauseThreshold && signal.riskAssessment.level !== 'LOW') {
        if (!state.pausedBySignal) {
          state.pausedBySignal = true;
          console.log(`[Adaptive DCA] ${signal.symbol}: Paused by signal (score: ${signal.compositeScore.toFixed(2)}, risk: ${signal.riskAssessment.level})`);
        }
        return;
      } else if (state.pausedBySignal && signal.compositeScore > config.signalPauseThreshold * 0.5) {
        state.pausedBySignal = false;
        console.log(`[Adaptive DCA] ${signal.symbol}: Resumed (signal improving)`);
      }
    }

    // Check for buy opportunities on strong sell signals (buy the dip)
    if ((signal.finalSignal === 'STRONG_SELL' || signal.finalSignal === 'SELL') && signal.confidence > 0.6) {
      this.checkPriceDropTrigger(signal.symbol, price);
    }
  }

  // ===================== DCA Logic =====================

  private checkAllDCAs(): void {
    for (const [symbol, config] of Array.from(this.configs.entries())) {
      const state = this.states.get(symbol);
      if (!state || !state.isActive || state.pausedBySignal) continue;

      // Check time-based DCA
      if (config.useTimeBasedDCA) {
        this.checkTimeBasedDCA(symbol);
      }
    }
  }

  private checkTimeBasedDCA(symbol: string): void {
    const config = this.configs.get(symbol)!;
    const state = this.states.get(symbol)!;
    const now = Date.now();

    // Check time interval
    if (now - state.lastOrderTime < config.timeIntervalMs) return;

    // Check max orders
    if (state.totalOrders >= config.maxOrders) return;

    // Check max investment
    if (state.totalInvested >= config.maxInvestment) return;

    // Emit DCA buy signal
    this.executeDCABuy(symbol, 'time');
  }

  private checkPriceDropTrigger(symbol: string, currentPrice: number): void {
    const config = this.configs.get(symbol)!;
    const state = this.states.get(symbol)!;

    if (!state.initialPrice || state.initialPrice === 0) return;
    if (state.totalOrders >= config.maxOrders) return;
    if (state.totalInvested >= config.maxInvestment) return;

    const priceChangePct = ((currentPrice - state.initialPrice) / state.initialPrice) * 100;

    // Find the next drop trigger
    for (let i = 0; i < config.priceDropTriggers.length; i++) {
      const trigger = config.priceDropTriggers[i];
      if (priceChangePct <= trigger) {
        // Check if we've already triggered this level
        const lastTriggerIndex = this.getLastTriggeredDropIndex(symbol);
        if (i > lastTriggerIndex) {
          const multiplier = config.sizeMultipliers[i] || 1;
          this.executeDCABuy(symbol, `drop_${trigger}%`, multiplier);

          // Update next trigger
          state.nextDropTrigger = i + 1 < config.priceDropTriggers.length
            ? config.priceDropTriggers[i + 1]
            : null;
          break;
        }
      }
    }
  }

  private getLastTriggeredDropIndex(symbol: string): number {
    const history = this.orderHistory.get(symbol) || [];
    let maxIndex = -1;
    const config = this.configs.get(symbol)!;

    for (const order of history) {
      if (order.trigger.startsWith('drop_')) {
        const triggerPct = parseFloat(order.trigger.replace('drop_', '').replace('%', ''));
        const index = config.priceDropTriggers.indexOf(triggerPct);
        if (index > maxIndex) maxIndex = index;
      }
    }

    return maxIndex;
  }

  private executeDCABuy(symbol: string, trigger: string, sizeMultiplier: number = 1): void {
    const config = this.configs.get(symbol)!;
    const state = this.states.get(symbol)!;

    const orderSize = config.baseOrderSize * sizeMultiplier;

    // Check investment limits
    if (state.totalInvested + orderSize > config.maxInvestment) {
      console.log(`[Adaptive DCA] ${symbol}: Would exceed max investment ($${config.maxInvestment})`);
      return;
    }

    // Create DCA buy order
    const orderId = randomUUID();
    const price = this.getCurrentPrice(symbol);
    const quantity = orderSize / price;

    // Emit buy event
    eventBus.emit({
      type: 'dca.buy_triggered',
      payload: {
        orderId,
        symbol,
        type: 'BUY',
        amount: orderSize,
        price,
        quantity,
        trigger,
        sizeMultiplier,
        dcaState: { ...state },
      },
      timestamp: Date.now(),
      source: 'adaptive-dca',
    });

    // Update state
    const totalCost = state.averageEntryPrice * state.currentQuantity + price * quantity;
    state.currentQuantity += quantity;
    state.averageEntryPrice = totalCost / state.currentQuantity;
    state.totalOrders++;
    state.totalInvested += orderSize;
    state.lastOrderTime = Date.now();
    state.lastOrderPrice = price;

    if (state.initialPrice === 0) state.initialPrice = price;
    state.highestPrice = Math.max(state.highestPrice, price);
    state.lowestPrice = Math.min(state.lowestPrice, price);

    // Record history
    const history = this.orderHistory.get(symbol) || [];
    history.push({
      orderId,
      type: 'BUY',
      price,
      quantity,
      amount: orderSize,
      trigger,
      timestamp: Date.now(),
    });
    this.orderHistory.set(symbol, history);

    console.log(
      `[Adaptive DCA] ${symbol}: BUY $${orderSize.toFixed(2)} @ $${price.toFixed(4)} ` +
      `(trigger: ${trigger}, avg: $${state.averageEntryPrice.toFixed(4)}, total: $${state.totalInvested.toFixed(2)})`
    );

    // Check take-profit
    this.checkTakeProfit(symbol, price);
  }

  private checkTakeProfit(symbol: string, currentPrice: number): void {
    const config = this.configs.get(symbol)!;
    const state = this.states.get(symbol)!;

    if (state.currentQuantity <= 0 || state.averageEntryPrice <= 0) return;

    const pnlPct = ((currentPrice - state.averageEntryPrice) / state.averageEntryPrice) * 100;

    // Take profit
    if (pnlPct >= config.takeProfitPct) {
      const sellQuantity = state.currentQuantity * config.partialSellPct;
      const sellAmount = sellQuantity * currentPrice;

      eventBus.emit({
        type: 'dca.sell_triggered',
        payload: {
          orderId: randomUUID(),
          symbol,
          type: 'SELL',
          amount: sellAmount,
          price: currentPrice,
          quantity: sellQuantity,
          trigger: 'take_profit',
          pnlPct,
          dcaState: { ...state },
        },
        timestamp: Date.now(),
        source: 'adaptive-dca',
      });

      // Update state
      state.currentQuantity -= sellQuantity;
      state.totalInvested -= sellAmount;

      const history = this.orderHistory.get(symbol) || [];
      history.push({
        orderId: randomUUID(),
        type: 'SELL',
        price: currentPrice,
        quantity: sellQuantity,
        amount: sellAmount,
        trigger: 'take_profit',
        timestamp: Date.now(),
      });
      this.orderHistory.set(symbol, history);

      console.log(
        `[Adaptive DCA] ${symbol}: SELL ${config.partialSellPct * 100}% @ $${currentPrice.toFixed(4)} ` +
        `(PnL: ${pnlPct.toFixed(2)}%, remaining: ${state.currentQuantity.toFixed(6)})`
      );
    }

    // Stop loss
    if (pnlPct <= -config.stopLossPct) {
      const sellQuantity = state.currentQuantity;
      const sellAmount = sellQuantity * currentPrice;

      eventBus.emit({
        type: 'dca.sell_triggered',
        payload: {
          orderId: randomUUID(),
          symbol,
          type: 'SELL',
          amount: sellAmount,
          price: currentPrice,
          quantity: sellQuantity,
          trigger: 'stop_loss',
          pnlPct,
          dcaState: { ...state },
        },
        timestamp: Date.now(),
        source: 'adaptive-dca',
      });

      state.currentQuantity = 0;
      state.totalInvested = 0;
      state.averageEntryPrice = 0;
      state.isActive = false;

      console.log(
        `[Adaptive DCA] ${symbol}: STOP LOSS triggered @ $${currentPrice.toFixed(4)} ` +
        `(PnL: ${pnlPct.toFixed(2)}%, DCA deactivated)`
      );
    }
  }

  // ===================== Utility =====================

  private updatePrice(symbol: string, price: number): void {
    if (!this.priceHistory.has(symbol)) {
      this.priceHistory.set(symbol, []);
    }
    const history = this.priceHistory.get(symbol)!;
    history.push(price);
    if (history.length > 100) history.shift();

    // Update state
    const state = this.states.get(symbol);
    if (state) {
      state.highestPrice = Math.max(state.highestPrice, price);
      state.lowestPrice = Math.min(state.lowestPrice, price);

      if (state.averageEntryPrice > 0) {
        state.unrealizedPnl = (price - state.averageEntryPrice) * state.currentQuantity;
        state.unrealizedPnlPct = ((price - state.averageEntryPrice) / state.averageEntryPrice) * 100;
      }
    }
  }

  private getCurrentPrice(symbol: string): number {
    const history = this.priceHistory.get(symbol);
    if (history && history.length > 0) {
      return history[history.length - 1];
    }
    // Fallback simulated prices
    const fallbackPrices: Record<string, number> = {
      BTC: 65000, ETH: 3500, BNB: 600, CAKE: 2.5,
    };
    return fallbackPrices[symbol] || 100;
  }

  // ===================== Accessors =====================

  getState(symbol: string): DCAState | null {
    return this.states.get(symbol) || null;
  }

  getConfig(symbol: string): DCAConfig | null {
    return this.configs.get(symbol) || null;
  }

  getOrderHistory(symbol: string, limit: number = 50): DCAOrderHistory[] {
    return (this.orderHistory.get(symbol) || []).slice(-limit);
  }

  getAllStates(): Map<string, DCAState> {
    return new Map(this.states);
  }

  /**
   * Manually pause/resume DCA for a symbol
   */
  setActive(symbol: string, active: boolean): void {
    const state = this.states.get(symbol);
    if (state) {
      state.isActive = active;
      console.log(`[Adaptive DCA] ${symbol}: ${active ? 'Activated' : 'Deactivated'}`);
    }
  }

  /**
   * Reset DCA state for a symbol
   */
  reset(symbol: string): void {
    this.states.delete(symbol);
    this.orderHistory.delete(symbol);
    this.priceHistory.delete(symbol);
    console.log(`[Adaptive DCA] ${symbol}: Reset`);
  }
}
