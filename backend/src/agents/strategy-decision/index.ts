// ============================================================
// TradeMind AI - Strategy Decision Engine (Agent)
// ============================================================
// Takes fused signals and determines optimal trade actions,
// position sizing, and risk-adjusted allocations.
// ============================================================
import { randomUUID } from 'crypto';
import type {
  FusedSignal,
  TradingSignal,
  SignalType,
  Strategy,
  StrategyType,
  StrategyParameters,
  StrategyPerformance,
  RiskLimits,
  TradeOrder,
  OrderType,
  OrderSide,
  PortfolioState,
  Position,
  AgentConfig,
  AgentState,
} from '../../types';
import { eventBus } from '../../core/event-bus';

interface DecisionContext {
  fusedSignal: FusedSignal;
  portfolio: PortfolioState;
  activeStrategies: Strategy[];
  riskLimits: RiskLimits;
}

export class StrategyDecisionEngine {
  private config: AgentConfig;
  private state: AgentState;
  private strategies: Map<string, Strategy> = new Map();
  private decisionHistory: TradeOrder[] = [];
  private processingTimes: number[] = [];

  constructor(config?: Partial<AgentConfig>) {
    this.config = {
      id: 'strategy-decision-engine',
      name: 'Strategy Decision Engine',
      version: '1.0.0',
      interval: 15000,
      enabled: true,
      ...config,
    };

    this.state = {
      status: 'idle',
      lastRun: 0,
      metrics: {
        totalRuns: 0,
        successRate: 1.0,
        avgProcessingTime: 0,
        lastProcessingTime: 0,
      },
    };

    // Initialize default strategies
    this.initializeStrategies();
  }

  private initializeStrategies(): void {
    const defaultStrategies: Strategy[] = [
      {
        id: 'momentum-v1',
        name: 'Momentum Strategy',
        type: 'momentum',
        isActive: true,
        parameters: {
          lookbackPeriod: 14,
          entryThreshold: 0.3,
          exitThreshold: -0.1,
          positionSizePct: 10,
          maxPositions: 5,
          stopLossPct: 5,
          takeProfitPct: 15,
          custom: { rsiOversold: 30, rsiOverbought: 70 },
        },
        performance: {
          totalReturn: 0,
          annualizedReturn: 0,
          sharpeRatio: 0,
          maxDrawdown: 0,
          winRate: 0,
          profitFactor: 0,
          totalTrades: 0,
          avgTradeDuration: 0,
          lastUpdated: 0,
        },
        riskLimits: {
          maxPositionSize: 10000,
          maxDrawdown: 0.15,
          maxDailyLoss: 0.05,
          maxLeverage: 1,
          maxCorrelatedPositions: 3,
        },
      },
      {
        id: 'mean-reversion-v1',
        name: 'Mean Reversion Strategy',
        type: 'mean_reversion',
        isActive: true,
        parameters: {
          lookbackPeriod: 20,
          entryThreshold: -0.2,
          exitThreshold: 0.05,
          positionSizePct: 8,
          maxPositions: 4,
          stopLossPct: 4,
          takeProfitPct: 10,
          custom: { bollingerStd: 2 },
        },
        performance: {
          totalReturn: 0,
          annualizedReturn: 0,
          sharpeRatio: 0,
          maxDrawdown: 0,
          winRate: 0,
          profitFactor: 0,
          totalTrades: 0,
          avgTradeDuration: 0,
          lastUpdated: 0,
        },
        riskLimits: {
          maxPositionSize: 8000,
          maxDrawdown: 0.12,
          maxDailyLoss: 0.04,
          maxLeverage: 1,
          maxCorrelatedPositions: 2,
        },
      },
      {
        id: 'ai-adaptive-v1',
        name: 'Adaptive Strategy',
        type: 'ai_adaptive',
        isActive: true,
        parameters: {
          lookbackPeriod: 30,
          entryThreshold: 0.4,
          exitThreshold: -0.2,
          positionSizePct: 12,
          maxPositions: 6,
          stopLossPct: 6,
          takeProfitPct: 20,
          custom: { adaptiveWeight: true },
        },
        performance: {
          totalReturn: 0,
          annualizedReturn: 0,
          sharpeRatio: 0,
          maxDrawdown: 0,
          winRate: 0,
          profitFactor: 0,
          totalTrades: 0,
          avgTradeDuration: 0,
          lastUpdated: 0,
        },
        riskLimits: {
          maxPositionSize: 15000,
          maxDrawdown: 0.18,
          maxDailyLoss: 0.06,
          maxLeverage: 1,
          maxCorrelatedPositions: 4,
        },
      },
    ];

    for (const strategy of defaultStrategies) {
      this.strategies.set(strategy.id, strategy);
    }
  }

  /**
   * Start the decision engine
   */
  start(): void {
    this.state.status = 'idle';
    eventBus.subscribe('signal.fused', (event) => {
      const fusedSignal = event.payload as FusedSignal;
      this.processDecision(fusedSignal);
    });
    console.log(`[${this.config.name}] Started with ${this.strategies.size} strategies`);
  }

  /**
   * Process a fused signal and generate trade decisions
   */
  private async processDecision(fusedSignal: FusedSignal): Promise<void> {
    const start = Date.now();
    this.state.status = 'processing';

    try {
      // Skip HOLD signals
      if (fusedSignal.finalSignal === 'HOLD') {
        this.state.status = 'idle';
        return;
      }

      // Select best strategy for this signal
      const strategy = this.selectStrategy(fusedSignal);
      if (!strategy) {
        console.log(`[${this.config.name}] No suitable strategy for ${fusedSignal.symbol}`);
        this.state.status = 'idle';
        return;
      }

      // Calculate position size
      const positionSize = this.calculatePositionSize(fusedSignal, strategy);

      // Determine order parameters
      const order = this.createTradeOrder(fusedSignal, strategy, positionSize);

      if (order) {
        this.decisionHistory.push(order);
        if (this.decisionHistory.length > 500) {
          this.decisionHistory = this.decisionHistory.slice(-250);
        }

        await eventBus.emit({
          type: 'strategy.decision',
          payload: { order, strategy: strategy.id, signal: fusedSignal },
          timestamp: Date.now(),
          source: this.config.id,
        });

        console.log(
          `[${this.config.name}] Decision: ${order.side} ${fusedSignal.symbol} ` +
          `via ${strategy.name} (confidence: ${(fusedSignal.confidence * 100).toFixed(1)}%)`
        );
      }

      this.state.status = 'idle';
      this.updateMetrics(Date.now() - start, true);
    } catch (err) {
      this.state.status = 'error';
      this.state.lastError = (err as Error).message;
      this.updateMetrics(Date.now() - start, false);
      console.error(`[${this.config.name}] Error:`, err);
    }
  }

  /**
   * Select the best strategy based on signal characteristics
   */
  private selectStrategy(signal: FusedSignal): Strategy | null {
    const activeStrategies = Array.from(this.strategies.values()).filter((s) => s.isActive);
    if (activeStrategies.length === 0) return null;

    // Score each strategy based on signal characteristics
    let bestStrategy: Strategy | null = null;
    let bestScore = -Infinity;

    for (const strategy of activeStrategies) {
      let score = 0;

      switch (strategy.type) {
        case 'momentum':
          // Momentum works best with strong directional signals
          score = Math.abs(signal.compositeScore) * signal.confidence;
          if (signal.riskAssessment.level === 'LOW') score *= 1.2;
          break;

        case 'mean_reversion':
          // Mean reversion works best with extreme signals that may revert
          if (Math.abs(signal.compositeScore) > 0.6) {
            score = 0.6; // Moderate score for extreme signals
          }
          if (signal.riskAssessment.volatility > 0.3) score *= 1.3;
          break;

        case 'ai_adaptive':
          // Adaptive strategy gets a base score and adjusts for risk
          score = signal.confidence * 0.8;
          if (signal.riskAssessment.level === 'LOW' || signal.riskAssessment.level === 'MEDIUM') {
            score *= 1.1;
          }
          break;

        case 'arbitrage':
          // Arbitrage needs specific conditions (not commonly triggered)
          score = 0.1;
          break;

        case 'grid':
          // Grid works in ranging markets
          if (Math.abs(signal.compositeScore) < 0.3) {
            score = 0.5;
          }
          break;

        case 'dca':
          // DCA is always a moderate option
          score = 0.4;
          break;
      }

      if (score > bestScore) {
        bestScore = score;
        bestStrategy = strategy;
      }
    }

    return bestStrategy;
  }

  /**
   * Calculate position size based on risk parameters
   */
  private calculatePositionSize(signal: FusedSignal, strategy: Strategy): number {
    const baseSize = strategy.parameters.positionSizePct; // % of portfolio
    const confidenceMultiplier = signal.confidence;
    const riskMultiplier = signal.riskAssessment.level === 'LOW' ? 1.0
      : signal.riskAssessment.level === 'MEDIUM' ? 0.7
      : signal.riskAssessment.level === 'HIGH' ? 0.4
      : 0.2;

    const adjustedSize = baseSize * confidenceMultiplier * riskMultiplier;

    // Cap at strategy max
    return Math.min(adjustedSize, strategy.riskLimits.maxPositionSize);
  }

  /**
   * Create a trade order from decision
   */
  private createTradeOrder(
    signal: FusedSignal,
    strategy: Strategy,
    positionSize: number
  ): TradeOrder | null {
    const side: OrderSide = (signal.finalSignal === 'BUY' || signal.finalSignal === 'STRONG_BUY')
      ? 'BUY'
      : 'SELL';

    const orderType: OrderType = signal.confidence > 0.7 ? 'MARKET' : 'LIMIT';

    // Calculate stop loss and take profit
    const currentPrice = signal.contributingSignals[0]?.metadata?.price as number || 0;
    const stopLoss = side === 'BUY'
      ? currentPrice * (1 - strategy.parameters.stopLossPct / 100)
      : currentPrice * (1 + strategy.parameters.stopLossPct / 100);
    const takeProfit = side === 'BUY'
      ? currentPrice * (1 + strategy.parameters.takeProfitPct / 100)
      : currentPrice * (1 - strategy.parameters.takeProfitPct / 100);

    return {
      id: randomUUID(),
      symbol: signal.symbol,
      side,
      type: orderType,
      quantity: positionSize,
      price: orderType === 'LIMIT' ? currentPrice : undefined,
      venue: 'pancakeswap',
      slippage: 0.5, // 0.5% max slippage
      deadline: Date.now() + 300000, // 5 min deadline
      status: 'PENDING',
      strategyId: strategy.id,
      signalId: signal.contributingSignals[0]?.id || 'unknown',
      metadata: {
        stopLoss,
        takeProfit,
        signalScore: signal.compositeScore,
        signalConfidence: signal.confidence,
        riskLevel: signal.riskAssessment.level,
      },
      createdAt: Date.now(),
    };
  }

  addStrategy(strategy: Strategy): void {
    this.strategies.set(strategy.id, strategy);
  }

  removeStrategy(strategyId: string): boolean {
    return this.strategies.delete(strategyId);
  }

  getStrategies(): Strategy[] {
    return Array.from(this.strategies.values());
  }

  getDecisionHistory(limit: number = 50): TradeOrder[] {
    return this.decisionHistory.slice(-limit);
  }

  getState(): AgentState {
    return { ...this.state };
  }

  private updateMetrics(processingTime: number, success: boolean): void {
    this.processingTimes.push(processingTime);
    if (this.processingTimes.length > 100) this.processingTimes.shift();

    const metrics = this.state.metrics;
    metrics.totalRuns++;
    metrics.lastProcessingTime = processingTime;
    metrics.avgProcessingTime =
      this.processingTimes.reduce((a, b) => a + b, 0) / this.processingTimes.length;
    metrics.successRate = success
      ? (metrics.successRate * (metrics.totalRuns - 1) + 1) / metrics.totalRuns
      : (metrics.successRate * (metrics.totalRuns - 1)) / metrics.totalRuns;

    this.state.lastRun = Date.now();
  }
}
