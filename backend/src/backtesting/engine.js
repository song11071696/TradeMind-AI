// ============================================================
// TradeMind AI - Backtesting Engine
// ============================================================
// Core engine for simulating trading strategies against
// historical data with realistic execution modeling.
// ============================================================

const EventEmitter = require('events');

/**
 * Default backtest configuration
 */
const DEFAULT_CONFIG = {
  initialCapital: 100000,
  commission: 0.001,        // 0.1% per trade
  slippage: 0.0005,         // 0.05% slippage model
  maxPositions: 10,
  riskFreeRate: 0.04,       // 4% annual
  startDate: null,
  endDate: null,
  timeframe: '1d',
  enableShortSelling: false,
  marginRequirement: 0.5,
};

/**
 * Backtest trade record
 */
class Trade {
  constructor(params) {
    this.id = params.id || `trade_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.symbol = params.symbol;
    this.side = params.side;           // 'long' | 'short'
    this.entryPrice = params.entryPrice;
    this.exitPrice = params.exitPrice || null;
    this.quantity = params.quantity;
    this.entryTime = params.entryTime;
    this.exitTime = params.exitTime || null;
    this.commission = params.commission || 0;
    this.slippage = params.slippage || 0;
    this.pnl = 0;
    this.pnlPercent = 0;
    this.status = 'open';             // 'open' | 'closed'
  }

  close(exitPrice, exitTime, commission = 0, slippage = 0) {
    this.exitPrice = exitPrice;
    this.exitTime = exitTime;
    this.commission += commission;
    this.slippage += slippage;

    if (this.side === 'long') {
      this.pnl = (this.exitPrice - this.entryPrice) * this.quantity - this.commission - this.slippage;
      this.pnlPercent = (this.exitPrice - this.entryPrice) / this.entryPrice;
    } else {
      this.pnl = (this.entryPrice - this.exitPrice) * this.quantity - this.commission - this.slippage;
      this.pnlPercent = (this.entryPrice - this.exitPrice) / this.entryPrice;
    }
    this.status = 'closed';
    return this;
  }
}

/**
 * Portfolio state tracker
 */
class Portfolio {
  constructor(initialCapital) {
    this.initialCapital = initialCapital;
    this.cash = initialCapital;
    this.positions = new Map();
    this.closedTrades = [];
    this.equityCurve = [];
    this.peakEquity = initialCapital;
    this.maxDrawdown = 0;
    this.currentDrawdown = 0;
  }

  get totalValue() {
    let positionsValue = 0;
    for (const pos of this.positions.values()) {
      if (pos.side === 'long') {
        positionsValue += (pos.currentPrice || pos.entryPrice) * pos.quantity;
      } else {
        positionsValue += (2 * pos.entryPrice - (pos.currentPrice || pos.entryPrice)) * pos.quantity;
      }
    }
    return this.cash + positionsValue;
  }

  updateEquity(timestamp) {
    const equity = this.totalValue;
    this.equityCurve.push({ timestamp, equity, cash: this.cash });

    if (equity > this.peakEquity) {
      this.peakEquity = equity;
    }
    this.currentDrawdown = (this.peakEquity - equity) / this.peakEquity;
    if (this.currentDrawdown > this.maxDrawdown) {
      this.maxDrawdown = this.currentDrawdown;
    }
    return equity;
  }
}

/**
 * Main Backtesting Engine
 */
class BacktestEngine extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.portfolio = null;
    this.strategy = null;
    this.tradeCounter = 0;
    this.isRunning = false;
    this.results = null;
  }

  /**
   * Set the strategy to backtest
   * @param {Object} strategy - Strategy with onBar/onTick methods
   */
  setStrategy(strategy) {
    if (!strategy || typeof strategy.onBar !== 'function') {
      throw new Error('Strategy must implement onBar(data) method');
    }
    this.strategy = strategy;
    return this;
  }

  /**
   * Run backtest on historical data
   * @param {Array} bars - Array of OHLCV bars
   * @returns {Object} Backtest results
   */
  async run(bars) {
    if (!this.strategy) {
      throw new Error('Strategy not set. Call setStrategy() first');
    }
    if (!Array.isArray(bars) || bars.length === 0) {
      throw new Error('Bars array must be non-empty');
    }

    this.portfolio = new Portfolio(this.config.initialCapital);
    this.isRunning = true;
    this.tradeCounter = 0;

    const context = this._createContext();

    this.emit('backtest:start', {
      bars: bars.length,
      startDate: bars[0].timestamp,
      endDate: bars[bars.length - 1].timestamp,
    });

    for (let i = 0; i < bars.length && this.isRunning; i++) {
      const bar = bars[i];
      context.currentBar = bar;
      context.currentIndex = i;
      context.history = bars.slice(Math.max(0, i - 100), i + 1);

      // Update position prices
      this._updatePositionPrices(bar);

      // Let strategy process the bar
      try {
        await this.strategy.onBar(context);
      } catch (err) {
        this.emit('strategy:error', { bar, error: err });
      }

      // Record equity
      this.portfolio.updateEquity(bar.timestamp);

      this.emit('bar:processed', {
        index: i,
        total: bars.length,
        equity: this.portfolio.totalValue,
      });
    }

    // Close all open positions at last bar
    const lastBar = bars[bars.length - 1];
    this._closeAllPositions(lastBar.close, lastBar.timestamp);

    this.results = this._calculateResults(bars);
    this.isRunning = false;

    this.emit('backtest:complete', this.results);
    return this.results;
  }

  /**
   * Stop a running backtest
   */
  stop() {
    this.isRunning = false;
  }

  /**
   * Create strategy context with trading functions
   */
  _createContext() {
    const self = this;
    return {
      currentBar: null,
      currentIndex: 0,
      history: [],
      portfolio: {
        get cash() { return self.portfolio.cash; },
        get positions() { return Array.from(self.portfolio.positions.values()); },
        get totalValue() { return self.portfolio.totalValue; },
        get drawdown() { return self.portfolio.currentDrawdown; },
      },
      buy(symbol, quantity, price) {
        return self._openPosition('long', symbol, quantity, price);
      },
      sell(symbol, quantity, price) {
        return self._closePosition('long', symbol, quantity, price);
      },
      short(symbol, quantity, price) {
        if (!self.config.enableShortSelling) return null;
        return self._openPosition('short', symbol, quantity, price);
      },
      cover(symbol, quantity, price) {
        return self._closePosition('short', symbol, quantity, price);
      },
    };
  }

  /**
   * Open a new position
   */
  _openPosition(side, symbol, quantity, price) {
    if (this.portfolio.positions.size >= this.config.maxPositions) {
      return null;
    }

    const slippage = price * this.config.slippage;
    const effectivePrice = side === 'long' ? price + slippage : price - slippage;
    const commission = effectivePrice * quantity * this.config.commission;
    const cost = effectivePrice * quantity + commission;

    if (side === 'long' && cost > this.portfolio.cash) {
      return null;
    }

    this.portfolio.cash -= cost;
    this.tradeCounter++;

    const trade = new Trade({
      id: `T${this.tradeCounter}`,
      symbol,
      side,
      entryPrice: effectivePrice,
      quantity,
      entryTime: this.portfolio.equityCurve.length,
      commission,
      slippage,
    });

    this.portfolio.positions.set(trade.id, trade);
    this.emit('trade:open', trade);
    return trade;
  }

  /**
   * Close an existing position
   */
  _closePosition(side, symbol, quantity, price) {
    for (const [id, trade] of this.portfolio.positions) {
      if (trade.symbol === symbol && trade.side === side && trade.status === 'open') {
        const slippage = price * this.config.slippage;
        const effectivePrice = side === 'long' ? price - slippage : price + slippage;
        const commission = effectivePrice * quantity * this.config.commission;

        trade.close(effectivePrice, this.portfolio.equityCurve.length, commission, slippage);

        if (side === 'long') {
          this.portfolio.cash += effectivePrice * quantity - commission;
        } else {
          this.portfolio.cash += (trade.entryPrice * 2 - effectivePrice) * quantity - commission;
        }

        this.portfolio.positions.delete(id);
        this.portfolio.closedTrades.push(trade);
        this.emit('trade:close', trade);
        return trade;
      }
    }
    return null;
  }

  /**
   * Update current prices for open positions
   */
  _updatePositionPrices(bar) {
    for (const trade of this.portfolio.positions.values()) {
      trade.currentPrice = bar.close;
    }
  }

  /**
   * Close all open positions
   */
  _closeAllPositions(price, timestamp) {
    for (const [id, trade] of this.portfolio.positions) {
      const slippage = price * this.config.slippage;
      const effectivePrice = trade.side === 'long' ? price - slippage : price + slippage;
      const commission = effectivePrice * trade.quantity * this.config.commission;

      trade.close(effectivePrice, timestamp, commission, slippage);
      this.portfolio.cash += trade.side === 'long'
        ? effectivePrice * trade.quantity - commission
        : (trade.entryPrice * 2 - effectivePrice) * trade.quantity - commission;

      this.portfolio.closedTrades.push(trade);
      this.emit('trade:close', trade);
    }
    this.portfolio.positions.clear();
  }

  /**
   * Calculate comprehensive backtest results
   */
  _calculateResults(bars) {
    const trades = this.portfolio.closedTrades;
    const equity = this.portfolio.equityCurve;
    const winners = trades.filter(t => t.pnl > 0);
    const losers = trades.filter(t => t.pnl <= 0);

    // Daily returns
    const returns = [];
    for (let i = 1; i < equity.length; i++) {
      returns.push((equity[i].equity - equity[i - 1].equity) / equity[i - 1].equity);
    }

    const avgReturn = returns.length > 0
      ? returns.reduce((s, r) => s + r, 0) / returns.length : 0;
    const stdReturn = returns.length > 1
      ? Math.sqrt(returns.reduce((s, r) => s + (r - avgReturn) ** 2, 0) / (returns.length - 1))
      : 0;

    const tradingDays = bars.length;
    const annualizationFactor = 252;

    return {
      summary: {
        initialCapital: this.config.initialCapital,
        finalEquity: this.portfolio.totalValue,
        totalReturn: (this.portfolio.totalValue - this.config.initialCapital) / this.config.initialCapital,
        totalTrades: trades.length,
        winningTrades: winners.length,
        losingTrades: losers.length,
        winRate: trades.length > 0 ? winners.length / trades.length : 0,
        maxDrawdown: this.portfolio.maxDrawdown,
        tradingDays,
      },
      performance: {
        annualizedReturn: avgReturn * annualizationFactor,
        annualizedVolatility: stdReturn * Math.sqrt(annualizationFactor),
        sharpeRatio: stdReturn > 0 ? (avgReturn - this.config.riskFreeRate / annualizationFactor) / stdReturn * Math.sqrt(annualizationFactor) : 0,
        sortinoRatio: this._calcSortino(returns, annualizationFactor),
        calmarRatio: this.portfolio.maxDrawdown > 0
          ? (avgReturn * annualizationFactor) / this.portfolio.maxDrawdown : 0,
      },
      trades: {
        avgWin: winners.length > 0 ? winners.reduce((s, t) => s + t.pnl, 0) / winners.length : 0,
        avgLoss: losers.length > 0 ? losers.reduce((s, t) => s + t.pnl, 0) / losers.length : 0,
        largestWin: winners.length > 0 ? Math.max(...winners.map(t => t.pnl)) : 0,
        largestLoss: losers.length > 0 ? Math.min(...losers.map(t => t.pnl)) : 0,
        profitFactor: this._calcProfitFactor(trades),
        avgHoldingPeriod: trades.length > 0
          ? trades.reduce((s, t) => s + (t.exitTime - t.entryTime), 0) / trades.length : 0,
        totalCommission: trades.reduce((s, t) => s + t.commission, 0),
        totalSlippage: trades.reduce((s, t) => s + t.slippage, 0),
      },
      equity: equity,
      tradesList: trades,
    };
  }

  _calcSortino(returns, annualizationFactor) {
    const riskFree = this.config.riskFreeRate / annualizationFactor;
    const downside = returns.filter(r => r < riskFree);
    if (downside.length === 0) return 0;
    const downDev = Math.sqrt(downside.reduce((s, r) => s + (r - riskFree) ** 2, 0) / downside.length);
    const avgRet = returns.reduce((s, r) => s + r, 0) / returns.length;
    return downDev > 0 ? (avgRet - riskFree) / downDev * Math.sqrt(annualizationFactor) : 0;
  }

  _calcProfitFactor(trades) {
    const grossProfit = trades.filter(t => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
    const grossLoss = Math.abs(trades.filter(t => t.pnl <= 0).reduce((s, t) => s + t.pnl, 0));
    return grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
  }
}

module.exports = { BacktestEngine, Portfolio, Trade, DEFAULT_CONFIG };
