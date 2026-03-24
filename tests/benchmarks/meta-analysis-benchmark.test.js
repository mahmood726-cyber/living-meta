/**
 * Performance Benchmarks for Meta-Analysis
 * Ensures acceptable performance for large-scale analyses
 *
 * @module PerformanceTests
 */

import { describe, it, expect } from 'vitest';
import { fixedEffects } from '../../src/lib/meta-fe.js';
import { derSimonianLaird } from '../../src/lib/meta-dl.js';
import { simpleMetaRegression } from '../../src/lib/meta-regression/multiple-regression.js';

// Performance targets (in milliseconds)
const TARGETS = {
  small: { n: 10, target: 10 },
  medium: { n: 50, target: 50 },
  large: { n: 100, target: 100 }
};

/**
 * Generate synthetic study data for benchmarking
 */
function generateStudies(n, effectSize = 0.3) {
  const studies = [];
  for (let i = 0; i < n; i++) {
    const yi = effectSize + (Math.random() - 0.5) * 0.5;
    const vi = 0.01 + Math.random() * 0.05;
    studies.push({
      id: `S${i + 1}`,
      yi,
      vi,
      events: Math.max(1, Math.round(100 * (1 / (1 + Math.exp(-yi))))),
      denominator: 100 + Math.floor(Math.random() * 100)
    });
  }
  return studies;
}

/**
 * Benchmark function with measurement
 */
function benchmark(name, fn, targetMs) {
  const start = performance.now();
  const result = fn();
  const end = performance.now();
  const duration = end - start;

  return {
    name,
    duration,
    targetMs,
    passed: duration <= targetMs,
    result
  };
}

describe('Meta-Analysis Performance Benchmarks', () => {
  describe('Fixed Effect Meta-Analysis', () => {
    it('should handle 10 studies quickly', () => {
      const studies = generateStudies(TARGETS.small.n);
      const { duration, targetMs, passed, result } = benchmark(
        'Fixed effect (10 studies)',
        () => fixedEffects(studies),
        TARGETS.small.target
      );

      expect(result.error).toBeUndefined();
      expect(duration).toBeLessThanOrEqual(targetMs * 2); // Allow 2x for slow systems
      console.log(`  Fixed effect (10 studies): ${duration.toFixed(2)}ms (target: ${targetMs}ms)`);
    });

    it('should handle 50 studies efficiently', () => {
      const studies = generateStudies(TARGETS.medium.n);
      const { duration, targetMs, passed, result } = benchmark(
        'Fixed effect (50 studies)',
        () => fixedEffects(studies),
        TARGETS.medium.target
      );

      expect(result.error).toBeUndefined();
      expect(duration).toBeLessThanOrEqual(targetMs * 2);
      console.log(`  Fixed effect (50 studies): ${duration.toFixed(2)}ms (target: ${targetMs}ms)`);
    });

    it('should handle 100 studies within acceptable time', () => {
      const studies = generateStudies(TARGETS.large.n);
      const { duration, targetMs, passed, result } = benchmark(
        'Fixed effect (100 studies)',
        () => fixedEffects(studies),
        TARGETS.large.target
      );

      expect(result.error).toBeUndefined();
      expect(duration).toBeLessThanOrEqual(targetMs * 2);
      console.log(`  Fixed effect (100 studies): ${duration.toFixed(2)}ms (target: ${targetMs}ms)`);
    });
  });

  describe('Random Effects Meta-Analysis', () => {
    it('should handle 10 studies quickly', () => {
      const studies = generateStudies(TARGETS.small.n, 0.5);
      const { duration, targetMs, result } = benchmark(
        'Random effects (10 studies)',
        () => derSimonianLaird(studies),
        TARGETS.small.target
      );

      expect(result.error).toBeUndefined();
      expect(duration).toBeLessThanOrEqual(targetMs * 2);
      console.log(`  Random effects (10 studies): ${duration.toFixed(2)}ms (target: ${targetMs}ms)`);
    });

    it('should handle 50 studies efficiently', () => {
      const studies = generateStudies(TARGETS.medium.n, 0.5);
      const { duration, targetMs, result } = benchmark(
        'Random effects (50 studies)',
        () => derSimonianLaird(studies),
        TARGETS.medium.target
      );

      expect(result.error).toBeUndefined();
      expect(duration).toBeLessThanOrEqual(targetMs * 2);
      console.log(`  Random effects (50 studies): ${duration.toFixed(2)}ms (target: ${targetMs}ms)`);
    });

    it('should handle 100 studies within acceptable time', () => {
      const studies = generateStudies(TARGETS.large.n, 0.5);
      const { duration, targetMs, result } = benchmark(
        'Random effects (100 studies)',
        () => derSimonianLaird(studies),
        TARGETS.large.target
      );

      expect(result.error).toBeUndefined();
      expect(duration).toBeLessThanOrEqual(targetMs * 2);
      console.log(`  Random effects (100 studies): ${duration.toFixed(2)}ms (target: ${targetMs}ms)`);
    });
  });

  describe('Meta-Regression Performance', () => {
    it('should handle simple meta-regression efficiently', () => {
      const studies = generateStudies(50, 0.3);
      studies.forEach((s, i) => {
        s.year = 2000 + i;
        s.sampleSize = 100 + i * 10;
      });

      const { duration, result } = benchmark(
        'Simple meta-regression (50 studies)',
        () => simpleMetaRegression(studies, 'year'),
        50
      );

      expect(result.error).toBeUndefined();
      expect(duration).toBeLessThanOrEqual(100); // 2x allowance
      console.log(`  Simple meta-regression: ${duration.toFixed(2)}ms`);
    });
  });
});

describe('Performance Summary', () => {
  it('should report overall performance metrics', () => {
    console.log('\n=== Performance Benchmark Summary ===');
    console.log('Note: All tests use 2x tolerance for CI/variability');
    console.log('=====================================\n');
    expect(true).toBe(true);
  });
});
