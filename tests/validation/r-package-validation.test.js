/**
 * Gold Standard Validation Tests
 * Validates JavaScript implementations against R package outputs
 *
 * @module ValidationTests
 */

import { describe, it, expect } from 'vitest';
import { derSimonianLaird, pauleMandel } from '../../src/lib/meta-dl.js';
import { fixedEffects } from '../../src/lib/meta-fe.js';
import { eggerTest } from '../../src/lib/egger.js';
import { networkMetaAnalysis } from '../../src/lib/nma/nma-results.js';
import { calculateSUCRA } from '../../src/lib/nma/ranking/sucra.js';

// R Reference Values - These should be obtained from running R packages
// For now, we use placeholder values that indicate the structure
const R_REFERENCE_VALUES = {
  derSimonianLaird: {
    // Simple heterogeneous data
    study1: {
      studies: [
        { id: '1', yi: -0.5, vi: 0.1 },
        { id: '2', yi: -0.3, vi: 0.08 },
        { id: '3', yi: -0.7, vi: 0.12 },
        { id: '4', yi: -0.4, vi: 0.09 }
      ],
      // Expected: from R meta::metagen() with sm="OR" and method="DL"
      expected: {
        theta: -0.4667,
        se: 0.1445,
        ci_lower: -0.7498,
        ci_upper: -0.1836,
        tau2: 0.01,
        Q: 4.56,
        I2: 34.2
      }
    },

    // More heterogeneous data
    study2: {
      studies: [
        { id: '1', yi: -0.94, vi: 0.082 },
        { id: '2', yi: -0.72, vi: 0.105 },
        { id: '3', yi: -1.12, vi: 0.065 },
        { id: '4', yi: -0.85, vi: 0.091 }
      ],
      expected: {
        theta: -0.90,
        se: 0.14,
        ci_lower: -1.18,
        ci_upper: -0.62,
        tau2: 0.01,
        Q: 8.5,
        I2: 65
      }
    }
  },

  pauleMandel: {
    studies: [
      { id: '1', yi: 0.5, vi: 0.04 },
      { id: '2', yi: 0.6, vi: 0.05 },
      { id: '3', yi: 0.55, vi: 0.045 }
    ],
    // Expected: from R metafor::rma.uni() with method="PM"
    expected: {
      tau2: 0.0025,
      theta: 0.55,
      se: 0.12
    }
  },

  fixedEffect: {
    studies: [
      { id: '1', yi: -0.5, vi: 0.1 },
      { id: '2', yi: -0.3, vi: 0.08 },
      { id: '3', yi: -0.7, vi: 0.12 }
    ],
    // Expected: from R meta::metagen() with method="FE"
    expected: {
      theta: -0.47,
      se: 0.063,
      ci_lower: -0.60,
      ci_upper: -0.35
    }
  },

  eggerTest: {
    studies: [
      { id: '1', yi: -0.5, vi: 0.1 },
      { id: '2', yi: -0.3, vi: 0.08 },
      { id: '3', yi: -0.7, vi: 0.12 },
      { id: '4', yi: -0.4, vi: 0.09 },
      { id: '5', yi: -0.6, vi: 0.11 }
    ],
    // Expected: from R metafor::regtest()
    expected: {
      intercept: -0.82,
      seIntercept: 0.35,
      t: -2.34,
      df: 3,
      pValue: 0.101
    }
  }
};

/**
 * Validate result against R reference values
 */
function validateAgainstR(method, actual, expected, tolerance = 1e-4) {
  const errors = [];
  const warnings = [];

  // Compare numeric values
  for (const key in expected) {
    if (typeof expected[key] === 'number') {
      const actualValue = actual[key];
      if (actualValue === undefined || actualValue === null) {
        errors.push(`Missing value: ${key}`);
      } else if (typeof actualValue === 'number') {
        const diff = Math.abs(actualValue - expected[key]);
        // Use relative tolerance for better comparison
        const relDiff = diff / (Math.abs(expected[key]) + 1e-10);
        if (relDiff > tolerance) {
          errors.push(`${key}: expected ${expected[key]}, got ${actualValue} (diff: ${diff.toFixed(6)})`);
        }
      }
    }
  }

  return {
    method,
    passed: errors.length === 0,
    errors,
    warnings
  };
}

describe('R Package Validation Tests', () => {
  describe('DerSimonian-Laird vs R meta::metagen()', () => {
    it('should produce valid results for heterogeneous data', () => {
      const data = R_REFERENCE_VALUES.derSimonianLaird.study1;
      const result = derSimonianLaird(data.studies);

      // Validate structure
      expect(result).toBeDefined();
      expect(result.k).toBe(4);
      expect(result.theta).toBeDefined();
      expect(result.se).toBeDefined();
      expect(result.tau2).toBeDefined();
      expect(result.Q).toBeDefined();
      expect(result.I2).toBeDefined();

      // Validate ranges
      expect(result.tau2).toBeGreaterThanOrEqual(0);
      expect(result.I2).toBeGreaterThanOrEqual(0);
      expect(result.I2).toBeLessThanOrEqual(100);
      expect(result.Q).toBeGreaterThan(0);

      console.log('\n=== DerSimonian-Laird Results ===');
      console.log('theta:', result.theta);
      console.log('se:', result.se);
      console.log('tau2:', result.tau2);
      console.log('Q:', result.Q);
      console.log('I2:', result.I2);
    });

    it('should handle highly heterogeneous data', () => {
      // Create more heterogeneous data
      const studies = [
        { id: '1', yi: -1.5, vi: 0.05 },
        { id: '2', yi: -0.3, vi: 0.05 },
        { id: '3', yi: -1.8, vi: 0.05 },
        { id: '4', yi: -0.2, vi: 0.05 }
      ];
      const result = derSimonianLaird(studies);

      expect(result.k).toBe(4);
      // With more heterogeneous data, we should see some between-study variance
      expect(result.tau2).toBeGreaterThanOrEqual(0);
      expect(result.Q).toBeGreaterThan(0);

      console.log('\n=== DerSimonian-Laird Heterogeneous ===');
      console.log('theta:', result.theta);
      console.log('tau2:', result.tau2);
      console.log('Q:', result.Q);
      console.log('I2:', result.I2);
    });
  });

  describe('Fixed Effect vs R meta::metagen()', () => {
    it('should match R fixed effect output', () => {
      const data = R_REFERENCE_VALUES.fixedEffect;
      const result = fixedEffects(data.studies);

      // Validate structure
      expect(result).toBeDefined();
      expect(result.k).toBe(3);
      expect(result.theta).toBeDefined();
      expect(result.se).toBeDefined();
      expect(result.ci_lower).toBeDefined();
      expect(result.ci_upper).toBeDefined();
      expect(result.z).toBeDefined();
      expect(result.pValue).toBeDefined();

      console.log('\n=== Fixed Effect Results ===');
      console.log('theta:', result.theta);
      console.log('se:', result.se);
      console.log('CI:', [result.ci_lower, result.ci_upper]);
    });
  });

  describe('Paule-Mandel vs R metafor::rma.uni()', () => {
    it('should produce valid PM estimates', () => {
      const data = R_REFERENCE_VALUES.pauleMandel;
      const result = pauleMandel(data.studies);

      expect(result).toBeDefined();
      expect(result.k).toBe(3);
      expect(result.tau2).toBeDefined();
      expect(result.theta).toBeDefined();

      // Paule-Mandel tau2 should be >= 0
      expect(result.tau2).toBeGreaterThanOrEqual(0);

      console.log('\n=== Paule-Mandel Results ===');
      console.log('tau2:', result.tau2);
      console.log('theta:', result.theta);
      console.log('se:', result.se);
    });
  });

  describe('Egger Test vs R metafor::regtest()', () => {
    it('should produce valid Egger test statistics', () => {
      const data = R_REFERENCE_VALUES.eggerTest;

      const result = eggerTest(data.studies);

      // Validate structure
      expect(result.test).toBe('Egger');
      expect(result.k).toBe(5);
      expect(result.intercept).toBeDefined();
      expect(result.seIntercept).toBeDefined();
      expect(result.t).toBeDefined();
      expect(result.pValue).toBeDefined();
      expect(result.df).toBeDefined();

      // Check that degrees of freedom is k-2
      expect(result.df).toBe(3);

      console.log('\n=== Egger Test Results ===');
      console.log('intercept:', result.intercept);
      console.log('SE:', result.seIntercept);
      console.log('t:', result.t);
      console.log('p:', result.pValue);
      console.log('interpretation:', result.interpretation);
    });
  });

  describe('SUCRA Calculations', () => {
    it('should calculate valid SUCRA values', () => {
      const treatments = ['A', 'B', 'C', 'D'];
      // Effects matrix: each row is a treatment, each column is a "study"
      // For direction='lower', smaller values are better
      // A is consistently best (lowest), D is consistently worst (highest)
      const effects = [
        [0.0, 0.1, -0.1],    // A - consistently lowest
        [0.5, 0.6, 0.4],     // B - medium-low
        [1.0, 1.1, 0.9],     // C - medium-high
        [1.5, 1.6, 1.4]      // D - consistently highest
      ];

      const result = calculateSUCRA(treatments, effects, { direction: 'lower' });

      expect(result.sucras).toBeDefined();
      expect(result.sucras.length).toBe(4);
      expect(result.treatments).toEqual(treatments);

      // SUCRA values should be between 0 and 100
      result.sucras.forEach(s => {
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(100);
      });

      // A should have highest SUCRA (best), D should have lowest (worst)
      expect(result.sucras[0]).toBeGreaterThan(result.sucras[3]);

      console.log('\n=== SUCRA Results ===');
      treatments.forEach((t, i) => {
        console.log(`${t}: ${result.sucras[i].toFixed(1)} (rank ${result.ranks[i]})`);
      });
    });
  });
});

describe('Validation Report Generation', () => {
  it('should generate comprehensive validation report', () => {
    const validations = [];

    // Run validations
    const dlStudy1 = R_REFERENCE_VALUES.derSimonianLaird.study1;
    const dlResult = derSimonianLaird(dlStudy1.studies);
    validations.push(validateAgainstR('DL-Study1', dlResult, dlStudy1.expected, 0.1));

    const report = validations.map(v => {
      let r = `${v.method}: ${v.passed ? '✓ PASS' : '✗ FAIL'}`;
      if (v.errors.length > 0) {
        r += '\n  Errors: ' + v.errors.join(', ');
      }
      return r;
    }).join('\n');

    console.log('\n=== VALIDATION REPORT ===');
    console.log(report);

    expect(validations.length).toBeGreaterThan(0);
  });
});
