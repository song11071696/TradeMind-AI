// ============================================================
// TradeMind AI - Drawdown Monitor
// ============================================================
// Real-time portfolio drawdown monitoring with multi-level
// alerts and automatic risk reduction triggers.
// ============================================================

const EventEmitter = require('events');

/**
 * Drawdown alert levels
 */
const DrawdownLevel = {
  NORMAL: 'normal',
  WARNING: 'warning',       // -5%
  DANGER: 'danger',         // -10%
  CRITICAL: 'critical',     // -15%
  EMERGENCY: 'emergency',   // -20%
};

const DEFAULT_THRESHOLDS = {
  [DrawdownLevel.WARNING]: 0.05,
  [DrawdownLevel.DANGER]: 0.10,
  [DrawdownLevel.CRITICAL]: 0.15,
  [DrawdownLevel.EMERGENCY]: 0.20,
};

class DrawdownMonitor extends EventEmitter {
  constructor(config = {}) {
    super();
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...config.thresholds };
    this.windowMs = config.windowMs || 86400000 * 30;  // 30 days
    this.checkInterval = config.checkInterval || 60000; // 1 minute

    this.peakEquity = 0;
    this.currentEquity = 0;
    this.currentLevel = DrawdownLevel.NORMAL;
    this.history = [];
    this.alerts = [];
    this.dailyReturns = [];
    this.maxDrawdown = 0;
    this.isMonitoring = false;
    this._timer = null;

    // Automatic actions per level
    this.actions = {
      [DrawdownLevel.WARNING]: config.warningAction || 'alert',
      [DrawdownLevel.DANGER]: config.dangerAction || 'reduce_size',
      [DrawdownLevel.CRITICAL]: config.criticalAction || 'close_new',
      [DrawdownLevel.EMERGENCY]: config.emergencyAction || 'halt_all',
    };
  }

  /**
   * Start monitoring
   */
  start(initialEquity) {
    this.peakEquity = initialEquity;
    this.currentEquity = initialEquity;
    this.isMonitoring = true;
    this._recordSnapshot();

    if (this.checkInterval > 0) {
      this._timer = setInterval(() => this._periodicCheck(), this.checkInterval);
    }

    this.emit('monitor:started', { equity: initialEquity });
  }

  /**
   * Stop monitoring
   */
  stop() {
    this.isMonitoring = false;
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    this.emit('monitor:stopped');
  }

  /**
   * Update with new equity value
   */
  update(equity, timestamp = Date.now()) {
    if (!this.isMonitoring) return;

    const previousEquity = this.currentEquity;
    this.currentEquity = equity;

    // Track daily returns
    if (this.history.length > 0) {
      const lastTimestamp = this.history[this.history.length - 1].timestamp;
      if (timestamp - lastTimestamp >= 86400000) {
        const dailyReturn = (equity - previousEquity) / previousEquity;
        this.dailyReturns.push({ timestamp, return: dailyReturn });
        this._pruneOldData(timestamp);
      }
    }

    // Update peak
    if (equity > this.peakEquity) {
      this.peakEquity = equity;
    }

    // Calculate drawdown
    const drawdown = this.peakEquity > 0
      ? (this.peakEquity - equity) / this.peakEquity
      : 0;

    if (drawdown > this.maxDrawdown) {
      this.maxDrawdown = drawdown;
    }

    this._recordSnapshot();
    this._checkLevel(drawdown);

    return {
      equity,
      peakEquity: this.peakEquity,
      drawdown,
      maxDrawdown: this.maxDrawdown,
      level: this.currentLevel,
    };
  }

  /**
   * Get current drawdown metrics
   */
  getMetrics() {
    const drawdown = this.peakEquity > 0
      ? (this.peakEquity - this.currentEquity) / this.peakEquity
      : 0;

    return {
      currentEquity: this.currentEquity,
      peakEquity: this.peakEquity,
      currentDrawdown: drawdown,
      maxDrawdown: this.maxDrawdown,
      level: this.currentLevel,
      alerts: this.alerts.length,
      dailyVolatility: this._calcDailyVolatility(),
      recoveryFactor: this.maxDrawdown > 0
        ? (this.currentEquity - (this.peakEquity * (1 - this.maxDrawdown)))
          / (this.peakEquity * this.maxDrawdown)
        : 0,
      ulcerIndex: this._calcUlcerIndex(),
    };
  }

  /**
   * Get drawdown history
   */
  getHistory() {
    return [...this.history];
  }

  /**
   * Check drawdown level and emit alerts
   */
  _checkLevel(drawdown) {
    let newLevel = DrawdownLevel.NORMAL;

    if (drawdown >= this.thresholds[DrawdownLevel.EMERGENCY]) {
      newLevel = DrawdownLevel.EMERGENCY;
    } else if (drawdown >= this.thresholds[DrawdownLevel.CRITICAL]) {
      newLevel = DrawdownLevel.CRITICAL;
    } else if (drawdown >= this.thresholds[DrawdownLevel.DANGER]) {
      newLevel = DrawdownLevel.DANGER;
    } else if (drawdown >= this.thresholds[DrawdownLevel.WARNING]) {
      newLevel = DrawdownLevel.WARNING;
    }

    if (newLevel !== this.currentLevel) {
      const alert = {
        timestamp: Date.now(),
        previousLevel: this.currentLevel,
        newLevel,
        drawdown,
        equity: this.currentEquity,
        peakEquity: this.peakEquity,
        action: this.actions[newLevel],
      };

      this.alerts.push(alert);
      this.currentLevel = newLevel;

      this.emit('drawdown:alert', alert);
      this.emit(`drawdown:${newLevel}`, alert);

      // Emit action event
      if (this.actions[newLevel] && newLevel !== DrawdownLevel.NORMAL) {
        this.emit('risk:action', {
          action: this.actions[newLevel],
          level: newLevel,
          drawdown,
        });
      }
    }
  }

  /**
   * Record equity snapshot
   */
  _recordSnapshot() {
    this.history.push({
      timestamp: Date.now(),
      equity: this.currentEquity,
      peakEquity: this.peakEquity,
      drawdown: this.peakEquity > 0
        ? (this.peakEquity - this.currentEquity) / this.peakEquity
        : 0,
    });
  }

  /**
   * Periodic health check
   */
  _periodicCheck() {
    if (!this.isMonitoring) return;

    const drawdown = this.peakEquity > 0
      ? (this.peakEquity - this.currentEquity) / this.peakEquity
      : 0;

    this.emit('monitor:heartbeat', {
      equity: this.currentEquity,
      drawdown,
      level: this.currentLevel,
      maxDrawdown: this.maxDrawdown,
    });
  }

  /**
   * Prune old data outside the monitoring window
   */
  _pruneOldData(currentTimestamp) {
    const cutoff = currentTimestamp - this.windowMs;
    this.dailyReturns = this.dailyReturns.filter(d => d.timestamp >= cutoff);
  }

  /**
   * Calculate daily volatility
   */
  _calcDailyVolatility() {
    if (this.dailyReturns.length < 2) return 0;
    const returns = this.dailyReturns.map(d => d.return);
    const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
    return Math.sqrt(variance);
  }

  /**
   * Calculate Ulcer Index (measure of downside volatility)
   */
  _calcUlcerIndex() {
    if (this.history.length < 2) return 0;
    let sumSquaredDD = 0;
    for (const snap of this.history) {
      sumSquaredDD += snap.drawdown ** 2;
    }
    return Math.sqrt(sumSquaredDD / this.history.length);
  }
}

module.exports = { DrawdownMonitor, DrawdownLevel, DEFAULT_THRESHOLDS };
