/**
 * 数据源聚合器 - 实现优先级和自动降级
 * 主数据源: CMC → 备用1: CoinGecko → 备用2: Binance
 */

// 注意：需要根据实际的CMC数据源类路径调整import
// import { CMCDataSource } from './cmc';
import { CoinGeckoDataSource } from './coingecko';
import { BinanceDataSource } from './binance-api';

export interface MarketDataPoint {
  price: number;
  volume24h: number;
  marketCap: number;
  priceChange24h: number;
  priceChange7d: number;
  source: string;
  timestamp: number;
}

export class DataAggregator {
  // private primary: CMCDataSource;
  private fallback1: CoinGeckoDataSource;
  private fallback2: BinanceDataSource;
  private healthStatus: Map<string, { healthy: boolean; lastCheck: number; failures: number }> = new Map();

  constructor() {
    // this.primary = new CMCDataSource();
    this.fallback1 = new CoinGeckoDataSource();
    this.fallback2 = new BinanceDataSource();
  }

  /**
   * 获取市场数据 - 带自动降级
   */
  async getMarketData(symbol: string): Promise<MarketDataPoint> {
    // TODO: 尝试主数据源 CMC（需要集成现有CMC类）
    // try {
    //   const cmcData = await this.primary.getQuote(symbol);
    //   if (cmcData) {
    //     this.markHealthy('cmc');
    //     return { ...cmcData, source: 'CoinMarketCap', timestamp: Date.now() };
    //   }
    // } catch (err) {
    //   this.markUnhealthy('cmc');
    // }

    // 降级到 CoinGecko
    try {
      const cgData = await this.fallback1.getMarketData(symbol);
      if (cgData && cgData.price) {
        this.markHealthy('coingecko');
        return { ...cgData, source: 'CoinGecko', timestamp: Date.now() };
      }
    } catch (err) {
      this.markUnhealthy('coingecko');
      console.warn(`[DataAggregator] CoinGecko失败，降级到Binance`);
    }

    // 降级到 Binance
    try {
      const bnData = await this.fallback2.get24hTicker(symbol);
      if (bnData && bnData.price) {
        this.markHealthy('binance');
        return {
          price: bnData.price,
          volume24h: bnData.volume24h,
          marketCap: 0,
          priceChange24h: bnData.priceChange24h,
          priceChange7d: 0,
          source: 'Binance',
          timestamp: Date.now(),
        };
      }
    } catch (err) {
      this.markUnhealthy('binance');
    }

    throw new Error(`所有数据源均不可用: ${symbol}`);
  }

  /**
   * 获取历史K线数据（用于信号分析）
   */
  async getHistoricalPrices(symbol: string, limit: number = 100): Promise<number[]> {
    try {
      const klines = await this.fallback2.getKlines(symbol, '1h', limit);
      if (klines) return klines.map(k => parseFloat(k[4])); // close price
    } catch {}
    console.warn(`[DataAggregator] 无法获取历史K线`);
    return [];
  }

  getHealthStatus() {
    return Object.fromEntries(this.healthStatus);
  }

  private markHealthy(source: string) {
    this.healthStatus.set(source, { healthy: true, lastCheck: Date.now(), failures: 0 });
  }

  private markUnhealthy(source: string) {
    const current = this.healthStatus.get(source) || { healthy: true, lastCheck: Date.now(), failures: 0 };
    this.healthStatus.set(source, {
      healthy: false,
      lastCheck: Date.now(),
      failures: current.failures + 1,
    });
  }
}
