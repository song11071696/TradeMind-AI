// ============================================================
// TradeMind AI - API Routes
// ============================================================
import type { FastifyInstance } from 'fastify';
import type { SignalFusionEngine } from '../agents/signal-fusion';
import type { StrategyDecisionEngine } from '../agents/strategy-decision';
import type { ExecutionEngine } from '../agents/execution';
import type { CMCDataSource } from '../data-sources/cmc';
import type { EventBus } from '../core/event-bus';
import type { RiskManager } from '../core/risk-manager';
import type { PnLTracker } from '../core/pnl-tracker';
import type { AdaptiveDCAStrategy } from '../strategies/dca';

interface RouteDeps {
  signalEngine: SignalFusionEngine;
  strategyEngine: StrategyDecisionEngine;
  executionEngine: ExecutionEngine;
  cmc: CMCDataSource;
  eventBus: EventBus;
  riskManager: RiskManager;
  pnlTracker: PnLTracker;
  dcaStrategy: AdaptiveDCAStrategy;
}

export function registerAPIRoutes(server: FastifyInstance, deps: RouteDeps): void {
  const { signalEngine, strategyEngine, executionEngine, cmc, eventBus, riskManager, pnlTracker, dcaStrategy } = deps;

  // ---- API Key Authentication Middleware ----
  const API_KEY = process.env.API_KEY;
  if (!API_KEY) {
    console.warn('[API] ⚠️  API_KEY not set — write endpoints are UNPROTECTED. Set API_KEY in .env for production.');
  }

  /**
   * Pre-handler hook for protected (write) routes.
   * Reads the API key from the `x-api-key` header.
   */
  server.addHook('onRequest', async (request, reply) => {
    // Only protect POST/PUT/PATCH/DELETE routes
    const method = request.method.toUpperCase();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return;

    // Skip auth if no API_KEY configured (dev mode warning above)
    if (!API_KEY) return;

    const provided = request.headers['x-api-key'] as string | undefined;
    if (!provided || provided !== API_KEY) {
      reply.code(401).send({ error: 'Unauthorized', message: 'Valid x-api-key header required' });
      return;
    }
  });

  // ---- Risk Config Validation ----
  const ALLOWED_RISK_CONFIG_KEYS = new Set([
    'positionStopLossPct',
    'positionTakeProfitPct',
    'maxOpenPositions',
    'maxOrdersPerMinute',
    'maxDailyTrades',
    'circuitBreakerThreshold',
    'circuitBreakerCooldownMs',
    'emergencyStopDrawdownPct',
    'emergencyStopDailyLossPct',
    'maxCorrelationExposure',
    'minTimeBetweenTradesMs',
    'globalLimits',
  ]);

  function validateRiskConfig(body: Record<string, unknown>): string[] {
    const errors: string[] = [];
    if (!body || typeof body !== 'object') {
      errors.push('Request body must be a JSON object');
      return errors;
    }
    // Reject unknown keys to prevent prototype pollution / config injection
    for (const key of Object.keys(body)) {
      if (!ALLOWED_RISK_CONFIG_KEYS.has(key)) {
        errors.push(`Unknown config key: ${key}`);
      }
    }
    // Type + range checks for numeric fields
    const numericPositive: Record<string, [number, number]> = {
      positionStopLossPct: [0.01, 100],
      positionTakeProfitPct: [0.01, 1000],
      maxOpenPositions: [1, 1000],
      maxOrdersPerMinute: [1, 1000],
      maxDailyTrades: [1, 100000],
      circuitBreakerThreshold: [1, 100],
      circuitBreakerCooldownMs: [1000, 86400000],      // 1s – 24h
      emergencyStopDrawdownPct: [0.01, 1],
      emergencyStopDailyLossPct: [0.01, 1],
      maxCorrelationExposure: [0.01, 1],
      minTimeBetweenTradesMs: [0, 86400000],
    };
    for (const [key, [min, max]] of Object.entries(numericPositive)) {
      if (key in body) {
        const val = body[key];
        if (typeof val !== 'number' || Number.isNaN(val)) {
          errors.push(`${key} must be a number`);
        } else if (val < min || val > max) {
          errors.push(`${key} must be between ${min} and ${max}`);
        }
      }
    }
    // Validate globalLimits sub-object if provided
    if ('globalLimits' in body) {
      const gl = body.globalLimits as Record<string, unknown>;
      if (!gl || typeof gl !== 'object') {
        errors.push('globalLimits must be an object');
      } else {
        const glChecks: Record<string, [number, number]> = {
          maxPositionSize: [1, 1_000_000_000],
          maxDrawdown: [0.01, 1],
          maxDailyLoss: [0.01, 1],
          maxLeverage: [1, 125],
          maxCorrelatedPositions: [1, 100],
        };
        for (const [gk, [gmin, gmax]] of Object.entries(glChecks)) {
          if (gk in gl) {
            const v = gl[gk];
            if (typeof v !== 'number' || Number.isNaN(v)) {
              errors.push(`globalLimits.${gk} must be a number`);
            } else if (v < gmin || v > gmax) {
              errors.push(`globalLimits.${gk} must be between ${gmin} and ${gmax}`);
            }
          }
        }
        // Reject unknown keys in globalLimits
        for (const gk of Object.keys(gl)) {
          if (!['maxPositionSize', 'maxDrawdown', 'maxDailyLoss', 'maxLeverage', 'maxCorrelatedPositions'].includes(gk)) {
            errors.push(`Unknown globalLimits key: ${gk}`);
          }
        }
      }
    }
    return errors;
  }

  // ---- Health ----
  server.get('/api/health', async () => ({
    status: 'ok',
    name: 'TradeMind AI',
    version: '2.0.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    agents: {
      signalFusion: signalEngine.getState().status,
      strategyDecision: strategyEngine.getState().status,
      execution: executionEngine.getState().status,
    },
    systems: {
      riskManager: riskManager.isTradingAllowed() ? 'active' : 'blocked',
      pnlTracker: 'active',
      dcaStrategy: 'active',
    },
    dataSources: {
      cmc: cmc.isOnline() ? 'connected' : 'offline',
    },
  }));

  // ---- Signals ----
  server.get('/api/signals', async () => ({
    buffer: Object.fromEntries(signalEngine.getSignalBuffer()),
    weights: signalEngine.getWeights(),
    fusionHistory: signalEngine.getFusionHistory(20),
    engineState: signalEngine.getState(),
  }));

  // ---- Strategies ----
  server.get('/api/strategies', async () => ({
    strategies: strategyEngine.getStrategies(),
    recentDecisions: strategyEngine.getDecisionHistory(20),
    engineState: strategyEngine.getState(),
  }));

  // ---- Portfolio ----
  server.get('/api/portfolio', async () => ({
    portfolio: executionEngine.getPortfolio(),
    recentTrades: executionEngine.getExecutionHistory(20),
    orderQueue: executionEngine.getOrderQueue(),
    engineState: executionEngine.getState(),
  }));

  // ---- PnL ----
  server.get('/api/pnl', async () => ({
    metrics: pnlTracker.getMetrics(executionEngine.getPortfolio()),
    recentTrades: pnlTracker.getTradeHistory(20),
    recentSnapshots: pnlTracker.getSnapshots(50),
    latestSnapshot: pnlTracker.getLatestSnapshot(),
  }));

  server.get('/api/pnl/metrics', async () => ({
    metrics: pnlTracker.getMetrics(executionEngine.getPortfolio()),
  }));

  server.get('/api/pnl/snapshots', async (request) => {
    const { limit } = request.query as { limit?: string };
    return { snapshots: pnlTracker.getSnapshots(parseInt(limit || '100')) };
  });

  server.get('/api/pnl/trades', async (request) => {
    const { limit } = request.query as { limit?: string };
    return { trades: pnlTracker.getTradeHistory(parseInt(limit || '50')) };
  });

  // ---- Risk ----
  server.get('/api/risk', async () => ({
    state: riskManager.getState(),
    config: riskManager.getConfig(),
    isTradingAllowed: riskManager.isTradingAllowed(),
  }));

  server.get('/api/risk/config', async () => ({
    config: riskManager.getConfigSummary(),
    source: 'centralized (backend/src/config/risk.ts)',
    overridable: 'POST /api/risk/config to update at runtime',
  }));

  server.post('/api/risk/emergency-stop/clear', async () => {
    riskManager.clearEmergencyStop();
    return { status: 'ok', message: 'Emergency stop cleared' };
  });

  server.post('/api/risk/config', async (request, reply) => {
    const body = request.body as Record<string, unknown>;

    // Validate input
    const errors = validateRiskConfig(body);
    if (errors.length > 0) {
      reply.code(400).send({ error: 'Validation failed', details: errors });
      return;
    }

    riskManager.updateConfig(body as any);
    return { status: 'ok', config: riskManager.getConfig() };
  });

  // ---- DCA ----
  server.get('/api/dca', async () => {
    const states: Record<string, any> = {};
    const symbols = ['BTC', 'ETH', 'BNB'];
    for (const symbol of symbols) {
      states[symbol] = {
        state: dcaStrategy.getState(symbol),
        config: dcaStrategy.getConfig(symbol),
        recentOrders: dcaStrategy.getOrderHistory(symbol, 10),
      };
    }
    return { strategies: states };
  });

  server.get('/api/dca/:symbol', async (request) => {
    const { symbol } = request.params as { symbol: string };
    const sym = symbol.toUpperCase();
    return {
      state: dcaStrategy.getState(sym),
      config: dcaStrategy.getConfig(sym),
      orders: dcaStrategy.getOrderHistory(sym, 50),
    };
  });

  server.post('/api/dca/:symbol/activate', async (request) => {
    const { symbol } = request.params as { symbol: string };
    dcaStrategy.setActive(symbol.toUpperCase(), true);
    return { status: 'ok', message: `DCA activated for ${symbol}` };
  });

  server.post('/api/dca/:symbol/deactivate', async (request) => {
    const { symbol } = request.params as { symbol: string };
    dcaStrategy.setActive(symbol.toUpperCase(), false);
    return { status: 'ok', message: `DCA deactivated for ${symbol}` };
  });

  // ---- Market Data ----
  server.get('/api/market/:symbol', async (request) => {
    const { symbol } = request.params as { symbol: string };
    try {
      const quotes = await cmc.getLatestQuotes([symbol.toUpperCase()]);
      return { data: quotes[symbol.toUpperCase()] || null };
    } catch (err) {
      return { error: (err as Error).message };
    }
  });

  server.get('/api/market', async () => {
    try {
      const top = await cmc.getTopCryptos(20);
      return { data: top };
    } catch (err) {
      return { error: (err as Error).message };
    }
  });

  // ---- Event Log ----
  server.get('/api/events', async (request) => {
    const { type, limit } = request.query as { type?: string; limit?: string };
    return {
      events: eventBus.getEventLog(
        type as any,
        parseInt(limit || '50')
      ),
    };
  });

  // ---- Config ----
  server.get('/api/config', async () => ({
    chainId: process.env.BSC_CHAIN_ID || '56',
    cmcConfigured: !!process.env.CMC_API_KEY,
    executionMode: 'dry_run',
    logLevel: process.env.LOG_LEVEL || 'info',
  }));
}
