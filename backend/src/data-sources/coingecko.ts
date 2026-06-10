/**
 * CoinGecko 免费API数据源（备用）
 * 免费API无需Key，每分钟30次请求
 * FIXED (H-03/H-04): Added SSRF protection — only allow official CoinGecko domains.
 * Added input validation for symbols to prevent injection attacks.
 */
import axios from 'axios';

// Allowed CoinGecko domains — prevents SSRF attacks
const ALLOWED_DOMAINS = [
  'https://api.coingecko.com',
  'https://api.coingecko.com/api/v3',
];

/**
 * Validate that the base URL is an allowed CoinGecko domain
 */
function isAllowedBaseUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_DOMAINS.some(allowed => {
      const allowedParsed = new URL(allowed);
      return parsed.hostname === allowedParsed.hostname &&
             parsed.protocol === allowedParsed.protocol;
    });
  } catch {
    return false;
  }
}

/**
 * Validate trading symbol: alphanumeric only, 1-20 chars
 */
function isValidSymbol(symbol: string): boolean {
  return /^[A-Za-z0-9]{1,20}$/.test(symbol);
}

interface CoinGeckoConfig {
  baseUrl?: string;
  timeout?: number;
}

export class CoinGeckoDataSource {
  private baseUrl: string;
  private timeout: number;
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private cacheTTL = 30000;

  constructor(config: CoinGeckoConfig = {}) {
    const requestedUrl = config.baseUrl || 'https://api.coingecko.com/api/v3';

    // H-04: SSRF protection — validate base URL against allowed domains
    if (!isAllowedBaseUrl(requestedUrl)) {
      console.error(`[CoinGecko] Blocked unauthorized base URL: ${requestedUrl}. Using default.`);
      this.baseUrl = 'https://api.coingecko.com/api/v3';
    } else {
      this.baseUrl = requestedUrl;
    }

    this.timeout = config.timeout || 10000;
  }

  async getPrice(symbol: string): Promise<number | null> {
    // H-03: Input validation
    if (!isValidSymbol(symbol)) {
      console.error(`[CoinGecko] Invalid symbol format: ${symbol}`);
      return null;
    }

    const cacheKey = `price_${symbol}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }
    try {
      const coinId = this.mapSymbolToCoinGeckoId(symbol);
      const response = await axios.get(
        `${this.baseUrl}/simple/price?ids=${coinId}&vs_currencies=usd`,
        { timeout: this.timeout }
      );
      const price = response.data[coinId]?.usd;
      if (price) {
        this.cache.set(cacheKey, { data: price, timestamp: Date.now() });
      }
      return price || null;
    } catch (error) {
      console.error(`[CoinGecko] 获取 ${symbol} 价格失败:`, error);
      return null;
    }
  }

  async getMarketData(symbol: string): Promise<any | null> {
    // H-03: Input validation
    if (!isValidSymbol(symbol)) {
      console.error(`[CoinGecko] Invalid symbol format: ${symbol}`);
      return null;
    }

    try {
      const coinId = this.mapSymbolToCoinGeckoId(symbol);
      const response = await axios.get(
        `${this.baseUrl}/coins/${coinId}?localization=false&tickers=false&community_data=false&developer_data=false`,
        { timeout: this.timeout }
      );
      const data = response.data;
      return {
        price: data.market_data?.current_price?.usd,
        volume24h: data.market_data?.total_volume?.usd,
        marketCap: data.market_data?.market_cap?.usd,
        priceChange24h: data.market_data?.price_change_percentage_24h,
        priceChange7d: data.market_data?.price_change_percentage_7d,
      };
    } catch (error) {
      console.error(`[CoinGecko] 获取 ${symbol} 市场数据失败:`, error);
      return null;
    }
  }

  private mapSymbolToCoinGeckoId(symbol: string): string {
    const mapping: Record<string, string> = {
      BTC: 'bitcoin', ETH: 'ethereum', BNB: 'binancecoin',
      SOL: 'solana', XRP: 'ripple', ADA: 'cardano',
      DOGE: 'dogecoin', AVAX: 'avalanche-2', DOT: 'polkadot',
      MATIC: 'matic-network', LINK: 'chainlink', UNI: 'uniswap',
      USDT: 'tether', USDC: 'usd-coin', BUSD: 'binance-usd',
    };
    return mapping[symbol.toUpperCase()] || symbol.toLowerCase();
  }
}
