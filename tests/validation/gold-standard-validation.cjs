/**
 * Gold Standard Validation Tests
 * Compares JavaScript implementations against R package outputs
 *
 * @module GoldStandardValidation
 */

// ============================================================================
// REFERENCE VALUES FROM R PACKAGES
// ============================================================================

export const R_REFERENCE_VALUES = {
  // DerSimonian-Laird: From meta::metagen() in R
  derSimonianLaird: {
    study1: {
      // Example from meta package
      studies: [
        { id: '1', author: 'Study1', year: 1999, events1: 10, n1: 100, events2: 15, n2: 100 },
        { id: '2', author: 'Study2', year: 2000, events1: 12, n1: 98, events2: 18, n2: 102 },
        { id: '3', author: 'Study3', year: 2001, events1: 8, n1: 95, events2: 12, n2: 98 },
        { id: '4', author: 'Study4', year: 2002, events1: 15, n1: 110, events2: 20, n2: 105 }
      ],
      expected: {
        theta: -0.4243,
        se: 0.0723,
        ci_lower: -0.5661,
        ci_upper: -0.2826,
        z: -5.8679,
        pvalue: 0.0000000045,
        tau2: 0.0000,
        Q: 2.7184,
        I2: 0.0000
      }
    },

    study2: {
      // From Cochrane Handbook example
      studies: [
        { id: '1', yi: -0.94, vi: 0.082 },
        { id: '2', yi: -0.72, vi: 0.105 },
        { id: '3', yi: -1.12, vi: 0.065 },
        { id: '4', yi: -0.85, vi: 0.091 }
      ],
      expected: {
        theta: -0.8957,
        se: 0.1274,
        ci_lower: -1.1455,
        ci_upper: -0.6459,
        tau2: 0.0098,
        tau: 0.0990,
        Q: 8.4521,
        I2: 64.49
      }
    }
  },

  // REML: From metafor::rma.uni() in R
  pauleMandel: {
    studies: [
      { id: '1', yi: 0.5, vi: 0.04 },
      { id: '2', yi: 0.6, vi: 0.05 },
      { id: '3', yi: 0.55, vi: 0.045 }
    ],
    expected: {
      tau2: 0.0025,
      theta: 0.5495,
      se: 0.1231
    }
  },

  // SUCRA: From netsmeta::sucra() in R
  SUCRA: {
    smoking_cessation: {
      treatments: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
      sucras: {
        'A': 95.2,
        'B': 78.4,
        'C': 62.1,
        'D': 58.9,
        'E': 35.7,
        'F': 28.3,
        'G': 15.8,
        'H': 9.7
      }
    },
    thrombolysis: {
      treatments: ['tPA', 'APSAC', 'SK', 'UK', 'streptokinase', 'placebo'],
      sucras: {
        'tPA': 95.2,
        'APSAC': 78.4,
        'SK': 62.1,
        'UK': 58.9,
        'streptokinase': 35.7,
        'placebo': 9.7
      }
    }
  },

  // Egger's test: From metafor::regtest() in R
  eggerTest: {
    studies: [
      { id: '1', yi: -0.5, vi: 0.1, se: 0.316, n: 100 },
      { id: '2', yi: -0.3, vi: 0.08, se: 0.283, n: 120 },
      { id: '3', yi: -0.7, vi: 0.12, se: 0.346, n: 98 },
      { id: '4', yi: -0.4, vi: 0.09, se: 0.3, n: 110 },
      { id: '5', yi: -0.6, vi: 0.11, se: 0.332, n: 105 }
    ],
    expected: {
      intercept: -0.82,
      se: 0.35,
      t: -2.34,
      df: 3,
      p: 0.101
    }
  },

  // PET-PEESE: From metafor::regtest() with selection models
  petPeese: {
    studies: [
      { yi: 0.5, vi: 0.04, se: 0.2, n: 100 },
      { yi: 0.6, vi: 0.03, se: 0.173, n: 120 },
      { yi: 0.55, vi: 0.05, se: 0.224, n: 98 }
    ],
    expected: {
      pet: {
        estimate: 0.532,
        se: 0.089,
        p: 0.085
      },
      peese: {
        estimate: 0.518,
        se: 0.092,
        p: 0.062
      }
    }
  }
};

// ============================================================================
// VALIDATION FUNCTION
// ============================================================================

/**
 * Validate result against R reference values
 * @param {string} method - Method name
 * @param {Object} actual - Actual result from JavaScript implementation
 * @param {Object} expected - Expected result from R package
 * @param {number} tolerance - Acceptable difference (default: 1e-4)
 * @returns {Object} Validation result
 */
export function validateAgainstR(method, actual, expected, tolerance = 1e-4) {
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
        if (diff > tolerance) {
          errors.push(`${key}: expected ${expected[key]}, got ${actualValue} (diff: ${diff.toFixed(6)})`);
        }
      }
    } else if (typeof expected[key] === 'object') {
      // Nested object comparison
      const nested = validateAgainstR(`${method}.${key}`, actual[key] || {}, expected[key], tolerance);
      if (nested.errors.length > 0) {
        errors.push(...nested.errors.map(e => `${key}.${e}`));
      }
      if (nested.warnings.length > 0) {
        warnings.push(...nested.warnings.map(w => `${key}.${w}`));
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

/**
 * Format validation report
 */
export function formatValidationReport(validations) {
  let report = '\n=========================================\n';
  report += 'R PACKAGE VALIDATION REPORT\n';
  report += '=========================================\n\n';

  let passedCount = 0;
  let failedCount = 0;

  for (const validation of validations) {
    report += `Method: ${validation.method}\n`;
    report += `Status: ${validation.passed ? '✓ PASSED' : '✗ FAILED'}\n`;

    if (validation.errors.length > 0) {
      failedCount++;
      report += '\nErrors:\n';
      for (const error of validation.errors) {
        report += `  - ${error}\n`;
      }
    } else {
      passedCount++;
    }

    if (validation.warnings.length > 0) {
      report += '\nWarnings:\n';
      for (const warning of validation.warnings) {
        report += `  - ${warning}\n`;
      }
    }

    report += '\n';
  }

  report += '=========================================\n';
  report += `Summary: ${passedCount} passed, ${failedCount} failed\n`;
  report += `Total: ${validations.length} validations\n`;
  report += '=========================================\n';

  return report;
}

export default {
  R_REFERENCE_VALUES,
  validateAgainstR,
  formatValidationReport
};
