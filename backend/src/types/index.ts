// ============================================================
// TradeMind AI - Core Type Definitions
// ============================================================

// ==================== Market Data Types ====================
export interface MarketDataPoint {
  symbol: string;
  price: number;
  volume24h: number;
  marketCap: number;
  priceChange24h: number;
  priceChange7d: number;
  timestamp: number;
  source: 'cmc' | 'binance' | 'onchain';
}

export interface OHLCVData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OrderBookSnapshot {
  symbol: string;
  bids: [number, number][]; // [price, quantity]
  asks: [number, number][];
  timestamp: number;
}

// ==================== Signal Types ====================
export type SignalType = 'BUY' | 'SELL' | 'HOLD' | 'STRONG_BUY' | 'STRONG_SELL';
export type SignalSource = 'technical' | 'sentiment' | 'onchain' | 'macro' | 'ai';

export interface TradingSignal {
  id: string;
  symbol: string;
  type: SignalType;
  source: SignalSource;
  confidence: number; // 0-1
  strength: number; // 0-1
  priceTarget?: number;
  stopLoss?: number;
  reasoning: string;
  metadata: Record<string, unknown>;
  timestamp: number;
  ttl: number; // time to live in ms
}

export interface FusedSignal {
  symbol: string;
  finalSignal: SignalType;
  compositeScore: number; // -1 to 1
  confidence: number; // 0-1
  contributingSignals: TradingSignal[];
  riskAssessment: RiskAssessment;
  timestamp: number;
}

// ==================== Risk Types ====================
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';

export interface RiskAssessment {
  level: RiskLevel;
  volatility: number;
  liquidity: number;
  maxDrawdown: number;
  sharpeRatio: number;
  var95: number; // Value at Risk 95%
  correlationRisk: number;
  reasons: string[];
}

export interface PositionRisk {
  symbol: string;
  size: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  liquidationPrice: number;
  marginRatio: number;
}

// ==================== Strategy Types ====================
export type StrategyType = 'momentum' | 'mean_reversion' | 'arbitrage' | 'grid' | 'dca' | 'ai_adaptive';

export interface Strategy {
  id: string;
  name: string;
  type: StrategyType;
  isActive: boolean;
  parameters: StrategyParameters;
  performance: StrategyPerformance;
  riskLimits: RiskLimits;
}

export interface StrategyParameters {
  lookbackPeriod: number;
  entryThreshold: number;
  exitThreshold: number;
  positionSizePct: number; // % of portfolio
  maxPositions: number;
  stopLossPct: number;
  takeProfitPct: number;
  custom: Record<string, unknown>;
}

export interface StrategyPerformance {
  totalReturn: number;
  annualizedReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  profitFactor: number;
  totalTrades: number;
  avgTradeDuration: number;
  lastUpdated: number;
}

export interface RiskLimits {
  maxPositionSize: number;
  maxDrawdown: number;
  maxDailyLoss: number;
  maxLeverage: number;
  maxCorrelatedPositions: number;
}

// ==================== Trade Types ====================
export type OrderType = 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT';
export type OrderSide = 'BUY' | 'SELL';
export type OrderStatus = 'PENDING' | 'FILLED' | 'PARTIAL' | 'CANCELLED' | 'FAILED';
export type ExecutionVenue = 'pancakeswap' | 'biswap' | 'apeswap' | 'binance';

export interface TradeOrder {
  id: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  price?: number;
  stopPrice?: number;
  venue: ExecutionVenue;
  slippage: number; // max slippage in %
  deadline: number; // unix timestamp
  status: OrderStatus;
  strategyId: string;
  signalId: string;
  metadata: Record<string, unknown>;
  createdAt: number;
  executedAt?: number;
  executedPrice?: number;
  executedQuantity?: number;
  txHash?: string;
  gasUsed?: number;
}

export interface PortfolioState {
  totalValue: number;
  positions: Position[];
  availableBalance: number;
  totalPnl: number;
  timestamp: number;
}

export interface Position {
  symbol: string;
  side: OrderSide;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  strategyId: string;
}

// ==================== Agent Types ====================
export type AgentStatus = 'idle' | 'processing' | 'error' | 'shutdown';

export interface AgentConfig {
  id: string;
  name: string;
  version: string;
  interval: number; // polling interval in ms
  enabled: boolean;
}

export interface AgentState {
  status: AgentStatus;
  lastRun: number;
  lastError?: string;
  metrics: AgentMetrics;
}

export interface AgentMetrics {
  totalRuns: number;
  successRate: number;
  avgProcessingTime: number;
  lastProcessingTime: number;
}

// ==================== Event Types ====================
export type EventType =
  | 'signal.generated'
  | 'signal.fused'
  | 'strategy.decision'
  | 'order.submitted'
  | 'order.filled'
  | 'order.failed'
  | 'fee.charged'
  | 'fee.distributed'
  | 'risk.alert'
  | 'risk.emergency_stop'
  | 'risk.drawdown_breach'
  | 'risk.daily_loss_breach'
  | 'risk.position_limit'
  | 'pnl.snapshot'
  | 'pnl.milestone'
  | 'dca.buy_triggered'
  | 'dca.sell_triggered'
  | 'dca.schedule_updated'
  | 'agent.error'
  | 'system.shutdown';

export interface TradeMindEvent {
  type: EventType;
  payload: unknown;
  timestamp: number;
  source: string;
}

// ==================== Config Types ====================
export interface BNBChainConfig {
  rpcUrl: string;
  chainId: number;
  privateKey?: string;
  gasLimit: number;
  gasPrice: string;
}

export interface CMCConfig {
  apiKey: string;
  baseUrl: string;
  pollingInterval: number;
}

export interface TradeMindConfig {
  bnbChain: BNBChainConfig;
  cmc: CMCConfig;
  riskLimits: RiskLimits;
  enabledStrategies: string[];
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
