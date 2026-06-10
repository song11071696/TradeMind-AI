// ============================================================
// TradeMind AI - Historical Data Loader
// ============================================================
// Loads and normalizes historical OHLCV data from multiple
// sources for backtesting engine consumption.
// ============================================================

const fs = require('fs').promises;
const path = require('path');

/**
 * Supported data sources
 */
const DataSource = {
  CSV: 'csv',
  JSON: 'json',
  API: 'api',
};

/**
 * Timeframe mappings
 */
const TIMEFRAME_MS = {
  '1m': 60000,
  '5m': 300000,
  '15m': 900000,
  '1h': 3600000,
  '4h': 14400000,
  '1d': 86400000,
  '1w': 604800000,
};

/**
 * Parse CSV data into OHLCV bars
 */
function parseCSV(content, options = {}) {
  const delimiter = options.delimiter || ',';
  const hasHeader = options.hasHeader !== false;
  const columns = options.columns || {
    timestamp: 0, open: 1, high: 2, low: 3, close: 4, volume: 5,
  };

  const lines = content.trim().split('\n');
  const start = hasHeader ? 1 : 0;
  const bars = [];

  for (let i = start; i < lines.length; i++) {
    const parts = lines[i].split(delimiter).map(p => p.trim());
    if (parts.length < 5) continue;

    const timestamp = new Date(parts[columns.timestamp]).getTime();
    if (isNaN(timestamp)) continue;

    bars.push({
      timestamp,
      open: parseFloat(parts[columns.open]),
      high: parseFloat(parts[columns.high]),
      low: parseFloat(parts[columns.low]),
      close: parseFloat(parts[columns.close]),
      volume: columns.volume !== undefined ? parseFloat(parts[columns.volume]) : 0,
    });
  }

  return bars.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Parse JSON data into OHLCV bars
 */
function parseJSON(data) {
  const arr = typeof data === 'string' ? JSON.parse(data) : data;
  if (!Array.isArray(arr)) throw new Error('JSON data must be an array');

  return arr.map(item => ({
    timestamp: typeof item.timestamp === 'number'
      ? item.timestamp
      : new Date(item.timestamp || item.date || item.time).getTime(),
    open: parseFloat(item.open || item.o),
    high: parseFloat(item.high || item.h),
    low: parseFloat(item.low || item.l),
    close: parseFloat(item.close || item.c),
    volume: parseFloat(item.volume || item.v || 0),
  })).filter(b => !isNaN(b.timestamp) && !isNaN(b.open))
    .sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Validate OHLCV bar data integrity
 */
function validateBars(bars) {
  const errors = [];

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    if (bar.open <= 0 || bar.close <= 0) {
      errors.push(`Bar ${i}: invalid price (open=${bar.open}, close=${bar.close})`);
    }
    if (bar.high < bar.low) {
      errors.push(`Bar ${i}: high < low`);
    }
    if (bar.high < bar.open || bar.high < bar.close) {
      errors.push(`Bar ${i}: high below open/close`);
    }
    if (bar.low > bar.open || bar.low > bar.close) {
      errors.push(`Bar ${i}: low above open/close`);
    }
    if (i > 0 && bar.timestamp <= bars[i - 1].timestamp) {
      errors.push(`Bar ${i}: timestamp not ascending`);
    }
  }

  return { valid: errors.length === 0, errors, barsChecked: bars.length };
}

/**
 * Resample bars to a different timeframe
 */
function resample(bars, targetTimeframe) {
  const interval = TIMEFRAME_MS[targetTimeframe];
  if (!interval) throw new Error(`Unknown timeframe: ${targetTimeframe}`);

  const buckets = new Map();
  for (const bar of bars) {
    const bucketKey = Math.floor(bar.timestamp / interval) * interval;
    if (!buckets.has(bucketKey)) {
      buckets.set(bucketKey, {
        timestamp: bucketKey,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
      });
    } else {
      const b = buckets.get(bucketKey);
      b.high = Math.max(b.high, bar.high);
      b.low = Math.min(b.low, bar.low);
      b.close = bar.close;
      b.volume += bar.volume;
    }
  }

  return Array.from(buckets.values()).sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Main DataLoader class
 */
class DataLoader {
  constructor(options = {}) {
    this.dataDir = options.dataDir || path.join(process.cwd(), 'data');
    this.cache = new Map();
  }

  /**
   * Load data from file
   */
  async loadFromFile(filePath, options = {}) {
    const ext = path.extname(filePath).toLowerCase();
    const content = await fs.readFile(filePath, 'utf-8');

    let bars;
    if (ext === '.csv') {
      bars = parseCSV(content, options);
    } else if (ext === '.json') {
      bars = parseJSON(content);
    } else {
      throw new Error(`Unsupported file format: ${ext}`);
    }

    return this._processBars(bars, options);
  }

  /**
   * Load data from array
   */
  loadFromArray(data, options = {}) {
    const bars = parseJSON(data);
    return this._processBars(bars, options);
  }

  /**
   * Process bars with filtering, resampling, validation
   */
  _processBars(bars, options = {}) {
    // Filter by date range
    if (options.startDate) {
      const start = new Date(options.startDate).getTime();
      bars = bars.filter(b => b.timestamp >= start);
    }
    if (options.endDate) {
      const end = new Date(options.endDate).getTime();
      bars = bars.filter(b => b.timestamp <= end);
    }

    // Resample if needed
    if (options.timeframe) {
      bars = resample(bars, options.timeframe);
    }

    // Validate
    if (options.validate !== false) {
      const validation = validateBars(bars);
      if (!validation.valid && options.strict) {
        throw new Error(`Data validation failed: ${validation.errors.slice(0, 5).join('; ')}`);
      }
    }

    return bars;
  }

  /**
   * Generate sample data for testing
   */
  static generateSampleData(bars = 500, startPrice = 100, volatility = 0.02) {
    const data = [];
    let price = startPrice;
    const startTime = Date.now() - bars * 86400000;

    for (let i = 0; i < bars; i++) {
      const change = (Math.random() - 0.48) * volatility * price;
      const open = price;
      const close = price + change;
      const high = Math.max(open, close) * (1 + Math.random() * volatility * 0.5);
      const low = Math.min(open, close) * (1 - Math.random() * volatility * 0.5);

      data.push({
        timestamp: startTime + i * 86400000,
        open, high, low, close,
        volume: Math.floor(Math.random() * 1000000) + 100000,
      });
      price = close;
    }
    return data;
  }
}

module.exports = { DataLoader, parseCSV, parseJSON, validateBars, resample, TIMEFRAME_MS };
