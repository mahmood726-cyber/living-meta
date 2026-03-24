/**
 * Complete Heterogeneity Estimators Library
 * Implements ALL tau² estimators from metafor plus additional methods
 *
 * Estimators: DL, HE, HS, HSk, SJ, ML, REML, EB, PM, PMM, GENQ, GENQM
 */

// ============================================================================
// STATISTICAL UTILITIES
// ============================================================================

function qchisq(p, df) {
  // Wilson-Hilferty approximation for chi-square quantile
  if (df <= 0) return NaN;
  if (p <= 0) return 0;
  if (p >= 1) return Infinity;

  // For small df, use Newton-Raphson
  if (df < 2) {
    let x = df;
    for (let i = 0; i < 50; i++) {
      const fx = pchisq(x, df) - p;
      const fpx = dchisq(x, df);
      if (Math.abs(fx) < 1e-10 || fpx === 0) break;
      x = Math.max(0.001, x - fx / fpx);
    }
    return x;
  }

  // Wilson-Hilferty for larger df
  const z = qnorm(p);
  const h = 2 / (9 * df);
  let x = df * Math.pow(1 - h + z * Math.sqrt(h), 3);
  return Math.max(0, x);
}

function pchisq(x, df) {
  if (x <= 0) return 0;
  return gammainc(df / 2, x / 2);
}

function dchisq(x, df) {
  if (x <= 0) return 0;
  const k = df / 2;
  return Math.pow(x, k - 1) * Math.exp(-x / 2) / (Math.pow(2, k) * gamma(k));
}

function gammainc(a, x) {
  // Lower incomplete gamma function / gamma(a)
  if (x < 0 || a <= 0) return NaN;
  if (x === 0) return 0;

  if (x < a + 1) {
    // Series expansion
    let sum = 1 / a;
    let term = 1 / a;
    for (let n = 1; n < 200; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < 1e-14 * Math.abs(sum)) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - lgamma(a));
  } else {
    // Continued fraction
    return 1 - gammainc_upper(a, x);
  }
}

function gammainc_upper(a, x) {
  // Upper incomplete gamma via continued fraction
  let f = 1e-30;
  let c = 1e-30;
  let d = 0;

  for (let i = 1; i < 200; i++) {
    const an = (i % 2 === 1) ? ((i + 1) / 2 - a) : (i / 2);
    const bn = (i % 2 === 1) ? 1 : x;
    d = bn + an * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = bn + an / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const delta = c * d;
    f *= delta;
    if (Math.abs(delta - 1) < 1e-10) break;
  }

  return Math.exp(-x + a * Math.log(x) - lgamma(a)) * f / a;
}

function lgamma(x) {
  // Log gamma function
  const c = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5
  ];

  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;

  for (let j = 0; j < 6; j++) {
    ser += c[j] / ++y;
  }

  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

function gamma(x) {
  return Math.exp(lgamma(x));
}

function qnorm(p) {
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

// ============================================================================
// CORE HETEROGENEITY CALCULATIONS
// ============================================================================

/**
 * Calculate Q statistic and related quantities
 */
function calculateQ(yi, vi, weights = null) {
  const k = yi.length;
  if (k < 2) return { Q: 0, df: 0, pvalue: 1 };

  // Default inverse-variance weights
  const w = weights || vi.map(v => 1 / v);
  const sumW = w.reduce((a, b) => a + b, 0);

  // Weighted mean
  const thetaFE = w.reduce((sum, wi, i) => sum + wi * yi[i], 0) / sumW;

  // Q statistic
  const Q = w.reduce((sum, wi, i) => sum + wi * (yi[i] - thetaFE) ** 2, 0);
  const df = k - 1;
  const pvalue = 1 - pchisq(Q, df);

  // Additional quantities for tau² estimators
  const sumW2 = w.reduce((sum, wi) => sum + wi * wi, 0);
  const C = sumW - sumW2 / sumW;

  return { Q, df, pvalue, thetaFE, sumW, sumW2, C, w };
}

// ============================================================================
// TAU² ESTIMATORS
// ============================================================================

/**
 * DL - DerSimonian-Laird Estimator
 * The most commonly used method-of-moments estimator
 */
export function tauDL(yi, vi) {
  const { Q, df, C } = calculateQ(yi, vi);

  let tau2 = Math.max(0, (Q - df) / C);

  return {
    tau2,
    tau: Math.sqrt(tau2),
    method: 'DL',
    Q, df,
    se_tau2: null // DL doesn't provide SE directly
  };
}

/**
 * HE - Hedges Estimator (also known as VC or Cochran)
 * Unbiased estimator based on weighted residuals
 */
export function tauHE(yi, vi) {
  const k = yi.length;
  if (k < 2) return { tau2: 0, tau: 0, method: 'HE' };

  // Unweighted mean
  const thetaBar = yi.reduce((a, b) => a + b, 0) / k;

  // Sum of squared deviations from unweighted mean
  const SS = yi.reduce((sum, y) => sum + (y - thetaBar) ** 2, 0);

  // Sum of sampling variances
  const sumVi = vi.reduce((a, b) => a + b, 0);

  // Hedges estimator
  let tau2 = Math.max(0, SS / (k - 1) - sumVi / k);

  return {
    tau2,
    tau: Math.sqrt(tau2),
    method: 'HE',
    se_tau2: null
  };
}

/**
 * HS - Hunter-Schmidt Estimator
 * Variance component estimator without inverse-variance weighting
 */
export function tauHS(yi, vi, ni = null) {
  const k = yi.length;
  if (k < 2) return { tau2: 0, tau: 0, method: 'HS' };

  // Use sample sizes as weights if provided, otherwise equal weights
  const weights = ni || yi.map(() => 1);
  const sumN = weights.reduce((a, b) => a + b, 0);

  // Weighted mean
  const thetaBar = weights.reduce((sum, w, i) => sum + w * yi[i], 0) / sumN;

  // Observed variance
  const varObs = weights.reduce((sum, w, i) => sum + w * (yi[i] - thetaBar) ** 2, 0) / sumN;

  // Average sampling variance
  const avgVi = vi.reduce((a, b) => a + b, 0) / k;

  // Hunter-Schmidt estimator
  let tau2 = Math.max(0, varObs - avgVi);

  return {
    tau2,
    tau: Math.sqrt(tau2),
    method: 'HS'
  };
}

/**
 * HSk - Hunter-Schmidt with small-sample correction
 */
export function tauHSk(yi, vi, ni = null) {
  const k = yi.length;
  const result = tauHS(yi, vi, ni);

  // Small sample correction factor
  const correction = k / (k - 1);
  result.tau2 = Math.max(0, result.tau2 * correction);
  result.tau = Math.sqrt(result.tau2);
  result.method = 'HSk';

  return result;
}

/**
 * SJ - Sidik-Jonkman Estimator
 * Two-step estimator using initial estimate to reweight
 */
export function tauSJ(yi, vi) {
  const k = yi.length;
  if (k < 2) return { tau2: 0, tau: 0, method: 'SJ' };

  // Step 1: Initial tau² estimate from HE
  const heResult = tauHE(yi, vi);
  let tau2Init = heResult.tau2;

  // If initial is 0, use a small positive value
  if (tau2Init === 0) {
    tau2Init = vi.reduce((a, b) => a + b, 0) / k * 0.01;
  }

  // Step 2: Calculate weights with initial tau²
  const w = vi.map(v => 1 / (v + tau2Init));
  const sumW = w.reduce((a, b) => a + b, 0);

  // Weighted mean
  const theta = w.reduce((sum, wi, i) => sum + wi * yi[i], 0) / sumW;

  // SJ estimator
  const num = w.reduce((sum, wi, i) => sum + wi * (yi[i] - theta) ** 2, 0);
  let tau2 = Math.max(0, num / (k - 1));

  return {
    tau2,
    tau: Math.sqrt(tau2),
    method: 'SJ',
    tau2_init: tau2Init
  };
}

/**
 * PM - Paule-Mandel Estimator
 * Iterative estimator based on the generalized Q statistic
 */
export function tauPM(yi, vi, maxIter = 100, tol = 1e-5) {
  const k = yi.length;
  if (k < 2) return { tau2: 0, tau: 0, method: 'PM' };

  // Initial estimate from DL
  let tau2 = tauDL(yi, vi).tau2;

  for (let iter = 0; iter < maxIter; iter++) {
    const w = vi.map(v => 1 / (v + tau2));
    const sumW = w.reduce((a, b) => a + b, 0);
    const theta = w.reduce((sum, wi, i) => sum + wi * yi[i], 0) / sumW;

    // Generalized Q with current tau²
    const Q = w.reduce((sum, wi, i) => sum + wi * (yi[i] - theta) ** 2, 0);

    // Target: Q = k - 1
    const target = k - 1;

    if (Math.abs(Q - target) < tol) break;

    // Update tau² using Newton-like step
    const dQdTau2 = -w.reduce((sum, wi, i) => sum + wi * wi * (yi[i] - theta) ** 2, 0);

    if (Math.abs(dQdTau2) < 1e-10) break;

    const delta = (Q - target) / dQdTau2;
    tau2 = Math.max(0, tau2 - delta);
  }

  return {
    tau2,
    tau: Math.sqrt(tau2),
    method: 'PM'
  };
}

/**
 * PMM - Paule-Mandel Median-Unbiased Estimator
 * Uses median rather than mean of Q distribution
 */
export function tauPMM(yi, vi, maxIter = 100) {
  const k = yi.length;
  if (k < 2) return { tau2: 0, tau: 0, method: 'PMM' };

  // Find tau² such that observed Q equals median of chi-square(k-1)
  const medianChisq = qchisq(0.5, k - 1);

  // Binary search
  let lower = 0;
  let upper = 10 * vi.reduce((a, b) => a + b, 0);

  for (let iter = 0; iter < maxIter; iter++) {
    const tau2 = (lower + upper) / 2;
    const w = vi.map(v => 1 / (v + tau2));
    const sumW = w.reduce((a, b) => a + b, 0);
    const theta = w.reduce((sum, wi, i) => sum + wi * yi[i], 0) / sumW;
    const Q = w.reduce((sum, wi, i) => sum + wi * (yi[i] - theta) ** 2, 0);

    if (Math.abs(Q - medianChisq) < 1e-6 || (upper - lower) < 1e-10) break;

    if (Q > medianChisq) {
      lower = tau2;
    } else {
      upper = tau2;
    }
  }

  const tau2 = (lower + upper) / 2;

  return {
    tau2: Math.max(0, tau2),
    tau: Math.sqrt(Math.max(0, tau2)),
    method: 'PMM'
  };
}

/**
 * ML - Maximum Likelihood Estimator
 * Assumes normality of both random effects and sampling errors
 */
export function tauML(yi, vi, maxIter = 100, tol = 1e-6) {
  const k = yi.length;
  if (k < 2) return { tau2: 0, tau: 0, method: 'ML' };

  // Initial estimate
  let tau2 = tauDL(yi, vi).tau2;

  for (let iter = 0; iter < maxIter; iter++) {
    const w = vi.map(v => 1 / (v + tau2));
    const sumW = w.reduce((a, b) => a + b, 0);
    const theta = w.reduce((sum, wi, i) => sum + wi * yi[i], 0) / sumW;

    // Score function for tau²
    const w2 = w.map(wi => wi * wi);
    const residSq = yi.map((y, i) => (y - theta) ** 2);

    const score = -0.5 * w.reduce((a, b) => a + b, 0) +
                  0.5 * w2.reduce((sum, w2i, i) => sum + w2i * residSq[i], 0) +
                  0.5 * w2.reduce((a, b) => a + b, 0) / sumW;

    // Fisher information
    const info = 0.5 * w2.reduce((a, b) => a + b, 0);

    if (Math.abs(info) < 1e-10) break;

    const delta = score / info;
    const newTau2 = Math.max(0, tau2 + delta);

    if (Math.abs(newTau2 - tau2) < tol) break;
    tau2 = newTau2;
  }

  // Calculate log-likelihood
  const w = vi.map(v => 1 / (v + tau2));
  const sumW = w.reduce((a, b) => a + b, 0);
  const theta = w.reduce((sum, wi, i) => sum + wi * yi[i], 0) / sumW;

  const ll = -0.5 * k * Math.log(2 * Math.PI) -
             0.5 * vi.reduce((sum, v, i) => sum + Math.log(v + tau2), 0) -
             0.5 * w.reduce((sum, wi, i) => sum + wi * (yi[i] - theta) ** 2, 0);

  return {
    tau2,
    tau: Math.sqrt(tau2),
    method: 'ML',
    logLik: ll
  };
}

/**
 * REML - Restricted Maximum Likelihood Estimator
 * Accounts for loss of degrees of freedom in estimating fixed effects
 */
export function tauREML(yi, vi, maxIter = 100, tol = 1e-6) {
  const k = yi.length;
  if (k < 2) return { tau2: 0, tau: 0, method: 'REML' };

  // Initial estimate
  let tau2 = tauDL(yi, vi).tau2;

  for (let iter = 0; iter < maxIter; iter++) {
    const w = vi.map(v => 1 / (v + tau2));
    const sumW = w.reduce((a, b) => a + b, 0);
    const theta = w.reduce((sum, wi, i) => sum + wi * yi[i], 0) / sumW;

    const w2 = w.map(wi => wi * wi);
    const sumW2 = w2.reduce((a, b) => a + b, 0);
    const residSq = yi.map((y, i) => (y - theta) ** 2);

    // REML score function
    const score = -0.5 * (sumW - sumW2 / sumW) +
                  0.5 * w2.reduce((sum, w2i, i) => sum + w2i * residSq[i], 0);

    // Fisher information for REML
    const info = 0.5 * (sumW2 - w2.reduce((sum, w2i) => sum + w2i * w2i, 0) / sumW);

    if (Math.abs(info) < 1e-10) break;

    const delta = score / info;
    const newTau2 = Math.max(0, tau2 + delta);

    if (Math.abs(newTau2 - tau2) < tol) break;
    tau2 = newTau2;
  }

  // Calculate restricted log-likelihood
  const w = vi.map(v => 1 / (v + tau2));
  const sumW = w.reduce((a, b) => a + b, 0);
  const theta = w.reduce((sum, wi, i) => sum + wi * yi[i], 0) / sumW;

  const rll = -0.5 * (k - 1) * Math.log(2 * Math.PI) -
              0.5 * vi.reduce((sum, v) => sum + Math.log(v + tau2), 0) -
              0.5 * Math.log(sumW) -
              0.5 * w.reduce((sum, wi, i) => sum + wi * (yi[i] - theta) ** 2, 0);

  return {
    tau2,
    tau: Math.sqrt(tau2),
    method: 'REML',
    logLik: rll
  };
}

/**
 * EB - Empirical Bayes Estimator
 * Morris (1983) estimator based on marginal likelihood
 */
export function tauEB(yi, vi, maxIter = 100, tol = 1e-6) {
  const k = yi.length;
  if (k < 2) return { tau2: 0, tau: 0, method: 'EB' };

  // Initial estimate
  let tau2 = tauDL(yi, vi).tau2;

  for (let iter = 0; iter < maxIter; iter++) {
    const w = vi.map(v => 1 / (v + tau2));
    const sumW = w.reduce((a, b) => a + b, 0);
    const theta = w.reduce((sum, wi, i) => sum + wi * yi[i], 0) / sumW;

    // EB update: weighted average of squared residuals minus average vi
    const num = w.reduce((sum, wi, i) => sum + wi * (yi[i] - theta) ** 2, 0);
    const avgVi = vi.reduce((a, b) => a + b, 0) / k;

    const newTau2 = Math.max(0, num / sumW - avgVi);

    if (Math.abs(newTau2 - tau2) < tol) break;
    tau2 = newTau2;
  }

  return {
    tau2,
    tau: Math.sqrt(tau2),
    method: 'EB'
  };
}

/**
 * GENQ - Generalized Q-statistic Estimator
 * Extension of DL with weights based on study-specific quantities
 */
export function tauGENQ(yi, vi, ni = null) {
  const k = yi.length;
  if (k < 2) return { tau2: 0, tau: 0, method: 'GENQ' };

  // Use sample sizes as auxiliary weights if provided
  const a = ni || vi.map(() => 1);

  // Weighted mean using auxiliary weights
  const sumA = a.reduce((sum, ai) => sum + ai, 0);
  const thetaA = a.reduce((sum, ai, i) => sum + ai * yi[i], 0) / sumA;

  // Generalized Q
  const Q = a.reduce((sum, ai, i) => sum + ai * (yi[i] - thetaA) ** 2, 0);

  // Expected value under null
  const sumA2 = a.reduce((sum, ai) => sum + ai * ai, 0);
  const aVi = a.reduce((sum, ai, i) => sum + ai * vi[i], 0);
  const EQ0 = aVi - a.reduce((sum, ai, i) => sum + ai * ai * vi[i], 0) / sumA;

  // C factor
  const C = sumA - sumA2 / sumA;

  let tau2 = Math.max(0, (Q - EQ0) / C);

  return {
    tau2,
    tau: Math.sqrt(tau2),
    method: 'GENQ',
    Q
  };
}

/**
 * GENQM - Generalized Q Median-Unbiased Estimator
 */
export function tauGENQM(yi, vi, ni = null, maxIter = 100) {
  const k = yi.length;
  if (k < 2) return { tau2: 0, tau: 0, method: 'GENQM' };

  const a = ni || vi.map(() => 1);
  const medianChisq = qchisq(0.5, k - 1);

  // Binary search for tau² such that Q equals median chi-square
  let lower = 0;
  let upper = 10 * vi.reduce((a, b) => a + b, 0);

  for (let iter = 0; iter < maxIter; iter++) {
    const tau2 = (lower + upper) / 2;

    // Weights adjusted for tau²
    const w = vi.map((v, i) => a[i] / (v + tau2));
    const sumW = w.reduce((sum, wi) => sum + wi, 0);
    const theta = w.reduce((sum, wi, i) => sum + wi * yi[i], 0) / sumW;

    const Q = w.reduce((sum, wi, i) => sum + wi * (yi[i] - theta) ** 2, 0);

    if (Math.abs(Q - medianChisq) < 1e-6 || (upper - lower) < 1e-10) break;

    if (Q > medianChisq) {
      lower = tau2;
    } else {
      upper = tau2;
    }
  }

  const tau2 = Math.max(0, (lower + upper) / 2);

  return {
    tau2,
    tau: Math.sqrt(tau2),
    method: 'GENQM'
  };
}

// ============================================================================
// I² AND RELATED MEASURES
// ============================================================================

/**
 * Calculate I² with confidence interval
 */
export function calculateI2(Q, df, k, method = 'QP') {
  const I2 = Math.max(0, (Q - df) / Q * 100);

  let ci_lower = 0;
  let ci_upper = 100;

  if (method === 'QP') {
    // Q-profile method for CI (Higgins & Thompson, 2002)
    // Uses non-centrality parameter of chi-square distribution

    // For lower bound: find ncp such that P(chi2(df, ncp) > Q) = 0.975
    // For upper bound: find ncp such that P(chi2(df, ncp) > Q) = 0.025

    // Approximation using Q distribution
    if (Q > df) {
      const seI2 = Math.sqrt(2 / k) * (Q / df);
      ci_lower = Math.max(0, I2 - 1.96 * seI2);
      ci_upper = Math.min(100, I2 + 1.96 * seI2);
    }
  }

  return {
    I2,
    ci_lower,
    ci_upper,
    Q, df,
    pvalue: 1 - pchisq(Q, df)
  };
}

/**
 * Calculate H² (relative excess heterogeneity)
 */
export function calculateH2(Q, df) {
  const H2 = Math.max(1, Q / df);
  const H = Math.sqrt(H2);

  // CI for H using log transformation
  const logH = Math.log(H);
  const seLogH = (Q > df + 1) ?
    0.5 * (Math.log(Q) - Math.log(df)) / Math.sqrt(2 * Q - 2 * df - 1) :
    Math.sqrt(1 / (2 * (df - 1)) * (1 - 1 / (3 * (df - 1) ** 2)));

  return {
    H2,
    H,
    ci_lower: Math.exp(logH - 1.96 * seLogH),
    ci_upper: Math.exp(logH + 1.96 * seLogH)
  };
}

// ============================================================================
// CONFIDENCE INTERVAL FOR TAU²
// ============================================================================

/**
 * Q-profile confidence interval for tau²
 */
export function tau2CI_QP(yi, vi, level = 0.95) {
  const k = yi.length;
  const alpha = 1 - level;

  // Get observed Q
  const { Q, df } = calculateQ(yi, vi);

  // Function to calculate Q for a given tau²
  function Qfunc(tau2) {
    const w = vi.map(v => 1 / (v + tau2));
    const sumW = w.reduce((a, b) => a + b, 0);
    const theta = w.reduce((sum, wi, i) => sum + wi * yi[i], 0) / sumW;
    return w.reduce((sum, wi, i) => sum + wi * (yi[i] - theta) ** 2, 0);
  }

  // Lower bound: find tau² such that Q equals upper chi-square quantile
  const upperChisq = qchisq(1 - alpha / 2, df);
  let lower = 0;

  if (Q > upperChisq) {
    // Binary search
    let lo = 0;
    let hi = 10;
    for (let iter = 0; iter < 50; iter++) {
      const mid = (lo + hi) / 2;
      if (Qfunc(mid) > upperChisq) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    lower = (lo + hi) / 2;
  }

  // Upper bound: find tau² such that Q equals lower chi-square quantile
  const lowerChisq = qchisq(alpha / 2, df);
  let upper;

  // Binary search
  let lo = 0;
  let hi = 100;
  for (let iter = 0; iter < 50; iter++) {
    const mid = (lo + hi) / 2;
    if (Qfunc(mid) > lowerChisq) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  upper = (lo + hi) / 2;

  return { lower, upper, level };
}

/**
 * Profile likelihood confidence interval for tau²
 */
export function tau2CI_PL(yi, vi, level = 0.95) {
  const k = yi.length;

  // Get REML estimate
  const result = tauREML(yi, vi);
  const tau2_hat = result.tau2;
  const ll_max = result.logLik;

  // Critical value
  const crit = qchisq(level, 1) / 2;

  // Function to calculate profile log-likelihood
  function profileLL(tau2) {
    const w = vi.map(v => 1 / (v + tau2));
    const sumW = w.reduce((a, b) => a + b, 0);
    const theta = w.reduce((sum, wi, i) => sum + wi * yi[i], 0) / sumW;

    return -0.5 * (k - 1) * Math.log(2 * Math.PI) -
           0.5 * vi.reduce((sum, v) => sum + Math.log(v + tau2), 0) -
           0.5 * Math.log(sumW) -
           0.5 * w.reduce((sum, wi, i) => sum + wi * (yi[i] - theta) ** 2, 0);
  }

  // Find lower bound
  let lower = 0;
  if (tau2_hat > 0) {
    let lo = 0;
    let hi = tau2_hat;
    for (let iter = 0; iter < 50; iter++) {
      const mid = (lo + hi) / 2;
      if (ll_max - profileLL(mid) > crit) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    lower = (lo + hi) / 2;
  }

  // Find upper bound
  let lo = tau2_hat;
  let hi = tau2_hat * 10 + 1;
  for (let iter = 0; iter < 50; iter++) {
    const mid = (lo + hi) / 2;
    if (ll_max - profileLL(mid) < crit) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  const upper = (lo + hi) / 2;

  return { lower, upper, level };
}

// ============================================================================
// MASTER FUNCTION
// ============================================================================

/**
 * Estimate tau² using specified method
 * @param {number[]} yi - Effect sizes
 * @param {number[]} vi - Sampling variances
 * @param {string} method - Estimator method
 * @param {object} options - Additional options (ni for sample sizes, etc.)
 */
export function estimateTau2(yi, vi, method = 'REML', options = {}) {
  method = method.toUpperCase();

  const estimators = {
    'DL': () => tauDL(yi, vi),
    'HE': () => tauHE(yi, vi),
    'VC': () => tauHE(yi, vi), // Alias
    'CO': () => tauHE(yi, vi), // Alias (Cochran)
    'HS': () => tauHS(yi, vi, options.ni),
    'HSK': () => tauHSk(yi, vi, options.ni),
    'SJ': () => tauSJ(yi, vi),
    'PM': () => tauPM(yi, vi, options.maxIter),
    'PMM': () => tauPMM(yi, vi, options.maxIter),
    'ML': () => tauML(yi, vi, options.maxIter, options.tol),
    'REML': () => tauREML(yi, vi, options.maxIter, options.tol),
    'EB': () => tauEB(yi, vi, options.maxIter, options.tol),
    'GENQ': () => tauGENQ(yi, vi, options.ni),
    'GENQM': () => tauGENQM(yi, vi, options.ni, options.maxIter),
    'EE': () => ({ tau2: 0, tau: 0, method: 'EE' }), // Equal-effects (no heterogeneity)
    'FE': () => ({ tau2: 0, tau: 0, method: 'FE' })  // Fixed-effect alias
  };

  if (!estimators[method]) {
    throw new Error(`Unknown tau² estimator: ${method}`);
  }

  const result = estimators[method]();

  // Add Q statistics and I²
  const { Q, df, pvalue } = calculateQ(yi, vi);
  const i2 = calculateI2(Q, df, yi.length);
  const h2 = calculateH2(Q, df);

  // Add CI for tau² if requested
  if (options.ci) {
    const ci = options.ciMethod === 'PL' ?
      tau2CI_PL(yi, vi, options.level || 0.95) :
      tau2CI_QP(yi, vi, options.level || 0.95);
    result.tau2_ci = ci;
  }

  return {
    ...result,
    Q,
    df,
    pvalue,
    I2: i2.I2,
    I2_ci: { lower: i2.ci_lower, upper: i2.ci_upper },
    H2: h2.H2,
    H: h2.H,
    k: yi.length
  };
}

export default {
  // Individual estimators
  tauDL,
  tauHE,
  tauHS,
  tauHSk,
  tauSJ,
  tauPM,
  tauPMM,
  tauML,
  tauREML,
  tauEB,
  tauGENQ,
  tauGENQM,

  // Heterogeneity measures
  calculateQ,
  calculateI2,
  calculateH2,

  // Confidence intervals
  tau2CI_QP,
  tau2CI_PL,

  // Master function
  estimateTau2
};
