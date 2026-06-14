// ============================================================
// TradeMind AI - PnL Tracking System
// ============================================================
// Tracks realized/unrealized PnL, drawdown, performance metrics,
// trade history, and generates periodic snapshots.
// ============================================================
import type {
  TradeOrder,
  Position,
  PortfolioState,
  StrategyPerformance,
} from '../types';
import { eventBus } from '../core/event-bus';

export interface PnLSnapshot {
  timestamp: number;
  totalValue: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  totalPnlPct: number;
  drawdown: number;
  peakValue: number;
  positions: Position[];
}

export interface TradeRecord {
  orderId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  realizedPnl: number;
  realizedPnlPct: number;
  fee: number;
  strategyId: string;
  entryTime: number;
  exitTime: number;
  duration: number;
}

export interface PnLMetrics {
  totalRealizedPnl: number;
  totalUnrealizedPnl: number;
  totalPnl: number;
  totalPnlPct: number;
  winRate: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  currentDrawdown: number;
  currentDrawdownPct: number;
  peakValue: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  avgWinAmount: number;
  avgLossAmount: number;
  avgTradeDuration: number;
  bestTrade: number;
  worstTrade: number;
  dailyPnl: Map<string, number>; // date string => PnL
  weeklyPnl: Map<string, number>;
}

export class PnLTracker {
  private snapshots: PnLSnapshot[] = [];
  private tradeHistory: TradeRecord[] = [];
  private dailyReturns: number[] = [];
  private peakValue: number;
  private initialValue: number;
  private snapshotInterval: ReturnType<typeof setInterval> | null = null;

  // Realized PnL tracking
  private realizedPnl: number = 0;
  private realizedTrades: number = 0;
  private winningTrades: number = 0;
  private losingTrades: number = 0;
  private totalWinAmount: number = 0;
  private totalLossAmount: number = 0;
  private bestTrade: number = 0;
  private worstTrade: number = 0;
  private totalTradeDuration: number = 0;

  // Daily PnL tracking
  private dailyPnl: Map<string, number> = new Map();
  private weeklyPnl: Map<string, number> = new Map();
  private lastDailyReset: number = 0;

  constructor(initialValue: number = 100000) {
    this.initialValue = initialValue;
    this.peakValue = initialValue;
  }

  start(portfolioGetter: () => PortfolioState): void {
    // Subscribe to order events
    eventBus.subscribe('order.filled', (event) => {
      const payload = event.payload as { order: TradeOrder };
      this.processFilledOrder(payload.order);
    });

    // Take periodic snapshots
    this.snapshotInterval = setInterval(() => {
      const portfolio = portfolioGetter();
      this.takeSnapshot(portfolio);
    }, 30000); // Every 30 seconds

    // Daily reset check
    setInterval(() => this.checkDailyReset(), 60000);

    console.log('[PnL Tracker] Started');
  }

  stop(): void {
    if (this.snapshotInterval) {
      clearInterval(this.snapshotInterval);
      this.snapshotInterval = null;
    }
  }

  // ===================== Order Processing =====================

  /**
   * Process a filled order and update PnL tracking
   */
  processFilledOrder(order: TradeOrder): void {
    if (!order.executedPrice || !order.executedQuantity) return;

    // For sell orders, we can calculate realized PnL
    if (order.side === 'SELL') {
      // The realized PnL is calculated against the average entry price
      // This is handled by the execution engine's portfolio update
      // We track the order for history
    }

    const now = Date.now();
    const dateStr = new Date(now).toISOString().split('T')[0];
    const weekStr = this.getWeekString(now);

    // Estimate PnL from the order metadata
    const entryPrice = order.metadata?.entryPrice as number || order.executedPrice;
    const pnl = order.side === 'SELL'
      ? (order.executedPrice - entryPrice) * order.executedQuantity
      : 0; // Buy orders have no realized PnL until sold

    if (order.side === 'SELL' && pnl !== 0) {
      this.realizedPnl += pnl;
      this.realizedTrades++;

      if (pnl > 0) {
        this.winningTrades++;
        this.totalWinAmount += pnl;
        this.bestTrade = Math.max(this.bestTrade, pnl);
      } else {
        this.losingTrades++;
        this.totalLossAmount += Math.abs(pnl);
        this.worstTrade = Math.min(this.worstTrade, pnl);
      }

      // Track daily/weekly PnL
      const currentDaily = this.dailyPnl.get(dateStr) || 0;
      this.dailyPnl.set(dateStr, currentDaily + pnl);

      const currentWeekly = this.weeklyPnl.get(weekStr) || 0;
      this.weeklyPnl.set(weekStr, currentWeekly + pnl);

      // Create trade record
      const tradeRecord: TradeRecord = {
        orderId: order.id,
        symbol: order.symbol,
        side: order.side,
        entryPrice,
        exitPrice: order.executedPrice,
        quantity: order.executedQuantity,
        realizedPnl: pnl,
        realizedPnlPct: ((order.executedPrice - entryPrice) / entryPrice) * 100,
        fee: (order.gasUsed || 0) * 0.000000005, // Rough gas cost estimate
        strategyId: order.strategyId,
        entryTime: order.createdAt,
        exitTime: order.executedAt || now,
        duration: (order.executedAt || now) - order.createdAt,
      };

      this.tradeHistory.push(tradeRecord);
      this.totalTradeDuration += tradeRecord.duration;

      // Emit fee.distributed event for fee transparency
      const totalFee = tradeRecord.fee;
      eventBus.emit({
        type: 'fee.distributed',
        payload: {
          orderId: order.id,
          symbol: order.symbol,
          side: order.side,
          totalFee,
          distribution: {
            gasCost: totalFee * 0.6,       // 60% gas costs
            treasury: totalFee * 0.25,     // 25% treasury
            insurance: totalFee * 0.10,    // 10% insurance fund
            stakers: totalFee * 0.05,      // 5% staker rewards
          },
          strategyId: order.strategyId,
        },
        timestamp: now,
        source: 'pnl-tracker',
      });

      // Emit PnL milestone events
      if (this.realizedPnl > 0 && this.realizedPnl % 1000 < 50) {
        eventBus.emit({
          type: 'pnl.milestone',
          payload: { milestone: 'profit', value: this.realizedPnl },
          timestamp: now,
          source: 'pnl-tracker',
        });
      }
    }
  }

  // ===================== Snapshot System =====================

  /**
   * Take a point-in-time snapshot of portfolio state
   */
  takeSnapshot(portfolio: PortfolioState): PnLSnapshot {
    const totalValue = portfolio.totalValue;
    const unrealizedPnl = portfolio.positions.reduce((sum, p) => sum + p.unrealizedPnl, 0);

    // Update peak value
    if (totalValue > this.peakValue) {
      this.peakValue = totalValue;
    }

    const drawdown = this.peakValue - totalValue;
    const drawdownPct = this.peakValue > 0 ? drawdown / this.peakValue : 0;

    const snapshot: PnLSnapshot = {
      timestamp: Date.now(),
      totalValue,
      realizedPnl: this.realizedPnl,
      unrealizedPnl,
      totalPnl: this.realizedPnl + unrealizedPnl,
      totalPnlPct: ((totalValue - this.initialValue) / this.initialValue) * 100,
      drawdown: drawdownPct,
      peakValue: this.peakValue,
      positions: [...portfolio.positions],
    };

    this.snapshots.push(snapshot);

    // Trim old snapshots (keep 24 hours worth at 30s intervals = 2880)
    if (this.snapshots.length > 3000) {
      this.snapshots = this.snapshots.slice(-2880);
    }

    // Calculate daily return for Sharpe ratio
    if (this.snapshots.length >= 2) {
      const prev = this.snapshots[this.snapshots.length - 2];
      const dailyReturn = (totalValue - prev.totalValue) / prev.totalValue;
      this.dailyReturns.push(dailyReturn);
      if (this.dailyReturns.length > 365) {
        this.dailyReturns.shift();
      }
    }

    // Emit snapshot event
    eventBus.emit({
      type: 'pnl.snapshot',
      payload: snapshot,
      timestamp: Date.now(),
      source: 'pnl-tracker',
    });

    return snapshot;
  }

  // ===================== Metrics Calculation =====================

  /**
   * Calculate comprehensive PnL metrics
   */
  getMetrics(portfolio?: PortfolioState): PnLMetrics {
    const currentTotalPnl = this.realizedPnl + (portfolio
      ? portfolio.positions.reduce((sum, p) => sum + p.unrealizedPnl, 0)
      : 0);

    const currentValue = portfolio
      ? portfolio.totalValue
      : (this.snapshots.length > 0 ? this.snapshots[this.snapshots.length - 1].totalValue : this.initialValue);

    const currentDrawdown = this.peakValue - currentValue;
    const currentDrawdownPct = this.peakValue > 0 ? currentDrawdown / this.peakValue : 0;

    // Find max drawdown from snapshots
    let maxDrawdown = 0;
    let maxDrawdownPct = 0;
    let runningPeak = this.initialValue;
    for (const snapshot of this.snapshots) {
      if (snapshot.totalValue > runningPeak) runningPeak = snapshot.totalValue;
      const dd = runningPeak - snapshot.totalValue;
      const ddPct = runningPeak > 0 ? dd / runningPeak : 0;
      if (dd > maxDrawdown) {
        maxDrawdown = dd;
        maxDrawdownPct = ddPct;
      }
    }

    // Sharpe ratio (annualized, assuming daily returns)
    let sharpeRatio = 0;
    if (this.dailyReturns.length >= 30) {
      const avgReturn = this.dailyReturns.reduce((a, b) => a + b, 0) / this.dailyReturns.length;
      const stdDev = Math.sqrt(
        this.dailyReturns.reduce((sum, r) => sum + (r - avgReturn) ** 2, 0) / this.dailyReturns.length
      );
      if (stdDev > 0) {
        sharpeRatio = (avgReturn / stdDev) * Math.sqrt(365); // Annualized
      }
    }

    // Profit factor
    const profitFactor = this.totalLossAmount > 0
      ? this.totalWinAmount / this.totalLossAmount
      : this.totalWinAmount > 0 ? Infinity : 0;

    return {
      totalRealizedPnl: this.realizedPnl,
      totalUnrealizedPnl: currentTotalPnl - this.realizedPnl,
      totalPnl: currentTotalPnl,
      totalPnlPct: ((currentValue - this.initialValue) / this.initialValue) * 100,
      winRate: this.realizedTrades > 0 ? this.winningTrades / this.realizedTrades : 0,
      profitFactor: isFinite(profitFactor) ? profitFactor : 999,
      sharpeRatio,
      maxDrawdown,
      maxDrawdownPct,
      currentDrawdown,
      currentDrawdownPct,
      peakValue: this.peakValue,
      totalTrades: this.realizedTrades,
      winningTrades: this.winningTrades,
      losingTrades: this.losingTrades,
      avgWinAmount: this.winningTrades > 0 ? this.totalWinAmount / this.winningTrades : 0,
      avgLossAmount: this.losingTrades > 0 ? this.totalLossAmount / this.losingTrades : 0,
      avgTradeDuration: this.realizedTrades > 0 ? this.totalTradeDuration / this.realizedTrades : 0,
      bestTrade: this.bestTrade,
      worstTrade: this.worstTrade,
      dailyPnl: new Map(this.dailyPnl),
      weeklyPnl: new Map(this.weeklyPnl),
    };
  }

  /**
   * Get strategy-specific performance metrics
   */
  getStrategyPerformance(strategyId: string): StrategyPerformance {
    const strategyTrades = this.tradeHistory.filter((t) => t.strategyId === strategyId);
    const wins = strategyTrades.filter((t) => t.realizedPnl > 0);
    const losses = strategyTrades.filter((t) => t.realizedPnl < 0);

    const totalReturn = strategyTrades.reduce((sum, t) => sum + t.realizedPnl, 0);
    const winAmount = wins.reduce((sum, t) => sum + t.realizedPnl, 0);
    const lossAmount = losses.reduce((sum, t) => sum + Math.abs(t.realizedPnl), 0);

    return {
      totalReturn,
      annualizedReturn: totalReturn * (365 / Math.max(1, strategyTrades.length)) / this.initialValue,
      sharpeRatio: 0, // Would need per-strategy daily returns
      maxDrawdown: losses.length > 0 ? Math.min(...losses.map((t) => t.realizedPnl)) : 0,
      winRate: strategyTrades.length > 0 ? wins.length / strategyTrades.length : 0,
      profitFactor: lossAmount > 0 ? winAmount / lossAmount : winAmount > 0 ? Infinity : 0,
      totalTrades: strategyTrades.length,
      avgTradeDuration: strategyTrades.length > 0
        ? strategyTrades.reduce((sum, t) => sum + t.duration, 0) / strategyTrades.length
        : 0,
      lastUpdated: Date.now(),
    };
  }

  // ===================== Daily Reset =====================

  private checkDailyReset(): void {
    const now = Date.now();
    const today = new Date(now).toISOString().split('T')[0];

    if (today !== new Date(this.lastDailyReset).toISOString().split('T')[0]) {
      this.lastDailyReset = now;
      // Daily PnL is already tracked by date string, no reset needed
    }
  }

  private getWeekString(timestamp: number): string {
    const d = new Date(timestamp);
    const startOfYear = new Date(d.getFullYear(), 0, 1);
    const weekNum = Math.ceil(((d.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
    return `${d.getFullYear()}-W${weekNum.toString().padStart(2, '0')}`;
  }

  // ===================== Accessors =====================

  getSnapshots(limit: number = 100): PnLSnapshot[] {
    return this.snapshots.slice(-limit);
  }

  getTradeHistory(limit: number = 50): TradeRecord[] {
    return this.tradeHistory.slice(-limit);
  }

  getDailyReturns(): number[] {
    return [...this.dailyReturns];
  }

  getLatestSnapshot(): PnLSnapshot | null {
    return this.snapshots.length > 0 ? this.snapshots[this.snapshots.length - 1] : null;
  }
}
