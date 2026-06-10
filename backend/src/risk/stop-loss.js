// ============================================================
// TradeMind AI - Stop Loss Manager
// ============================================================
// Multiple stop-loss strategies: fixed, trailing, ATR-based,
// time-based, and volatility-adjusted.
// ============================================================

const EventEmitter = require('events');

/**
 * Stop loss types
 */
const StopLossType = {
  FIXED: 'fixed',
  TRAILING: 'trailing',
  ATR: 'atr',
  TIME: 'time',
  VOLATILITY: 'volatility',
};

class StopLossManager extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      defaultType: config.defaultType || StopLossType.FIXED,
      fixedPercent: config.fixedPercent || 0.02,        // 2%
      trailingPercent: config.trailingPercent || 0.015,  // 1.5%
      atrMultiplier: config.atrMultiplier || 2.0,
      atrPeriod: config.atrPeriod || 14,
      timeLimitMs: config.timeLimitMs || 86400000,       // 24 hours
      volatilityMultiplier: config.volatilityMultiplier || 2.5,
      volatilityPeriod: config.volatilityPeriod || 20,
    };
    this.activeStops = new Map();
  }

  /**
   * Create a stop loss for a position
   */
  createStop(positionId, params = {}) {
    const type = params.type || this.config.defaultType;
    const entryPrice = params.entryPrice;
    const side = params.side || 'long';

    const stop = {
      positionId,
      type,
      side,
      entryPrice,
      active: true,
      triggered: false,
      triggerPrice: null,
      peakPrice: entryPrice,
      createdAt: Date.now(),
      params: { ...this.config, ...params },
    };

    switch (type) {
      case StopLossType.FIXED:
        stop.triggerPrice = side === 'long'
          ? entryPrice * (1 - this.config.fixedPercent)
          : entryPrice * (1 + this.config.fixedPercent);
        break;
      case StopLossType.TRAILING:
        stop.triggerPrice = side === 'long'
          ? entryPrice * (1 - this.config.trailingPercent)
          : entryPrice * (1 + this.config.trailingPercent);
        break;
      case StopLossType.ATR:
        if (!params.atr) throw new Error('ATR value required for ATR stop loss');
        stop.triggerPrice = side === 'long'
          ? entryPrice - params.atr * this.config.atrMultiplier
          : entryPrice + params.atr * this.config.atrMultiplier;
        break;
      case StopLossType.VOLATILITY:
        if (!params.volatility) throw new Error('Volatility value required');
        stop.triggerPrice = side === 'long'
          ? entryPrice * (1 - params.volatility * this.config.volatilityMultiplier)
          : entryPrice * (1 + params.volatility * this.config.volatilityMultiplier);
        break;
      case StopLossType.TIME:
        stop.triggerPrice = null; // Time-based, no price trigger
        break;
    }

    this.activeStops.set(positionId, stop);
    this.emit('stop:created', stop);
    return stop;
  }

  /**
   * Update stops with current market data
   */
  update(positionId, currentPrice) {
    const stop = this.activeStops.get(positionId);
    if (!stop || !stop.active) return null;

    // Update trailing stop peak
    if (stop.type === StopLossType.TRAILING) {
      if (stop.side === 'long' && currentPrice > stop.peakPrice) {
        stop.peakPrice = currentPrice;
        stop.triggerPrice = currentPrice * (1 - stop.params.trailingPercent);
      } else if (stop.side === 'short' && currentPrice < stop.peakPrice) {
        stop.peakPrice = currentPrice;
        stop.triggerPrice = currentPrice * (1 + stop.params.trailingPercent);
      }
    }

    // Check if triggered
    let triggered = false;
    if (stop.type === StopLossType.TIME) {
      triggered = (Date.now() - stop.createdAt) >= this.config.timeLimitMs;
    } else if (stop.side === 'long') {
      triggered = currentPrice <= stop.triggerPrice;
    } else {
      triggered = currentPrice >= stop.triggerPrice;
    }

    if (triggered) {
      stop.triggered = true;
      stop.active = false;
      stop.triggeredAt = Date.now();
      stop.triggeredPrice = currentPrice;
      this.emit('stop:triggered', stop);
    }

    return stop;
  }

  /**
   * Remove a stop loss
   */
  remove(positionId) {
    const stop = this.activeStops.get(positionId);
    if (stop) {
      stop.active = false;
      this.activeStops.delete(positionId);
      this.emit('stop:removed', stop);
    }
    return stop;
  }

  /**
   * Get all active stops
   */
  getActiveStops() {
    return Array.from(this.activeStops.values()).filter(s => s.active);
  }

  /**
   * Calculate ATR from price data
   */
  static calculateATR(bars, period = 14) {
    if (bars.length < period + 1) return 0;

    const trs = [];
    for (let i = 1; i < bars.length; i++) {
      const tr = Math.max(
        bars[i].high - bars[i].low,
        Math.abs(bars[i].high - bars[i - 1].close),
        Math.abs(bars[i].low - bars[i - 1].close)
      );
      trs.push(tr);
    }

    let atr = trs.slice(0, period).reduce((s, v) => s + v, 0) / period;
    for (let i = period; i < trs.length; i++) {
      atr = (atr * (period - 1) + trs[i]) / period;
    }
    return atr;
  }
}

module.exports = { StopLossManager, StopLossType };
