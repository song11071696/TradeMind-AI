// ============================================================
// TradeMind AI - Configuration
// ============================================================
import type { TradeMindConfig } from '../types';

export function loadConfig(): TradeMindConfig {
  return {
    bnbChain: {
      rpcUrl: process.env.BSC_RPC_URL || 'https://bsc-dataseed.bnbchain.org',
      chainId: parseInt(process.env.BSC_CHAIN_ID || '56'),
      privateKey: process.env.BNB_PRIVATE_KEY,
      gasLimit: parseInt(process.env.GAS_LIMIT || '300000'),
      gasPrice: process.env.GAS_PRICE || '5000000000', // 5 gwei
    },
    cmc: {
      apiKey: process.env.CMC_API_KEY || '',
      baseUrl: 'https://pro-api.coinmarketcap.com/v1',
      pollingInterval: parseInt(process.env.CMC_POLL_INTERVAL || '60000'),
    },
    riskLimits: {
      maxPositionSize: parseFloat(process.env.MAX_POSITION_SIZE || '10000'),
      maxDrawdown: parseFloat(process.env.MAX_DRAWDOWN || '0.15'),
      maxDailyLoss: parseFloat(process.env.MAX_DAILY_LOSS || '0.05'),
      maxLeverage: parseInt(process.env.MAX_LEVERAGE || '1'),
      maxCorrelatedPositions: parseInt(process.env.MAX_CORRELATED_POSITIONS || '3'),
    },
    enabledStrategies: (process.env.ENABLED_STRATEGIES || 'momentum,mean_reversion,ai_adaptive').split(','),
    logLevel: (process.env.LOG_LEVEL as TradeMindConfig['logLevel']) || 'info',
  };
}

export function validateConfig(config: TradeMindConfig): string[] {
  const errors: string[] = [];

  if (!config.cmc.apiKey) {
    errors.push('CMC_API_KEY is required');
  }
  if (!config.bnbChain.rpcUrl) {
    errors.push('BSC_RPC_URL is required');
  }
  if (config.riskLimits.maxDrawdown <= 0 || config.riskLimits.maxDrawdown > 1) {
    errors.push('MAX_DRAWDOWN must be between 0 and 1');
  }
  if (config.riskLimits.maxDailyLoss <= 0 || config.riskLimits.maxDailyLoss > 1) {
    errors.push('MAX_DAILY_LOSS must be between 0 and 1');
  }

  return errors;
}
