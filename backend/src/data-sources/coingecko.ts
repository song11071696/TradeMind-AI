/**
 * CoinGecko 免费API数据源（备用）
 * 免费API无需Key，每分钟30次请求
 */
import axios from 'axios';

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
    this.baseUrl = config.baseUrl || 'https://api.coingecko.com/api/v3';
    this.timeout = config.timeout || 10000;
  }

  async getPrice(symbol: string): Promise<number | null> {
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
