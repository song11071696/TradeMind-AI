/**
 * Binance公开API数据源（备用）
 * 无需API Key，限频1200次/分钟
 */
import axios from 'axios';

export class BinanceDataSource {
  private baseUrl = 'https://api.binance.com/api/v3';
  private timeout = 10000;
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private cacheTTL = 15000;

  async getPrice(symbol: string): Promise<number | null> {
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
      this.cache.set(cacheKey, { data: price, timestamp: Date.now() });
      return price;
    } catch (error) {
      console.error(`[Binance] 获取 ${symbol} 价格失败:`, error);
      return null;
    }
  }

  async get24hTicker(symbol: string): Promise<any | null> {
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
