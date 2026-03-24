/**
 * Performance Benchmarks for Bayesian MCMC
 * Ensures acceptable performance for Bayesian methods
 *
 * @module BayesianPerformanceTests
 */

import { describe, it, expect } from 'vitest';
import { bayesianRandomEffects } from '../../src/lib/bayesian/mcmc-wrapper.js';

/**
 * Generate synthetic data for Bayesian meta-analysis
 */
function generateBayesianStudies(n, trueEffect = 0.3, trueTau2 = 0.05) {
  const studies = [];
  for (let i = 0; i < n; i++) {
    // Simulate from hierarchical model
    const theta = trueEffect + Math.sqrt(trueTau2) * (Math.random() - 0.5);
    const vi = 0.01 + Math.random() * 0.05;
    const yi = theta + Math.sqrt(vi) * (Math.random() - 0.5);

    studies.push({ yi, vi });
  }
  return studies;
}

/**
 * Benchmark function
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

describe('Bayesian MCMC Performance Benchmarks', () => {
  describe('Basic MCMC Performance', () => {
    it('should handle small dataset quickly', () => {
      const studies = generateBayesianStudies(10);
      const { duration, result } = benchmark(
        'Bayesian RE (10 studies, 1000 iterations)',
        () => bayesianRandomEffects(studies, {
          iterations: 1000,
          burnIn: 200,
          chains: 2
        }),
        500
      );

      expect(result.error).toBeUndefined();
      expect(result.mu).toBeDefined();
      expect(duration).toBeLessThanOrEqual(1000); // Allow 2x
      console.log(`  Bayesian RE (10 studies, 1000 iter): ${duration.toFixed(2)}ms`);
    });

    it('should handle medium dataset efficiently', () => {
      const studies = generateBayesianStudies(20);
      const { duration, result } = benchmark(
        'Bayesian RE (20 studies, 1000 iterations)',
        () => bayesianRandomEffects(studies, {
          iterations: 1000,
          burnIn: 200,
          chains: 2
        }),
        1000
      );

      expect(result.error).toBeUndefined();
      expect(result.mu).toBeDefined();
      expect(duration).toBeLessThanOrEqual(2000);
      console.log(`  Bayesian RE (20 studies, 1000 iter): ${duration.toFixed(2)}ms`);
    });
  });

  describe('MCMC Scaling', () => {
    it('should scale linearly with iterations', () => {
      const studies = generateBayesianStudies(15);

      const b1 = benchmark(
        '1000 iterations',
        () => bayesianRandomEffects(studies, {
          iterations: 1000,
          burnIn: 200,
          chains: 1
        }),
        500
      );

      const b2 = benchmark(
        '2000 iterations',
        () => bayesianRandomEffects(studies, {
          iterations: 2000,
          burnIn: 400,
          chains: 1
        }),
        1000
      );

      expect(b2.duration).toBeGreaterThan(b1.duration);
      expect(b2.duration / b1.duration).toBeLessThan(3); // Should be roughly 2x
      console.log(`  Scaling: 1000 iter = ${b1.duration.toFixed(2)}ms, 2000 iter = ${b2.duration.toFixed(2)}ms`);
    });

    it('should handle multiple chains efficiently', () => {
      const studies = generateBayesianStudies(15);

      const b1 = benchmark(
        '1 chain',
        () => bayesianRandomEffects(studies, {
          iterations: 500,
          chains: 1
        }),
        300
      );

      const b3 = benchmark(
        '3 chains',
        () => bayesianRandomEffects(studies, {
          iterations: 500,
          chains: 3
        }),
        900
      );

      expect(b3.duration).toBeGreaterThan(b1.duration);
      expect(b3.duration / b1.duration).toBeLessThan(4); // Should be roughly 3x
      console.log(`  Chains: 1 = ${b1.duration.toFixed(2)}ms, 3 = ${b3.duration.toFixed(2)}ms`);
    });
  });

  describe('Convergence Diagnostics', () => {
    it('should calculate R-hat efficiently', () => {
      const studies = generateBayesianStudies(20);
      const { duration, result } = benchmark(
        'Bayesian with R-hat (20 studies, 3 chains)',
        () => bayesianRandomEffects(studies, {
          iterations: 1000,
          burnIn: 200,
          chains: 3
        }),
        2000
      );

      expect(result.error).toBeUndefined();
      expect(result.rhat).toBeDefined();
      expect(result.rhat.mu).toBeGreaterThan(0);
      expect(duration).toBeLessThanOrEqual(4000);
      console.log(`  Bayesian with R-hat (3 chains): ${duration.toFixed(2)}ms`);
    });

    it('should calculate effective sample size efficiently', () => {
      const studies = generateBayesianStudies(20);
      const { duration, result } = benchmark(
        'Bayesian with nEff (20 studies)',
        () => bayesianRandomEffects(studies, {
          iterations: 1000,
          burnIn: 200,
          chains: 2
        }),
        1500
      );

      expect(result.error).toBeUndefined();
      expect(result.nEff).toBeDefined();
      expect(result.nEff.mu).toBeGreaterThan(0);
      expect(duration).toBeLessThanOrEqual(3000);
      console.log(`  Bayesian with nEff: ${duration.toFixed(2)}ms`);
    });
  });
});

describe('Bayesian Performance Summary', () => {
  it('should report overall Bayesian performance', () => {
    console.log('\n=== Bayesian Performance Summary ===');
    console.log('All Bayesian benchmarks completed');
    console.log('==================================\n');
    expect(true).toBe(true);
  });
});
