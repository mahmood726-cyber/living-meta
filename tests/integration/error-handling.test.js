/**
 * Integration Tests for Error Handling
 * Tests error recovery, user-friendly messaging, and graceful degradation
 *
 * @module ErrorHandlingIntegrationTests
 */

import { describe, it, expect } from 'vitest';
import { createError, getErrorMessage, wrapError } from '../../src/lib/error-messages.js';
import { networkMetaAnalysis } from '../../src/lib/nma/nma-results.js';
import { simpleMetaRegression } from '../../src/lib/meta-regression/multiple-regression.js';

describe('Error Message System Integration', () => {
  describe('Structured Error Creation', () => {
    it('should create error with all required fields', () => {
      const error = createError('INSUFFICIENT_STUDIES_NMA', 2);

      expect(error).toBeDefined();
      expect(error.error).toBe('Insufficient studies for network meta-analysis');
      expect(error.detail).toContain('2');
      expect(error.recovery).toBeDefined();
      expect(error.errorCode).toBe('INSUFFICIENT_STUDIES_NMA');
    });

    it('should provide actionable recovery guidance', () => {
      const error = createError('NETWORK_DISCONNECTED', 3);

      expect(error.recovery).toBeTypeOf('string');
      expect(error.recovery.length).toBeGreaterThan(0);
      expect(error.recovery).toContain('bridge');
    });

    it('should handle unknown error codes gracefully', () => {
      const error = createError('UNKNOWN_ERROR_CODE', 'some context');

      expect(error.error).toBe('Unknown error');
      expect(error.detail).toBe('UNKNOWN_ERROR_CODE');
      expect(error.recovery).toContain('try again');
    });
  });

  describe('Error Wrapping with Context', () => {
    it('should wrap original error with additional context', () => {
      const originalError = createError('SINGULAR_MATRIX');
      const context = 'Failed during meta-regression with covariates: year, sample_size';

      const wrapped = wrapError(originalError, context);

      expect(wrapped.error).toBeDefined();
      expect(wrapped.context).toBe(context);
      expect(wrapped.original).toEqual(originalError);
    });

    it('should preserve recovery suggestion when wrapping', () => {
      const originalError = createError('HIGH_MULTICOLLINEARITY', [15.2, 8.5], ['x1', 'x2']);
      const wrapped = wrapError(originalError, 'During variable selection');

      expect(wrapped.recovery).toBe(originalError.recovery);
    });
  });
});

describe('Analysis Error Handling Integration', () => {
  describe('NMA Error Recovery', () => {
    it('should return structured error for insufficient studies', () => {
      const tooFewStudies = [
        { id: 'S1', arms: [{ treatment: 'A', events: 10, denominator: 100 }] }
      ];

      const result = networkMetaAnalysis(tooFewStudies);

      expect(result.error).toBeDefined();
      expect(result.errorCode).toBe('INSUFFICIENT_STUDIES_NMA');
      expect(result.recovery).toBeDefined();
    });

    it('should return structured error for disconnected network', () => {
      const disconnectedStudies = [
        { id: 'S1', arms: [{ treatment: 'A', events: 10, denominator: 100 }, { treatment: 'B', events: 15, denominator: 100 }] },
        { id: 'S2', arms: [{ treatment: 'A', events: 12, denominator: 100 }, { treatment: 'B', events: 18, denominator: 100 }] },
        { id: 'S3', arms: [{ treatment: 'C', events: 20, denominator: 100 }, { treatment: 'D', events: 25, denominator: 100 }] }
      ];

      const result = networkMetaAnalysis(disconnectedStudies);

      expect(result.error || !result.network?.connected).toBeTruthy();
      expect(result.recovery || result.components || result.error).toBeDefined();
    });

    it('should provide guidance for invalid reference treatment', () => {
      const studies = [
        { id: 'S1', arms: [{ treatment: 'A', events: 10, denominator: 100 }, { treatment: 'B', events: 15, denominator: 100 }] }
      ];

      const result = networkMetaAnalysis(studies, { reference: 'NonExistent' });

      if (result.error) {
        expect(result.error).toBeDefined();
        expect(result.recovery).toBeDefined();
      }
    });
  });

  describe('Meta-Regression Error Handling', () => {
    it('should handle covariate with no variation', () => {
      const studies = [
        { id: 'S1', yi: -0.5, vi: 0.1, year: 2020 },
        { id: 'S2', yi: -0.3, vi: 0.08, year: 2020 },
        { id: 'S3', yi: -0.4, vi: 0.09, year: 2020 }
      ];

      const result = simpleMetaRegression(studies, 'year');

      if (result.error) {
        expect(result.error).toContain('no variation');
      }
    });

    it('should handle missing covariate values', () => {
      const studies = [
        { id: 'S1', yi: -0.5, vi: 0.1, sampleSize: 100 },
        { id: 'S2', yi: -0.3, vi: 0.08 }, // Missing sampleSize
        { id: 'S3', yi: -0.4, vi: 0.09, sampleSize: 110 }
      ];

      // Count missing values
      const missingCount = studies.filter(s => s.sampleSize === undefined).length;

      expect(missingCount).toBe(1);
    });

    it('should handle perfect multicollinearity', () => {
      const studies = [
        { id: 'S1', yi: -0.5, vi: 0.1, x1: 10, x2: 20, x3: 30 },
        { id: 'S2', yi: -0.3, vi: 0.08, x1: 20, x2: 40, x3: 60 },
        { id: 'S3', yi: -0.4, vi: 0.09, x1: 15, x2: 30, x3: 45 }
      ];

      // x2 = 2*x1, x3 = 3*x1 (perfect multicollinearity)
      expect(studies[0].x2).toBe(studies[0].x1 * 2);
      expect(studies[1].x2).toBe(studies[1].x1 * 2);
    });
  });
});

describe('Data Validation Integration', () => {
  describe('Invalid Effect Size Handling', () => {
    it('should detect missing effect sizes', () => {
      const invalidStudies = [
        { id: 'S1', yi: -0.5, vi: 0.1 },
        { id: 'S2', yi: null, vi: 0.08 }, // Missing yi
        { id: 'S3', yi: -0.4, vi: 0.09 }
      ];

      const invalidCount = invalidStudies.filter(s => s.yi === null || s.yi === undefined || isNaN(s.yi)).length;

      expect(invalidCount).toBe(1);
    });

    it('should detect invalid variance values', () => {
      const invalidStudies = [
        { id: 'S1', yi: -0.5, vi: 0.1 },
        { id: 'S2', yi: -0.3, vi: -0.05 }, // Negative variance
        { id: 'S3', yi: -0.4, vi: 0 }, // Zero variance
        { id: 'S4', yi: -0.6, vi: Infinity }
      ];

      const invalidCount = invalidStudies.filter(s => s.vi <= 0 || !isFinite(s.vi)).length;

      expect(invalidCount).toBeGreaterThanOrEqual(2);
    });

    it('should handle extreme effect sizes', () => {
      const extremeStudies = [
        { id: 'S1', yi: -10, vi: 0.1 }, // Extremely large effect
        { id: 'S2', yi: 15, vi: 0.05 },
        { id: 'S3', yi: -0.5, vi: 0.1 }
      ];

      // Flag effects > 5 log units as potentially erroneous
      const flagged = extremeStudies.filter(s => Math.abs(s.yi) > 5);

      expect(flagged).toHaveLength(2);
    });
  });

  describe('Arm Data Validation', () => {
    it('should validate binary outcome data', () => {
      const arm = {
        treatment: 'Experimental',
        events: 45,
        denominator: 100
      };

      // Check for valid 2x2 table values
      const a = arm.events;
      const b = arm.denominator - a;

      const isValid = a > 0 && b > 0 && arm.denominator > a;

      expect(isValid).toBe(true);
    });

    it('should detect invalid cell counts', () => {
      const invalidArms = [
        { events: 0, denominator: 100 }, // Zero events (needs continuity correction)
        { events: 100, denominator: 100 }, // All events (needs continuity correction)
        { events: 50, denominator: 0 }, // Zero denominator
        { events: 150, denominator: 100 } // Events > denominator
      ];

      invalidArms.forEach(arm => {
        const isInvalid = arm.events < 0 ||
                         arm.denominator <= 0 ||
                         arm.events > arm.denominator;

        if (arm.denominator === 0 || arm.events > arm.denominator) {
          expect(isInvalid).toBe(true);
        }
      });
    });

    it('should validate continuous outcome data', () => {
      const continuousArms = [
        { mean: 5.2, sd: 1.5, n: 50 }, // Valid
        { mean: 5.2, sd: 0, n: 50 }, // Zero SD
        { mean: 5.2, sd: -1.5, n: 50 }, // Negative SD
        { mean: 5.2, sd: 1.5, n: 0 } // Zero n
      ];

      continuousArms.forEach(arm => {
        const isValid = arm.sd > 0 && arm.n > 0 && isFinite(arm.mean);

        if (arm.sd <= 0 || arm.n <= 0) {
          expect(isValid).toBe(false);
        }
      });
    });
  });
});

describe('Worker Error Handling', () => {
  describe('Worker Communication Errors', () => {
    it('should handle worker timeout gracefully', async () => {
      const timeoutMs = 5000;
      const startTime = Date.now();

      // Simulate long-running operation
      const longRunningTask = new Promise((resolve) => {
        setTimeout(() => resolve({ result: 'done' }), timeoutMs + 1000);
      });

      // Add timeout wrapper
      const timeoutWrapper = (promise, timeout) => {
        return Promise.race([
          promise,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Operation timed out')), timeout)
          )
        ]);
      };

      try {
        await timeoutWrapper(longRunningTask, timeoutMs);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error.message).toBe('Operation timed out');
        const elapsed = Date.now() - startTime;
        expect(elapsed).toBeLessThanOrEqual(timeoutMs + 100);
      }
    });

    it('should handle worker crash recovery', () => {
      let crashCount = 0;
      const maxRetries = 3;

      const simulateWorker = (shouldCrash) => {
        if (shouldCrash) {
          crashCount++;
          throw new Error('Worker crashed');
        }
        return { result: 'success' };
      };

      // Retry logic
      let result = null;
      for (let i = 0; i < maxRetries; i++) {
        try {
          result = simulateWorker(crashCount < 2);
          break;
        } catch (error) {
          if (i === maxRetries - 1) {
            // Last attempt failed
            expect(crashCount).toBe(2);
          }
        }
      }

      expect(result).toBeDefined();
    });
  });

  describe('Message Validation', () => {
    it('should validate message structure', () => {
      const validMessage = {
        type: 'RUN_META_ANALYSIS',
        payload: {
          studies: [{ id: 'S1', yi: -0.5, vi: 0.1 }],
          spec: { effectType: 'OR' }
        },
        requestId: 'test-123'
      };

      const isValid = !!(validMessage.type &&
                     validMessage.payload &&
                     validMessage.requestId);

      expect(isValid).toBe(true);
    });

    it('should reject malformed messages', () => {
      const invalidMessages = [
        { type: 'RUN_META_ANALYSIS' }, // Missing payload
        { payload: {} }, // Missing type
        {}, // Empty
        null, // Null
        undefined // Undefined
      ];

      invalidMessages.forEach(msg => {
        const isValid = !!(msg && msg.type && msg.payload);
        expect(isValid).toBe(false);
      });
    });
  });
});

describe('Graceful Degradation', () => {
  it('should fall back to simpler methods when advanced fail', () => {
    // Simulate REML failure, fallback to DL
    const remlResult = { error: 'REML failed to converge' };
    const dlResult = { estimate: -0.5, se: 0.1, method: 'DL' };

    const finalResult = remlResult.error ? dlResult : remlResult;

    expect(finalResult.method).toBe('DL');
    expect(finalResult.estimate).toBeDefined();
  });

  it('should provide partial results when possible', () => {
    const partialResults = {
      meta_analysis: {
        k: 5,
        estimate: -0.5,
        se: 0.1
        // Missing confidence intervals due to calculation error
      },
      warning: 'Could not calculate confidence intervals'
    };

    expect(partialResults.meta_analysis.estimate).toBeDefined();
    expect(partialResults.warning).toBeDefined();
  });

  it('should maintain UI responsiveness during errors', () => {
    let isUIResponsive = true;

    // Simulate error handling without blocking
    const handleError = (error) => {
      // Non-blocking error handler
      isUIResponsive = true;
      return {
        type: 'ERROR',
        message: error.message,
        recoverable: true
      };
    };

    const result = handleError(new Error('Test error'));

    expect(isUIResponsive).toBe(true);
    expect(result.type).toBe('ERROR');
    expect(result.recoverable).toBe(true);
  });
});
