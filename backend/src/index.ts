// ============================================================
// TradeMind AI - Main Entry Point
// ============================================================
import Fastify from 'fastify';
import cors from '@fastify/cors';
import * as dotenv from 'dotenv';
import { loadConfig, validateConfig } from './config';
import { eventBus } from './core/event-bus';
import { CMCDataSource } from './data-sources/cmc';
import { SignalFusionEngine } from './agents/signal-fusion';
import { StrategyDecisionEngine } from './agents/strategy-decision';
import { ExecutionEngine } from './agents/execution';
import { PnLTracker } from './core/pnl-tracker';
import { RiskManager } from './core/risk-manager';
import { AdaptiveDCAStrategy } from './strategies/dca';
import { registerAPIRoutes } from './api/routes';
import { formatEther } from 'viem';
import { BNBChainClient } from './core/bnb-chain';

dotenv.config();

const server = Fastify({ logger: true });

async function main() {
  console.log('='.repeat(60));
  console.log('  🧠 TradeMind AI - Autonomous Trading Agent System');
  console.log('  Powered by BNB Chain + CoinMarketCap');
  console.log('='.repeat(60));

  // Load & validate config
  const config = loadConfig();
  const configErrors = validateConfig(config);
  if (configErrors.length > 0) {
    console.warn('[Config] Warnings:', configErrors.join('; '));
    console.warn('[Config] Running in limited mode (no CMC live data)');
  }

  // ---- Initialize Core Systems ----
  const riskManager = new RiskManager({
    globalLimits: config.riskLimits,
    maxOpenPositions: 10,
    maxOrdersPerMinute: 5,
    maxDailyTrades: 50,
    emergencyStopDrawdownPct: 0.20,
    emergencyStopDailyLossPct: 0.10,
  });

  const pnlTracker = new PnLTracker(100000);

  // ---- Initialize Data Sources ----
  const cmc = new CMCDataSource(config.cmc);

  // ---- Initialize Agent Pipeline ----
  const signalEngine = new SignalFusionEngine();
  const strategyEngine = new StrategyDecisionEngine();
  const executionEngine = new ExecutionEngine(config.bnbChain, { dryRun: true });

  // ---- Query real wallet balance on startup ----
  if (config.bnbChain?.rpcUrl && config.bnbChain?.privateKey) {
    try {
      const startupClient = new BNBChainClient(config.bnbChain);
      const walletAddr = startupClient.getWalletAddress();
      if (walletAddr) {
        const balance = await startupClient.getBalance(walletAddr);
        console.log(`\n💰 Wallet Balance on startup:`);
        console.log(`   Address: ${walletAddr}`);
        console.log(`   Balance: ${formatEther(balance)} BNB`);
        console.log('');
      }
    } catch (err) {
      console.warn('[Startup] Failed to query wallet balance:', (err as Error).message);
    }
  }

  // ---- Initialize DCA Strategies ----
  const dcaStrategy = new AdaptiveDCAStrategy();

  // Set up DCA for default symbols
  const dcaSymbols = ['BTC', 'ETH', 'BNB'];
  for (const symbol of dcaSymbols) {
    dcaStrategy.addDCA(AdaptiveDCAStrategy.createDefaultConfig(symbol, {
      baseOrderSize: symbol === 'BTC' ? 200 : symbol === 'ETH' ? 150 : 100,
      maxInvestment: symbol === 'BTC' ? 5000 : symbol === 'ETH' ? 3000 : 2000,
      timeIntervalMs: 1800000, // 30 min for demo
      priceDropTriggers: [-2, -5, -8, -12, -18, -25],
      sizeMultipliers: [1.0, 1.3, 1.6, 2.0, 2.5, 3.0],
      takeProfitPct: 6,
      stopLossPct: 20,
    }));
  }

  // ---- Wire up event pipeline with risk gating ----
  // The execution engine needs risk checks before executing
  eventBus.subscribe('strategy.decision', async (event) => {
    const payload = event.payload as { order: any };
    const portfolio = executionEngine.getPortfolio();

    // Risk check before execution
    const riskResult = await riskManager.checkOrder(payload.order, portfolio);

    if (!riskResult.approved) {
      console.log(
        `[Risk Gate] ❌ Order rejected by ${riskResult.layer}: ${riskResult.reason}`
      );
      eventBus.emit({
        type: 'risk.alert',
        payload: {
          orderId: payload.order.id,
          symbol: payload.order.symbol,
          layer: riskResult.layer,
          reason: riskResult.reason,
          severity: riskResult.severity,
        },
        timestamp: Date.now(),
        source: 'risk-manager',
      });
      return; // Don't forward to execution
    }

    // Approved - forward to execution
    executionEngine.queueOrder(payload.order);
  });

  // Start all systems
  signalEngine.start();
  strategyEngine.start();
  executionEngine.start();
  riskManager.start();
  pnlTracker.start(() => executionEngine.getPortfolio());
  dcaStrategy.start();

  // Start CMC polling (if API key available)
  if (config.cmc.apiKey) {
    cmc.start(['BTC', 'ETH', 'BNB', 'CAKE', 'USDT']);
  } else {
    console.log('[CMC] No API key - running without live market data');
    emitTestData(signalEngine);
  }

  // ---- Setup API Server ----
  // CORS: restrict to explicitly allowed origins (not `origin: true` which allows ALL)
  const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:5173')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

  await server.register(cors, {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'x-api-key'],
    credentials: true,
  });
  registerAPIRoutes(server, {
    signalEngine,
    strategyEngine,
    executionEngine,
    cmc,
    eventBus,
    riskManager,
    pnlTracker,
    dcaStrategy,
  });

  // Start server
  const port = parseInt(process.env.PORT || '3001');
  try {
    await server.listen({ port, host: '0.0.0.0' });
    console.log(`\n🚀 TradeMind API running on http://localhost:${port}`);
    console.log(`   Health:     http://localhost:${port}/api/health`);
    console.log(`   Signals:    http://localhost:${port}/api/signals`);
    console.log(`   Portfolio:  http://localhost:${port}/api/portfolio`);
    console.log(`   Strategies: http://localhost:${port}/api/strategies`);
    console.log(`   PnL:        http://localhost:${port}/api/pnl`);
    console.log(`   Risk:       http://localhost:${port}/api/risk`);
    console.log(`   DCA:        http://localhost:${port}/api/dca`);
    console.log('');
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n[Shutdown] Stopping TradeMind AI...');
    cmc.stop();
    dcaStrategy.stop();
    pnlTracker.stop();
    await server.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

/**
 * Emit test data when CMC is unavailable
 */
function emitTestData(engine: SignalFusionEngine): void {
  const testSymbols = [
    { symbol: 'BTC', price: 65000, volume24h: 28000000000, marketCap: 1280000000000, priceChange24h: 3.5, priceChange7d: 8.2 },
    { symbol: 'ETH', price: 3500, volume24h: 15000000000, marketCap: 420000000000, priceChange24h: 2.1, priceChange7d: 5.4 },
    { symbol: 'BNB', price: 600, volume24h: 2000000000, marketCap: 90000000000, priceChange24h: -1.2, priceChange7d: 3.8 },
  ];

  setInterval(() => {
    for (const t of testSymbols) {
      const noise = (Math.random() - 0.5) * 2;
      eventBus.emit({
        type: 'signal.generated',
        payload: {
          symbol: t.symbol,
          data: {
            ...t,
            price: t.price * (1 + noise * 0.01),
            priceChange24h: t.priceChange24h + noise,
            timestamp: Date.now(),
            source: 'cmc' as const,
          },
        },
        timestamp: Date.now(),
        source: 'test-data',
      });
    }
  }, 30000);
}

main();
