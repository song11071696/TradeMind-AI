// ============================================================
// TradeMind AI - Multi-Layer Risk Management System
// ============================================================
// Layers:
//   1. Position-Level: stop-loss, take-profit, position limits
//   2. Portfolio-Level: max drawdown, daily loss, correlation
//   3. Strategy-Level: strategy-specific limits
//   4. System-Level: emergency stop, circuit breakers
// ============================================================
import type {
  TradeOrder,
  FusedSignal,
  Position,
  PortfolioState,
  RiskLimits,
  RiskLevel,
} from '../types';
import { eventBus } from '../core/event-bus';
import { DEFAULT_RISK_CONFIG, getRiskConfigSummary } from '../config/risk';

/**
 * 频率限制器 - 增强版
 * 增加：连续亏损冷却、最小交易间隔、每小时/每日累计限制
 */
class FrequencyLimiter {
  private tradeTimestamps: number[] = [];
  private consecutiveLosses = 0;
  private cooldownUntil = 0;

  constructor(private config: {
    maxTradesPerMinute: number;
    maxTradesPerHour: number;
    maxTradesPerDay: number;
    minTradeIntervalMs: number;
    cooldownAfterLosses: number;
    cooldownDurationMs: number;
  }) {}

  canTrade(): { allowed: boolean; reason?: string } {
    const now = Date.now();

    // 检查冷却期
    if (now < this.cooldownUntil) {
      const remaining = Math.ceil((this.cooldownUntil - now) / 1000);
      return {
        allowed: false,
        reason: `冷却期中，还需等待 ${remaining} 秒（连续亏损${this.consecutiveLosses}次）`,
      };
    }

    // 清理过期记录（保留24小时）
    this.tradeTimestamps = this.tradeTimestamps.filter(t => now - t < 86400000);

    // 检查最小间隔
    if (this.tradeTimestamps.length > 0) {
      const lastTrade = this.tradeTimestamps[this.tradeTimestamps.length - 1];
      if (now - lastTrade < this.config.minTradeIntervalMs) {
        return {
          allowed: false,
          reason: `交易间隔不足，需等待 ${Math.ceil((this.config.minTradeIntervalMs - (now - lastTrade)) / 1000)} 秒`,
        };
      }
    }

    // 检查每分钟限制
    const tradesLastMinute = this.tradeTimestamps.filter(t => now - t < 60000).length;
    if (tradesLastMinute >= this.config.maxTradesPerMinute) {
      return { allowed: false, reason: `每分钟交易次数已达上限(${this.config.maxTradesPerMinute})` };
    }

    // 检查每小时限制
    const tradesLastHour = this.tradeTimestamps.filter(t => now - t < 3600000).length;
    if (tradesLastHour >= this.config.maxTradesPerHour) {
      return { allowed: false, reason: `每小时交易次数已达上限(${this.config.maxTradesPerHour})` };
    }

    // 检查每日限制
    if (this.tradeTimestamps.length >= this.config.maxTradesPerDay) {
      return { allowed: false, reason: `每日交易次数已达上限(${this.config.maxTradesPerDay})` };
    }

    return { allowed: true };
  }

  recordTrade(profitable: boolean): void {
    this.tradeTimestamps.push(Date.now());
    if (!profitable) {
      this.consecutiveLosses++;
      if (this.consecutiveLosses >= this.config.cooldownAfterLosses) {
        this.cooldownUntil = Date.now() + this.config.cooldownDurationMs;
      }
    } else {
      this.consecutiveLosses = 0;
    }
  }

  getStatus() {
    const now = Date.now();
    return {
      tradesLastMinute: this.tradeTimestamps.filter(t => now - t < 60000).length,
      tradesLastHour: this.tradeTimestamps.filter(t => now - t < 3600000).length,
      tradesLastDay: this.tradeTimestamps.length,
      consecutiveLosses: this.consecutiveLosses,
      inCooldown: now < this.cooldownUntil,
    };
  }
}

/**
 * 动态相关性监控器 - 基于皮尔逊相关系数
 * 替代原有的静态分组检查
 */
class DynamicCorrelationMonitor {
  private priceHistory: Map<string, number[]> = new Map();
  private correlationMatrix: Map<string, number> = new Map();
  private lastCalculation = 0;

  constructor(private config: {
    windowSize: number;
    highCorrelationThreshold: number;
    maxHighCorrelationPairs: number;
    recalculationIntervalMs: number;
  }) {}

  updatePrice(symbol: string, price: number): void {
    if (!this.priceHistory.has(symbol)) {
      this.priceHistory.set(symbol, []);
    }
    const history = this.priceHistory.get(symbol)!;
    history.push(price);
    if (history.length > this.config.windowSize) {
      history.shift();
    }
  }

  private calculateCorrelation(series1: number[], series2: number[]): number {
    const n = Math.min(series1.length, series2.length, this.config.windowSize);
    if (n < 10) return 0;

    const s1 = series1.slice(-n);
    const s2 = series2.slice(-n);

    // 计算收益率序列
    const returns1: number[] = [];
    const returns2: number[] = [];
    for (let i = 1; i < n; i++) {
      returns1.push((s1[i] - s1[i - 1]) / s1[i - 1]);
      returns2.push((s2[i] - s2[i - 1]) / s2[i - 1]);
    }

    const m = returns1.length;
    const mean1 = returns1.reduce((a, b) => a + b, 0) / m;
    const mean2 = returns2.reduce((a, b) => a + b, 0) / m;

    let cov = 0, var1 = 0, var2 = 0;
    for (let i = 0; i < m; i++) {
      const d1 = returns1[i] - mean1;
      const d2 = returns2[i] - mean2;
      cov += d1 * d2;
      var1 += d1 * d1;
      var2 += d2 * d2;
    }

    const denom = Math.sqrt(var1 * var2);
    return denom === 0 ? 0 : cov / denom;
  }

  recalculateMatrix(): void {
    const now = Date.now();
    if (now - this.lastCalculation < this.config.recalculationIntervalMs) return;

    const symbols = Array.from(this.priceHistory.keys());
    this.correlationMatrix.clear();

    for (let i = 0; i < symbols.length; i++) {
      for (let j = i + 1; j < symbols.length; j++) {
        const key = `${symbols[i]}-${symbols[j]}`;
        const corr = this.calculateCorrelation(
          this.priceHistory.get(symbols[i])!,
          this.priceHistory.get(symbols[j])!
        );
        this.correlationMatrix.set(key, corr);
      }
    }
    this.lastCalculation = now;
  }

  assessCorrelationRisk(positions: Record<string, number>): {
    allowed: boolean;
    risk: 'LOW' | 'MEDIUM' | 'HIGH';
    details: { highCorrelationPairs: Array<{ pair: string; correlation: number }> };
  } {
    this.recalculateMatrix();

    const highCorrelationPairs: Array<{ pair: string; correlation: number }> = [];
    const symbols = Object.keys(positions);

    for (let i = 0; i < symbols.length; i++) {
      for (let j = i + 1; j < symbols.length; j++) {
        const key = [symbols[i], symbols[j]].sort().join('-');
        const corr = Math.abs(this.correlationMatrix.get(key) || 0);
        if (corr >= this.config.highCorrelationThreshold) {
          highCorrelationPairs.push({ pair: key, correlation: parseFloat(corr.toFixed(4)) });
        }
      }
    }

    const riskLevel = highCorrelationPairs.length > this.config.maxHighCorrelationPairs
      ? 'HIGH' : highCorrelationPairs.length > 0 ? 'MEDIUM' : 'LOW';

    return {
      allowed: riskLevel !== 'HIGH',
      risk: riskLevel,
      details: { highCorrelationPairs },
    };
  }
}

export type RiskCheckResult = {
  approved: boolean;
  layer: string;
  reason: string;
  severity: RiskLevel;
  adjustments?: Partial<TradeOrder>;
};

export interface RiskState {
  isEmergencyStop: boolean;
  emergencyStopReason: string;
  circuitBreakerTripped: boolean;
  circuitBreakerResetTime: number;
  consecutiveFailures: number;
  dailyLoss: number;
  dailyLossDate: string;
  peakPortfolioValue: number;
  currentDrawdown: number;
  lastRiskCheck: number;
}

export interface RiskConfig {
  globalLimits: RiskLimits;
  positionStopLossPct: number;
  positionTakeProfitPct: number;
  maxOpenPositions: number;
  maxOrdersPerMinute: number;
  maxDailyTrades: number;
  circuitBreakerThreshold: number;    // consecutive failures before tripping
  circuitBreakerCooldownMs: number;   // cooldown period after trip
  emergencyStopDrawdownPct: number;   // drawdown % that triggers emergency stop
  emergencyStopDailyLossPct: number;  // daily loss % that triggers emergency stop
  maxCorrelationExposure: number;     // max % in correlated assets
  minTimeBetweenTradesMs: number;     // minimum time between trades for same symbol
}

export class RiskManager {
  private config: RiskConfig;
  private state: RiskState;
  private orderTimestamps: Map<string, number[]> = new Map(); // symbol => timestamps
  private symbolLastTrade: Map<string, number> = new Map();
  private correlationGroups: Map<string, string[]> = new Map(); // group => symbols
  private frequencyLimiter: FrequencyLimiter;
  private dynamicCorrelation: DynamicCorrelationMonitor;

  constructor(config?: Partial<RiskConfig>) {
    this.config = {
      ...DEFAULT_RISK_CONFIG,
      ...config,
    };

    this.state = {
      isEmergencyStop: false,
      emergencyStopReason: '',
      circuitBreakerTripped: false,
      circuitBreakerResetTime: 0,
      consecutiveFailures: 0,
      dailyLoss: 0,
      dailyLossDate: new Date().toISOString().split('T')[0],
      peakPortfolioValue: 0,
      currentDrawdown: 0,
      lastRiskCheck: Date.now(),
    };

    // Define correlation groups
    this.correlationGroups.set('layer1', ['BTC', 'ETH', 'BNB']);
    this.correlationGroups.set('defi', ['CAKE', 'UNI', 'SUSHI']);
    this.correlationGroups.set('stablecoins', ['USDT', 'USDC', 'BUSD']);

    // ===== 新增：初始化增强风控层 =====
    this.frequencyLimiter = new FrequencyLimiter({
      maxTradesPerMinute: this.config.maxOrdersPerMinute || 3,
      maxTradesPerHour: 20,
      maxTradesPerDay: this.config.maxDailyTrades || 100,
      minTradeIntervalMs: this.config.minTimeBetweenTradesMs || 10000,
      cooldownAfterLosses: 3,
      cooldownDurationMs: 300000, // 5分钟
    });

    this.dynamicCorrelation = new DynamicCorrelationMonitor({
      windowSize: 100,
      highCorrelationThreshold: 0.8,
      maxHighCorrelationPairs: 2,
      recalculationIntervalMs: 60000,
    });
  }

  start(): void {
    // Listen for order events to track failures
    eventBus.subscribe('order.failed', (event) => {
      this.state.consecutiveFailures++;
      if (this.state.consecutiveFailures >= this.config.circuitBreakerThreshold) {
        this.tripCircuitBreaker('Too many consecutive order failures');
      }
    });

    eventBus.subscribe('order.filled', () => {
      this.state.consecutiveFailures = 0; // Reset on success
    });

    // Periodic state checks
    setInterval(() => this.periodicCheck(), 10000);

    console.log('[Risk Manager] Started (multi-layer protection active)');
  }

  // ===================== Pre-Trade Risk Checks =====================

  /**
   * Run all risk checks before approving a trade order
   * Returns the first rejection or approves if all pass
   */
  async checkOrder(order: TradeOrder, portfolio: PortfolioState): Promise<RiskCheckResult> {
    this.state.lastRiskCheck = Date.now();

    // Layer 0: System-level checks (highest priority)
    const systemCheck = this.checkSystemLevel(order, portfolio);
    if (!systemCheck.approved) return systemCheck;

    // Layer 1: Portfolio-level checks
    const portfolioCheck = this.checkPortfolioLevel(order, portfolio);
    if (!portfolioCheck.approved) return portfolioCheck;

    // Layer 2: Position-level checks
    const positionCheck = this.checkPositionLevel(order, portfolio);
    if (!positionCheck.approved) return positionCheck;

    // Layer 3: Rate limiting
    const rateCheck = this.checkRateLimits(order);
    if (!rateCheck.approved) return rateCheck;

    // Layer 4: Correlation checks
    const correlationCheck = this.checkCorrelation(order, portfolio);
    if (!correlationCheck.approved) return correlationCheck;

    // ===== 新增 Layer 5: 增强频率限制 =====
    const frequencyCheck = this.frequencyLimiter.canTrade();
    if (!frequencyCheck.allowed) {
      return {
        approved: false,
        layer: 'frequency.limit',
        reason: frequencyCheck.reason || '频率限制',
        severity: 'MEDIUM',
      };
    }

    // ===== 新增 Layer 6: 动态相关性检查 =====
    const positionWeights: Record<string, number> = {};
    for (const pos of portfolio.positions) {
      if (pos.side === 'BUY') {
        positionWeights[pos.symbol] = (positionWeights[pos.symbol] || 0) + pos.quantity * pos.currentPrice;
      }
    }
    // 如果是BUY订单，加入即将开仓的资产
    if (order.side === 'BUY') {
      const orderValue = (order.executedPrice || order.price || 0) * order.quantity;
      positionWeights[order.symbol] = (positionWeights[order.symbol] || 0) + orderValue;
    }

    if (Object.keys(positionWeights).length >= 2) {
      const dynamicCorrCheck = this.dynamicCorrelation.assessCorrelationRisk(positionWeights);
      if (!dynamicCorrCheck.allowed) {
        return {
          approved: false,
          layer: 'correlation.dynamic',
          reason: `高相关性资产对过多: ${dynamicCorrCheck.details.highCorrelationPairs.map(p => `${p.pair}(${p.correlation})`).join(', ')}`,
          severity: 'HIGH',
        };
      }
    }

    // All checks passed
    return {
      approved: true,
      layer: 'all',
      reason: 'All risk checks passed',
      severity: 'LOW',
    };
  }

  // ===================== Layer 0: System-Level =====================

  private checkSystemLevel(order: TradeOrder, portfolio: PortfolioState): RiskCheckResult {
    // Emergency stop check
    if (this.state.isEmergencyStop) {
      return {
        approved: false,
        layer: 'system.emergency_stop',
        reason: `Emergency stop active: ${this.state.emergencyStopReason}`,
        severity: 'EXTREME',
      };
    }

    // Circuit breaker check
    if (this.state.circuitBreakerTripped) {
      if (Date.now() < this.state.circuitBreakerResetTime) {
        const remaining = Math.ceil((this.state.circuitBreakerResetTime - Date.now()) / 1000);
        return {
          approved: false,
          layer: 'system.circuit_breaker',
          reason: `Circuit breaker tripped. Resets in ${remaining}s`,
          severity: 'HIGH',
        };
      } else {
        // Reset circuit breaker
        this.state.circuitBreakerTripped = false;
        console.log('[Risk Manager] Circuit breaker reset');
      }
    }

    return { approved: true, layer: 'system', reason: 'OK', severity: 'LOW' };
  }

  // ===================== Layer 1: Portfolio-Level =====================

  private checkPortfolioLevel(order: TradeOrder, portfolio: PortfolioState): RiskCheckResult {
    // Update daily loss tracking
    this.updateDailyLoss(portfolio);

    // Update drawdown
    if (portfolio.totalValue > this.state.peakPortfolioValue) {
      this.state.peakPortfolioValue = portfolio.totalValue;
    }
    this.state.currentDrawdown = this.state.peakPortfolioValue > 0
      ? (this.state.peakPortfolioValue - portfolio.totalValue) / this.state.peakPortfolioValue
      : 0;

    // Check emergency stop conditions
    if (this.state.currentDrawdown >= this.config.emergencyStopDrawdownPct) {
      this.triggerEmergencyStop(`Drawdown ${(this.state.currentDrawdown * 100).toFixed(1)}% exceeds ${this.config.emergencyStopDrawdownPct * 100}%`);
      return {
        approved: false,
        layer: 'portfolio.drawdown_emergency',
        reason: `Emergency stop: drawdown ${(this.state.currentDrawdown * 100).toFixed(1)}%`,
        severity: 'EXTREME',
      };
    }

    if (this.state.dailyLoss >= this.config.emergencyStopDailyLossPct) {
      this.triggerEmergencyStop(`Daily loss ${(this.state.dailyLoss * 100).toFixed(1)}% exceeds ${this.config.emergencyStopDailyLossPct * 100}%`);
      return {
        approved: false,
        layer: 'portfolio.daily_loss_emergency',
        reason: `Emergency stop: daily loss ${(this.state.dailyLoss * 100).toFixed(1)}%`,
        severity: 'EXTREME',
      };
    }

    // Max drawdown warning/rejection
    if (this.state.currentDrawdown >= this.config.globalLimits.maxDrawdown) {
      eventBus.emit({
        type: 'risk.drawdown_breach',
        payload: { drawdown: this.state.currentDrawdown, limit: this.config.globalLimits.maxDrawdown },
        timestamp: Date.now(),
        source: 'risk-manager',
      });

      return {
        approved: false,
        layer: 'portfolio.max_drawdown',
        reason: `Drawdown ${(this.state.currentDrawdown * 100).toFixed(1)}% exceeds limit ${this.config.globalLimits.maxDrawdown * 100}%`,
        severity: 'HIGH',
      };
    }

    // Daily loss limit
    if (this.state.dailyLoss >= this.config.globalLimits.maxDailyLoss) {
      eventBus.emit({
        type: 'risk.daily_loss_breach',
        payload: { dailyLoss: this.state.dailyLoss, limit: this.config.globalLimits.maxDailyLoss },
        timestamp: Date.now(),
        source: 'risk-manager',
      });

      return {
        approved: false,
        layer: 'portfolio.daily_loss',
        reason: `Daily loss ${(this.state.dailyLoss * 100).toFixed(1)}% exceeds limit ${this.config.globalLimits.maxDailyLoss * 100}%`,
        severity: 'HIGH',
      };
    }

    // Max open positions
    if (portfolio.positions.length >= this.config.maxOpenPositions && order.side === 'BUY') {
      return {
        approved: false,
        layer: 'portfolio.max_positions',
        reason: `Max open positions (${this.config.maxOpenPositions}) reached`,
        severity: 'MEDIUM',
      };
    }

    // Sufficient balance for buy orders
    if (order.side === 'BUY') {
      const cost = (order.executedPrice || order.price || 0) * order.quantity;
      if (cost > portfolio.availableBalance * 0.95) { // 95% to leave buffer for gas
        return {
          approved: false,
          layer: 'portfolio.insufficient_balance',
          reason: `Insufficient balance: need $${cost.toFixed(2)}, have $${portfolio.availableBalance.toFixed(2)}`,
          severity: 'MEDIUM',
        };
      }
    }

    return { approved: true, layer: 'portfolio', reason: 'OK', severity: 'LOW' };
  }

  // ===================== Layer 2: Position-Level =====================

  private checkPositionLevel(order: TradeOrder, portfolio: PortfolioState): RiskCheckResult {
    // Position size limit
    const maxSize = this.config.globalLimits.maxPositionSize;
    const orderValue = (order.executedPrice || order.price || 0) * order.quantity;

    if (orderValue > maxSize) {
      return {
        approved: false,
        layer: 'position.max_size',
        reason: `Order value $${orderValue.toFixed(2)} exceeds max position size $${maxSize}`,
        severity: 'MEDIUM',
        adjustments: { quantity: maxSize / (order.executedPrice || order.price || 1) },
      };
    }

    // Check if adding to existing position would exceed limits
    if (order.side === 'BUY') {
      const existingPos = portfolio.positions.find(
        (p) => p.symbol === order.symbol && p.side === 'BUY'
      );
      if (existingPos) {
        const totalValue = existingPos.quantity * existingPos.currentPrice + orderValue;
        if (totalValue > maxSize) {
          return {
            approved: false,
            layer: 'position.aggregate_size',
            reason: `Total position in ${order.symbol} would be $${totalValue.toFixed(2)}, exceeds $${maxSize}`,
            severity: 'MEDIUM',
          };
        }
      }
    }

    // Minimum time between trades for same symbol
    const lastTrade = this.symbolLastTrade.get(order.symbol);
    if (lastTrade && Date.now() - lastTrade < this.config.minTimeBetweenTradesMs) {
      const remaining = Math.ceil((this.config.minTimeBetweenTradesMs - (Date.now() - lastTrade)) / 1000);
      return {
        approved: false,
        layer: 'position.min_interval',
        reason: `Too soon for ${order.symbol}. Wait ${remaining}s`,
        severity: 'LOW',
      };
    }

    return { approved: true, layer: 'position', reason: 'OK', severity: 'LOW' };
  }

  // ===================== Layer 3: Rate Limiting =====================

  private checkRateLimits(order: TradeOrder): RiskCheckResult {
    const now = Date.now();

    // Per-symbol rate limiting
    if (!this.orderTimestamps.has(order.symbol)) {
      this.orderTimestamps.set(order.symbol, []);
    }
    const timestamps = this.orderTimestamps.get(order.symbol)!;

    // Clean old timestamps (older than 1 minute)
    const recentTimestamps = timestamps.filter((t) => now - t < 60000);
    this.orderTimestamps.set(order.symbol, recentTimestamps);

    if (recentTimestamps.length >= this.config.maxOrdersPerMinute) {
      return {
        approved: false,
        layer: 'rate.orders_per_minute',
        reason: `Rate limit: ${recentTimestamps.length} orders in last minute for ${order.symbol}`,
        severity: 'MEDIUM',
      };
    }

    // Daily trade count
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayTimestamps = timestamps.filter((t) => t >= todayStart.getTime());
    if (todayTimestamps.length >= this.config.maxDailyTrades) {
      return {
        approved: false,
        layer: 'rate.daily_trades',
        reason: `Daily trade limit (${this.config.maxDailyTrades}) reached`,
        severity: 'MEDIUM',
      };
    }

    // Record this order timestamp
    recentTimestamps.push(now);
    this.orderTimestamps.set(order.symbol, recentTimestamps);
    this.symbolLastTrade.set(order.symbol, now);

    return { approved: true, layer: 'rate', reason: 'OK', severity: 'LOW' };
  }

  // ===================== Layer 4: Correlation Checks =====================

  private checkCorrelation(order: TradeOrder, portfolio: PortfolioState): RiskCheckResult {
    if (order.side !== 'BUY') return { approved: true, layer: 'correlation', reason: 'OK', severity: 'LOW' };

    // Find which correlation group this symbol belongs to
    let group: string | null = null;
    for (const [groupName, symbols] of Array.from(this.correlationGroups.entries())) {
      if (symbols.includes(order.symbol)) {
        group = groupName;
        break;
      }
    }

    if (!group) return { approved: true, layer: 'correlation', reason: 'No correlation group', severity: 'LOW' };

    // Count positions in the same correlation group
    const groupSymbols = this.correlationGroups.get(group) || [];
    const correlatedPositions = portfolio.positions.filter(
      (p) => groupSymbols.includes(p.symbol) && p.side === 'BUY'
    );

    if (correlatedPositions.length >= this.config.globalLimits.maxCorrelatedPositions) {
      return {
        approved: false,
        layer: 'correlation.max_correlated',
        reason: `Max ${this.config.globalLimits.maxCorrelatedPositions} correlated positions in ${group} group`,
        severity: 'MEDIUM',
      };
    }

    // Check total exposure in correlated group
    const groupExposure = correlatedPositions.reduce(
      (sum, p) => sum + p.quantity * p.currentPrice, 0
    );
    const totalPortfolioValue = portfolio.totalValue;
    const orderValue = (order.executedPrice || order.price || 0) * order.quantity;
    const newGroupExposure = (groupExposure + orderValue) / totalPortfolioValue;

    if (newGroupExposure > this.config.maxCorrelationExposure) {
      return {
        approved: false,
        layer: 'correlation.exposure',
        reason: `${group} exposure would be ${(newGroupExposure * 100).toFixed(1)}%, max ${this.config.maxCorrelationExposure * 100}%`,
        severity: 'MEDIUM',
      };
    }

    return { approved: true, layer: 'correlation', reason: 'OK', severity: 'LOW' };
  }

  // ===================== System Controls =====================

  private triggerEmergencyStop(reason: string): void {
    this.state.isEmergencyStop = true;
    this.state.emergencyStopReason = reason;

    console.error(`[Risk Manager] 🚨 EMERGENCY STOP: ${reason}`);

    eventBus.emit({
      type: 'risk.emergency_stop',
      payload: { reason, timestamp: Date.now() },
      timestamp: Date.now(),
      source: 'risk-manager',
    });
  }

  clearEmergencyStop(): void {
    this.state.isEmergencyStop = false;
    this.state.emergencyStopReason = '';
    console.log('[Risk Manager] Emergency stop cleared');
  }

  private tripCircuitBreaker(reason: string): void {
    this.state.circuitBreakerTripped = true;
    this.state.circuitBreakerResetTime = Date.now() + this.config.circuitBreakerCooldownMs;

    console.warn(`[Risk Manager] ⚡ Circuit breaker tripped: ${reason}`);

    eventBus.emit({
      type: 'risk.alert',
      payload: { type: 'circuit_breaker', reason, resetTime: this.state.circuitBreakerResetTime },
      timestamp: Date.now(),
      source: 'risk-manager',
    });
  }

  // ===================== Utility =====================

  private updateDailyLoss(portfolio: PortfolioState): void {
    const today = new Date().toISOString().split('T')[0];
    if (today !== this.state.dailyLossDate) {
      // New day - reset daily loss tracking
      this.state.dailyLoss = 0;
      this.state.dailyLossDate = today;
    }

    // Calculate daily loss from portfolio change
    if (this.state.peakPortfolioValue > 0) {
      const dailyLossAmount = this.state.peakPortfolioValue - portfolio.totalValue;
      this.state.dailyLoss = dailyLossAmount > 0
        ? dailyLossAmount / this.state.peakPortfolioValue
        : 0;
    }
  }

  private periodicCheck(): void {
    // Reset circuit breaker if cooldown has passed
    if (this.state.circuitBreakerTripped && Date.now() >= this.state.circuitBreakerResetTime) {
      this.state.circuitBreakerTripped = false;
      this.state.consecutiveFailures = 0;
      console.log('[Risk Manager] Circuit breaker auto-reset after cooldown');
    }
  }

  // ===================== Accessors =====================

  getState(): RiskState {
    return { ...this.state };
  }

  getConfig(): RiskConfig {
    return { ...this.config };
  }

  /**
   * Get a formatted summary of all risk configuration parameters
   */
  getConfigSummary(): Record<string, unknown> {
    return getRiskConfigSummary(this.config);
  }

  isTradingAllowed(): boolean {
    return !this.state.isEmergencyStop && !this.state.circuitBreakerTripped;
  }

  /**
   * Add a custom correlation group
   */
  addCorrelationGroup(name: string, symbols: string[]): void {
    this.correlationGroups.set(name, symbols);
  }

  /**
   * Update risk configuration
   */
  updateConfig(updates: Partial<RiskConfig>): void {
    Object.assign(this.config, updates);
    console.log('[Risk Manager] Configuration updated');
  }

  // ===== 新增：供外部调用的方法 =====

  /** 记录交易结果（用于频率层冷却机制） */
  recordTradeResult(profitable: boolean): void {
    this.frequencyLimiter.recordTrade(profitable);
  }

  /** 更新价格数据（用于动态相关性计算） */
  updatePriceData(symbol: string, price: number): void {
    this.dynamicCorrelation.updatePrice(symbol, price);
  }

  /** 获取增强风控状态 */
  getEnhancedStatus() {
    return {
      frequency: this.frequencyLimiter.getStatus(),
      correlation: this.dynamicCorrelation.assessCorrelationRisk({}),
    };
  }
}
