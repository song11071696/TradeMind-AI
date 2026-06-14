// ============================================================
// Unit Tests: PnLTracker
// ============================================================
import { describe, it, expect, beforeEach } from 'vitest';
import { PnLTracker } from '../core/pnl-tracker';
import type { TradeOrder, PortfolioState, Position } from '../types';

function makeOrder(overrides: Partial<TradeOrder> = {}): TradeOrder {
  return {
    id: 'test-order-001',
    symbol: 'BNB',
    side: 'SELL',
    type: 'MARKET',
    quantity: 2,
    price: 650,
    venue: 'pancakeswap',
    slippage: 0.5,
    deadline: Date.now() + 300000,
    status: 'FILLED',
    strategyId: 'momentum',
    signalId: 'sig-001',
    metadata: { entryPrice: 600 },
    createdAt: Date.now() - 600000,
    executedAt: Date.now(),
    executedPrice: 648,
    executedQuantity: 2,
    txHash: '0xabc123',
    gasUsed: 180000,
    ...overrides,
  };
}

function makePortfolio(overrides: Partial<PortfolioState> = {}): PortfolioState {
  return {
    totalValue: 100000,
    positions: [],
    availableBalance: 80000,
    totalPnl: 0,
    timestamp: Date.now(),
    ...overrides,
  };
}

function makePosition(overrides: Partial<Position> = {}): Position {
  return {
    symbol: 'BNB',
    side: 'BUY',
    quantity: 5,
    entryPrice: 600,
    currentPrice: 620,
    unrealizedPnl: 100,
    unrealizedPnlPct: 3.33,
    strategyId: 'test',
    ...overrides,
  };
}

describe('PnLTracker', () => {
  let tracker: PnLTracker;

  beforeEach(() => {
    tracker = new PnLTracker(100000);
  });

  describe('Constructor & Initialization', () => {
    it('should initialize with given initial value', () => {
      const t = new PnLTracker(50000);
      const metrics = t.getMetrics();
      expect(metrics.totalTrades).toBe(0);
      expect(metrics.totalRealizedPnl).toBe(0);
    });

    it('should have no snapshots initially', () => {
      expect(tracker.getLatestSnapshot()).toBeNull();
      expect(tracker.getSnapshots()).toHaveLength(0);
    });

    it('should have no trade history initially', () => {
      expect(tracker.getTradeHistory()).toHaveLength(0);
    });
  });

  describe('Snapshot System', () => {
    it('should create snapshot with correct values', () => {
      const portfolio = makePortfolio({ totalValue: 102500 });
      const snapshot = tracker.takeSnapshot(portfolio);

      expect(snapshot.totalValue).toBe(102500);
      expect(snapshot.timestamp).toBeGreaterThan(0);
      expect(snapshot.peakValue).toBe(102500);
      expect(snapshot.drawdown).toBe(0);
    });

    it('should track peak value correctly', () => {
      // First snapshot: value goes up
      tracker.takeSnapshot(makePortfolio({ totalValue: 105000 }));
      // Second snapshot: value drops
      tracker.takeSnapshot(makePortfolio({ totalValue: 102000 }));

      const latest = tracker.getLatestSnapshot()!;
      expect(latest.peakValue).toBe(105000);
      expect(latest.drawdown).toBeGreaterThan(0);
    });

    it('should calculate drawdown percentage', () => {
      tracker.takeSnapshot(makePortfolio({ totalValue: 100000 }));
      tracker.takeSnapshot(makePortfolio({ totalValue: 90000 }));

      const latest = tracker.getLatestSnapshot()!;
      expect(latest.drawdown).toBeCloseTo(0.1, 2); // 10% drawdown
    });

    it('should trim old snapshots beyond limit', () => {
      for (let i = 0; i < 3005; i++) {
        tracker.takeSnapshot(makePortfolio({ totalValue: 100000 + i }));
      }
      const snapshots = tracker.getSnapshots(9999);
      expect(snapshots.length).toBeLessThanOrEqual(3005);
      expect(snapshots.length).toBeGreaterThan(2800);
    });
  });

  describe('Trade Processing', () => {
    it('should track realized PnL from winning sell order', () => {
      const order = makeOrder({
        side: 'SELL',
        executedPrice: 650,
        executedQuantity: 2,
        metadata: { entryPrice: 600 },
      });

      tracker.processFilledOrder(order);
      const metrics = tracker.getMetrics();

      expect(metrics.totalTrades).toBe(1);
      expect(metrics.winningTrades).toBe(1);
      expect(metrics.losingTrades).toBe(0);
      expect(metrics.totalRealizedPnl).toBe(100); // (650-600)*2 = 100
      expect(metrics.winRate).toBe(1.0);
    });

    it('should track realized PnL from losing sell order', () => {
      const order = makeOrder({
        side: 'SELL',
        executedPrice: 580,
        executedQuantity: 2,
        metadata: { entryPrice: 600 },
      });

      tracker.processFilledOrder(order);
      const metrics = tracker.getMetrics();

      expect(metrics.totalTrades).toBe(1);
      expect(metrics.winningTrades).toBe(0);
      expect(metrics.losingTrades).toBe(1);
      expect(metrics.totalRealizedPnl).toBe(-40); // (580-600)*2 = -40
      expect(metrics.winRate).toBe(0);
    });

    it('should not track PnL for buy orders', () => {
      const order = makeOrder({ side: 'BUY' });
      tracker.processFilledOrder(order);
      const metrics = tracker.getMetrics();
      expect(metrics.totalTrades).toBe(0);
    });

    it('should skip orders without executed price', () => {
      const order = makeOrder({ executedPrice: undefined, executedQuantity: undefined });
      tracker.processFilledOrder(order);
      const metrics = tracker.getMetrics();
      expect(metrics.totalTrades).toBe(0);
    });

    it('should calculate win rate correctly with mixed trades', () => {
      // Win
      tracker.processFilledOrder(makeOrder({
        id: 'win-1',
        executedPrice: 650,
        metadata: { entryPrice: 600 },
      }));
      // Win
      tracker.processFilledOrder(makeOrder({
        id: 'win-2',
        executedPrice: 630,
        metadata: { entryPrice: 600 },
      }));
      // Loss
      tracker.processFilledOrder(makeOrder({
        id: 'loss-1',
        executedPrice: 580,
        metadata: { entryPrice: 600 },
      }));

      const metrics = tracker.getMetrics();
      expect(metrics.totalTrades).toBe(3);
      expect(metrics.winningTrades).toBe(2);
      expect(metrics.losingTrades).toBe(1);
      expect(metrics.winRate).toBeCloseTo(2 / 3, 2);
    });

    it('should track best and worst trades', () => {
      tracker.processFilledOrder(makeOrder({
        id: 'best',
        executedPrice: 700,
        executedQuantity: 1,
        metadata: { entryPrice: 600 },
      }));
      tracker.processFilledOrder(makeOrder({
        id: 'worst',
        executedPrice: 550,
        executedQuantity: 1,
        metadata: { entryPrice: 600 },
      }));

      const metrics = tracker.getMetrics();
      expect(metrics.bestTrade).toBe(100); // (700-600)*1
      expect(metrics.worstTrade).toBe(-50); // (550-600)*1
    });
  });

  describe('Metrics Calculation', () => {
    it('should return correct metrics with no trades', () => {
      const metrics = tracker.getMetrics();
      expect(metrics.totalTrades).toBe(0);
      expect(metrics.winRate).toBe(0);
      expect(metrics.profitFactor).toBe(0);
      expect(metrics.sharpeRatio).toBe(0);
      expect(metrics.avgWinAmount).toBe(0);
      expect(metrics.avgLossAmount).toBe(0);
    });

    it('should calculate profit factor correctly', () => {
      // Win: +100
      tracker.processFilledOrder(makeOrder({
        id: 'pf-win',
        executedPrice: 650,
        executedQuantity: 2,
        metadata: { entryPrice: 600 },
      }));
      // Loss: -40
      tracker.processFilledOrder(makeOrder({
        id: 'pf-loss',
        executedPrice: 580,
        executedQuantity: 2,
        metadata: { entryPrice: 600 },
      }));

      const metrics = tracker.getMetrics();
      // Profit factor = totalWinAmount / totalLossAmount = 100 / 40 = 2.5
      expect(metrics.profitFactor).toBeCloseTo(2.5, 1);
    });

    it('should calculate unrealized PnL from portfolio', () => {
      const portfolio = makePortfolio({
        totalValue: 105000,
        positions: [
          makePosition({ unrealizedPnl: 500 }),
          makePosition({ symbol: 'ETH', unrealizedPnl: 200 }),
        ],
      });

      const metrics = tracker.getMetrics(portfolio);
      expect(metrics.totalUnrealizedPnl).toBe(700);
    });
  });

  describe('Strategy Performance', () => {
    it('should return empty performance for unknown strategy', () => {
      const perf = tracker.getStrategyPerformance('unknown-strategy');
      expect(perf.totalTrades).toBe(0);
      expect(perf.winRate).toBe(0);
      expect(perf.totalReturn).toBe(0);
    });

    it('should track strategy-specific performance', () => {
      tracker.processFilledOrder(makeOrder({
        strategyId: 'momentum',
        executedPrice: 650,
        metadata: { entryPrice: 600 },
      }));
      tracker.processFilledOrder(makeOrder({
        strategyId: 'dca',
        executedPrice: 580,
        metadata: { entryPrice: 600 },
      }));

      const momentumPerf = tracker.getStrategyPerformance('momentum');
      const dcaPerf = tracker.getStrategyPerformance('dca');

      expect(momentumPerf.totalTrades).toBe(1);
      expect(momentumPerf.totalReturn).toBe(100);
      expect(dcaPerf.totalTrades).toBe(1);
      expect(dcaPerf.totalReturn).toBe(-40);
    });
  });

  describe('Accessors', () => {
    it('should return snapshots with limit', () => {
      for (let i = 0; i < 10; i++) {
        tracker.takeSnapshot(makePortfolio({ totalValue: 100000 + i * 100 }));
      }
      expect(tracker.getSnapshots(5)).toHaveLength(5);
      expect(tracker.getSnapshots(20)).toHaveLength(10);
    });

    it('should return trade history with limit', () => {
      for (let i = 0; i < 5; i++) {
        tracker.processFilledOrder(makeOrder({
          id: `hist-${i}`,
          executedPrice: 600 + (i + 1) * 10,
          metadata: { entryPrice: 600 },
        }));
      }
      expect(tracker.getTradeHistory(3)).toHaveLength(3);
      expect(tracker.getTradeHistory(10)).toHaveLength(5);  // all have non-zero PnL
    });

    it('should return copy of daily returns', () => {
      const returns = tracker.getDailyReturns();
      expect(returns).toHaveLength(0);
      // Modifying the returned array should not affect internal state
      returns.push(0.05);
      expect(tracker.getDailyReturns()).toHaveLength(0);
    });
  });
});
