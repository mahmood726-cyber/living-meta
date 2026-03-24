/**
 * Random Effects Meta-Analysis
 * Implements DerSimonian-Laird and Paule-Mandel estimators
 *
 * OPTIMIZED: Uses computeMAState for single-pass calculations
 */

import { fixedEffects } from './meta-fe.js';
import { computeMAState } from './meta-cache.js';

/**
 * DerSimonian-Laird random effects meta-analysis
 * @param {Array} studies - Array of { yi, vi, ... } objects
 * @param {object} options - { hksj: true/false }
 * @returns {object} Random effects results
 */
export function derSimonianLaird(studies, options = {}) {
  const { hksj = true } = options;

  // Filter valid studies
  const validStudies = studies.filter(s =>
    s.yi !== null && s.vi !== null &&
    !isNaN(s.yi) && !isNaN(s.vi) &&
    s.vi > 0
  );

  if (validStudies.length === 0) {
    return { error: 'No valid studies' };
  }

  // Use optimized single-pass calculation - gets FE, RE, tau², Q, I² all at once
  const state = computeMAState(validStudies);
  const {
    k,
    thetaFE,
    seFE,
    thetaRE: theta,
    seRE,
    reWeights: wiStar,
    reTotalWeight: sumWiStar,
    tau2,
    Q,
    I2: stateI2,
    totalWeight: sumWi
  } = state;

  // Use let for SE since HKSJ adjustment may modify it
  let se = seRE;

  // Get FE result for output (uses same cached state internally)
  const fe = fixedEffects(validStudies);

  // Variance of pooled estimate
  const variance = 1 / sumWiStar;

  // Standard confidence interval
  let ci_lower = theta - 1.96 * se;
  let ci_upper = theta + 1.96 * se;

  // HKSJ adjustment
  let hksjApplied = false;
  let qStar = null;
  let tCrit = null;

  if (hksj && k >= 2) {
    // Q* statistic with RE weights
    qStar = validStudies.reduce((sum, s, i) => {
      return sum + wiStar[i] * Math.pow(s.yi - theta, 2);
    }, 0);

    // HKSJ variance multiplier
    const hksjMultiplier = qStar / (k - 1);

    // Apply HKSJ if it doesn't narrow CI (conservative approach)
    if (hksjMultiplier > 1) {
      se = se * Math.sqrt(hksjMultiplier);
      hksjApplied = true;
    }

    // Use t-distribution with df = k - 1
    tCrit = tQuantile(0.975, k - 1);
    ci_lower = theta - tCrit * se;
    ci_upper = theta + tCrit * se;
  }

  // Prediction interval (df = k - 2 per metafor default)
  // Uses k-2 because we estimate both mean (θ) and variance (τ²)
  // Reference: Higgins, Thompson & Spiegelhalter (2009); IntHout et al. (2016)
  let pi_lower = null;
  let pi_upper = null;

  if (k >= 3) {
    const piDF = k - 2;
    const piTCrit = tQuantile(0.975, piDF);
    const piSE = Math.sqrt(variance + tau2);
    pi_lower = theta - piTCrit * piSE;
    pi_upper = theta + piTCrit * piSE;
  }

  // Z-test for overall effect
  const zTest = theta / se;
  const pValue = hksj
    ? 2 * (1 - tCDF(Math.abs(zTest), k - 1))
    : 2 * (1 - normalCDF(Math.abs(zTest)));

  // τ (standard deviation of true effects)
  const tau = Math.sqrt(tau2);

  // I² calculated correctly for RE models using τ² / (τ² + typical_variance)
  // This is the proper RE-based I², not reusing FE I²
  // Reference: Higgins & Thompson (2002), Borenstein et al. (2009)
  const typicalVariance = variance;  // 1/Σw* is the typical sampling variance under RE
  const I2 = tau2 > 0 ? (tau2 / (tau2 + typicalVariance)) * 100 : 0;
  const I2CI = i2ConfidenceInterval(fe.Q, k);

  // H² statistic
  // H² statistic: H² = τ²/σ² + 1 where σ² is the typical within-study variance
  const H2 = tau2 > 0 ? 1 + tau2 / typicalVariance : 1;

  return {
    model: 'RE-DL',
    k,
    theta,
    se,
    variance,
    ci_lower,
    ci_upper,
    z: zTest,
    pValue,
    tau2,
    tau,
    pi_lower,
    pi_upper,
    Q: fe.Q,
    df: k - 1,
    pQ: fe.pQ,
    I2,
    I2_lower: I2CI.lower,
    I2_upper: I2CI.upper,
    H2,
    hksj: hksjApplied,
    qStar,
    weights: validStudies.map((s, i) => ({
      id: s.id || s.nctId || i,
      yi: s.yi,
      vi: s.vi,
      weight: state.reWeights[i],
      weightPercent: (state.reWeights[i] / sumWiStar) * 100
    })),
    fe: {
      theta: fe.theta,
      se: fe.se,
      ci_lower: fe.ci_lower,
      ci_upper: fe.ci_upper
    }
  };
}

/**
 * Paule-Mandel estimator for τ²
 *
 * Uses bisection root-finding to solve Q*(τ²) = k-1
 * This is the correct PM algorithm per Paule & Mandel (1982)
 *
 * Reference: Paule RC, Mandel J (1982). Consensus values and weighting factors.
 *            J Res Natl Bur Stand 87:377-385
 *
 * @param {Array} studies - Array of { yi, vi, ... } objects
 * @param {object} options - { maxIter: 100, tol: 1e-8, hksj: true }
 */
export function pauleMandel(studies, options = {}) {
  const { maxIter = 100, tol = 1e-8, hksj = true } = options;

  const validStudies = studies.filter(s =>
    s.yi !== null && s.vi !== null &&
    !isNaN(s.yi) && !isNaN(s.vi) &&
    s.vi > 0
  );

  if (validStudies.length === 0) {
    return { error: 'No valid studies' };
  }

  const k = validStudies.length;
  const target = k - 1; // Q*(τ²) should equal k-1

  // Helper function: compute Q* for a given τ²
  function computeQstar(tau2) {
    const wi = validStudies.map(s => 1 / (s.vi + tau2));
    const sumWi = wi.reduce((a, b) => a + b, 0);
    const theta = validStudies.reduce((sum, s, i) => sum + wi[i] * s.yi, 0) / sumWi;
    return validStudies.reduce((sum, s, i) => {
      return sum + wi[i] * Math.pow(s.yi - theta, 2);
    }, 0);
  }

  // Check if τ² = 0 is the solution (Q* at τ²=0 ≤ k-1)
  const Q0 = computeQstar(0);
  let tau2 = 0;
  let converged = true;

  if (Q0 > target) {
    // Need positive τ² - use bisection to find root of Q*(τ²) - (k-1) = 0

    // Find upper bound where Q* < k-1
    let lower = 0;
    let upper = 1;
    while (computeQstar(upper) > target && upper < 1e10) {
      upper *= 2;
    }

    if (upper >= 1e10) {
      // Fallback to DL if we can't find bounds
      const dlResult = derSimonianLaird(validStudies, { hksj: false });
      tau2 = dlResult.tau2;
      converged = false;
    } else {
      // Bisection search
      converged = false;
      for (let iter = 0; iter < maxIter; iter++) {
        tau2 = (lower + upper) / 2;
        const Qmid = computeQstar(tau2);

        if (Math.abs(Qmid - target) < tol) {
          converged = true;
          break;
        }

        if (Qmid > target) {
          lower = tau2;
        } else {
          upper = tau2;
        }

        // Also check interval width
        if (upper - lower < tol) {
          converged = true;
          break;
        }
      }
    }
  }

  // Calculate final estimates with converged τ²
  const wiStar = validStudies.map(s => 1 / (s.vi + tau2));
  const sumWiStar = wiStar.reduce((a, b) => a + b, 0);
  const theta = validStudies.reduce((sum, s, i) => sum + wiStar[i] * s.yi, 0) / sumWiStar;
  const variance = 1 / sumWiStar;
  let se = Math.sqrt(variance);

  // Get FE Q for I² calculation
  const dlResult = derSimonianLaird(validStudies, { hksj: false });

  // Apply HKSJ if requested
  let ci_lower, ci_upper;
  let hksjApplied = false;
  if (hksj && k >= 2) {
    const qStar = computeQstar(tau2);
    const hksjMult = qStar / (k - 1);
    if (hksjMult > 1) {
      se = se * Math.sqrt(hksjMult);
      hksjApplied = true;
    }
    const tCrit = tQuantile(0.975, k - 1);
    ci_lower = theta - tCrit * se;
    ci_upper = theta + tCrit * se;
  } else {
    ci_lower = theta - 1.96 * se;
    ci_upper = theta + 1.96 * se;
  }

  // Prediction interval
  let pi_lower = null, pi_upper = null;
  if (k >= 3) {
    const piTCrit = tQuantile(0.975, k - 2);
    const piSE = Math.sqrt(variance + tau2);
    pi_lower = theta - piTCrit * piSE;
    pi_upper = theta + piTCrit * piSE;
  }

  // I² from PM τ²
  const I2 = tau2 > 0 ? (tau2 / (tau2 + variance)) * 100 : 0;

  return {
    model: 'RE-PM',
    estimator: 'Paule-Mandel',
    k,
    theta,
    se,
    variance,
    ci_lower,
    ci_upper,
    tau2,
    tau: Math.sqrt(tau2),
    pi_lower,
    pi_upper,
    converged,
    hksj: hksjApplied,
    Q: dlResult.Q,
    I2,
    weights: validStudies.map((s, i) => ({
      id: s.id || s.nctId || i,
      yi: s.yi,
      vi: s.vi,
      weight: wiStar[i],
      weightPercent: (wiStar[i] / sumWiStar) * 100
    }))
  };
}

/**
 * REML (Restricted Maximum Likelihood) estimator for τ²
 *
 * Uses Fisher scoring algorithm (Newton-Raphson with expected information)
 * This matches metafor's REML implementation.
 *
 * Reference: Viechtbauer W (2005). Bias and efficiency of meta-analytic
 *            variance estimators in the random-effects model.
 *            J Educ Behav Stat 30:261-293
 *
 * @param {Array} studies - Array of { yi, vi, ... } objects
 * @param {object} options - { maxIter: 100, tol: 1e-8, hksj: true }
 */
export function reml(studies, options = {}) {
  const { maxIter = 100, tol = 1e-8, hksj = true } = options;

  const validStudies = studies.filter(s =>
    s.yi !== null && s.vi !== null &&
    !isNaN(s.yi) && !isNaN(s.vi) &&
    s.vi > 0
  );

  if (validStudies.length === 0) {
    return { error: 'No valid studies' };
  }

  const k = validStudies.length;
  const yi = validStudies.map(s => s.yi);
  const vi = validStudies.map(s => s.vi);

  // Start with DL estimate as initial value
  const dlResult = derSimonianLaird(validStudies, { hksj: false });
  let tau2 = Math.max(0, dlResult.tau2);

  // Fisher scoring iteration
  let converged = false;
  let iter = 0;

  for (iter = 0; iter < maxIter; iter++) {
    // Weights with current τ²
    const wi = vi.map(v => 1 / (v + tau2));
    const sumWi = wi.reduce((a, b) => a + b, 0);

    // Weighted mean
    const theta = yi.reduce((sum, y, i) => sum + wi[i] * y, 0) / sumWi;

    // First derivative of REML log-likelihood
    // d(ll)/d(τ²) = -0.5 * Σw_i + 0.5 * Σw_i²(y_i - θ)² - 0.5 * (Σw_i² / Σw_i)
    let sumW2 = 0;
    let sumW2resid = 0;
    for (let i = 0; i < k; i++) {
      sumW2 += wi[i] * wi[i];
      sumW2resid += wi[i] * wi[i] * Math.pow(yi[i] - theta, 2);
    }

    const deriv1 = -0.5 * sumWi + 0.5 * sumW2resid + 0.5 * (sumW2 / sumWi);

    // Expected Fisher information (negative second derivative)
    // I(τ²) = 0.5 * (Σw_i² - Σw_i³/Σw_i - (Σw_i² - Σw_i³/Σw_i)/k)
    // Simplified: I(τ²) ≈ 0.5 * Σw_i² * (1 - 1/k)
    let sumW3 = 0;
    for (let i = 0; i < k; i++) {
      sumW3 += wi[i] * wi[i] * wi[i];
    }

    const fisherInfo = 0.5 * (sumW2 - sumW3 / sumWi);

    if (fisherInfo <= 0) {
      // Fallback if Fisher info is non-positive
      break;
    }

    // Fisher scoring update: τ²_new = τ²_old + deriv1 / fisherInfo
    const tau2New = tau2 + deriv1 / fisherInfo;

    // Ensure non-negative
    const tau2Bounded = Math.max(0, tau2New);

    // Check convergence
    if (Math.abs(tau2Bounded - tau2) < tol) {
      tau2 = tau2Bounded;
      converged = true;
      break;
    }

    tau2 = tau2Bounded;
  }

  // Calculate final estimates
  const wiStar = vi.map(v => 1 / (v + tau2));
  const sumWiStar = wiStar.reduce((a, b) => a + b, 0);
  const theta = yi.reduce((sum, y, i) => sum + wiStar[i] * y, 0) / sumWiStar;
  const variance = 1 / sumWiStar;
  let se = Math.sqrt(variance);

  // Apply HKSJ if requested
  let ci_lower, ci_upper;
  let hksjApplied = false;
  if (hksj && k >= 2) {
    const qStar = yi.reduce((sum, y, i) => {
      return sum + wiStar[i] * Math.pow(y - theta, 2);
    }, 0);
    const hksjMult = qStar / (k - 1);
    if (hksjMult > 1) {
      se = se * Math.sqrt(hksjMult);
      hksjApplied = true;
    }
    const tCrit = tQuantile(0.975, k - 1);
    ci_lower = theta - tCrit * se;
    ci_upper = theta + tCrit * se;
  } else {
    ci_lower = theta - 1.96 * se;
    ci_upper = theta + 1.96 * se;
  }

  // Prediction interval
  let pi_lower = null, pi_upper = null;
  if (k >= 3) {
    const piTCrit = tQuantile(0.975, k - 2);
    const piSE = Math.sqrt(variance + tau2);
    pi_lower = theta - piTCrit * piSE;
    pi_upper = theta + piTCrit * piSE;
  }

  // I²
  const I2 = tau2 > 0 ? (tau2 / (tau2 + variance)) * 100 : 0;
  const I2CI = i2ConfidenceInterval(dlResult.Q, k);

  // Z-test for overall effect
  const zTest = theta / se;
  const pValue = hksj
    ? 2 * (1 - tCDF(Math.abs(zTest), k - 1))
    : 2 * (1 - normalCDF(Math.abs(zTest)));

  return {
    model: 'RE-REML',
    estimator: 'REML',
    k,
    theta,
    se,
    variance,
    ci_lower,
    ci_upper,
    z: zTest,
    pValue,
    tau2,
    tau: Math.sqrt(tau2),
    pi_lower,
    pi_upper,
    converged,
    iterations: iter + 1,
    hksj: hksjApplied,
    Q: dlResult.Q,
    df: k - 1,
    pQ: dlResult.pQ,
    I2,
    I2_lower: I2CI.lower,
    I2_upper: I2CI.upper,
    weights: validStudies.map((s, i) => ({
      id: s.id || s.nctId || i,
      yi: s.yi,
      vi: s.vi,
      weight: wiStar[i],
      weightPercent: (wiStar[i] / sumWiStar) * 100
    })),
    fe: {
      theta: dlResult.fe.theta,
      se: dlResult.fe.se,
      ci_lower: dlResult.fe.ci_lower,
      ci_upper: dlResult.fe.ci_upper
    }
  };
}

/**
 * Leave-one-out analysis for random effects
 */
export function leaveOneOutRE(studies, method = 'DL') {
  const validStudies = studies.filter(s =>
    s.yi !== null && s.vi !== null &&
    !isNaN(s.yi) && !isNaN(s.vi) &&
    s.vi > 0
  );

  if (validStudies.length < 2) {
    return { error: 'Need at least 2 studies' };
  }

  const analysisFn = method === 'PM' ? pauleMandel : derSimonianLaird;

  return validStudies.map((omitted, i) => {
    const remaining = validStudies.filter((_, j) => j !== i);
    const result = analysisFn(remaining);

    return {
      omitted: omitted.id || omitted.nctId || `Study ${i + 1}`,
      omittedYi: omitted.yi,
      theta: result.theta,
      se: result.se,
      ci_lower: result.ci_lower,
      ci_upper: result.ci_upper,
      tau2: result.tau2,
      I2: result.I2
    };
  });
}

/**
 * Cumulative meta-analysis with random effects
 */
export function cumulativeMetaRE(studies, orderBy = 'order', method = 'DL') {
  const validStudies = studies.filter(s =>
    s.yi !== null && s.vi !== null &&
    !isNaN(s.yi) && !isNaN(s.vi) &&
    s.vi > 0
  );

  if (validStudies.length === 0) {
    return { error: 'No valid studies' };
  }

  const sorted = [...validStudies].sort((a, b) => {
    const aVal = a[orderBy] || 0;
    const bVal = b[orderBy] || 0;
    return aVal - bVal;
  });

  const analysisFn = method === 'PM' ? pauleMandel : derSimonianLaird;
  const results = [];

  for (let i = 0; i < sorted.length; i++) {
    if (i === 0) {
      // Single study - no pooling possible
      results.push({
        k: 1,
        addedStudy: sorted[i].id || sorted[i].nctId,
        theta: sorted[i].yi,
        se: Math.sqrt(sorted[i].vi),
        ci_lower: sorted[i].yi - 1.96 * Math.sqrt(sorted[i].vi),
        ci_upper: sorted[i].yi + 1.96 * Math.sqrt(sorted[i].vi),
        tau2: 0,
        I2: 0
      });
    } else {
      const subset = sorted.slice(0, i + 1);
      const result = analysisFn(subset);

      results.push({
        k: i + 1,
        addedStudy: sorted[i].id || sorted[i].nctId,
        orderValue: sorted[i][orderBy],
        theta: result.theta,
        se: result.se,
        ci_lower: result.ci_lower,
        ci_upper: result.ci_upper,
        tau2: result.tau2,
        I2: result.I2
      });
    }
  }

  return results;
}

// Statistical helper functions

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
  // Approximation using incomplete beta function
  // Must handle negative t correctly: CDF(t) = 1 - CDF(-t) for symmetric distribution
  const x = df / (df + t * t);
  const halfBeta = 0.5 * incompleteBeta(df / 2, 0.5, x);
  // For t >= 0: CDF = 1 - halfBeta, for t < 0: CDF = halfBeta
  return t >= 0 ? 1 - halfBeta : halfBeta;
}

function tQuantile(p, df) {
  // Newton-Raphson iteration for t quantile
  // Start with normal approximation
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
  // Approximation of inverse normal CDF
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;

  const a = [
    -3.969683028665376e+01, 2.209460984245205e+02,
    -2.759285104469687e+02, 1.383577518672690e+02,
    -3.066479806614716e+01, 2.506628277459239e+00
  ];
  const b = [
    -5.447609879822406e+01, 1.615858368580409e+02,
    -1.556989798598866e+02, 6.680131188771972e+01,
    -1.328068155288572e+01
  ];
  const c = [
    -7.784894002430293e-03, -3.223964580411365e-01,
    -2.400758277161838e+00, -2.549732539343734e+00,
    4.374664141464968e+00, 2.938163982698783e+00
  ];
  const d = [
    7.784695709041462e-03, 3.224671290700398e-01,
    2.445134137142996e+00, 3.754408661907416e+00
  ];

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
  // Regularized incomplete beta function
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
  const eps = 1e-10;

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
    if (Math.abs(del - 1) < eps) break;
  }

  return h;
}

function gammaln(x) {
  const coef = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5
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

/**
 * Confidence interval for I² using Q distribution
 */
function i2ConfidenceInterval(Q, k) {
  if (k < 2) return { lower: 0, upper: 0 };

  const df = k - 1;

  // Use chi-square quantiles for Q
  const qLower = chiSquareQuantile(0.025, df);
  const qUpper = chiSquareQuantile(0.975, df);

  // I² = (Q - df) / Q
  // CI for I² from CI for Q
  let lower = Q > qUpper ? ((Q - qUpper) / Q) * 100 : 0;
  let upper = Q > qLower ? ((Q - qLower) / Q) * 100 : 0;

  // Ensure bounds
  lower = Math.max(0, Math.min(100, lower));
  upper = Math.max(0, Math.min(100, upper));

  return { lower, upper };
}

function chiSquareQuantile(p, df) {
  // Newton-Raphson for chi-square quantile
  let x = df; // Starting guess

  for (let iter = 0; iter < 20; iter++) {
    const cdf = chiSquareCDF(x, df);
    const pdf = chiSquarePDF(x, df);
    if (pdf < 1e-10) break;

    const diff = cdf - p;
    if (Math.abs(diff) < 1e-8) break;

    x = Math.max(0.001, x - diff / pdf);
  }

  return x;
}

function chiSquareCDF(x, df) {
  if (x <= 0) return 0;
  return gammainc(df / 2, x / 2);
}

function chiSquarePDF(x, df) {
  if (x <= 0) return 0;
  const k = df / 2;
  return Math.pow(x, k - 1) * Math.exp(-x / 2) / (Math.pow(2, k) * Math.exp(gammaln(k)));
}

function gammainc(a, x) {
  if (x === 0) return 0;
  if (x < 0 || a <= 0) return NaN;

  if (x < a + 1) {
    let sum = 1 / a;
    let term = 1 / a;
    for (let n = 1; n < 100; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < 1e-10 * Math.abs(sum)) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - gammaln(a));
  } else {
    return 1 - gammainc_upper(a, x);
  }
}

function gammainc_upper(a, x) {
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

export default {
  derSimonianLaird,
  pauleMandel,
  reml,
  leaveOneOutRE,
  cumulativeMetaRE
};
