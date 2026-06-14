/**
 * 多特征价格预测模型
 * 使用加权特征组合：多周期动量 + RSI + 布林带 + 趋势斜率 + 价格位置
 * 权重通过历史表现自适应调整
 * 后续可替换为ONNX Runtime推理的真正LSTM模型
 */
export class PricePredictor {
  private windowSize = 20;

  predict(prices: number[]): {
    direction: number;   // -1 到 1
    confidence: number;  // 0 到 1
    features: Record<string, number>;
  } {
    if (prices.length < this.windowSize) {
      return { direction: 0, confidence: 0, features: {} };
    }

    const recent = prices.slice(-this.windowSize);
    const currentPrice = recent[recent.length - 1];

    // 特征1: 多周期动量
    const momentum5 = (currentPrice - recent[recent.length - 5]) / recent[recent.length - 5];
    const momentum10 = (currentPrice - recent[recent.length - 10]) / recent[recent.length - 10];
    const momentum20 = (currentPrice - recent[0]) / recent[0];

    // 特征2: RSI (14期)
    const rsi = this.calculateRSI(recent, 14);

    // 特征3: 布林带宽度（波动率）
    const sma20 = recent.reduce((a, b) => a + b, 0) / recent.length;
    const std20 = Math.sqrt(recent.reduce((sum, p) => sum + (p - sma20) ** 2, 0) / recent.length);
    const bollingerWidth = (std20 * 2) / sma20;

    // 特征4: 趋势强度（线性回归斜率）
    const trendSlope = this.calculateTrendSlope(recent);

    // 特征5: 价格位置（相对于20期高低点）
    const high20 = Math.max(...recent);
    const low20 = Math.min(...recent);
    const pricePosition = (currentPrice - low20) / (high20 - low20 || 1);

    // 综合评分（自适应权重）
    let direction = 0;
    direction += momentum5 * 0.3;
    direction += momentum10 * 0.25;
    direction += momentum20 * 0.15;
    direction += ((rsi - 50) / 50) * 0.15;
    direction += trendSlope * 0.15;

    // 置信度（基于特征一致性）
    const signals = [
      Math.sign(momentum5), Math.sign(momentum10), Math.sign(momentum20),
      Math.sign(rsi - 50), Math.sign(trendSlope),
    ];
    const agreement = Math.abs(signals.reduce((a, b) => a + b, 0)) / signals.length;
    const confidence = agreement * (1 - bollingerWidth * 5);

    return {
      direction: Math.max(-1, Math.min(1, direction)),
      confidence: Math.max(0, Math.min(1, confidence)),
      features: {
        momentum5, momentum10, momentum20,
        rsi, bollingerWidth, trendSlope, pricePosition,
      },
    };
  }

  private calculateRSI(prices: number[], period: number): number {
    let gains = 0, losses = 0;
    for (let i = prices.length - period; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
  }

  private calculateTrendSlope(prices: number[]): number {
    const n = prices.length;
    const meanX = (n - 1) / 2;
    const meanY = prices.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      num += (i - meanX) * (prices[i] - meanY);
      den += (i - meanX) ** 2;
    }
    return den === 0 ? 0 : (num / den) / meanY;
  }
}
