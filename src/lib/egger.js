/**
 * Egger's Regression Test for Small-Study Effects (Publication Bias)
 * Tests for funnel plot asymmetry
 */

/**
 * Egger's linear regression test
 * Regresses standardized effect (yi/sei) on precision (1/sei)
 *
 * Reference: Egger M, Smith GD, Schneider M, Minder C. Bias in meta-analysis
 * detected by a simple, graphical test. BMJ. 1997;315(7109):629-634.
 *
 * IMPORTANT: This test has low power with fewer than 10 studies.
 * The Cochrane Handbook recommends against routine use when k < 10.
 * See: Sterne JAC et al. Recommendations for examining and interpreting
 * funnel plot asymmetry in meta-analyses of randomised controlled trials.
 * BMJ. 2011;343:d4002.
 *
 * @param {Array} studies - Array of { yi, vi, ... } objects
 * @returns {object} Egger test results with power warning if k < 10
 */
export function eggerTest(studies) {
  const validStudies = studies.filter(s =>
    s.yi !== null && s.vi !== null &&
    !isNaN(s.yi) && !isNaN(s.vi) &&
    s.vi > 0
  );

  if (validStudies.length < 3) {
    return { error: 'Need at least 3 studies for Egger test' };
  }

  const k = validStudies.length;

  // Power warning for small meta-analyses
  const lowPowerWarning = k < 10
    ? 'Caution: Egger test has low statistical power with fewer than 10 studies. ' +
      'A non-significant result should not be interpreted as absence of publication bias. ' +
      'The Cochrane Handbook recommends against routine testing when k < 10.'
    : null;

  // Calculate standard errors
  const ses = validStudies.map(s => Math.sqrt(s.vi));

  // Standardized effect: yi / sei
  const z = validStudies.map((s, i) => s.yi / ses[i]);

  // Precision: 1 / sei
  const x = ses.map(se => 1 / se);

  // Weighted least squares regression (as per metafor)
  // z = intercept + slope * precision
  // Weight = 1/vi = 1/sei² (inverse variance)
  // This is more efficient than OLS and matches metafor's regtest()
  const weights = ses.map(se => 1 / (se * se));

  // Calculate regression coefficients
  const sumW = weights.reduce((a, b) => a + b, 0);
  const sumWX = weights.reduce((sum, w, i) => sum + w * x[i], 0);
  const sumWZ = weights.reduce((sum, w, i) => sum + w * z[i], 0);
  const sumWXX = weights.reduce((sum, w, i) => sum + w * x[i] * x[i], 0);
  const sumWXZ = weights.reduce((sum, w, i) => sum + w * x[i] * z[i], 0);

  const meanX = sumWX / sumW;
  const meanZ = sumWZ / sumW;

  // Slope and intercept
  const Sxx = sumWXX - sumW * meanX * meanX;
  const Sxz = sumWXZ - sumW * meanX * meanZ;

  const slope = Sxz / Sxx;
  const intercept = meanZ - slope * meanX;

  // Residuals and residual variance
  const residuals = z.map((zi, i) => zi - intercept - slope * x[i]);
  const sse = residuals.reduce((sum, r, i) => sum + weights[i] * r * r, 0);
  const mse = sse / (k - 2);

  // Standard errors of coefficients
  const seSlope = Math.sqrt(mse / Sxx);
  const seIntercept = Math.sqrt(mse * (1/sumW + meanX * meanX / Sxx));

  // T-test for intercept (main test of publication bias)
  const tIntercept = intercept / seIntercept;
  const df = k - 2;
  const pValue = 2 * (1 - tCDF(Math.abs(tIntercept), df));

  // Confidence interval for intercept
  const tCrit = tQuantile(0.975, df);
  const interceptCILower = intercept - tCrit * seIntercept;
  const interceptCIUpper = intercept + tCrit * seIntercept;

  // R-squared
  const sst = z.reduce((sum, zi) => sum + Math.pow(zi - meanZ, 2), 0);
  const r2 = 1 - sse / sst;

  return {
    test: 'Egger',
    k,
    intercept,
    seIntercept,
    interceptCILower,
    interceptCIUpper,
    slope,
    seSlope,
    t: tIntercept,
    df,
    pValue,
    r2,
    significant: pValue < 0.10,  // Typically use α = 0.10 for Egger
    interpretation: interpretEgger(pValue, intercept),
    lowPowerWarning,
    adequatePower: k >= 10
  };
}

/**
 * Modified Egger test using precision squared
 * More appropriate for ratio measures (OR, RR)
 */
export function eggerTestModified(studies) {
  const validStudies = studies.filter(s =>
    s.yi !== null && s.vi !== null &&
    !isNaN(s.yi) && !isNaN(s.vi) &&
    s.vi > 0
  );

  if (validStudies.length < 3) {
    return { error: 'Need at least 3 studies for modified Egger test' };
  }

  const k = validStudies.length;

  // Use variance instead of SE
  const vi = validStudies.map(s => s.vi);
  const yi = validStudies.map(s => s.yi);

  // Weighted regression: yi = intercept + slope * vi
  // Weight = 1 / vi
  const weights = vi.map(v => 1 / v);

  const sumW = weights.reduce((a, b) => a + b, 0);
  const sumWX = weights.reduce((sum, w, i) => sum + w * vi[i], 0);
  const sumWY = weights.reduce((sum, w, i) => sum + w * yi[i], 0);
  const sumWXX = weights.reduce((sum, w, i) => sum + w * vi[i] * vi[i], 0);
  const sumWXY = weights.reduce((sum, w, i) => sum + w * vi[i] * yi[i], 0);

  const meanX = sumWX / sumW;
  const meanY = sumWY / sumW;

  const Sxx = sumWXX - sumW * meanX * meanX;
  const Sxy = sumWXY - sumW * meanX * meanY;

  const slope = Sxy / Sxx;
  const intercept = meanY - slope * meanX;

  // Residual variance
  const residuals = yi.map((y, i) => y - intercept - slope * vi[i]);
  const sse = residuals.reduce((sum, r, i) => sum + weights[i] * r * r, 0);
  const mse = sse / (k - 2);

  const seIntercept = Math.sqrt(mse / sumW);
  const seSlope = Math.sqrt(mse / Sxx);

  const tIntercept = intercept / seIntercept;
  const df = k - 2;
  const pValue = 2 * (1 - tCDF(Math.abs(tIntercept), df));

  return {
    test: 'Egger-Modified',
    k,
    intercept,
    seIntercept,
    slope,
    seSlope,
    t: tIntercept,
    df,
    pValue,
    significant: pValue < 0.10
  };
}

/**
 * Begg and Mazumdar rank correlation test
 * Non-parametric test for publication bias using Kendall's tau-b
 *
 * Reference: Begg CB, Mazumdar M. Operating characteristics of a rank
 * correlation test for publication bias. Biometrics. 1994;50(4):1088-1101.
 *
 * This implementation uses the corrected variance formula that properly
 * adjusts for tied ranks, matching the original paper and metafor.
 */
export function beggTest(studies) {
  const validStudies = studies.filter(s =>
    s.yi !== null && s.vi !== null &&
    !isNaN(s.yi) && !isNaN(s.vi) &&
    s.vi > 0
  );

  if (validStudies.length < 3) {
    return { error: 'Need at least 3 studies for Begg test' };
  }

  const k = validStudies.length;

  // Calculate standardized residuals from pooled estimate
  const theta = validStudies.reduce((sum, s) => sum + s.yi / s.vi, 0) /
                validStudies.reduce((sum, s) => sum + 1 / s.vi, 0);

  const ses = validStudies.map(s => Math.sqrt(s.vi));
  const residuals = validStudies.map(s => s.yi - theta);
  const stdResiduals = residuals.map((r, i) => r / ses[i]);

  // Rank correlation between standardized residuals and variances
  const { ranks: ranks1, tieGroups: ties1 } = getRanksWithTies(stdResiduals);
  const { ranks: ranks2, tieGroups: ties2 } = getRanksWithTies(validStudies.map(s => s.vi));

  // Kendall's tau-b (adjusted for ties)
  let concordant = 0;
  let discordant = 0;
  let tiesOnlyX = 0;
  let tiesOnlyY = 0;

  for (let i = 0; i < k - 1; i++) {
    for (let j = i + 1; j < k; j++) {
      const diff1 = ranks1[i] - ranks1[j];
      const diff2 = ranks2[i] - ranks2[j];
      
      if (diff1 === 0 && diff2 === 0) {
        // Tied on both - doesn't count
      } else if (diff1 === 0) {
        tiesOnlyX++;
      } else if (diff2 === 0) {
        tiesOnlyY++;
      } else if (diff1 * diff2 > 0) {
        concordant++;
      } else {
        discordant++;
      }
    }
  }

  const n0 = k * (k - 1) / 2;
  const n1 = ties1.reduce((sum, t) => sum + t * (t - 1) / 2, 0);  // Sum of ties in X
  const n2 = ties2.reduce((sum, t) => sum + t * (t - 1) / 2, 0);  // Sum of ties in Y

  // Kendall's tau-b formula: (C - D) / sqrt((n0-n1)(n0-n2))
  const denominator = Math.sqrt((n0 - n1) * (n0 - n2));
  const tau = denominator > 0 ? (concordant - discordant) / denominator : 0;

  // Variance with tie correction (Kendall 1970, as used in metafor)
  // This is the proper correction for Begg's test
  const v0 = k * (k - 1) * (2 * k + 5);
  const vt = ties1.reduce((sum, t) => sum + t * (t - 1) * (2 * t + 5), 0);
  const vu = ties2.reduce((sum, t) => sum + t * (t - 1) * (2 * t + 5), 0);
  const v1 = ties1.reduce((sum, t) => sum + t * (t - 1), 0);
  const v2 = ties2.reduce((sum, t) => sum + t * (t - 1), 0);
  
  const varTauNumer = (v0 - vt - vu) / 18 +
    (v1 * v2) / (9 * k * (k - 1)) +
    (ties1.reduce((sum, t) => sum + t * (t - 1) * (t - 2), 0) *
     ties2.reduce((sum, t) => sum + t * (t - 1) * (t - 2), 0)) / (9 * k * (k - 1) * (k - 2));
  
  const varTau = varTauNumer / ((n0 - n1) * (n0 - n2));
  const seTau = Math.sqrt(varTau);
  const z = tau / seTau;
  const pValue = 2 * (1 - normalCDF(Math.abs(z)));

  return {
    test: 'Begg',
    k,
    tau,
    seTau,
    z,
    pValue,
    significant: pValue < 0.10,
    tieCorrection: n1 > 0 || n2 > 0,
    lowPowerWarning: k < 10
      ? 'Caution: Begg test has low power with fewer than 10 studies.'
      : null
  };
}

/**
 * Thompson-Sharp funnel plot regression
 * Regression of effect on SE
 */
export function thompsonSharpTest(studies) {
  const validStudies = studies.filter(s =>
    s.yi !== null && s.vi !== null &&
    !isNaN(s.yi) && !isNaN(s.vi) &&
    s.vi > 0
  );

  if (validStudies.length < 3) {
    return { error: 'Need at least 3 studies' };
  }

  const k = validStudies.length;
  const yi = validStudies.map(s => s.yi);
  const sei = validStudies.map(s => Math.sqrt(s.vi));

  // Weighted regression: yi = intercept + slope * sei
  const weights = sei.map(se => 1 / (se * se));

  const sumW = weights.reduce((a, b) => a + b, 0);
  const sumWX = weights.reduce((sum, w, i) => sum + w * sei[i], 0);
  const sumWY = weights.reduce((sum, w, i) => sum + w * yi[i], 0);
  const sumWXX = weights.reduce((sum, w, i) => sum + w * sei[i] * sei[i], 0);
  const sumWXY = weights.reduce((sum, w, i) => sum + w * sei[i] * yi[i], 0);

  const meanX = sumWX / sumW;
  const meanY = sumWY / sumW;

  const Sxx = sumWXX - sumW * meanX * meanX;
  const Sxy = sumWXY - sumW * meanX * meanY;

  const slope = Sxy / Sxx;
  const intercept = meanY - slope * meanX;

  // Standard errors
  const residuals = yi.map((y, i) => y - intercept - slope * sei[i]);
  const sse = residuals.reduce((sum, r, i) => sum + weights[i] * r * r, 0);
  const mse = sse / (k - 2);

  const seSlope = Math.sqrt(mse / Sxx);
  const tSlope = slope / seSlope;
  const df = k - 2;
  const pValue = 2 * (1 - tCDF(Math.abs(tSlope), df));

  return {
    test: 'Thompson-Sharp',
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

// Helper functions

function interpretEgger(pValue, intercept) {
  if (pValue >= 0.10) {
    return 'No evidence of funnel plot asymmetry';
  } else if (pValue >= 0.05) {
    const direction = intercept > 0 ? 'positive' : 'negative';
    return `Weak evidence of funnel plot asymmetry (${direction} direction)`;
  } else {
    const direction = intercept > 0 ? 'positive' : 'negative';
    return `Significant funnel plot asymmetry detected (${direction} direction), suggesting possible publication bias or small-study effects`;
  }
}

function getRanks(arr) {
  return getRanksWithTies(arr).ranks;
}

function getRanksWithTies(arr) {
  const sorted = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array(arr.length);
  const tieGroups = [];

  let i = 0;
  while (i < sorted.length) {
    let j = i;
    // Find ties
    while (j < sorted.length && sorted[j].v === sorted[i].v) j++;
    // Record tie group size
    const tieSize = j - i;
    if (tieSize > 1) {
      tieGroups.push(tieSize);
    }
    // Average rank for ties
    const avgRank = (i + j + 1) / 2;
    for (let k = i; k < j; k++) {
      ranks[sorted[k].i] = avgRank;
    }
    i = j;
  }

  return { ranks, tieGroups };
}

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

function tCDF(t, df) {
  const x = df / (df + t * t);
  const halfBeta = 0.5 * incompleteBeta(df / 2, 0.5, x);
  // For t >= 0: CDF = 1 - halfBeta, for t < 0: CDF = halfBeta
  return t >= 0 ? 1 - halfBeta : halfBeta;
}

function tQuantile(p, df) {
  let t = normalQuantile(p);

  for (let iter = 0; iter < 10; iter++) {
    const cdf = tCDF(t, df);
    const pdf = tPDF(t, df);
    if (Math.abs(pdf) < 1e-10) break;

    const diff = cdf - p;
    if (Math.abs(diff) < 1e-10) break;

    t = t - diff / pdf;
  }

  return t;
}

function tPDF(t, df) {
  const coef = Math.exp(gammaln((df + 1) / 2) - gammaln(df / 2)) /
               Math.sqrt(df * Math.PI);
  return coef * Math.pow(1 + t * t / df, -(df + 1) / 2);
}

function normalQuantile(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;

  const a = [-3.969683028665376e+01, 2.209460984245205e+02,
             -2.759285104469687e+02, 1.383577518672690e+02,
             -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02,
             -1.556989798598866e+02, 6.680131188771972e+01,
             -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01,
             -2.400758277161838e+00, -2.549732539343734e+00,
             4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01,
             2.445134137142996e+00, 3.754408661907416e+00];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let q, r;

  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
           ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  } else if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q /
           (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
            ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  }
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
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-10) break;
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

/**
 * Trim-and-Fill Method for Publication Bias Adjustment
 *
 * Estimates the number of missing studies and imputes them to create
 * an adjusted pooled estimate.
 *
 * Reference: Duval S, Tweedie R. Trim and fill: A simple funnel-plot-based
 * method of testing and adjusting for publication bias in meta-analysis.
 * Biometrics. 2000;56(2):455-463.
 *
 * @param {Array} studies - Array of { yi, vi, ... } objects
 * @param {object} options - { side: 'auto'|'left'|'right', maxIter: 100, estimator: 'L0' }
 * @returns {object} Trim-and-fill results with adjusted estimate
 */
export function trimAndFill(studies, options = {}) {
  const { side = 'auto', maxIter = 100, estimator = 'L0' } = options;

  const validStudies = studies.filter(s =>
    s.yi !== null && s.vi !== null &&
    !isNaN(s.yi) && !isNaN(s.vi) &&
    s.vi > 0
  );

  if (validStudies.length < 3) {
    return { error: 'Need at least 3 studies for trim-and-fill' };
  }

  const k = validStudies.length;

  // Calculate initial pooled estimate (fixed effect)
  function calcPooled(data) {
    const sumW = data.reduce((s, d) => s + 1/d.vi, 0);
    const sumWY = data.reduce((s, d) => s + d.yi/d.vi, 0);
    return sumWY / sumW;
  }

  // Initial pooled estimate
  let theta0 = calcPooled(validStudies);

  // Determine side for imputation
  let fillSide = side;
  if (side === 'auto') {
    // Count studies on each side of the pooled estimate
    const leftCount = validStudies.filter(s => s.yi < theta0).length;
    const rightCount = validStudies.filter(s => s.yi > theta0).length;
    // Assume missing studies are on the side with fewer studies
    fillSide = leftCount < rightCount ? 'left' : 'right';
  }

  // Iterative trim-and-fill procedure
  let k0 = 0;  // Number of imputed studies
  let trimmedStudies = [...validStudies];
  let converged = false;
  let iterations = 0;

  for (let iter = 0; iter < maxIter; iter++) {
    iterations = iter + 1;

    // Current pooled estimate
    const thetaCurrent = calcPooled(trimmedStudies);

    // Calculate residuals (distance from pooled estimate on the effect scale)
    const residuals = validStudies.map(s => ({
      ...s,
      resid: s.yi - thetaCurrent,
      absResid: Math.abs(s.yi - thetaCurrent)
    }));

    // Sort by absolute residual (largest first)
    residuals.sort((a, b) => b.absResid - a.absResid);

    // Identify studies on the extreme side
    const extremeStudies = residuals.filter(s =>
      fillSide === 'left' ? s.resid < 0 : s.resid > 0
    );

    // Estimate k0 using L0 estimator (Duval & Tweedie, 2000)
    // L0 = (4S - k) / 2 where S = sum of ranks of extreme studies
    // For the R0 estimator: R0 = k - 1 - 2*R where R is the number of studies
    // on the less extreme side

    let k0New;
    if (estimator === 'L0') {
      // L0 estimator
      // Rank studies by their absolute distance from the center
      const ranked = [...residuals].sort((a, b) => a.absResid - b.absResid);
      const rankMap = new Map();
      ranked.forEach((s, i) => rankMap.set(s, i + 1));

      // Sum of ranks for extreme studies (those on the fill side)
      const S = extremeStudies.reduce((sum, s) => sum + rankMap.get(s), 0);
      k0New = Math.max(0, Math.round((4 * S - k * (k + 1)) / (2 * k)));
    } else {
      // R0 estimator (simpler)
      const nExtreme = extremeStudies.length;
      const nOther = k - nExtreme;
      k0New = Math.max(0, Math.round(nExtreme - nOther));
    }

    // Check convergence
    if (k0New === k0) {
      converged = true;
      break;
    }

    k0 = k0New;

    // Trim the k0 most extreme studies on the fill side
    const studiesToTrim = extremeStudies.slice(0, k0);
    const trimmedIds = new Set(studiesToTrim.map(s => s.id || studies.indexOf(s)));

    trimmedStudies = validStudies.filter(s => {
      const id = s.id || studies.indexOf(s);
      return !trimmedIds.has(id);
    });

    if (trimmedStudies.length < 2) {
      break;  // Can't trim more
    }
  }

  // Final pooled estimate from trimmed data
  const thetaTrimmed = calcPooled(trimmedStudies);

  // Create imputed (filled) studies by reflecting across the trimmed mean
  const filledStudies = [];
  if (k0 > 0) {
    // Sort by distance from trimmed mean
    const sorted = [...validStudies].sort((a, b) => {
      const distA = Math.abs(a.yi - thetaTrimmed);
      const distB = Math.abs(b.yi - thetaTrimmed);
      return distB - distA;
    });

    // Take the k0 most extreme studies on the fill side
    const extremeForFill = sorted.filter(s =>
      fillSide === 'left' ? s.yi < thetaTrimmed : s.yi > thetaTrimmed
    ).slice(0, k0);

    // Reflect them across the trimmed mean
    for (const s of extremeForFill) {
      const reflectedYi = 2 * thetaTrimmed - s.yi;
      filledStudies.push({
        yi: reflectedYi,
        vi: s.vi,  // Same variance as the reflected study
        imputed: true,
        originalId: s.id || 'imputed'
      });
    }
  }

  // Combined dataset with filled studies
  const combinedStudies = [...validStudies, ...filledStudies];

  // Adjusted pooled estimate
  const thetaAdjusted = calcPooled(combinedStudies);
  const sumWCombined = combinedStudies.reduce((s, d) => s + 1/d.vi, 0);
  const seAdjusted = Math.sqrt(1 / sumWCombined);

  // Original pooled estimate for comparison
  const sumWOriginal = validStudies.reduce((s, d) => s + 1/d.vi, 0);
  const seOriginal = Math.sqrt(1 / sumWOriginal);

  return {
    test: 'Trim-and-Fill',
    k,
    k0,  // Number of imputed studies
    side: fillSide,
    estimator,
    converged,
    iterations,
    original: {
      theta: theta0,
      se: seOriginal,
      ci_lower: theta0 - 1.96 * seOriginal,
      ci_upper: theta0 + 1.96 * seOriginal
    },
    adjusted: {
      theta: thetaAdjusted,
      se: seAdjusted,
      ci_lower: thetaAdjusted - 1.96 * seAdjusted,
      ci_upper: thetaAdjusted + 1.96 * seAdjusted,
      kTotal: combinedStudies.length
    },
    filledStudies,
    interpretation: interpretTrimAndFill(k0, theta0, thetaAdjusted, fillSide)
  };
}

/**
 * Interpret trim-and-fill results
 */
function interpretTrimAndFill(k0, thetaOriginal, thetaAdjusted, side) {
  if (k0 === 0) {
    return 'No asymmetry detected; no studies imputed.';
  }

  const direction = side === 'left' ? 'smaller' : 'larger';
  const change = Math.abs(thetaAdjusted - thetaOriginal);
  const percentChange = Math.abs((thetaAdjusted - thetaOriginal) / thetaOriginal) * 100;

  let severity;
  if (percentChange < 10) {
    severity = 'minimal';
  } else if (percentChange < 25) {
    severity = 'moderate';
  } else {
    severity = 'substantial';
  }

  return `${k0} studies imputed on the ${side} side (suggesting missing studies with ${direction} effects). ` +
         `The adjusted estimate shows a ${severity} change (${percentChange.toFixed(1)}% shift). ` +
         `This suggests potential publication bias, though trim-and-fill assumes a specific mechanism ` +
         `and should be interpreted cautiously.`;
}

/**
 * Fail-safe N (Rosenthal's method)
 * Number of null studies needed to make the effect non-significant
 *
 * Reference: Rosenthal R. The file drawer problem and tolerance for null results.
 * Psychological Bulletin. 1979;86(3):638-641.
 */
export function failSafeN(studies, alpha = 0.05) {
  const validStudies = studies.filter(s =>
    s.yi !== null && s.vi !== null &&
    !isNaN(s.yi) && !isNaN(s.vi) &&
    s.vi > 0
  );

  if (validStudies.length < 2) {
    return { error: 'Need at least 2 studies' };
  }

  const k = validStudies.length;

  // Calculate z-scores for each study
  const zScores = validStudies.map(s => s.yi / Math.sqrt(s.vi));
  const sumZ = zScores.reduce((a, b) => a + b, 0);
  const meanZ = sumZ / k;

  // Critical z value
  const zCrit = normalQuantile(1 - alpha / 2);

  // Rosenthal's formula: nfs = k * (mean(z) / zCrit)^2 - k
  const nfs = Math.max(0, k * Math.pow(meanZ / zCrit, 2) - k);

  // Orwin's fail-safe N (for SMD, assuming target d = 0.1)
  const targetEffect = 0.1;
  const meanEffect = validStudies.reduce((s, d) => s + d.yi, 0) / k;
  const nfsOrwin = Math.max(0, k * (meanEffect / targetEffect - 1));

  return {
    test: 'Fail-safe N',
    k,
    rosenthal: {
      nfs: Math.round(nfs),
      sumZ,
      meanZ,
      interpretation: nfs > 5 * k + 10
        ? 'Result is robust (exceeds 5k+10 threshold)'
        : 'Result may not be robust to publication bias'
    },
    orwin: {
      nfs: Math.round(nfsOrwin),
      targetEffect,
      meanEffect,
      interpretation: `Number of null studies to reduce mean effect to ${targetEffect}`
    }
  };
}

export default {
  eggerTest,
  eggerTestModified,
  beggTest,
  thompsonSharpTest,
  trimAndFill,
  failSafeN
};
