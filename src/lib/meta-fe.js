/**
 * Fixed Effects Meta-Analysis
 * Implements inverse-variance weighted fixed effects model
 *
 * OPTIMIZED: Uses computeMAState for single-pass calculations
 */

import { computeMAState } from './meta-cache.js';

/**
 * Fixed effects meta-analysis using inverse variance weighting
 * @param {Array} studies - Array of { yi, vi, ... } objects
 * @returns {object} Fixed effects results
 */
export function fixedEffects(studies) {
  // Filter out invalid studies
  const validStudies = studies.filter(s =>
    s.yi !== null && s.vi !== null &&
    !isNaN(s.yi) && !isNaN(s.vi) &&
    s.vi > 0
  );

  if (validStudies.length === 0) {
    return { error: 'No valid studies' };
  }

  // Use optimized single-pass calculation
  const state = computeMAState(validStudies);
  const { k, weights, totalWeight, thetaFE: theta, seFE: se, Q, I2 } = state;

  // Variance of pooled estimate
  const variance = 1 / totalWeight;

  // Confidence interval (95%)
  const z = 1.96;
  const ci_lower = theta - z * se;
  const ci_upper = theta + z * se;

  // Degrees of freedom
  const df = k - 1;

  // P-value for Q (chi-square distribution)
  const pQ = 1 - chiSquareCDF(Q, df);

  // H² statistic
  const H2 = df > 0 ? Q / df : 1;

  // Z-test for overall effect
  const zTest = theta / se;
  const pValue = 2 * (1 - normalCDF(Math.abs(zTest)));

  return {
    model: 'FE',
    k,
    theta,
    se,
    variance,
    ci_lower,
    ci_upper,
    z: zTest,
    pValue,
    Q,
    df,
    pQ,
    I2,
    H2,
    weights: validStudies.map((s, i) => ({
      id: s.id || s.nctId || i,
      yi: s.yi,
      vi: s.vi,
      weight: state.weights[i],
      weightPercent: (state.weights[i] / totalWeight) * 100
    }))
  };
}

/**
 * Leave-one-out sensitivity analysis
 * @param {Array} studies - Array of { yi, vi, ... } objects
 * @returns {Array} Results with each study omitted
 */
export function leaveOneOut(studies) {
  const validStudies = studies.filter(s =>
    s.yi !== null && s.vi !== null &&
    !isNaN(s.yi) && !isNaN(s.vi) &&
    s.vi > 0
  );

  if (validStudies.length < 2) {
    return { error: 'Need at least 2 studies for leave-one-out' };
  }

  return validStudies.map((omitted, i) => {
    const remaining = validStudies.filter((_, j) => j !== i);
    const result = fixedEffects(remaining);

    return {
      omitted: omitted.id || omitted.nctId || `Study ${i + 1}`,
      omittedYi: omitted.yi,
      theta: result.theta,
      se: result.se,
      ci_lower: result.ci_lower,
      ci_upper: result.ci_upper,
      I2: result.I2
    };
  });
}

/**
 * Cumulative meta-analysis (ordered by study characteristic)
 * @param {Array} studies - Array of { yi, vi, order, ... } objects
 * @param {string} orderBy - Property to order by (default: 'order')
 * @returns {Array} Cumulative results as studies are added
 */
export function cumulativeMeta(studies, orderBy = 'order') {
  const validStudies = studies.filter(s =>
    s.yi !== null && s.vi !== null &&
    !isNaN(s.yi) && !isNaN(s.vi) &&
    s.vi > 0
  );

  if (validStudies.length === 0) {
    return { error: 'No valid studies' };
  }

  // Sort studies
  const sorted = [...validStudies].sort((a, b) => {
    const aVal = a[orderBy] || 0;
    const bVal = b[orderBy] || 0;
    return aVal - bVal;
  });

  const results = [];

  for (let i = 0; i < sorted.length; i++) {
    const subset = sorted.slice(0, i + 1);
    const result = fixedEffects(subset);

    results.push({
      k: i + 1,
      addedStudy: sorted[i].id || sorted[i].nctId || `Study ${i + 1}`,
      orderValue: sorted[i][orderBy],
      theta: result.theta,
      se: result.se,
      ci_lower: result.ci_lower,
      ci_upper: result.ci_upper,
      I2: result.I2,
      Q: result.Q
    });
  }

  return results;
}

/**
 * Subgroup analysis
 * @param {Array} studies - Array of { yi, vi, group, ... } objects
 * @param {string} groupVar - Property defining subgroups
 * @returns {object} Results per subgroup and overall
 */
export function subgroupAnalysis(studies, groupVar = 'group') {
  const validStudies = studies.filter(s =>
    s.yi !== null && s.vi !== null &&
    !isNaN(s.yi) && !isNaN(s.vi) &&
    s.vi > 0 &&
    s[groupVar] !== undefined
  );

  // Group studies
  const groups = {};
  validStudies.forEach(s => {
    const group = s[groupVar];
    if (!groups[group]) groups[group] = [];
    groups[group].push(s);
  });

  // Analyze each subgroup
  const subgroupResults = {};
  for (const [groupName, groupStudies] of Object.entries(groups)) {
    subgroupResults[groupName] = fixedEffects(groupStudies);
  }

  // Test for subgroup differences (Q between)
  const groupKeys = Object.keys(subgroupResults);
  if (groupKeys.length < 2) {
    return {
      subgroups: subgroupResults,
      overall: fixedEffects(validStudies),
      test: { error: 'Need at least 2 subgroups for comparison' }
    };
  }

  // Q between = sum of (wi * (theta_i - theta_overall)^2)
  const overall = fixedEffects(validStudies);

  let Qbetween = 0;
  groupKeys.forEach(key => {
    const result = subgroupResults[key];
    if (result.theta !== undefined) {
      const wi = 1 / result.variance;
      Qbetween += wi * Math.pow(result.theta - overall.theta, 2);
    }
  });

  const dfBetween = groupKeys.length - 1;
  const pBetween = 1 - chiSquareCDF(Qbetween, dfBetween);

  return {
    subgroups: subgroupResults,
    overall,
    test: {
      Qbetween,
      df: dfBetween,
      pValue: pBetween,
      significant: pBetween < 0.05
    }
  };
}

/**
 * Influence diagnostics for fixed effects
 * @param {Array} studies - Array of { yi, vi, ... } objects
 * @returns {object} Influence measures for each study
 */
export function influenceDiagnostics(studies) {
  const validStudies = studies.filter(s =>
    s.yi !== null && s.vi !== null &&
    !isNaN(s.yi) && !isNaN(s.vi) &&
    s.vi > 0
  );

  if (validStudies.length < 2) {
    return { error: 'Need at least 2 studies' };
  }

  const fullResult = fixedEffects(validStudies);
  const loo = leaveOneOut(validStudies);

  return validStudies.map((s, i) => {
    const looResult = loo[i];

    // Standardized residual
    const residual = s.yi - fullResult.theta;
    const stdResidual = residual / Math.sqrt(s.vi);

    // DFBETAS (change in theta when study removed)
    const dfbetas = fullResult.theta - looResult.theta;

    // Cook's distance analog
    const weight = 1 / s.vi;
    const cooksD = Math.pow(dfbetas, 2) / fullResult.variance;

    // Hat value (leverage)
    const hatValue = weight / fullResult.weights.reduce((sum, w) => sum + w.weight, 0);

    return {
      id: s.id || s.nctId || `Study ${i + 1}`,
      yi: s.yi,
      vi: s.vi,
      residual,
      stdResidual,
      dfbetas,
      cooksD,
      hatValue,
      thetaWithout: looResult.theta,
      I2Without: looResult.I2
    };
  });
}

// Statistical helper functions

/**
 * Standard normal CDF
 */
function normalCDF(x) {
  const a1 =  0.254829592;
  const a2 = -0.284496736;
  const a3 =  1.421413741;
  const a4 = -1.453152027;
  const a5 =  1.061405429;
  const p  =  0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

/**
 * Chi-square CDF (using incomplete gamma function approximation)
 */
function chiSquareCDF(x, df) {
  if (x <= 0 || df <= 0) return 0;

  // Use regularized incomplete gamma function
  return gammainc(df / 2, x / 2);
}

/**
 * Regularized incomplete gamma function P(a,x)
 * Approximation using series expansion
 */
function gammainc(a, x) {
  if (x === 0) return 0;
  if (x < 0 || a <= 0) return NaN;

  if (x < a + 1) {
    // Use series representation
    let sum = 1 / a;
    let term = 1 / a;
    for (let n = 1; n < 100; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < 1e-10 * Math.abs(sum)) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - gammaln(a));
  } else {
    // Use continued fraction representation
    return 1 - gammainc_upper(a, x);
  }
}

/**
 * Upper incomplete gamma function Q(a,x) = 1 - P(a,x)
 */
function gammainc_upper(a, x) {
  // Lentz's algorithm for continued fraction
  const fpmin = 1e-30;
  let b = x + 1 - a;
  let c = 1 / fpmin;
  let d = 1 / b;
  let h = d;

  for (let i = 1; i < 100; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < fpmin) d = fpmin;
    c = b + an / c;
    if (Math.abs(c) < fpmin) c = fpmin;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-10) break;
  }

  return Math.exp(-x + a * Math.log(x) - gammaln(a)) * h;
}

/**
 * Log gamma function (Lanczos approximation)
 */
function gammaln(x) {
  const coef = [
    76.18009172947146,
    -86.50532032941677,
    24.01409824083091,
    -1.231739572450155,
    0.1208650973866179e-2,
    -0.5395239384953e-5
  ];

  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);

  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) {
    ser += coef[j] / ++y;
  }

  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

export default {
  fixedEffects,
  leaveOneOut,
  cumulativeMeta,
  subgroupAnalysis,
  influenceDiagnostics
};
