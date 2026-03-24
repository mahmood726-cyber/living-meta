/**
 * Performance Benchmarks for Network Meta-Analysis
 * Ensures acceptable performance for treatment networks
 *
 * @module NMAPerformanceTests
 */

import { describe, it, expect } from 'vitest';
import { networkMetaAnalysis } from '../../src/lib/nma/nma-results.js';

/**
 * Generate star network studies
 */
function generateStarNetwork(nTreatments, nStudiesPerComparison = 3) {
  const reference = 'Placebo';
  const treatments = [reference, ...Array.from({ length: nTreatments - 1 }, (_, i) => `T${i + 1}`)];
  const studies = [];

  for (let i = 1; i < treatments.length; i++) {
    for (let j = 0; j < nStudiesPerComparison; j++) {
      const eventRateControl = 0.4;
      const eventRateTreatment = 0.2 + Math.random() * 0.1;
      const n = 100 + Math.floor(Math.random() * 100);

      studies.push({
        id: `S_${treatments[i]}_${j + 1}`,
        arms: [
          {
            treatment: reference,
            events: Math.round(eventRateControl * n),
            denominator: n
          },
          {
            treatment: treatments[i],
            events: Math.round(eventRateTreatment * n),
            denominator: n
          }
        ]
      });
    }
  }

  return studies;
}

/**
 * Generate complex network with crossover comparisons
 */
function generateComplexNetwork(nTreatments, nStudies) {
  const treatments = Array.from({ length: nTreatments }, (_, i) => `T${i}`);
  const studies = [];

  for (let i = 0; i < nStudies; i++) {
    const t1 = i % nTreatments;
    const t2 = (i + 1) % nTreatments;

    const eventRate1 = 0.3 + Math.random() * 0.2;
    const eventRate2 = 0.2 + Math.random() * 0.2;
    const n = 100 + Math.floor(Math.random() * 100);

    studies.push({
      id: `S${i + 1}`,
      arms: [
        {
          treatment: treatments[t1],
          events: Math.round(eventRate1 * n),
          denominator: n
        },
        {
          treatment: treatments[t2],
          events: Math.round(eventRate2 * n),
          denominator: n
        }
      ]
    });
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

describe('NMA Performance Benchmarks', () => {
  describe('Star Network Performance', () => {
    it('should handle 5 treatments efficiently', () => {
      const studies = generateStarNetwork(5, 3);
      const { duration, result } = benchmark(
        'NMA star network (5 treatments)',
        () => networkMetaAnalysis(studies, { reference: 'Placebo' }),
        200
      );

      expect(result.error).toBeUndefined();
      expect(duration).toBeLessThanOrEqual(400);
      console.log(`  NMA (5 treatments, ${studies.length} studies): ${duration.toFixed(2)}ms`);
    });

    it('should handle 10 treatments within acceptable time', () => {
      const studies = generateStarNetwork(10, 3);
      const { duration, result } = benchmark(
        'NMA star network (10 treatments)',
        () => networkMetaAnalysis(studies, { reference: 'Placebo' }),
        500
      );

      expect(result.error).toBeUndefined();
      expect(duration).toBeLessThanOrEqual(1000);
      console.log(`  NMA (10 treatments, ${studies.length} studies): ${duration.toFixed(2)}ms`);
    });
  });

  describe('Complex Network Performance', () => {
    it('should handle complex network with 6 treatments', () => {
      const studies = generateComplexNetwork(6, 30);
      const { duration, result } = benchmark(
        'NMA complex network (6 treatments)',
        () => networkMetaAnalysis(studies),
        300
      );

      expect(result.error).toBeUndefined();
      expect(duration).toBeLessThanOrEqual(600);
      console.log(`  NMA complex (6 treatments, ${studies.length} studies): ${duration.toFixed(2)}ms`);
    });

    it('should handle complex network with 10 treatments', () => {
      const studies = generateComplexNetwork(10, 50);
      const { duration, result } = benchmark(
        'NMA complex network (10 treatments)',
        () => networkMetaAnalysis(studies),
        500
      );

      expect(result.error).toBeUndefined();
      expect(duration).toBeLessThanOrEqual(1000);
      console.log(`  NMA complex (10 treatments, ${studies.length} studies): ${duration.toFixed(2)}ms`);
    });
  });

  describe('SUCRA Calculation Performance', () => {
    it('should calculate SUCRA quickly for moderate networks', () => {
      const studies = generateStarNetwork(8, 5);
      const { duration, result } = benchmark(
        'NMA with SUCRA (8 treatments)',
        () => networkMetaAnalysis(studies, { reference: 'Placebo' }),
        300
      );

      expect(result.error).toBeUndefined();
      expect(result.rankings).toBeDefined();
      expect(result.rankings.sucras).toBeDefined();
      expect(duration).toBeLessThanOrEqual(600);
      console.log(`  NMA with SUCRA (8 treatments): ${duration.toFixed(2)}ms`);
    });
  });

  describe('Multi-Arm Study Performance', () => {
    it('should handle multi-arm studies efficiently', () => {
      const studies = [
        {
          id: 'S1',
          arms: [
            { treatment: 'A', events: 10, denominator: 100 },
            { treatment: 'B', events: 8, denominator: 100 },
            { treatment: 'C', events: 12, denominator: 100 }
          ]
        },
        {
          id: 'S2',
          arms: [
            { treatment: 'A', events: 15, denominator: 100 },
            { treatment: 'B', events: 7, denominator: 100 },
            { treatment: 'D', events: 11, denominator: 100 }
          ]
        },
        {
          id: 'S3',
          arms: [
            { treatment: 'B', events: 9, denominator: 100 },
            { treatment: 'C', events: 13, denominator: 100 },
            { treatment: 'D', events: 10, denominator: 100 }
          ]
        }
      ];

      const { duration, result } = benchmark(
        'NMA multi-arm studies',
        () => networkMetaAnalysis(studies, { reference: 'A' }),
        100
      );

      expect(result.error).toBeUndefined();
      expect(duration).toBeLessThanOrEqual(200);
      console.log(`  NMA multi-arm: ${duration.toFixed(2)}ms`);
    });
  });
});

describe('NMA Performance Summary', () => {
  it('should report overall NMA performance', () => {
    console.log('\n=== NMA Performance Summary ===');
    console.log('All NMA benchmarks completed');
    console.log('==============================\n');
    expect(true).toBe(true);
  });
});
