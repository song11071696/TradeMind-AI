/**
 * Binance公开API数据源（备用）
 * 无需API Key，限频1200次/分钟
 * FIXED (H-05): Added input validation for symbols to prevent injection attacks.
 * Only alphanumeric symbols (1-20 chars) are accepted.
 */
import axios from 'axios';

// Allowed Binance API base URL — prevents SSRF
const ALLOWED_BASE_URL = 'https://api.binance.com/api/v3';

/**
 * Validate trading symbol: alphanumeric only, 1-20 chars, no special characters
 */
function isValidSymbol(symbol: string): boolean {
  return /^[A-Za-z0-9]{1,20}$/.test(symbol);
}

export class BinanceDataSource {
  private baseUrl = ALLOWED_BASE_URL;
  private timeout = 10000;
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private cacheTTL = 15000;

  async getPrice(symbol: string): Promise<number | null> {
    // H-05: Input validation — reject malformed symbols
    if (!isValidSymbol(symbol)) {
      console.error(`[Binance] Invalid symbol format: ${symbol}`);
      return null;
    }

    const cacheKey = `price_${symbol}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }
    try {
      const pair = `${symbol.toUpperCase()}USDT`;
      const response = await axios.get(
        `${this.baseUrl}/ticker/price?symbol=${pair}`,
        { timeout: this.timeout }
      );
      const price = parseFloat(response.data.price);
      if (isNaN(price) || price < 0) {
        return null;
      }
      this.cache.set(cacheKey, { data: price, timestamp: Date.now() });
      return price;
    } catch (error) {
      console.error(`[Binance] 获取 ${symbol} 价格失败:`, error);
      return null;
    }
  }

  async get24hTicker(symbol: string): Promise<any | null> {
    // H-05: Input validation
    if (!isValidSymbol(symbol)) {
      console.error(`[Binance] Invalid symbol format: ${symbol}`);
      return null;
    }

    try {
      const pair = `${symbol.toUpperCase()}USDT`;
      const response = await axios.get(
        `${this.baseUrl}/ticker/24hr?symbol=${pair}`,
        { timeout: this.timeout }
      );
      const d = response.data;
      return {
        price: parseFloat(d.lastPrice),
        volume24h: parseFloat(d.quoteVolume),
        priceChange24h: parseFloat(d.priceChangePercent),
        high24h: parseFloat(d.highPrice),
        low24h: parseFloat(d.lowPrice),
      };
    } catch (error) {
      console.error(`[Binance] 获取 ${symbol} 24h数据失败:`, error);
      return null;
    }
  }

  async getKlines(symbol: string, interval: string = '1h', limit: number = 100): Promise<number[][] | null> {
    // H-05: Input validation for both symbol and interval
    if (!isValidSymbol(symbol)) {
      console.error(`[Binance] Invalid symbol format: ${symbol}`);
      return null;
    }
    // Validate interval: only allow known Binance intervals
    const allowedIntervals = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M'];
    if (!allowedIntervals.includes(interval)) {
      console.error(`[Binance] Invalid interval: ${interval}`);
      return null;
    }
    // Validate limit: 1-1000, integer
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
      limit = 100;
    }

    try {
      const pair = `${symbol.toUpperCase()}USDT`;
      const response = await axios.get(
        `${this.baseUrl}/klines?symbol=${pair}&interval=${interval}&limit=${limit}`,
        { timeout: this.timeout }
      );
      return response.data;
    } catch (error) {
      console.error(`[Binance] 获取 ${symbol} K线失败:`, error);
      return null;
    }
  }
}
