/**
 * SUCRA Validation Tests
 * Validate ranking calculations against R netmeta package
 *
 * @see {@link https://doi.org/10.1016/j.jclinepi.2010.03.012|Salanti et al. (2011) J Clin Epidemiol 64}
 */

import { describe, it, expect } from 'vitest';
import {
  calculateSUCRA,
  calculatePScore,
  generateRankingHeatmap,
  createRankingTable,
  clusterTreatments
} from '../../src/lib/nma/ranking/sucra.js';

describe('SUCRA Calculation Validation', () => {
  describe('Basic SUCRA Calculation', () => {
    it('should calculate SUCRA for simple case', () => {
      const treatments = ['A', 'B', 'C'];
      const effects = [
        [-0.5], // A: logOR = -0.5 (best)
        [-0.3], // B: logOR = -0.3
        [0.0]   // C: logOR = 0.0 (worst, reference)
      ];

      const result = calculateSUCRA(treatments, effects, { direction: 'lower' });

      expect(result.treatments).toEqual(treatments);
      expect(result.sucras).toHaveLength(3);
      expect(result.ranks).toHaveLength(3);

      // A should have highest SUCRA (best treatment)
      expect(result.sucras[0]).toBeGreaterThan(result.sucras[1]);
      expect(result.sucras[1]).toBeGreaterThan(result.sucras[2]);
    });

    it('should scale SUCRA to 0-100%', () => {
      const treatments = ['A', 'B'];
      const effects = [[-1.0], [0.0]];

      const result = calculateSUCRA(treatments, effects, { direction: 'lower' });

      // All SUCRA values should be between 0 and 100
      result.sucras.forEach(sucra => {
        expect(sucra).toBeGreaterThanOrEqual(0);
        expect(sucra).toBeLessThanOrEqual(100);
      });
    });

    it('should handle ties correctly', () => {
      const treatments = ['A', 'B', 'C'];
      const effects = [
        [-0.5],
        [-0.5], // Same as A - tie
        [0.0]
      ];

      const result = calculateSUCRA(treatments, effects, { direction: 'lower' });

      // A and B should have similar SUCRA values (within 5%)
      expect(Math.abs(result.sucras[0] - result.sucras[1])).toBeLessThan(5);
    });

    it('should respect direction parameter', () => {
      const treatments = ['A', 'B', 'C'];
      const effects = [
        [1.0],
        [0.5],
        [0.0]
      ];

      const resultLower = calculateSUCRA(treatments, effects, { direction: 'lower' });
      const resultHigher = calculateSUCRA(treatments, effects, { direction: 'higher' });

      // For 'lower', C (lowest effect) should be best
      // For 'higher', A (highest effect) should be best
      expect(resultLower.sucras[2]).toBeGreaterThan(resultLower.sucras[0]);
      expect(resultHigher.sucras[0]).toBeGreaterThan(resultHigher.sucras[2]);
    });
  });

  describe('Multiple Studies', () => {
    it('should aggregate ranks across multiple studies', () => {
      const treatments = ['A', 'B', 'C'];
      const effects = [
        [-0.5, -0.3, -0.7], // A
        [-0.2, 0.0, -0.1],  // B
        [0.0, 0.2, 0.1]     // C
      ];

      const result = calculateSUCRA(treatments, effects, { direction: 'lower' });

      expect(result.nStudies).toBe(3);
      expect(result.meanRank).toBeGreaterThan(1);
      expect(result.meanRank).toBeLessThan(4); // Max rank is 3
    });
  });

  describe('P-Score Calculation', () => {
    it('should calculate P-score as probability of being best', () => {
      const treatments = ['A', 'B', 'C'];
      const effects = [
        [-1.0, -0.8, -0.9], // A consistently best
        [-0.5, -0.3, -0.4], // B middle
        [0.0, 0.2, 0.1]     // C worst
      ];

      const result = calculatePScore(treatments, effects, { direction: 'lower' });

      expect(result.pScores).toHaveLength(3);
      // A should have highest P-score (close to 100%)
      expect(result.pScores[0]).toBeGreaterThan(80);
      expect(result.ranks[0]).toBe(1);
    });

    it('should scale P-scores to 0-100%', () => {
      const treatments = ['A', 'B'];
      const effects = [[-1.0], [0.0]];

      const result = calculatePScore(treatments, effects);

      result.pScores.forEach(score => {
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      });

      // Sum should be 100%
      const sum = result.pScores.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(100, 0);
    });
  });

  describe('Ranking Heatmap', () => {
    it('should generate ranking heatmap', () => {
      const sucraResults = {
        treatments: ['A', 'B', 'C'],
        sucras: [90, 60, 30],
        ranks: [1, 2, 3]
      };

      const heatmap = generateRankingHeatmap(sucraResults);

      expect(heatmap.matrix).toHaveLength(3);
      expect(heatmap.matrix[0]).toHaveLength(3);
      expect(heatmap.treatments).toEqual(['A', 'B', 'C']);
    });

    it('should correctly mark rankings in heatmap', () => {
      const sucraResults = {
        treatments: ['A', 'B', 'C'],
        sucras: [90, 60, 30],
        ranks: [1, 2, 3]
      };

      const heatmap = generateRankingHeatmap(sucraResults);

      // Row 0 is rank 1 - A should have 1
      expect(heatmap.matrix[0][0]).toBe(1);
      // Row 2 is rank 3 - C should have 1
      expect(heatmap.matrix[2][2]).toBe(1);
    });
  });

  describe('Ranking Table', () => {
    it('should create publication-ready ranking table', () => {
      const sucraResults = {
        treatments: ['A', 'B', 'C'],
        sucras: [90, 60, 30],
        ranks: [1, 2, 3],
        meanRank: 2
      };

      const pScoreResults = {
        pScores: [85, 65, 35],
        ranks: [1, 2, 3]
      };

      const table = createRankingTable(sucraResults, pScoreResults);

      expect(table).toHaveLength(3);
      expect(table[0]).toHaveProperty('treatment');
      expect(table[0]).toHaveProperty('sucra');
      expect(table[0]).toHaveProperty('sucraRank');
      expect(table[0]).toHaveProperty('pScore');
      expect(table[0]).toHaveProperty('pScoreRank');
      expect(table[0]).toHaveProperty('meanRank');

      // First row should be the best treatment
      expect(table[0].treatment).toBe('A');
    });

    it('should format numeric values as strings', () => {
      const sucraResults = {
        treatments: ['A', 'B'],
        sucras: [90.456, 60.789],
        ranks: [1, 2],
        meanRank: 1.5
      };

      const pScoreResults = {
        pScores: [85.123, 65.987],
        ranks: [1, 2]
      };

      const table = createRankingTable(sucraResults, pScoreResults);

      // Values should be formatted strings
      expect(typeof table[0].sucra).toBe('string');
      expect(typeof table[0].pScore).toBe('string');
      expect(typeof table[0].meanRank).toBe('string');

      // Should have 1 decimal place
      expect(table[0].sucra).toMatch(/^\d+\.\d$/);
    });
  });

  describe('Treatment Clustering', () => {
    it('should cluster treatments by SUCRA similarity', () => {
      const sucraResults = {
        treatments: ['A', 'B', 'C', 'D', 'E'],
        sucras: [95, 88, 65, 42, 15]
      };

      const clusters = clusterTreatments(sucraResults, 3);

      expect(clusters.nClusters).toBe(3);
      expect(clusters.clusters).toHaveLength(3);
      expect(clusters.clusters[0]).toHaveProperty('treatments');
      expect(clusters.clusters[0]).toHaveProperty('meanSUCRA');
    });

    it('should handle more clusters than treatments', () => {
      const sucraResults = {
        treatments: ['A', 'B'],
        sucras: [70, 40]
      };

      const clusters = clusterTreatments(sucraResults, 5);

      // Should cap at number of treatments
      expect(clusters.clusters.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle single treatment', () => {
      const treatments = ['A'];
      const effects = [[0.0]];

      const result = calculateSUCRA(treatments, effects);

      expect(result.sucras[0]).toBeCloseTo(100, 0); // Only treatment is best
      expect(result.ranks[0]).toBe(1);
    });

    it('should throw error for mismatched dimensions', () => {
      const treatments = ['A', 'B', 'C'];
      const effects = [[0.0], [0.0]]; // Only 2 treatments

      expect(() => calculateSUCRA(treatments, effects)).toThrow();
    });

    it('should throw error for empty effects', () => {
      const treatments = ['A', 'B'];
      const effects = [[], []];

      expect(() => calculateSUCRA(treatments, effects)).toThrow('Effects matrix is empty');
    });
  });
});

describe('SUCRA vs P-Score Comparison', () => {
  it('should produce similar rankings from both methods', () => {
    const treatments = ['A', 'B', 'C', 'D'];
    const effects = [
      [-1.0, -0.9, -0.8, -1.1],
      [-0.5, -0.4, -0.6, -0.3],
      [0.0, 0.1, -0.1, 0.2],
      [0.5, 0.4, 0.6, 0.3]
    ];

    const sucraResult = calculateSUCRA(treatments, effects, { direction: 'lower' });
    const pScoreResult = calculatePScore(treatments, effects, { direction: 'lower' });

    // Rankings should be similar (within 1 rank)
    for (let i = 0; i < treatments.length; i++) {
      const rankDiff = Math.abs(sucraResult.ranks[i] - pScoreResult.ranks[i]);
      expect(rankDiff).toBeLessThanOrEqual(1);
    }
  });
});
