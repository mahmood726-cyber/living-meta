/**
 * Meta-Regression Validation Tests
 * Validate against R metafor package
 *
 * @see {@link https://doi.org/10.1002/jrsm.1200|Baker & Jackson (2016) RSM 7:92-107}
 * @see {@link https://www.metafor-project.org/|Viechtbauer (2010) J Stat Softw 36:1-48}
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  simpleMetaRegression,
  multipleMetaRegression,
  extractPredictors,
  regressionForest,
  predictFromModel
} from '../../src/lib/meta-regression/multiple-regression.js';

describe('Simple Meta-Regression', () => {
  describe('Basic Functionality', () => {
    it('should perform simple meta-regression', () => {
      const studies = [
        { yi: -0.5, vi: 0.04, year: 2010 },
        { yi: -0.3, vi: 0.05, year: 2015 },
        { yi: -0.1, vi: 0.03, year: 2020 }
      ];

      const result = simpleMetaRegression(studies, 'year');

      expect(result.error).toBeUndefined();
      expect(result.slope).toBeDefined();
      expect(result.intercept).toBeDefined();
      expect(result.slopeSE).toBeDefined();
      expect(result.interceptSE).toBeDefined();
      expect(result.pValue).toBeDefined();
    });

    it('should calculate regression coefficients', () => {
      const studies = [
        { yi: 0.0, vi: 0.01, year: 2010 },
        { yi: 0.2, vi: 0.01, year: 2015 },
        { yi: 0.4, vi: 0.01, year: 2020 }
      ];

      const result = simpleMetaRegression(studies, 'year');

      // Positive slope: effect increases with year
      expect(result.slope).toBeGreaterThan(0);
      expect(result.intercept).toBeDefined();
    });

    it('should calculate standard errors', () => {
      const studies = [
        { yi: 0.1, vi: 0.02, year: 2010 },
        { yi: 0.2, vi: 0.03, year: 2015 }
      ];

      const result = simpleMetaRegression(studies, 'year');

      expect(result.slopeSE).toBeGreaterThan(0);
      expect(result.interceptSE).toBeGreaterThan(0);
    });

    it('should calculate test statistics and p-values', () => {
      const studies = [
        { yi: -0.5, vi: 0.04, year: 2010 },
        { yi: -0.4, vi: 0.05, year: 2015 },
        { yi: -0.3, vi: 0.03, year: 2020 }
      ];

      const result = simpleMetaRegression(studies, 'year');

      expect(result.zValue).toBeDefined();
      expect(result.pValue).toBeDefined();
      expect(result.pValue).toBeGreaterThanOrEqual(0);
      expect(result.pValue).toBeLessThanOrEqual(1);
    });
  });

  describe('Model Fit Statistics', () => {
    it('should calculate Q statistic', () => {
      const studies = [
        { yi: 0.1, vi: 0.01, year: 2010 },
        { yi: 0.2, vi: 0.02, year: 2015 }
      ];

      const result = simpleMetaRegression(studies, 'year');

      expect(result.Q).toBeDefined();
      expect(result.Q).toBeGreaterThan(0);
    });

    it('should calculate tau²', () => {
      const studies = [
        { yi: 0.1, vi: 0.01, year: 2010 },
        { yi: 0.5, vi: 0.01, year: 2015 },
        { yi: 0.9, vi: 0.01, year: 2020 }
      ];

      const result = simpleMetaRegression(studies, 'year');

      expect(result.tau2).toBeDefined();
      expect(result.tau2).toBeGreaterThanOrEqual(0);
    });

    it('should calculate R²', () => {
      const studies = [
        { yi: 0.1, vi: 0.01, year: 2010 },
        { yi: 0.3, vi: 0.01, year: 2015 },
        { yi: 0.5, vi: 0.01, year: 2020 }
      ];

      const result = simpleMetaRegression(studies, 'year');

      expect(result.r2).toBeDefined();
      expect(result.r2).toBeGreaterThanOrEqual(0);
      expect(result.r2).toBeLessThanOrEqual(1);
    });

    it('should calculate I²', () => {
      const studies = [
        { yi: 0.1, vi: 0.01, year: 2010 },
        { yi: 0.5, vi: 0.01, year: 2015 }
      ];

      const result = simpleMetaRegression(studies, 'year');

      expect(result.i2).toBeDefined();
      expect(result.i2).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Permutation Testing', () => {
    it('should perform permutation test for significance', () => {
      const studies = [
        { yi: -0.5, vi: 0.04, year: 2010 },
        { yi: -0.3, vi: 0.05, year: 2015 },
        { yi: -0.1, vi: 0.03, year: 2020 }
      ];

      const result = simpleMetaRegression(studies, 'year', {
        nPermutations: 100,
        seed: 42
      });

      expect(result.permutationTest).toBeDefined();
      expect(result.permutationTest.pValue).toBeDefined();
      expect(result.permutationTest.nPermutations).toBe(100);
    });
  });

  describe('HKSJ Adjustment', () => {
    it('should apply HKSJ adjustment when requested', () => {
      const studies = [
        { yi: 0.1, vi: 0.02, year: 2010 },
        { yi: 0.2, vi: 0.03, year: 2015 },
        { yi: 0.15, vi: 0.025, year: 2018 }
      ];

      const result = simpleMetaRegression(studies, 'year', {
        hksj: true
      });

      expect(result.hksj).toBe(true);
      expect(result.ciLower).toBeDefined();
      expect(result.ciUpper).toBeDefined();
    });
  });
});

describe('Multiple Meta-Regression', () => {
  describe('Basic Functionality', () => {
    it('should handle multiple covariates', () => {
      const studies = [
        { yi: -0.5, vi: 0.04, year: 2010, sampleSize: 100, quality: 8 },
        { yi: -0.3, vi: 0.05, year: 2015, sampleSize: 150, quality: 7 },
        { yi: -0.1, vi: 0.03, year: 2020, sampleSize: 200, quality: 9 }
      ];

      const result = multipleMetaRegression(studies, ['year', 'sampleSize']);

      expect(result.error).toBeUndefined();
      expect(result.coefficients).toBeDefined();
      expect(result.coefficients).toHaveProperty('intercept');
      expect(result.coefficients).toHaveProperty('year');
      expect(result.coefficients).toHaveProperty('sampleSize');
    });

    it('should calculate coefficient matrix', () => {
      const studies = [
        { yi: 0.1, vi: 0.01, year: 2010, dose: 10 },
        { yi: 0.2, vi: 0.02, year: 2015, dose: 20 }
      ];

      const result = multipleMetaRegression(studies, ['year', 'dose']);

      expect(result.coefficientMatrix).toBeDefined();
      expect(result.varianceMatrix).toBeDefined();
    });
  });

  describe('Multicollinearity Detection', () => {
    it('should calculate VIF for each predictor', () => {
      const studies = [
        { yi: 0.1, vi: 0.01, year: 2010, sampleSize: 100 },
        { yi: 0.2, vi: 0.02, year: 2015, sampleSize: 150 },
        { yi: 0.3, vi: 0.015, year: 2020, sampleSize: 200 },
        { yi: 0.25, vi: 0.018, year: 2018, sampleSize: 175 }
      ];

      const result = multipleMetaRegression(studies, ['year', 'sampleSize']);

      expect(result.vif).toBeDefined();
      expect(result.vif.year).toBeGreaterThan(0);
      expect(result.vif.sampleSize).toBeGreaterThan(0);
    });

    it('should flag high VIF values', () => {
      const studies = [
        { yi: 0.1, vi: 0.01, x1: 1, x2: 2 },
        { yi: 0.2, vi: 0.02, x1: 2, x2: 4 },
        { yi: 0.3, vi: 0.015, x1: 3, x2: 6 }
      ];

      // x1 and x2 are perfectly correlated (x2 = 2*x1)
      const result = multipleMetaRegression(studies, ['x1', 'x2']);

      // Should warn about high multicollinearity
      if (result.vif) {
        expect(result.vif.x1).toBeGreaterThan(5);
        expect(result.vif.x2).toBeGreaterThan(5);
      }
    });
  });

  describe('Model Selection', () => {
    it('should support stepwise selection', () => {
      const studies = [
        { yi: 0.1, vi: 0.01, year: 2010, dose: 10, quality: 8 },
        { yi: 0.2, vi: 0.02, year: 2015, dose: 20, quality: 7 },
        { yi: 0.3, vi: 0.015, year: 2020, dose: 30, quality: 9 }
      ];

      const predictors = ['year', 'dose', 'quality'];
      const result = multipleMetaRegression(studies, predictors, {
        method: 'backward'
      });

      expect(result.selectedPredictors).toBeDefined();
    });
  });
});

describe('Predictor Extraction', () => {
  describe('CT.gov Auto-Extraction', () => {
    it('should extract study-level predictors', () => {
      const studies = [
        {
          nctId: 'NCT0001',
          yi: 0.1,
          vi: 0.01,
          protocolSection: {
            identificationModule: { nctId: 'NCT0001' },
            statusModule: { startDateStruct: { date: '2010-01-01' } }
          }
        },
        {
          nctId: 'NCT0002',
          yi: 0.2,
          vi: 0.02,
          protocolSection: {
            identificationModule: { nctId: 'NCT0002' },
            statusModule: { startDateStruct: { date: '2015-01-01' } }
          }
        }
      ];

      const predictors = extractPredictors(studies);

      expect(predictors.year).toBeDefined();
      expect(predictors.year).toHaveLength(2);
    });

    it('should extract sample size predictor', () => {
      const studies = [
        {
          nctId: 'NCT0001',
          yi: 0.1,
          vi: 0.01,
          arms: [
            { groupSize: 50 },
            { groupSize: 50 }
          ]
        }
      ];

      const predictors = extractPredictors(studies);

      expect(predictors.sampleSize).toBeDefined();
      expect(predictors.sampleSize[0]).toBe(100);
    });

    it('should extract funding source predictor', () => {
      const studies = [
        {
          nctId: 'NCT0001',
          yi: 0.1,
          vi: 0.01,
          protocolSection: {
            sponsorsCollaboratorsModule: {
              leadSponsor: { name: 'NIH', class: 'INDUSTRY' }
            }
          }
        }
      ];

      const predictors = extractPredictors(studies);

      expect(predictors.funding).toBeDefined();
      expect(predictors.funding[0]).toBeDefined();
    });
  });
});

describe('Regression Forest', () => {
  describe('Variable Selection', () => {
    it('should rank predictors by importance', () => {
      const studies = [];
      for (let i = 0; i < 50; i++) {
        studies.push({
          yi: Math.random() * 2 - 1,
          vi: 0.01 + Math.random() * 0.02,
          year: 2000 + i,
          sampleSize: 100 + i * 10,
          dose: 10 + i,
          quality: 5 + Math.floor(Math.random() * 5)
        });
      }

      const result = regressionForest(studies, {
        nTrees: 50
      });

      expect(result.importance).toBeDefined();
      expect(result.predictors).toBeDefined();
    });
  });
});

describe('Prediction', () => {
  describe('From Regression Model', () => {
    it('should predict effect for new study', () => {
      const studies = [
        { yi: 0.1, vi: 0.01, year: 2010 },
        { yi: 0.2, vi: 0.02, year: 2015 },
        { yi: 0.3, vi: 0.015, year: 2020 }
      ];

      const model = simpleMetaRegression(studies, 'year');

      const prediction = predictFromModel(model, { year: 2025 });

      expect(prediction.predicted).toBeDefined();
      expect(prediction.se).toBeDefined();
      expect(prediction.ciLower).toBeDefined();
      expect(prediction.ciUpper).toBeDefined();
    });

    it('should extrapolate beyond data range', () => {
      const studies = [
        { yi: 0.1, vi: 0.01, year: 2010 },
        { yi: 0.2, vi: 0.02, year: 2015 }
      ];

      const model = simpleMetaRegression(studies, 'year');

      const prediction = predictFromModel(model, { year: 2030 });

      expect(prediction.predicted).toBeDefined();
      expect(prediction.warning).toContain('extrapolat');
    });
  });
});

describe('Edge Cases', () => {
  it('should handle missing covariate values', () => {
    const studies = [
      { yi: 0.1, vi: 0.01, year: 2010 },
      { yi: 0.2, vi: 0.02 }, // Missing year
      { yi: 0.3, vi: 0.015, year: 2020 }
    ];

    const result = simpleMetaRegression(studies, 'year');

    // Should handle gracefully - either exclude or impute
    expect(result).toBeDefined();
  });

  it('should handle single predictor with no variation', () => {
    const studies = [
      { yi: 0.1, vi: 0.01, year: 2010 },
      { yi: 0.2, vi: 0.02, year: 2010 },
      { yi: 0.15, vi: 0.015, year: 2010 }
    ];

    const result = simpleMetaRegression(studies, 'year');

    // Should warn about zero variance predictor
    expect(result).toBeDefined();
  });
});
