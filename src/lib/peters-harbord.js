/**
 * Peters and Harbord Tests for Small-Study Effects
 * Tests specifically designed for binary outcomes
 */

/**
 * Peters' test for publication bias in binary outcomes
 * Weighted linear regression of log(OR) on 1/n or 1/√n (inverse sample size)
 *
 * This test supports two predictor variants:
 * - '1/n': Original Peters formulation (JAMA 2006) - default
 * - '1/sqrt(n)': Alternative with potentially better properties
 *
 * Reference: Peters JL, Sutton AJ, Jones DR, Abrams KR, Rushton L.
 * Comparison of two methods to detect publication bias in meta-analysis.
 * JAMA. 2006;295(6):676-680.
 *
 * IMPORTANT: Like Egger's test, Peters' test has low power with fewer than
 * 10 studies. Results should be interpreted with caution when k < 10.
 *
 * @param {Array} studies - Array of { a, b, c, d } (2x2 table data) or { yi, vi, n1, n2 }
 * @param {object} options - { variant: '1/n' | '1/sqrt(n)' } predictor specification
 * @returns {object} Peters test results with power warning if k < 10
 */
export function petersTest(studies, options = {}) {
  const { variant = '1/n' } = options;

  const validStudies = prepareStudies(studies);

  if (validStudies.length < 3) {
    return { error: 'Need at least 3 studies for Peters test' };
  }

  const k = validStudies.length;

  // Power warning for small meta-analyses
  const lowPowerWarning = k < 10
    ? 'Caution: Peters test has low statistical power with fewer than 10 studies. ' +
      'A non-significant result should not be interpreted as absence of publication bias.'
    : null;

  // Predictor: 1/n (default) or 1/√n based on variant option
  const x = variant === '1/sqrt(n)'
    ? validStudies.map(s => 1 / Math.sqrt(s.totalN))
    : validStudies.map(s => 1 / s.totalN);

  // Outcome: log(OR)
  const yi = validStudies.map(s => s.yi);

  // Weights: inverse variance
  const weights = validStudies.map(s => 1 / s.vi);

  // Weighted least squares regression
  const sumW = weights.reduce((a, b) => a + b, 0);
  const sumWX = weights.reduce((sum, w, i) => sum + w * x[i], 0);
  const sumWY = weights.reduce((sum, w, i) => sum + w * yi[i], 0);
  const sumWXX = weights.reduce((sum, w, i) => sum + w * x[i] * x[i], 0);
  const sumWXY = weights.reduce((sum, w, i) => sum + w * x[i] * yi[i], 0);

  const meanX = sumWX / sumW;
  const meanY = sumWY / sumW;

  const Sxx = sumWXX - sumW * meanX * meanX;
  const Sxy = sumWXY - sumW * meanX * meanY;

  const slope = Sxy / Sxx;
  const intercept = meanY - slope * meanX;

  // Residual variance
  const residuals = yi.map((y, i) => y - intercept - slope * x[i]);
  const sse = residuals.reduce((sum, r, i) => sum + weights[i] * r * r, 0);
  const mse = sse / (k - 2);

  // Standard error of slope
  const seSlope = Math.sqrt(mse / Sxx);
  const seIntercept = Math.sqrt(mse * (1/sumW + meanX * meanX / Sxx));

  // T-test for slope (main test)
  const tSlope = slope / seSlope;
  const df = k - 2;
  const pValue = 2 * (1 - tCDF(Math.abs(tSlope), df));

  return {
    test: 'Peters',
    variant,  // Document which variant is used
    k,
    intercept,
    seIntercept,
    slope,
    seSlope,
    t: tSlope,
    df,
    pValue,
    significant: pValue < 0.10,
    interpretation: interpretPeters(pValue, slope),
    lowPowerWarning,
    adequatePower: k >= 10
  };
}

/**
 * Harbord's test for publication bias in binary outcomes
 * Modified Egger test using score and score variance
 *
 * Harbord's test is specifically designed for binary outcomes and avoids
 * the bias in Egger's test that can occur with sparse data.
 *
 * Reference: Harbord RM, Egger M, Sterne JA. A modified test for small-study
 * effects in meta-analyses of controlled trials with binary endpoints.
 * Stat Med. 2006;25(20):3443-3457.
 *
 * IMPORTANT: Like other small-study tests, Harbord's test has low power
 * with fewer than 10 studies. Results should be interpreted with caution.
 *
 * @param {Array} studies - Array of { a, b, c, d } (2x2 table data)
 * @returns {object} Harbord test results with power warning if k < 10
 */
export function harbordTest(studies) {
  const validStudies = prepareStudies(studies);

  if (validStudies.length < 3) {
    return { error: 'Need at least 3 studies for Harbord test' };
  }

  const k = validStudies.length;

  // Power warning for small meta-analyses
  const lowPowerWarning = k < 10
    ? 'Caution: Harbord test has low statistical power with fewer than 10 studies. ' +
      'A non-significant result should not be interpreted as absence of publication bias.'
    : null;

  // Calculate score statistic and its variance for each study
  const scoreData = validStudies.map(s => {
    // Score: observed - expected events in treatment
    const { a, b, c, d } = s;
    const n1 = a + b;  // Treatment total
    const n2 = c + d;  // Control total
    const n = n1 + n2; // Total
    const m = a + c;   // Total events

    // Expected events in treatment under null
    const expected = n1 * m / n;

    // Score
    const score = a - expected;

    // Variance of score (hypergeometric)
    const varScore = n1 * n2 * m * (n - m) / (n * n * (n - 1));

    return {
      score,
      varScore,
      z: score / Math.sqrt(varScore),
      precision: Math.sqrt(varScore)
    };
  });

  // Harbord regression: Z = intercept + slope * precision
  const z = scoreData.map(s => s.z);
  const x = scoreData.map(s => s.precision);

  // Equal weights regression
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumZ = z.reduce((a, b) => a + b, 0);
  const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
  const sumXZ = x.reduce((sum, xi, i) => sum + xi * z[i], 0);

  const meanX = sumX / k;
  const meanZ = sumZ / k;

  const Sxx = sumXX - k * meanX * meanX;
  const Sxz = sumXZ - k * meanX * meanZ;

  const slope = Sxz / Sxx;
  const intercept = meanZ - slope * meanX;

  // Residual variance
  const residuals = z.map((zi, i) => zi - intercept - slope * x[i]);
  const sse = residuals.reduce((sum, r) => sum + r * r, 0);
  const mse = sse / (k - 2);

  const seIntercept = Math.sqrt(mse * (1/k + meanX * meanX / Sxx));
  const seSlope = Math.sqrt(mse / Sxx);

  // T-test for intercept (deviation from symmetry)
  const tIntercept = intercept / seIntercept;
  const df = k - 2;
  const pValue = 2 * (1 - tCDF(Math.abs(tIntercept), df));

  return {
    test: 'Harbord',
    k,
    intercept,
    seIntercept,
    slope,
    seSlope,
    t: tIntercept,
    df,
    pValue,
    significant: pValue < 0.10,
    interpretation: interpretHarbord(pValue, intercept),
    lowPowerWarning,
    adequatePower: k >= 10
  };
}

/**
 * Rücker's arcsine test
 * Uses variance-stabilizing transformation
 *
 * @param {Array} studies - Array of { a, b, c, d }
 * @returns {object} Arcsine test results
 */
export function ruckerArcsineTest(studies) {
  const validStudies = prepareStudies(studies);

  if (validStudies.length < 3) {
    return { error: 'Need at least 3 studies for Rücker arcsine test' };
  }

  const k = validStudies.length;

  // Arcsine transformation for each study
  const transformed = validStudies.map(s => {
    const { a, b, c, d } = s;
    const n1 = a + b;
    const n2 = c + d;

    // Arcsine difference
    const as1 = Math.asin(Math.sqrt(a / n1));
    const as2 = Math.asin(Math.sqrt(c / n2));
    const asd = as1 - as2;

    // Variance (approximately 1/(4n1) + 1/(4n2))
    const varAsd = 1 / (4 * n1) + 1 / (4 * n2);

    return {
      yi: asd,
      vi: varAsd,
      se: Math.sqrt(varAsd)
    };
  });

  // Weighted regression of arcsine difference on SE
  const yi = transformed.map(t => t.yi);
  const x = transformed.map(t => t.se);
  const weights = transformed.map(t => 1 / t.vi);

  const sumW = weights.reduce((a, b) => a + b, 0);
  const sumWX = weights.reduce((sum, w, i) => sum + w * x[i], 0);
  const sumWY = weights.reduce((sum, w, i) => sum + w * yi[i], 0);
  const sumWXX = weights.reduce((sum, w, i) => sum + w * x[i] * x[i], 0);
  const sumWXY = weights.reduce((sum, w, i) => sum + w * x[i] * yi[i], 0);

  const meanX = sumWX / sumW;
  const meanY = sumWY / sumW;

  const Sxx = sumWXX - sumW * meanX * meanX;
  const Sxy = sumWXY - sumW * meanX * meanY;

  const slope = Sxy / Sxx;
  const intercept = meanY - slope * meanX;

  const residuals = yi.map((y, i) => y - intercept - slope * x[i]);
  const sse = residuals.reduce((sum, r, i) => sum + weights[i] * r * r, 0);
  const mse = sse / (k - 2);

  const seSlope = Math.sqrt(mse / Sxx);
  const tSlope = slope / seSlope;
  const df = k - 2;
  const pValue = 2 * (1 - tCDF(Math.abs(tSlope), df));

  return {
    test: 'Rücker-Arcsine',
    k,
    intercept,
    slope,
    seSlope,
    t: tSlope,
    df,
    pValue,
    significant: pValue < 0.10
  };
}

/**
 * Schwarzer's sample-size based test
 * Regression on sqrt(effective sample size)
 */
export function schwarzerTest(studies) {
  const validStudies = prepareStudies(studies);

  if (validStudies.length < 3) {
    return { error: 'Need at least 3 studies' };
  }

  const k = validStudies.length;

  // Effective sample size: 4 * n1 * n2 / (n1 + n2)
  const effN = validStudies.map(s => 4 * s.n1 * s.n2 / s.totalN);

  const yi = validStudies.map(s => s.yi);
  const x = effN.map(n => 1 / Math.sqrt(n));
  const weights = validStudies.map(s => 1 / s.vi);

  const sumW = weights.reduce((a, b) => a + b, 0);
  const sumWX = weights.reduce((sum, w, i) => sum + w * x[i], 0);
  const sumWY = weights.reduce((sum, w, i) => sum + w * yi[i], 0);
  const sumWXX = weights.reduce((sum, w, i) => sum + w * x[i] * x[i], 0);
  const sumWXY = weights.reduce((sum, w, i) => sum + w * x[i] * yi[i], 0);

  const meanX = sumWX / sumW;
  const meanY = sumWY / sumW;

  const Sxx = sumWXX - sumW * meanX * meanX;
  const Sxy = sumWXY - sumW * meanX * meanY;

  const slope = Sxy / Sxx;
  const intercept = meanY - slope * meanX;

  const residuals = yi.map((y, i) => y - intercept - slope * x[i]);
  const sse = residuals.reduce((sum, r, i) => sum + weights[i] * r * r, 0);
  const mse = sse / (k - 2);

  const seSlope = Math.sqrt(mse / Sxx);
  const tSlope = slope / seSlope;
  const df = k - 2;
  const pValue = 2 * (1 - tCDF(Math.abs(tSlope), df));

  return {
    test: 'Schwarzer',
    k,
    intercept,
    slope,
    seSlope,
    t: tSlope,
    df,
    pValue,
    significant: pValue < 0.10
  };
}

/**
 * Choose appropriate test based on effect measure
 */
export function selectSmallStudyTest(studies, effectMeasure = 'OR') {
  if (['OR', 'RR', 'RD'].includes(effectMeasure.toUpperCase())) {
    // For binary outcomes, prefer Peters (OR) or Harbord
    const peters = petersTest(studies);
    const harbord = harbordTest(studies);

    return {
      recommended: 'Peters',
      reason: 'Appropriate for odds ratios with low event rates',
      results: {
        peters,
        harbord
      }
    };
  } else {
    // For continuous outcomes, use standard Egger
    return {
      recommended: 'Egger',
      reason: 'Standard test for continuous outcome measures'
    };
  }
}

// Helper functions

function prepareStudies(studies) {
  return studies.filter(s => {
    // Accept either 2x2 table format or computed yi/vi with sample sizes
    if (s.a !== undefined && s.b !== undefined && s.c !== undefined && s.d !== undefined) {
      const valid = s.a >= 0 && s.b >= 0 && s.c >= 0 && s.d >= 0 &&
                   (s.a + s.b) > 0 && (s.c + s.d) > 0;
      if (valid) {
        // Calculate OR and variance
        const cc = 0.5;
        let { a, b, c, d } = s;
        if (a === 0 || b === 0 || c === 0 || d === 0) {
          a += cc; b += cc; c += cc; d += cc;
        }
        s.yi = Math.log(a * d / (b * c));
        s.vi = 1/a + 1/b + 1/c + 1/d;
        s.n1 = s.a + s.b;
        s.n2 = s.c + s.d;
        s.totalN = s.n1 + s.n2;
      }
      return valid;
    }
    return s.yi !== null && s.vi !== null && s.vi > 0 &&
           s.n1 !== undefined && s.n2 !== undefined;
  }).map(s => {
    if (!s.totalN) {
      s.totalN = s.n1 + s.n2;
    }
    return s;
  });
}

function interpretPeters(pValue, slope) {
  if (pValue >= 0.10) {
    return 'No evidence of small-study effects';
  } else {
    const direction = slope > 0 ? 'positive' : 'negative';
    return `Evidence of small-study effects (${direction} association with sample size), suggesting possible publication bias`;
  }
}

function interpretHarbord(pValue, intercept) {
  if (pValue >= 0.10) {
    return 'No evidence of funnel plot asymmetry';
  } else {
    const direction = intercept > 0 ? 'favoring treatment' : 'favoring control';
    return `Evidence of funnel plot asymmetry (${direction}), suggesting possible publication bias`;
  }
}

function tCDF(t, df) {
  const x = df / (df + t * t);
  const halfBeta = 0.5 * incompleteBeta(df / 2, 0.5, x);
  // For t >= 0: CDF = 1 - halfBeta, for t < 0: CDF = halfBeta
  return t >= 0 ? 1 - halfBeta : halfBeta;
}

function incompleteBeta(a, b, x) {
  if (x === 0) return 0;
  if (x === 1) return 1;

  const bt = Math.exp(gammaln(a + b) - gammaln(a) - gammaln(b) +
              a * Math.log(x) + b * Math.log(1 - x));

  if (x < (a + 1) / (a + b + 2)) {
    return bt * betacf(a, b, x) / a;
  } else {
    return 1 - bt * betacf(b, a, 1 - x) / b;
  }
}

function betacf(a, b, x) {
  const maxIter = 100;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - qab * x / qap;
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= maxIter; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    h *= d * c;
    if (Math.abs(d * c - 1) < 1e-10) break;
  }

  return h;
}

function gammaln(x) {
  const coef = [76.18009172947146, -86.50532032941677, 24.01409824083091,
                -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];

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
  petersTest,
  harbordTest,
  ruckerArcsineTest,
  schwarzerTest,
  selectSmallStudyTest
};
