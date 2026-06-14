// ============================================================
// TradeMind AI - CMC (CoinMarketCap) Data Source
// ============================================================
// Resilience features:
//   - Retry with exponential backoff (3 attempts, base 1s)
//   - Circuit breaker pattern (5 failures → 60s cooldown)
//   - Error events emitted via EventBus
//   - Cache with TTL
// ============================================================
import axios, { AxiosInstance } from 'axios';
import type { CMCConfig, MarketDataPoint } from '../types';
import { eventBus } from '../core/event-bus';

interface CMCTokenQuote {
  price: number;
  volume_24h: number;
  volume_change_24h: number;
  percent_change_1h: number;
  percent_change_24h: number;
  percent_change_7d: number;
  market_cap: number;
  last_updated: string;
}

interface CMCTokenData {
  id: number;
  name: string;
  symbol: string;
  slug: string;
  cmc_rank: number;
  circulating_supply: number;
  total_supply: number;
  max_supply: number | null;
  quote: {
    USD: CMCTokenQuote;
  };
}

// ===================== Circuit Breaker =====================

enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation
  OPEN = 'OPEN',         // Failing, reject requests
  HALF_OPEN = 'HALF_OPEN', // Testing recovery
}

interface CircuitBreakerConfig {
  failureThreshold: number;    // failures before opening
  cooldownMs: number;          // time before half-open
  halfOpenMaxAttempts: number; // attempts in half-open before closing
}

const DEFAULT_CB_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  cooldownMs: 60000,       // 60 seconds
  halfOpenMaxAttempts: 2,
};

class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private halfOpenAttempts: number = 0;
  private config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CB_CONFIG, ...config };
  }

  getState(): CircuitState {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime >= this.config.cooldownMs) {
        this.state = CircuitState.HALF_OPEN;
        this.halfOpenAttempts = 0;
      }
    }
    return this.state;
  }

  recordSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.halfOpenAttempts++;
      if (this.halfOpenAttempts >= this.config.halfOpenMaxAttempts) {
        this.reset();
      }
    } else {
      this.reset();
    }
  }

  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.trip();
    } else if (this.failureCount >= this.config.failureThreshold) {
      this.trip();
    }
  }

  private trip(): void {
    this.state = CircuitState.OPEN;
    console.warn(`[CircuitBreaker] TRIPPED — ${this.failureCount} failures. Cooldown: ${this.config.cooldownMs / 1000}s`);
  }

  private reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.halfOpenAttempts = 0;
  }

  getStatus() {
    return {
      state: this.getState(),
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      cooldownRemaining: this.state === CircuitState.OPEN
        ? Math.max(0, this.config.cooldownMs - (Date.now() - this.lastFailureTime))
        : 0,
    };
  }
}

// ===================== Retry Utility =====================

const RETRY_DEFAULTS = {
  maxRetries: 3,
  baseDelayMs: 1000,   // 1s
  maxDelayMs: 10000,   // 10s
  backoffMultiplier: 2,
};

async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  options: Partial<typeof RETRY_DEFAULTS> = {},
): Promise<T> {
  const opts = { ...RETRY_DEFAULTS, ...options };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;
      if (attempt < opts.maxRetries) {
        const delay = Math.min(
          opts.baseDelayMs * Math.pow(opts.backoffMultiplier, attempt),
          opts.maxDelayMs,
        );
        console.warn(`[CMC] ${label} failed (attempt ${attempt + 1}/${opts.maxRetries + 1}), retrying in ${delay}ms: ${lastError.message}`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError!;
}

// ===================== CMC Data Source =====================

export class CMCDataSource {
  private config: CMCConfig;
  private client: AxiosInstance;
  private cache: Map<string, { data: MarketDataPoint[]; expiry: number }> = new Map();
  private cacheTTL: number = 30000; // 30 seconds
  private isRunning: boolean = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private circuitBreaker: CircuitBreaker;

  constructor(config: CMCConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: config.baseUrl,
      headers: {
        'X-CMC_PRO_API_KEY': config.apiKey,
        Accept: 'application/json',
      },
      timeout: 10000,
    });
    this.circuitBreaker = new CircuitBreaker();
  }

  /**
   * Start polling CMC for market data
   */
  start(symbols: string[] = ['BTC', 'ETH', 'BNB', 'CAKE', 'USDT']): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // Initial fetch
    this.fetchAndEmit(symbols);

    // Set up polling
    this.pollTimer = setInterval(() => {
      this.fetchAndEmit(symbols);
    }, this.config.pollingInterval);

    console.log(`[CMC] Started polling every ${this.config.pollingInterval / 1000}s for: ${symbols.join(', ')}`);
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.isRunning = false;
    console.log('[CMC] Stopped polling');
  }

  private async fetchAndEmit(symbols: string[]): Promise<void> {
    try {
      const data = await this.getLatestQuotes(symbols);
      for (const [symbol, marketData] of Object.entries(data)) {
        eventBus.emit({
          type: 'signal.generated',
          payload: { symbol, data: marketData, source: 'cmc' },
          timestamp: Date.now(),
          source: 'cmcdatasource',
        });
      }
    } catch (err) {
      const error = err as Error;
      console.error('[CMC] Error fetching data:', error.message);

      // Emit error event for downstream consumers
      eventBus.emit({
        type: 'agent.error',
        payload: {
          component: 'cmc',
          error: error.message,
          symbols,
          circuitState: this.circuitBreaker.getStatus(),
        },
        timestamp: Date.now(),
        source: 'cmcdatasource',
      });
    }
  }

  /**
   * Get latest quotes for specified symbols
   * Includes retry with backoff and circuit breaker
   */
  async getLatestQuotes(symbols: string[]): Promise<Record<string, MarketDataPoint>> {
    const cacheKey = symbols.sort().join(',');
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      return Object.fromEntries(cached.data.map((d) => [d.symbol, d]));
    }

    // Circuit breaker check
    const cbState = this.circuitBreaker.getState();
    if (cbState === CircuitState.OPEN) {
      const status = this.circuitBreaker.getStatus();
      const cooldownSec = Math.ceil(status.cooldownRemaining / 1000);
      throw new Error(`CMC circuit breaker is OPEN. Retry in ${cooldownSec}s`);
    }

    const result = await withRetry(async () => {
      const response = await this.client.get('/cryptocurrency/quotes/latest', {
        params: {
          symbol: symbols.join(','),
          convert: 'USD',
        },
      });

      const parsed: Record<string, MarketDataPoint> = {};
      const data = response.data.data as Record<string, CMCTokenData>;

      for (const symbol of Object.keys(data)) {
        const token = data[symbol];
        const quote = token.quote.USD;

        parsed[symbol] = {
          symbol: token.symbol,
          price: quote.price,
          volume24h: quote.volume_24h,
          marketCap: quote.market_cap,
          priceChange24h: quote.percent_change_24h,
          priceChange7d: quote.percent_change_7d,
          timestamp: Date.now(),
          source: 'cmc',
        };
      }

      return parsed;
    }, 'getLatestQuotes');

    // Record success in circuit breaker
    this.circuitBreaker.recordSuccess();

    // Cache results
    this.cache.set(cacheKey, {
      data: Object.values(result),
      expiry: Date.now() + this.cacheTTL,
    });

    return result;
  }

  /**
   * Get top N cryptocurrencies by market cap
   */
  async getTopCryptos(limit: number = 20): Promise<MarketDataPoint[]> {
    // Circuit breaker check
    const cbState = this.circuitBreaker.getState();
    if (cbState === CircuitState.OPEN) {
      throw new Error('CMC circuit breaker is OPEN');
    }

    try {
      const result = await withRetry(async () => {
        const response = await this.client.get('/cryptocurrency/listings/latest', {
          params: {
            start: 1,
            limit,
            convert: 'USD',
            sort: 'market_cap',
            sort_dir: 'desc',
          },
        });

        return (response.data.data as CMCTokenData[]).map((token) => ({
          symbol: token.symbol,
          price: token.quote.USD.price,
          volume24h: token.quote.USD.volume_24h,
          marketCap: token.quote.USD.market_cap,
          priceChange24h: token.quote.USD.percent_change_24h,
          priceChange7d: token.quote.USD.percent_change_7d,
          timestamp: Date.now(),
          source: 'cmc' as const,
        }));
      }, 'getTopCryptos');

      this.circuitBreaker.recordSuccess();
      return result;
    } catch (err) {
      this.circuitBreaker.recordFailure();
      throw err;
    }
  }

  /**
   * Get global market metrics
   */
  async getGlobalMetrics(): Promise<Record<string, unknown>> {
    const cbState = this.circuitBreaker.getState();
    if (cbState === CircuitState.OPEN) {
      throw new Error('CMC circuit breaker is OPEN');
    }

    try {
      const result = await withRetry(async () => {
        const response = await this.client.get('/global-metrics/quotes/latest');
        return response.data.data;
      }, 'getGlobalMetrics');

      this.circuitBreaker.recordSuccess();
      return result;
    } catch (err) {
      this.circuitBreaker.recordFailure();
      throw err;
    }
  }

  /**
   * Get trending coins (gainers/losers)
   */
  async getTrendingGainers(limit: number = 10): Promise<MarketDataPoint[]> {
    const top = await this.getTopCryptos(100);
    return top
      .sort((a, b) => b.priceChange24h - a.priceChange24h)
      .slice(0, limit);
  }

  async getTrendingLosers(limit: number = 10): Promise<MarketDataPoint[]> {
    const top = await this.getTopCryptos(100);
    return top
      .sort((a, b) => a.priceChange24h - b.priceChange24h)
      .slice(0, limit);
  }

  isOnline(): boolean {
    return this.isRunning;
  }

  /**
   * Get circuit breaker status for observability
   */
  getCircuitBreakerStatus() {
    return this.circuitBreaker.getStatus();
  }
}
