/**
 * PET-PEESE Method for Publication Bias
 * Precision-Effect Test and Precision-Effect Estimate
 * Stanley (2017) meta-regression approach
 *
 * @module PETPEESE
 * @see {@link https://doi.org/10.1002/jrsm.1207|Stanley (2017) RSM 12(4):373-390}
 * @description PET-PEESE uses weighted regression to detect and correct for
 *              publication bias. PET (yi ~ 1 + SE) tests for small-study effects.
 *              PESEE (yi ~ 1 + SE²) estimates the effect at infinite precision.
 *              If PET slope is significant, use PESEE estimate; otherwise use PET.
 *              Alpha threshold for significance testing: default α = 0.05.
 */

import { normalCDF, tCDF, tQuantile } from '../utils.js';

/**
 * Perform weighted least squares regression
 * @param {Array} x - Independent variable values
 * @param {Array} y - Dependent variable values
 * @param {Array} weights - Weights for each observation
 * @returns {Object} Regression results
 */
function weightedRegression(x, y, weights) {
  const n = x.length;

  if (n < 2) {
    return { error: 'Need at least 2 observations for regression' };
  }

  let sumW = 0;
  let sumWX = 0;
  let sumWY = 0;
  let sumWXY = 0;
  let sumWX2 = 0;

  for (let i = 0; i < n; i++) {
    const w = weights[i];
    const xi = x[i];
    const yi = y[i];

    sumW += w;
    sumWX += w * xi;
    sumWY += w * yi;
    sumWXY += w * xi * yi;
    sumWX2 += w * xi * xi;
  }

  // Calculate slope and intercept
  const denominator = sumW * sumWX2 - sumWX * sumWX;

  if (Math.abs(denominator) < 1e-10) {
    return { error: 'Cannot compute regression (collinearity)' };
  }

  const slope = (sumW * sumWXY - sumWX * sumWY) / denominator;
  const intercept = (sumWY - slope * sumWX) / sumW;

  // Calculate residuals
  const residuals = y.map((yi, i) => yi - (intercept + slope * x[i]));

  // Weighted residual sum of squares
  const rss = weights.reduce((sum, w, i) => sum + w * residuals[i] * residuals[i], 0);

  // Degrees of freedom
  const df = n - 2;

  // Mean squared error
  const mse = df > 0 ? rss / df : 0;

  // Variance of slope and intercept
  const varSlope = mse * sumW / denominator;
  const varIntercept = mse * sumWX2 / denominator;

  // Covariance
  const cov = -mse * sumWX / denominator;

  // Standard errors
  const seSlope = Math.sqrt(varSlope);
  const seIntercept = Math.sqrt(varIntercept);

  // t-statistics
  const tSlope = slope / seSlope;
  const tIntercept = intercept / seIntercept;

  // p-values
  const pSlope = 2 * (1 - tCDF(Math.abs(tSlope), df));
  const pIntercept = 2 * (1 - tCDF(Math.abs(tIntercept), df));

  return {
    intercept,
    slope,
    seIntercept,
    seSlope,
    tIntercept,
    tSlope,
    pIntercept,
    pSlope,
    df,
    rss,
    mse,
    residuals,
    r2: null, // Could compute if needed
    cov
  };
}

/**
 * Perform PET-PEESE analysis
 * @param {Array} studies - Array of studies with yi, vi
 * @param {Object} options - Analysis options
 * @returns {Object} PET-PEESE results
 */
export function petPeese(studies, options = {}) {
  const {
    alpha = 0.05,
    useWeights = true,
    onlyPositiveSE = false
  } = options;

  const k = studies.length;

  if (k < 3) {
    return {
      error: 'PET-PEESE requires at least 3 studies',
      pet: null,
      peese: null,
      recommendation: null
    };
  }

  // Prepare data
  const validStudies = studies.filter(s =>
    s.yi !== null &&
    s.yi !== undefined &&
    s.vi !== null &&
    s.vi !== undefined &&
    s.vi > 0 &&
    !isNaN(s.yi) &&
    !isNaN(s.vi)
  );

  if (validStudies.length < 3) {
    return {
      error: 'PET-PEESE requires at least 3 valid studies',
      pet: null,
      peese: null,
      recommendation: null
    };
  }

  const se = validStudies.map(s => Math.sqrt(s.vi));
  const precision = validStudies.map(s => 1 / Math.sqrt(s.vi));
  const yi = validStudies.map(s => s.yi);

  // PET regression: yi ~ 1 + se
  const petWeights = useWeights
    ? validStudies.map(s => 1 / s.vi)
    : validStudies.map(() => 1);

  const pet = weightedRegression(se, yi, petWeights);

  // PESEE regression: yi ~ 1 + se^2
  const se2 = se.map(s => s * s);
  const peeseWeights = useWeights
    ? validStudies.map(s => 1 / s.vi)
    : validStudies.map(() => 1);

  const peese = weightedRegression(se2, yi, peeseWeights);

  // Determine recommendation based on PET
  let recommendation = null;
  let selectedEstimate = null;

  if (pet && !pet.error) {
    if (pet.pIntercept < alpha) {
      // PET is significant -> use PESEE
      recommendation = 'PET significant, using PESEE estimate';
      if (peese && !peese.error) {
        selectedEstimate = {
          type: 'PESEE',
          estimate: peese.intercept,
          se: peese.seIntercept,
          ciLower: peese.intercept - 1.96 * peese.seIntercept,
          ciUpper: peese.intercept + 1.96 * peese.seIntercept,
          pValue: peese.pIntercept
        };
      }
    } else {
      // PET not significant -> use PET (FE)
      recommendation = 'PET not significant, using PET estimate (fixed effects)';
      selectedEstimate = {
        type: 'PET',
        estimate: pet.intercept,
        se: pet.seIntercept,
        ciLower: pet.intercept - 1.96 * pet.seIntercept,
        ciUpper: pet.intercept + 1.96 * pet.seIntercept,
        pValue: pet.pIntercept
      };
    }
  }

  return {
    pet: pet.error ? null : {
      intercept: pet.intercept,
      seIntercept: pet.seIntercept,
      slope: pet.slope,
      seSlope: pet.seSlope,
      tIntercept: pet.tIntercept,
      tSlope: pet.tSlope,
      pIntercept: pet.pIntercept,
      pSlope: pet.pSlope,
      df: pet.df,
      interpretation: pet.pSlope < alpha
        ? 'Significant small-study effects detected'
        : 'No significant small-study effects'
    },
    peese: peese.error ? null : {
      intercept: peese.intercept,
      seIntercept: peese.seIntercept,
      slope: peese.slope,
      seSlope: peese.seSlope,
      tIntercept: peese.tIntercept,
      tSlope: peese.tSlope,
      pIntercept: peese.pIntercept,
      pSlope: peese.pSlope,
      df: peese.df,
      interpretation: peese.pSlope < alpha
        ? 'Significant effect of precision detected'
        : 'No significant precision effect'
    },
    selectedEstimate,
    recommendation,
    k: validStudies.length
  };
}

/**
 * Perform PET-PEESE with bias correction
 * @param {Array} studies - Array of studies with yi, vi
 * @param {Object} options - Analysis options
 * @returns {Object} PET-PEESE results with bias-corrected estimates
 */
export function petPeeseBiasCorrected(studies, options = {}) {
  const result = petPeese(studies, options);

  if (result.error || !result.pet || !result.peese) {
    return result;
  }

  // Calculate bias-corrected estimate
  // Use PET intercept if PET slope is not significant
  // Use PESEE intercept if PET slope is significant
  let biasCorrected = null;

  if (result.pet.pSlope >= (options.alpha || 0.05)) {
    // PET slope not significant -> use PET intercept
    biasCorrected = {
      estimate: result.pet.intercept,
      se: result.pet.seIntercept,
      ciLower: result.pet.intercept - 1.96 * result.pet.seIntercept,
      ciUpper: result.pet.intercept + 1.96 * result.pet.seIntercept,
      pValue: result.pet.pIntercept,
      method: 'PET (FE)',
      interpretation: 'No evidence of publication bias, using fixed effects estimate'
    };
  } else {
    // PET slope significant -> use PESEE intercept
    biasCorrected = {
      estimate: result.peese.intercept,
      se: result.peese.seIntercept,
      ciLower: result.peese.intercept - 1.96 * result.peese.seIntercept,
      ciUpper: result.peese.intercept + 1.96 * result.peese.seIntercept,
      pValue: result.peese.pIntercept,
      method: 'PESEE',
      interpretation: 'Evidence of publication bias, using precision-corrected estimate'
    };
  }

  return {
    ...result,
    biasCorrected
  };
}

/**
 * Compare PET-PEESE with traditional meta-analysis
 * @param {Array} studies - Array of studies with yi, vi
 * @param {Object} traditionalResult - Traditional meta-analysis result
 * @param {Object} options - PET-PEESE options
 * @returns {Object} Comparison results
 */
export function comparePETPEESE(studies, traditionalResult, options = {}) {
  const petpeeseResult = petPeese(studies, options);

  if (petpeeseResult.error) {
    return {
      error: petpeeseResult.error,
      comparison: null
    };
  }

  const traditional = traditionalResult.theta || traditionalResult.estimate || 0;
  const traditionalSE = traditionalResult.se || traditionalResult.se || 0;

  const selected = petpeeseResult.selectedEstimate;

  if (!selected) {
    return {
      error: 'Could not determine selected PET-PEESE estimate',
      comparison: null
    };
  }

  // Calculate difference
  const diff = selected.estimate - traditional;
  const diffSE = Math.sqrt(selected.se * selected.se + traditionalSE * traditionalSE);
  const diffZ = diff / diffSE;
  const diffPValue = 2 * (1 - normalCDF(Math.abs(diffZ)));

  const comparison = {
    traditional: {
      estimate: traditional,
      se: traditionalSE
    },
    petpeese: {
      estimate: selected.estimate,
      se: selected.se,
      method: selected.type
    },
    difference: {
      estimate: diff,
      se: diffSE,
      z: diffZ,
      pValue: diffPValue,
      significant: diffPValue < (options.alpha || 0.05)
    },
    interpretation: diffPValue < (options.alpha || 0.05)
      ? `PET-PEESE estimate differs significantly from traditional estimate (${selected.type} selected)`
      : `PET-PEESE estimate does not differ significantly from traditional estimate (${selected.type} selected)`
  };

  return {
    ...petpeeseResult,
    comparison
  };
}

/**
 * Perform PET-PEESE sensitivity analysis
 * @param {Array} studies - Array of studies with yi, vi
 * @param {Object} options - Analysis options
 * @returns {Object} Sensitivity analysis results
 */
export function petPeeseSensitivity(studies, options = {}) {
  const k = studies.length;

  if (k < 5) {
    return {
      error: 'Sensitivity analysis requires at least 5 studies',
      results: null
    };
  }

  // Leave-one-out sensitivity analysis
  const leaveOneOut = [];

  for (let i = 0; i < studies.length; i++) {
    const leaveOutStudies = studies.filter((_, j) => j !== i);
    const result = petPeese(leaveOutStudies, options);

    if (!result.error && result.selectedEstimate) {
      leaveOneOut.push({
        omitted: studies[i].nctId || studies[i].id || `Study ${i + 1}`,
        estimate: result.selectedEstimate.estimate,
        se: result.selectedEstimate.se,
        method: result.selectedEstimate.type,
        recommendation: result.recommendation
      });
    }
  }

  // Calculate range of estimates
  const estimates = leaveOneOut.map(r => r.estimate);
  const minEstimate = Math.min(...estimates);
  const maxEstimate = Math.max(...estimates);
  const range = maxEstimate - minEstimate;

  // Count method selections
  const methodCounts = {};
  for (const r of leaveOneOut) {
    methodCounts[r.method] = (methodCounts[r.method] || 0) + 1;
  }

  return {
    leaveOneOut,
    estimateRange: {
      min: minEstimate,
      max: maxEstimate,
      range
    },
    methodCounts,
    interpretation: range < 0.1
      ? 'Robust: PET-PEESE estimates are stable across leave-one-out analysis'
      : 'Sensitive: PET-PEESE estimates vary substantially across leave-one-out analysis'
  };
}

export default {
  petPeese,
  petPeeseBiasCorrected,
  comparePETPEESE,
  petPeeseSensitivity
};
