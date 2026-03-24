/**
 * Effect Size Calculations
 * Computes various effect measures and their standard errors
 */

/**
 * Odds Ratio (OR) for binary outcomes
 * @param {number} a - Events in treatment group
 * @param {number} b - Non-events in treatment group
 * @param {number} c - Events in control group
 * @param {number} d - Non-events in control group
 * @param {number} cc - Continuity correction (default 0.5)
 * @returns {object} { yi: log(OR), vi: variance, or: OR, ci_lower, ci_upper }
 */
export function oddsRatio(a, b, c, d, cc = 0.5) {
  // Apply continuity correction if any cell is zero
  const needsCorrection = a === 0 || b === 0 || c === 0 || d === 0;

  if (needsCorrection && cc > 0) {
    a += cc;
    b += cc;
    c += cc;
    d += cc;
  }

  // Check for invalid data
  if (a <= 0 || b <= 0 || c <= 0 || d <= 0) {
    return { yi: null, vi: null, or: null, ci_lower: null, ci_upper: null, error: 'Invalid cell counts' };
  }

  const logOR = Math.log(a * d / (b * c));
  const variance = 1/a + 1/b + 1/c + 1/d;
  const se = Math.sqrt(variance);

  return {
    yi: logOR,
    vi: variance,
    se: se,
    or: Math.exp(logOR),
    ci_lower: Math.exp(logOR - 1.96 * se),
    ci_upper: Math.exp(logOR + 1.96 * se),
    needsCorrection
  };
}

/**
 * Risk Ratio (RR) for binary outcomes
 * @param {number} a - Events in treatment group
 * @param {number} n1 - Total in treatment group
 * @param {number} c - Events in control group
 * @param {number} n2 - Total in control group
 * @param {number} cc - Continuity correction (default 0.5)
 * @returns {object} { yi: log(RR), vi: variance, rr: RR, ci_lower, ci_upper }
 */
export function riskRatio(a, n1, c, n2, cc = 0.5) {
  // Apply continuity correction if needed
  const needsCorrection = a === 0 || c === 0;

  if (needsCorrection && cc > 0) {
    a += cc;
    c += cc;
    n1 += cc;
    n2 += cc;
  }

  if (a <= 0 || c <= 0 || n1 <= 0 || n2 <= 0) {
    return { yi: null, vi: null, rr: null, ci_lower: null, ci_upper: null, error: 'Invalid counts' };
  }

  const p1 = a / n1;
  const p2 = c / n2;

  const logRR = Math.log(p1 / p2);
  const variance = (1 - p1) / a + (1 - p2) / c;
  const se = Math.sqrt(variance);

  return {
    yi: logRR,
    vi: variance,
    se: se,
    rr: Math.exp(logRR),
    ci_lower: Math.exp(logRR - 1.96 * se),
    ci_upper: Math.exp(logRR + 1.96 * se),
    needsCorrection
  };
}

/**
 * Risk Difference (RD) for binary outcomes
 * @param {number} a - Events in treatment group
 * @param {number} n1 - Total in treatment group
 * @param {number} c - Events in control group
 * @param {number} n2 - Total in control group
 * @returns {object} { yi: RD, vi: variance, ci_lower, ci_upper }
 */
export function riskDifference(a, n1, c, n2) {
  if (n1 <= 0 || n2 <= 0) {
    return { yi: null, vi: null, ci_lower: null, ci_upper: null, error: 'Invalid sample sizes' };
  }

  const p1 = a / n1;
  const p2 = c / n2;

  const rd = p1 - p2;
  const variance = (p1 * (1 - p1)) / n1 + (p2 * (1 - p2)) / n2;
  const se = Math.sqrt(variance);

  return {
    yi: rd,
    vi: variance,
    se: se,
    ci_lower: rd - 1.96 * se,
    ci_upper: rd + 1.96 * se
  };
}

/**
 * Mean Difference (MD) for continuous outcomes
 * @param {number} m1 - Mean in treatment group
 * @param {number} sd1 - SD in treatment group
 * @param {number} n1 - N in treatment group
 * @param {number} m2 - Mean in control group
 * @param {number} sd2 - SD in control group
 * @param {number} n2 - N in control group
 * @returns {object} { yi: MD, vi: variance, ci_lower, ci_upper }
 */
export function meanDifference(m1, sd1, n1, m2, sd2, n2) {
  if (n1 <= 0 || n2 <= 0 || sd1 < 0 || sd2 < 0) {
    return { yi: null, vi: null, ci_lower: null, ci_upper: null, error: 'Invalid parameters' };
  }

  const md = m1 - m2;
  const variance = (sd1 * sd1) / n1 + (sd2 * sd2) / n2;
  const se = Math.sqrt(variance);

  return {
    yi: md,
    vi: variance,
    se: se,
    ci_lower: md - 1.96 * se,
    ci_upper: md + 1.96 * se
  };
}

/**
 * Standardized Mean Difference (SMD) - Hedges' g
 * @param {number} m1 - Mean in treatment group
 * @param {number} sd1 - SD in treatment group
 * @param {number} n1 - N in treatment group
 * @param {number} m2 - Mean in control group
 * @param {number} sd2 - SD in control group
 * @param {number} n2 - N in control group
 * @returns {object} { yi: SMD (Hedges' g), vi: variance, ci_lower, ci_upper, cohens_d }
 */
export function standardizedMeanDifference(m1, sd1, n1, m2, sd2, n2) {
  if (n1 <= 1 || n2 <= 1 || sd1 <= 0 || sd2 <= 0) {
    return { yi: null, vi: null, ci_lower: null, ci_upper: null, error: 'Invalid parameters' };
  }

  // Pooled standard deviation
  const pooledSD = Math.sqrt(
    ((n1 - 1) * sd1 * sd1 + (n2 - 1) * sd2 * sd2) / (n1 + n2 - 2)
  );

  if (pooledSD === 0) {
    return { yi: null, vi: null, ci_lower: null, ci_upper: null, error: 'Pooled SD is zero' };
  }

  // Cohen's d
  const d = (m1 - m2) / pooledSD;

  // Hedges' g correction factor (small sample bias correction)
  const df = n1 + n2 - 2;
  const J = 1 - (3 / (4 * df - 1));  // Hedges' correction factor

  // Hedges' g
  const g = J * d;

  // Variance of Hedges' g (Borenstein et al., 2009, Eq. 4.24)
  // Note: J² correction is already incorporated in the large-sample formula
  // Var(g) = (n1+n2)/(n1*n2) + g²/(2*(n1+n2-2))
  // The first term is the sampling variance, second term accounts for uncertainty in d
  const variance = (n1 + n2) / (n1 * n2) + (g * g) / (2 * df);
  const se = Math.sqrt(variance);

  return {
    yi: g,
    vi: variance,
    se: se,
    ci_lower: g - 1.96 * se,
    ci_upper: g + 1.96 * se,
    cohens_d: d,
    hedges_correction: J
  };
}

/**
 * Log Hazard Ratio from reported HR and CI
 * @param {number} hr - Hazard ratio
 * @param {number} ci_lower - Lower CI bound
 * @param {number} ci_upper - Upper CI bound
 * @returns {object} { yi: log(HR), vi: variance, hr, ci_lower, ci_upper }
 */
export function hazardRatio(hr, ci_lower, ci_upper) {
  if (hr <= 0 || ci_lower <= 0 || ci_upper <= 0) {
    return { yi: null, vi: null, hr: null, ci_lower: null, ci_upper: null, error: 'Invalid HR or CI' };
  }

  const logHR = Math.log(hr);

  // Derive SE from CI
  const logCILower = Math.log(ci_lower);
  const logCIUpper = Math.log(ci_upper);
  const se = (logCIUpper - logCILower) / (2 * 1.96);
  const variance = se * se;

  return {
    yi: logHR,
    vi: variance,
    se: se,
    hr: hr,
    ci_lower: ci_lower,
    ci_upper: ci_upper
  };
}

/**
 * Convert between effect measures
 */
export const conversions = {
  /**
   * Convert log(OR) to log(RR) approximately
   * RR ≈ OR / (1 - p0 + p0 × OR) where p0 is baseline risk
   */
  logORtoLogRR(logOR, baselineRisk) {
    const or = Math.exp(logOR);
    const rr = or / (1 - baselineRisk + baselineRisk * or);
    return Math.log(rr);
  },

  /**
   * Convert log(RR) to log(OR) approximately
   * OR ≈ RR × (1 - p0) / (1 - RR × p0)
   */
  logRRtoLogOR(logRR, baselineRisk) {
    const rr = Math.exp(logRR);
    const or = rr * (1 - baselineRisk) / (1 - rr * baselineRisk);
    return Math.log(or);
  },

  /**
   * Convert OR to NNT (Number Needed to Treat)
   * NNT = 1 / ARR where ARR = p0 - p1
   */
  orToNNT(or, baselineRisk) {
    const p0 = baselineRisk;
    const p1 = (or * p0) / (1 - p0 + or * p0);
    const arr = Math.abs(p0 - p1);
    return arr > 0 ? 1 / arr : Infinity;
  },

  /**
   * Convert RR to NNT
   */
  rrToNNT(rr, baselineRisk) {
    const arr = Math.abs(baselineRisk - rr * baselineRisk);
    return arr > 0 ? 1 / arr : Infinity;
  }
};

/**
 * Calculate effect size from 2x2 table
 * @param {object} data - { a, b, c, d } or { e1, n1, e2, n2 }
 * @param {string} measure - 'OR', 'RR', 'RD'
 * @param {number} cc - Continuity correction
 */
export function binaryEffect(data, measure = 'OR', cc = 0.5) {
  let a, b, c, d;

  if (data.a !== undefined) {
    ({ a, b, c, d } = data);
  } else if (data.e1 !== undefined) {
    a = data.e1;
    b = data.n1 - data.e1;
    c = data.e2;
    d = data.n2 - data.e2;
  } else {
    return { error: 'Invalid data format' };
  }

  switch (measure.toUpperCase()) {
    case 'OR':
      return oddsRatio(a, b, c, d, cc);
    case 'RR':
      return riskRatio(a, a + b, c, c + d, cc);
    case 'RD':
      return riskDifference(a, a + b, c, c + d);
    default:
      return { error: `Unknown measure: ${measure}` };
  }
}

/**
 * Calculate effect size for continuous outcomes
 * @param {object} data - { m1, sd1, n1, m2, sd2, n2 }
 * @param {string} measure - 'MD' or 'SMD'
 */
export function continuousEffect(data, measure = 'MD') {
  const { m1, sd1, n1, m2, sd2, n2 } = data;

  switch (measure.toUpperCase()) {
    case 'MD':
      return meanDifference(m1, sd1, n1, m2, sd2, n2);
    case 'SMD':
      return standardizedMeanDifference(m1, sd1, n1, m2, sd2, n2);
    default:
      return { error: `Unknown measure: ${measure}` };
  }
}

/**
 * Back-transform log effect to original scale with CI
 */
export function backTransform(yi, vi, scale = 'log') {
  if (yi === null || vi === null) return null;

  const se = Math.sqrt(vi);

  if (scale === 'log') {
    return {
      estimate: Math.exp(yi),
      ci_lower: Math.exp(yi - 1.96 * se),
      ci_upper: Math.exp(yi + 1.96 * se)
    };
  }

  return {
    estimate: yi,
    ci_lower: yi - 1.96 * se,
    ci_upper: yi + 1.96 * se
  };
}

export default {
  oddsRatio,
  riskRatio,
  riskDifference,
  meanDifference,
  standardizedMeanDifference,
  hazardRatio,
  conversions,
  binaryEffect,
  continuousEffect,
  backTransform
};
