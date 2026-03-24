/**
 * User-Friendly Error Messages
 * Provides actionable guidance for common errors
 *
 * @module ErrorMessages
 */

/**
 * Error categories with recovery suggestions
 */
export const ERROR_MESSAGES = {
  // Insufficient data errors
  INSUFFICIENT_STUDIES_META_ANALYSIS: {
    message: 'Insufficient studies for meta-analysis',
    detail: (n, min) => `Meta-analysis requires at least ${min} studies, but only ${n} were provided.`,
    recovery: 'Add more studies to your analysis or reduce the complexity of your model.'
  },

  INSUFFICIENT_STUDIES_REGRESSION: {
    message: 'Insufficient studies for meta-regression',
    detail: (n, params) => `Meta-regression with ${params} parameters requires at least ${params} studies, but only ${n} were provided.`,
    recovery: 'Reduce the number of covariates or collect more study data.'
  },

  INSUFFICIENT_STUDIES_NMA: {
    message: 'Insufficient studies for network meta-analysis',
    detail: (n) => `Network meta-analysis requires at least 3 studies, but only ${n} were provided.`,
    recovery: 'Add more studies to establish a connected treatment network.'
  },

  INSUFFICIENT_STUDIES_BAYESIAN: {
    message: 'Insufficient studies for Bayesian meta-analysis',
    detail: (n) => `Bayesian meta-analysis requires at least 2 studies, but only ${n} were provided.`,
    recovery: 'Add more studies or use a simpler analysis method.'
  },

  // Network connectivity errors
  NETWORK_DISCONNECTED: {
    message: 'Network is not connected',
    detail: (components) => `The treatment network has ${components} disconnected components. All treatments must be connected through direct or indirect comparisons.`,
    recovery: 'Add studies that bridge the disconnected components or analyze each component separately.'
  },

  NETWORK_NO_CONNECTIONS: {
    message: 'Treatment network has no connections',
    detail: 'No direct comparisons between treatments were found in the data.',
    recovery: 'Ensure your data includes studies comparing at least two treatments.'
  },

  // Data quality errors
  INVALID_EFFECT_SIZE: {
    message: 'Invalid effect size data',
    detail: (index) => `Study at index ${index} has missing or invalid effect size (yi) or variance (vi).`,
    recovery: 'Check your input data and ensure all studies have valid numeric values for yi and vi.'
  },

  VARIANCE_TOO_SMALL: {
    message: 'Study variance is too small or zero',
    detail: (index, vi) => `Study at index ${index} has variance vi=${vi}, which is too small for reliable analysis.`,
    recovery: 'Check the data for this study. Very small variances may indicate data entry errors.'
  },

  NEGATIVE_VARIANCE: {
    message: 'Negative variance detected',
    detail: (index, vi) => `Study at index ${index} has negative variance (vi=${vi}).`,
    recovery: 'Variance cannot be negative. Check your data calculations.'
  },

  // Covariate errors
  COVARIATE_NO_VARIATION: {
    message: 'Covariate has no variation',
    detail: (name) => `Covariate '${name}' has the same value across all studies.`,
    recovery: 'Remove this covariate from the analysis or check your data for errors.'
  },

  COVARIATE_MISSING: {
    message: 'Covariate values missing',
    detail: (name, missing) => `Covariate '${name}' is missing in ${missing} studies.`,
    recovery: 'Impute missing values or remove studies with missing covariate data.'
  },

  // Convergence errors
  BAYESIAN_NO_CONVERGENCE: {
    message: 'MCMC chains did not converge',
    detail: (rhat) => `R-hat diagnostic (${rhat}) exceeds 1.1, indicating chains have not converged.`,
    recovery: 'Increase iterations, increase burn-in period, or simplify the model.'
  },

  BAYESIAN_LOW_EFF_N: {
    message: 'Low effective sample size',
    detail: (neff, min) => `Effective sample size (${neff}) is below recommended minimum (${min}).`,
    recovery: 'Increase iterations or reduce autocorrelation by thinning more aggressively.'
  },

  // Multicollinearity errors
  HIGH_MULTICOLLINEARITY: {
    message: 'High multicollinearity detected',
    detail: (vif, predictors) => `VIF values ${vif} indicate high multicollinearity among predictors: ${predictors.join(', ')}.`,
    recovery: 'Remove correlated predictors, combine them, or use dimensionality reduction (e.g., PCA).'
  },

  PERFECT_COLLINEARITY: {
    message: 'Perfect collinearity detected',
    detail: 'Some predictors are perfectly correlated (correlation = 1).',
    recovery: 'Remove one of the perfectly correlated predictors from the model.'
  },

  // Model fit errors
  SINGULAR_MATRIX: {
    message: 'Cannot solve: singular matrix',
    detail: 'The design matrix is singular, meaning predictors are linearly dependent.',
    recovery: 'Remove redundant predictors or collect more diverse data.'
  },

  // NMA-specific errors
  INVALID_STUDY_FORMAT: {
    message: 'Invalid study format for NMA',
    detail: 'Studies must have an "arms" array with treatment, events, and denominator for each arm.',
    recovery: 'Ensure each study has the structure: { arms: [{ treatment, events, denominator }, ...] }'
  },

  INVALID_REFERENCE: {
    message: 'Invalid reference treatment',
    detail: (ref, available) => `Reference treatment '${ref}' not found. Available treatments: ${available.join(', ')}.`,
    recovery: 'Choose a reference treatment that exists in your network.'
  },

  // Permutation test errors
  PERMUTATION_TOO_FEW_STUDIES: {
    message: 'Insufficient studies for permutation test',
    detail: (n) => `Permutation test requires at least 3 studies, but only ${n} were provided.`,
    recovery: 'Add more studies or use parametric inference instead.'
  }
};

/**
 * Get user-friendly error message
 * @param {string} errorCode - Error code key
 * @param {Array} args - Arguments for error message formatting
 * @returns {Object} Formatted error with message, detail, and recovery
 */
export function getErrorMessage(errorCode, ...args) {
  const error = ERROR_MESSAGES[errorCode];
  if (!error) {
    return {
      message: 'Unknown error',
      detail: errorCode,
      recovery: 'Please check your input data and try again.'
    };
  }

  return {
    message: error.message,
    detail: typeof error.detail === 'function' ? error.detail(...args) : error.detail,
    recovery: error.recovery
  };
}

/**
 * Create enhanced error object
 * @param {string} errorCode - Error code key
 * @param {Array} args - Arguments for error message formatting
 * @returns {Object} Enhanced error object
 */
export function createError(errorCode, ...args) {
  const errorInfo = getErrorMessage(errorCode, ...args);
  return {
    error: errorInfo.message,
    detail: errorInfo.detail,
    recovery: errorInfo.recovery,
    errorCode
  };
}

/**
 * Wrap error with additional context
 * @param {Object} originalError - Original error object
 * @param {string} context - Additional context information
 * @returns {Object} Enhanced error with context
 */
export function wrapError(originalError, context) {
  return {
    error: originalError.error || originalError.message || 'Analysis failed',
    detail: originalError.detail || context,
    recovery: originalError.recovery || 'Please check your input data.',
    context,
    original: originalError
  };
}

export default {
  ERROR_MESSAGES,
  getErrorMessage,
  createError,
  wrapError
};
