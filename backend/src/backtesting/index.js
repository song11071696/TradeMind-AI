// ============================================================
// TradeMind AI - Backtesting Module Entry
// ============================================================
// Re-exports all backtesting components for convenient import.
// Usage:
//   const { BacktestEngine, DataLoader, Reporter } = require('./backtesting');
// ============================================================

const { BacktestEngine, Portfolio, Trade, DEFAULT_CONFIG } = require('./engine');
const { DataLoader, parseCSV, parseJSON, validateBars, resample, TIMEFRAME_MS } = require('./data-loader');
const { Reporter, generateTextReport, generateJSONReport, generateMarkdownReport } = require('./reporter');

/**
 * Quick backtest helper - loads data, runs engine, generates report
 * @param {Object} strategy - Strategy with onBar(context) method
 * @param {Array|String} data - OHLCV array or file path
 * @param {Object} options - { config, format, reportPath }
 * @returns {Object} { results, report }
 */
async function quickBacktest(strategy, data, options = {}) {
  const engine = new BacktestEngine(options.config);
  engine.setStrategy(strategy);

  let bars;
  if (Array.isArray(data)) {
    const loader = new DataLoader();
    bars = loader.loadFromArray(data, options);
  } else if (typeof data === 'string') {
    const loader = new DataLoader();
    bars = await loader.loadFromFile(data, options);
  } else {
    bars = data;
  }

  const results = await engine.run(bars);
  const format = options.format || 'text';
  const report = Reporter.generate(results, format);

  if (options.reportPath) {
    await Reporter.save(results, options.reportPath, format);
  }

  return { results, report };
}

module.exports = {
  // Core classes
  BacktestEngine,
  Portfolio,
  Trade,
  DataLoader,
  Reporter,
  // Utilities
  parseCSV,
  parseJSON,
  validateBars,
  resample,
  TIMEFRAME_MS,
  DEFAULT_CONFIG,
  // Report generators
  generateTextReport,
  generateJSONReport,
  generateMarkdownReport,
  // Helper
  quickBacktest,
};
