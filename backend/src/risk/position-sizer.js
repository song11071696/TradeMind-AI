// ============================================================
// TradeMind AI - Position Sizer
// ============================================================
// Risk-based position sizing using multiple methods:
// fixed, Kelly criterion, volatility-based, and risk-parity.
// ============================================================

/**
 * Position sizing methods
 */
const SizingMethod = {
  FIXED: 'fixed',           // Fixed dollar amount
  PERCENT: 'percent',       // Percentage of portfolio
  RISK: 'risk',             // Risk a fixed % of portfolio per trade
  KELLY: 'kelly',           // Kelly criterion
  VOLATILITY: 'volatility', // Inverse volatility weighting
  ATR: 'atr',               // ATR-based sizing
};

class PositionSizer {
  constructor(config = {}) {
    this.config = {
      method: config.method || SizingMethod.RISK,
      fixedAmount: config.fixedAmount || 10000,
      portfolioPercent: config.portfolioPercent || 0.05,  // 5%
      riskPercent: config.riskPercent || 0.01,            // 1% risk per trade
      maxPositionPercent: config.maxPositionPercent || 0.20, // 20% max
      minPositionSize: config.minPositionSize || 100,
      kellyFraction: config.kellyFraction || 0.5,         // Half-Kelly
      atrPeriod: config.atrPeriod || 14,
      atrMultiplier: config.atrMultiplier || 2.0,
    };
  }

  /**
   * Calculate position size
   * @param {Object} params - Sizing parameters
   * @returns {Object} Position sizing result
   */
  calculate(params) {
    const {
      portfolioValue,
      entryPrice,
      stopLossPrice,
      method,
      winRate,
      avgWin,
      avgLoss,
      atr,
      volatility,
      signalStrength,
    } = { ...this.config, ...params };

    if (!portfolioValue || !entryPrice) {
      throw new Error('portfolioValue and entryPrice are required');
    }

    let size = 0;
    const sizingMethod = method || this.config.method;

    switch (sizingMethod) {
      case SizingMethod.FIXED:
        size = this._fixedSize(entryPrice);
        break;
      case SizingMethod.PERCENT:
        size = this._percentSize(portfolioValue, entryPrice);
        break;
      case SizingMethod.RISK:
        size = this._riskSize(portfolioValue, entryPrice, stopLossPrice);
        break;
      case SizingMethod.KELLY:
        size = this._kellySize(portfolioValue, entryPrice, winRate, avgWin, avgLoss);
        break;
      case SizingMethod.VOLATILITY:
        size = this._volatilitySize(portfolioValue, entryPrice, volatility);
        break;
      case SizingMethod.ATR:
        size = this._atrSize(portfolioValue, entryPrice, atr);
        break;
      default:
        size = this._riskSize(portfolioValue, entryPrice, stopLossPrice);
    }

    // Apply constraints
    size = Math.max(size, 0);
    const maxShares = Math.floor(portfolioValue * this.config.maxPositionPercent / entryPrice);
    size = Math.min(size, maxShares);
    size = Math.max(size, 0);

    // Adjust by signal strength (0-1)
    if (signalStrength !== undefined && signalStrength >= 0 && signalStrength <= 1) {
      size = Math.floor(size * signalStrength);
    }

    const dollarValue = size * entryPrice;
    const portfolioPercent = dollarValue / portfolioValue;

    return {
      shares: size,
      dollarValue,
      portfolioPercent,
      method: sizingMethod,
      riskAmount: stopLossPrice ? Math.abs(entryPrice - stopLossPrice) * size : null,
      warnings: this._generateWarnings(size, portfolioPercent, dollarValue),
    };
  }

  /**
   * Fixed dollar amount sizing
   */
  _fixedSize(entryPrice) {
    return Math.floor(this.config.fixedAmount / entryPrice);
  }

  /**
   * Percentage of portfolio sizing
   */
  _percentSize(portfolioValue, entryPrice) {
    const amount = portfolioValue * this.config.portfolioPercent;
    return Math.floor(amount / entryPrice);
  }

  /**
   * Risk-based sizing (risk a fixed % of portfolio)
   */
  _riskSize(portfolioValue, entryPrice, stopLossPrice) {
    if (!stopLossPrice) {
      return this._percentSize(portfolioValue, entryPrice);
    }
    const riskAmount = portfolioValue * this.config.riskPercent;
    const riskPerShare = Math.abs(entryPrice - stopLossPrice);
    if (riskPerShare <= 0) return 0;
    return Math.floor(riskAmount / riskPerShare);
  }

  /**
   * Kelly Criterion sizing
   */
  _kellySize(portfolioValue, entryPrice, winRate, avgWin, avgLoss) {
    if (!winRate || !avgWin || !avgLoss || avgLoss === 0) {
      return this._percentSize(portfolioValue, entryPrice);
    }

    const b = avgWin / Math.abs(avgLoss); // Odds ratio
    const kelly = (winRate * b - (1 - winRate)) / b;
    const fraction = Math.max(0, kelly * this.config.kellyFraction);

    const amount = portfolioValue * fraction;
    return Math.floor(amount / entryPrice);
  }

  /**
   * Inverse volatility sizing
   */
  _volatilitySize(portfolioValue, entryPrice, volatility) {
    if (!volatility || volatility <= 0) {
      return this._percentSize(portfolioValue, entryPrice);
    }
    // Inverse volatility: allocate more to less volatile assets
    const invVol = 1 / volatility;
    const amount = portfolioValue * this.config.portfolioPercent * invVol * 0.01;
    return Math.floor(amount / entryPrice);
  }

  /**
   * ATR-based sizing
   */
  _atrSize(portfolioValue, entryPrice, atr) {
    if (!atr || atr <= 0) {
      return this._percentSize(portfolioValue, entryPrice);
    }
    const riskAmount = portfolioValue * this.config.riskPercent;
    const riskPerShare = atr * this.config.atrMultiplier;
    return Math.floor(riskAmount / riskPerShare);
  }

  /**
   * Generate warnings for the position
   */
  _generateWarnings(size, portfolioPercent, dollarValue) {
    const warnings = [];
    if (size <= 0) warnings.push('Position size is zero or negative');
    if (portfolioPercent > 0.15) warnings.push('Position exceeds 15% of portfolio');
    if (portfolioPercent > 0.30) warnings.push('CRITICAL: Position exceeds 30% of portfolio');
    if (dollarValue < this.config.minPositionSize) warnings.push('Position below minimum size');
    return warnings;
  }

  /**
   * Calculate position size for multiple assets (portfolio allocation)
   */
  allocatePortfolio(portfolioValue, assets) {
    const results = [];
    let remaining = portfolioValue;

    for (const asset of assets) {
      if (remaining <= 0) break;
      const result = this.calculate({
        ...asset,
        portfolioValue: remaining,
      });
      if (result.dollarValue <= remaining) {
        results.push(result);
        remaining -= result.dollarValue;
      }
    }

    return { allocations: results, remainingCash: remaining };
  }
}

module.exports = { PositionSizer, SizingMethod };
