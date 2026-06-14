// ============================================================
// Unit Tests: SignalFusionEngine
// ============================================================
import { describe, it, expect, beforeEach } from 'vitest';
import { SignalFusionEngine } from '../agents/signal-fusion/index';
import type { MarketDataPoint, TradingSignal, SignalType } from '../types';

// We test the fuseSignals method directly since it's public
// and the signal generators indirectly through their behavior

function makeMarketData(overrides: Partial<MarketDataPoint> = {}): MarketDataPoint {
  return {
    symbol: 'BNB',
    price: 600,
    volume24h: 2_000_000_000,
    marketCap: 90_000_000_000,
    priceChange24h: 3.5,
    priceChange7d: 8.2,
    timestamp: Date.now(),
    source: 'cmc',
    ...overrides,
  };
}

function makeSignal(type: SignalType, source: string, confidence = 0.7, strength = 0.6): TradingSignal {
  return {
    id: `sig-${Date.now()}-${Math.random()}`,
    symbol: 'BNB',
    type,
    source: source as any,
    confidence,
    strength,
    reasoning: `Test signal: ${type} from ${source}`,
    metadata: {},
    timestamp: Date.now(),
    ttl: 300000,
  };
}

describe('SignalFusionEngine', () => {
  let engine: SignalFusionEngine;

  beforeEach(() => {
    engine = new SignalFusionEngine();
  });

  describe('Constructor & Initialization', () => {
    it('should initialize with default config', () => {
      const state = engine.getState();
      expect(state.status).toBe('idle');
      expect(state.metrics.totalRuns).toBe(0);
      expect(state.metrics.successRate).toBe(1.0);
    });

    it('should initialize with custom config', () => {
      const custom = new SignalFusionEngine({ id: 'custom-sfe', name: 'Custom SFE' });
      const state = custom.getState();
      expect(state.status).toBe('idle');
    });

    it('should have default signal weights', () => {
      const weights = engine.getWeights();
      expect(weights).toHaveProperty('technical');
      expect(weights).toHaveProperty('sentiment');
      expect(weights).toHaveProperty('onchain');
      expect(weights).toHaveProperty('macro');
      expect(weights).toHaveProperty('ai');

      // Weights should sum to approximately 1
      const totalWeight = Object.values(weights).reduce((sum, w) => sum + w.weight, 0);
      expect(totalWeight).toBeCloseTo(1.0, 2);
    });

    it('technical weight should be highest default weight', () => {
      const weights = engine.getWeights();
      expect(weights.technical.weight).toBeGreaterThan(weights.sentiment.weight);
      expect(weights.technical.weight).toBe(0.30);
    });
  });

  describe('fuseSignals', () => {
    it('should produce BUY signal from multiple buy signals', () => {
      const signals = [
        makeSignal('BUY', 'technical', 0.7, 0.6),
        makeSignal('BUY', 'sentiment', 0.65, 0.5),
        makeSignal('BUY', 'onchain', 0.7, 0.6),
      ];

      const fused = engine.fuseSignals('BNB', signals);
      expect(['BUY', 'STRONG_BUY']).toContain(fused.finalSignal);
      expect(fused.compositeScore).toBeGreaterThan(0);
      expect(fused.symbol).toBe('BNB');
      expect(fused.contributingSignals).toHaveLength(3);
    });

    it('should produce SELL signal from multiple sell signals', () => {
      const signals = [
        makeSignal('SELL', 'technical', 0.7, 0.6),
        makeSignal('SELL', 'sentiment', 0.65, 0.5),
        makeSignal('SELL', 'onchain', 0.7, 0.6),
      ];

      const fused = engine.fuseSignals('BNB', signals);
      expect(['SELL', 'STRONG_SELL']).toContain(fused.finalSignal);
      expect(fused.compositeScore).toBeLessThan(0);
    });

    it('should produce HOLD signal from conflicting signals', () => {
      const signals = [
        makeSignal('BUY', 'technical', 0.5, 0.3),
        makeSignal('SELL', 'sentiment', 0.5, 0.3),
      ];

      const fused = engine.fuseSignals('BNB', signals);
      // With balanced opposing signals, should tend toward HOLD
      expect(Math.abs(fused.compositeScore)).toBeLessThan(0.5);
    });

    it('should handle STRONG_BUY with higher composite score', () => {
      const strongSignals = [
        makeSignal('STRONG_BUY', 'technical', 0.9, 0.9),
        makeSignal('STRONG_BUY', 'onchain', 0.85, 0.8),
      ];

      const weakSignals = [
        makeSignal('BUY', 'technical', 0.9, 0.9),
        makeSignal('BUY', 'onchain', 0.85, 0.8),
      ];

      const strongFused = engine.fuseSignals('BNB', strongSignals);
      const weakFused = engine.fuseSignals('BNB2', weakSignals);

      expect(strongFused.compositeScore).toBeGreaterThan(weakFused.compositeScore);
    });

    it('should clamp composite score between -1 and 1', () => {
      const signals = [
        makeSignal('STRONG_BUY', 'technical', 1.0, 1.0),
        makeSignal('STRONG_BUY', 'sentiment', 1.0, 1.0),
        makeSignal('STRONG_BUY', 'onchain', 1.0, 1.0),
        makeSignal('STRONG_BUY', 'macro', 1.0, 1.0),
        makeSignal('STRONG_BUY', 'ai', 1.0, 1.0),
      ];

      const fused = engine.fuseSignals('BNB', signals);
      expect(fused.compositeScore).toBeGreaterThanOrEqual(-1);
      expect(fused.compositeScore).toBeLessThanOrEqual(1);
    });
  });

  describe('Risk Assessment', () => {
    it('should assess LOW risk for aligned signals', () => {
      const signals = [
        makeSignal('BUY', 'technical', 0.8, 0.7),
        makeSignal('BUY', 'sentiment', 0.8, 0.7),
        makeSignal('BUY', 'onchain', 0.8, 0.7),
      ];

      const fused = engine.fuseSignals('BNB', signals);
      expect(fused.riskAssessment.level).toBe('LOW');
      expect(fused.riskAssessment.reasons[0]).toContain('aligned');
    });

    it('should assess higher risk for divergent signals', () => {
      const signals = [
        makeSignal('STRONG_BUY', 'technical', 0.9, 0.9),
        makeSignal('STRONG_SELL', 'sentiment', 0.9, 0.9),
        makeSignal('BUY', 'onchain', 0.5, 0.3),
      ];

      const fused = engine.fuseSignals('BNB', signals);
      expect(['MEDIUM', 'HIGH', 'EXTREME']).toContain(fused.riskAssessment.level);
    });
  });

  describe('Accessors', () => {
    it('should return empty signal buffer initially', () => {
      const buffer = engine.getSignalBuffer();
      expect(buffer.size).toBe(0);
    });

    it('should return empty fusion history initially', () => {
      const history = engine.getFusionHistory();
      expect(history).toHaveLength(0);
    });

    it('should return performance scores for all sources', () => {
      const weights = engine.getWeights();
      for (const source of ['technical', 'sentiment', 'onchain', 'macro', 'ai']) {
        expect(weights[source]).toBeDefined();
        expect(weights[source].performanceScore).toBe(0.5);
        expect(weights[source].accuracy).toBe(0);
      }
    });
  });
});
