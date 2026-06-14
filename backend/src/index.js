const fastify = require('fastify')({ logger: true });
const cors = require('@fastify/cors');
const { ethers } = require('ethers');
require('dotenv').config();

// Contract ABIs (simplified)
const YieldMindCoreABI = [
  'function totalDeposits() view returns (uint256)',
  'function totalShares() view returns (uint256)',
  'function getVaultAPY() view returns (uint256)',
  'function getActiveStrategies() view returns (address[])',
  'function getUserBalance(address) view returns (uint256, uint256)',
  'function getStrategyInfo(address) view returns (string, uint256, uint256, bool, uint256)',
  'function getStrategyCount() view returns (uint256)',
  'event Deposit(address indexed user, uint256 amount, uint256 shares)',
  'event Withdraw(address indexed user, uint256 amount, uint256 shares)',
];

// Initialize provider
const provider = new ethers.JsonRpcProvider(
  process.env.BSC_TESTNET_RPC || 'https://data-seed-prebsc-1-s1.binance.org:8545'
);

// Contract addresses (update after deployment)
const CONTRACTS = {
  yieldMindCore: process.env.YIELDMIND_CORE_ADDRESS || '0x0000000000000000000000000000000000000000',
};

// Register CORS — restrict to allowed origins (not `origin: true`)
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:5173')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

fastify.register(cors, {
  origin: allowedOrigins,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'x-api-key'],
  credentials: true,
});

// Health check
fastify.get('/api/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// Get vault stats
fastify.get('/api/vault/stats', async () => {
  try {
    const contract = new ethers.Contract(CONTRACTS.yieldMindCore, YieldMindCoreABI, provider);

    const [totalDeposits, totalShares, vaultAPY, strategyCount] = await Promise.all([
      contract.totalDeposits(),
      contract.totalShares(),
      contract.getVaultAPY(),
      contract.getStrategyCount(),
    ]);

    return {
      totalDeposits: totalDeposits.toString(),
      totalShares: totalShares.toString(),
      vaultAPY: vaultAPY.toString(),
      strategyCount: strategyCount.toString(),
    };
  } catch (error) {
    fastify.log.error(error);
    return { error: 'Failed to fetch vault stats' };
  }
});

// Get strategies
fastify.get('/api/strategies', async () => {
  try {
    const contract = new ethers.Contract(CONTRACTS.yieldMindCore, YieldMindCoreABI, provider);
    const strategies = await contract.getActiveStrategies();

    const strategyData = await Promise.all(
      strategies.map(async (addr) => {
        const info = await contract.getStrategyInfo(addr);
        return {
          address: addr,
          name: info[0],
          allocationBps: info[1].toString(),
          totalDeposited: info[2].toString(),
          isActive: info[3],
          apy: info[4].toString(),
        };
      })
    );

    return { strategies: strategyData };
  } catch (error) {
    fastify.log.error(error);
    return { error: 'Failed to fetch strategies' };
  }
});

// Get user balance
fastify.get('/api/user/:address/balance', async (request) => {
  try {
    const { address } = request.params;
    if (!ethers.isAddress(address)) {
      return { error: 'Invalid address' };
    }

    const contract = new ethers.Contract(CONTRACTS.yieldMindCore, YieldMindCoreABI, provider);
    const [depositAmount, sharesAmount] = await contract.getUserBalance(address);

    return {
      address,
      depositAmount: depositAmount.toString(),
      sharesAmount: sharesAmount.toString(),
    };
  } catch (error) {
    fastify.log.error(error);
    return { error: 'Failed to fetch user balance' };
  }
});

// Get recent events
fastify.get('/api/events/:type', async (request) => {
  try {
    const { type } = request.params;
    const contract = new ethers.Contract(CONTRACTS.yieldMindCore, YieldMindCoreABI, provider);

    let filter;
    if (type === 'deposits') {
      filter = contract.filters.Deposit();
    } else if (type === 'withdrawals') {
      filter = contract.filters.Withdraw();
    } else {
      return { error: 'Invalid event type' };
    }

    const events = await contract.queryFilter(filter, -1000);
    const formatted = events.map((e) => ({
      user: e.args[0],
      amount: e.args[1].toString(),
      shares: e.args[2].toString(),
      blockNumber: e.blockNumber,
      transactionHash: e.transactionHash,
    }));

    return { events: formatted };
  } catch (error) {
    fastify.log.error(error);
    return { error: 'Failed to fetch events' };
  }
});

// AI recommendation endpoint (mock)
fastify.get('/api/ai/recommendation', async () => {
  // In production, this would call an AI model
  return {
    recommendation: {
      timestamp: new Date().toISOString(),
      currentAPY: 6.8,
      suggestedAllocations: [
        { strategy: 'PancakeSwap LP', current: 60, suggested: 50, reason: 'Reducing impermanent loss risk' },
        { strategy: 'Venus Lending', current: 40, suggested: 30, reason: 'Stable but lower returns' },
        { strategy: 'Alpaca Finance', current: 0, suggested: 20, reason: 'High leverage opportunity' },
      ],
      expectedAPY: 7.5,
      riskScore: 6.2,
      confidence: 0.85,
    },
  };
});

// Start server
const start = async () => {
  try {
    await fastify.listen({ port: process.env.PORT || 3001, host: '0.0.0.0' });
    fastify.log.info(`Server running on port ${process.env.PORT || 3001}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
