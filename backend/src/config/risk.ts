// ============================================================
// TradeMind AI - Centralized Risk Configuration
// ============================================================
// All risk management parameters in one place.
// Loaded by RiskManager constructor; overridable via env vars
// and POST /api/risk/config at runtime.
// ============================================================
import type { RiskConfig } from '../core/risk-manager';

/**
 * Default risk configuration.
 * Environment variables override individual fields when present.
 */
export const DEFAULT_RISK_CONFIG: RiskConfig = {
  globalLimits: {
    maxPositionSize: parseFloat(process.env.MAX_POSITION_SIZE || '10000'),
    maxDrawdown: parseFloat(process.env.MAX_DRAWDOWN || '0.15'),
    maxDailyLoss: parseFloat(process.env.MAX_DAILY_LOSS || '0.05'),
    maxLeverage: parseInt(process.env.MAX_LEVERAGE || '1'),
    maxCorrelatedPositions: parseInt(process.env.MAX_CORRELATED_POSITIONS || '3'),
  },

  // Position-level
  positionStopLossPct: parseFloat(process.env.RISK_STOP_LOSS_PCT || '5'),
  positionTakeProfitPct: parseFloat(process.env.RISK_TAKE_PROFIT_PCT || '15'),
  maxOpenPositions: parseInt(process.env.RISK_MAX_OPEN_POSITIONS || '10'),

  // Rate limiting
  maxOrdersPerMinute: parseInt(process.env.RISK_MAX_ORDERS_PER_MINUTE || '5'),
  maxDailyTrades: parseInt(process.env.RISK_MAX_DAILY_TRADES || '50'),

  // Circuit breaker
  circuitBreakerThreshold: parseInt(process.env.RISK_CB_THRESHOLD || '3'),
  circuitBreakerCooldownMs: parseInt(process.env.RISK_CB_COOLDOWN_MS || '300000'), // 5 min

  // Emergency stop
  emergencyStopDrawdownPct: parseFloat(process.env.RISK_EMERGENCY_DRAWDOWN_PCT || '0.20'),
  emergencyStopDailyLossPct: parseFloat(process.env.RISK_EMERGENCY_DAILY_LOSS_PCT || '0.10'),

  // Correlation
  maxCorrelationExposure: parseFloat(process.env.RISK_MAX_CORRELATION_EXPOSURE || '0.4'),

  // Trading speed
  minTimeBetweenTradesMs: parseInt(process.env.RISK_MIN_TRADE_INTERVAL_MS || '60000'), // 1 min
};

/**
 * Get a snapshot of the current risk config (for API responses).
 * Returns a plain object with all parameter names and current values.
 */
export function getRiskConfigSummary(config: RiskConfig): Record<string, unknown> {
  return {
    globalLimits: { ...config.globalLimits },
    positionStopLossPct: config.positionStopLossPct,
    positionTakeProfitPct: config.positionTakeProfitPct,
    maxOpenPositions: config.maxOpenPositions,
    maxOrdersPerMinute: config.maxOrdersPerMinute,
    maxDailyTrades: config.maxDailyTrades,
    circuitBreakerThreshold: config.circuitBreakerThreshold,
    circuitBreakerCooldownMs: config.circuitBreakerCooldownMs,
    emergencyStopDrawdownPct: config.emergencyStopDrawdownPct,
    emergencyStopDailyLossPct: config.emergencyStopDailyLossPct,
    maxCorrelationExposure: config.maxCorrelationExposure,
    minTimeBetweenTradesMs: config.minTimeBetweenTradesMs,
  };
}
