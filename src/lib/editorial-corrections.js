/**
 * Editorial Corrections and Advanced Methods
 *
 * Addresses reviewer concerns:
 * 1. Continuity corrections for sparse data
 * 2. Copas selection model (gold standard for publication bias)
 * 3. Arcsine test for binary outcomes (Rücker et al. 2008)
 * 4. Limit meta-analysis (Rücker et al. 2011)
 * 5. Rubin's rules for multiple imputation
 * 6. Model fit statistics (AIC, BIC, deviance)
 * 7. Sensitivity-specificity joint confidence regions
 *
 * References provided for each method for verification.
 */

// ============================================================================
// SHARED STATISTICAL UTILITIES (consolidated)
// ============================================================================

export const stats = {
  qnorm(p) {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    if (p === 0.5) return 0;

    const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
               1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
               6.680131188771972e+01, -1.328068155288572e+01];
    const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
               -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
               3.754408661907416e+00];

    const pLow = 0.02425, pHigh = 1 - pLow;
    let q;

    if (p < pLow) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
             ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
    } else if (p <= pHigh) {
      q = p - 0.5;
      const r = q * q;
      return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q /
             (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
    } else {
      q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
              ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
    }
  },

  pnorm(x) {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
    const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);
    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return 0.5 * (1.0 + sign * y);
  },

  dnorm(x) {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  },

  pt(t, df) {
    // Student's t CDF using beta function approximation
    if (df <= 0) return NaN;
    const x = df / (df + t * t);
    const p = 0.5 * this.betainc(x, df / 2, 0.5);
    return t > 0 ? 1 - p : p;
  },

  qt(p, df) {
    // Student's t quantile using Newton-Raphson
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    if (p === 0.5) return 0;

    let t = this.qnorm(p); // Initial guess
    for (let i = 0; i < 20; i++) {
      const f = this.pt(t, df) - p;
      const fprime = this.dt(t, df);
      if (Math.abs(f) < 1e-10 || fprime === 0) break;
      t -= f / fprime;
    }
    return t;
  },

  dt(t, df) {
    // Student's t PDF
    const c = Math.exp(this.lgamma((df + 1) / 2) - this.lgamma(df / 2));
    return c / (Math.sqrt(df * Math.PI) * Math.pow(1 + t * t / df, (df + 1) / 2));
  },

  lgamma(x) {
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
               -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let y = x, tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (let j = 0; j < 6; j++) ser += c[j] / ++y;
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  },

  betainc(x, a, b) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const bt = Math.exp(this.lgamma(a + b) - this.lgamma(a) - this.lgamma(b) +
                        a * Math.log(x) + b * Math.log(1 - x));
    if (x < (a + 1) / (a + b + 2)) {
      return bt * this.betacf(x, a, b) / a;
    }
    return 1 - bt * this.betacf(1 - x, b, a) / b;
  },

  betacf(x, a, b) {
    const qab = a + b, qap = a + 1, qam = a - 1;
    let c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= 100; m++) {
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
};

// ============================================================================
// 1. CONTINUITY CORRECTIONS FOR SPARSE DATA
// Reference: Sweeting et al. (2004) Statistics in Medicine
// ============================================================================

/**
 * Apply continuity correction to 2x2 table
 * Supports multiple methods for comparison
 *
 * @param {number} a - Events in treatment
 * @param {number} b - Non-events in treatment
 * @param {number} c - Events in control
 * @param {number} d - Non-events in control
 * @param {string} method - 'constant', 'treatment_arm', 'empirical', 'tarone'
 * @param {number} value - Correction value (default 0.5)
 * @returns {Object} Corrected values
 */
export function continuityCorrection(a, b, c, d, method = 'constant', value = 0.5) {
  const hasZero = a === 0 || b === 0 || c === 0 || d === 0;
  const isDoubleZero = (a === 0 && c === 0) || (b === 0 && d === 0);

  // If no zeros, no correction needed
  if (!hasZero) {
    return { a, b, c, d, corrected: false, method: 'none' };
  }

  // Double-zero studies: controversial, often excluded
  if (isDoubleZero) {
    return {
      a, b, c, d,
      corrected: false,
      excluded: true,
      method: 'double_zero',
      warning: 'Double-zero study - consider excluding from analysis'
    };
  }

  let cc; // Correction value

  switch (method) {
    case 'constant':
      // Traditional constant correction (default 0.5)
      cc = value;
      break;

    case 'treatment_arm':
      // Proportional to opposite arm size (Sweeting 2004)
      // Reduces bias in unbalanced designs
      const n1 = a + b;
      const n2 = c + d;
      const R = n2 / n1;
      cc = 1 / (1 + R);
      break;

    case 'empirical':
      // Empirical correction based on non-zero studies
      // Requires external estimate of pooled effect
      cc = value; // Placeholder - needs pooled estimate
      break;

    case 'tarone':
      // Tarone's correction (1985)
      // Minimizes bias in variance estimation
      const n = a + b + c + d;
      cc = n > 0 ? (a + b) * (c + d) / (n * n) : 0.5;
      break;

    default:
      cc = 0.5;
  }

  return {
    a: a + cc,
    b: b + cc,
    c: c + cc,
    d: d + cc,
    correction: cc,
    corrected: true,
    method
  };
}

/**
 * Corrected effect size calculations for binary data
 */
export function correctedBinaryEffects(studies, options = {}) {
  const {
    method = 'constant',
    cc = 0.5,
    includeDoubleZero = false,
    measure = 'OR'
  } = options;

  const results = [];
  let excluded = 0;

  for (const study of studies) {
    const corrected = continuityCorrection(
      study.a, study.b, study.c, study.d,
      method, cc
    );

    if (corrected.excluded && !includeDoubleZero) {
      excluded++;
      continue;
    }

    const { a, b, c, d } = corrected;

    let yi, vi;

    switch (measure.toUpperCase()) {
      case 'OR':
        yi = Math.log((a * d) / (b * c));
        vi = 1/a + 1/b + 1/c + 1/d;
        break;

      case 'RR':
        yi = Math.log((a / (a + b)) / (c / (c + d)));
        vi = 1/a - 1/(a + b) + 1/c - 1/(c + d);
        break;

      case 'RD':
        const p1 = a / (a + b);
        const p2 = c / (c + d);
        yi = p1 - p2;
        vi = p1 * (1 - p1) / (a + b) + p2 * (1 - p2) / (c + d);
        break;

      case 'AS':
        // Arcsine square root difference
        yi = Math.asin(Math.sqrt(a / (a + b))) - Math.asin(Math.sqrt(c / (c + d)));
        vi = 0.25 * (1 / (a + b) + 1 / (c + d));
        break;

      default:
        throw new Error(`Unknown measure: ${measure}`);
    }

    results.push({
      ...study,
      yi,
      vi,
      se: Math.sqrt(vi),
      corrected: corrected.corrected,
      correction: corrected.correction
    });
  }

  return {
    studies: results,
    k: results.length,
    excluded,
    method,
    measure
  };
}

// ============================================================================
// 2. COPAS SELECTION MODEL
// Reference: Copas & Shi (2000, 2001) Biostatistics
// The gold standard for selection model-based bias adjustment
// ============================================================================

/**
 * Copas Selection Model
 * Models publication probability as function of both effect size and SE
 * P(publish) = Φ(γ₀ + γ₁/σᵢ)
 *
 * More realistic than p-value based selection models
 */
export function copasSelectionModel(studies, options = {}) {
  const {
    gamma0Range = [-2, 2],    // Range for γ₀ (intercept)
    gamma1Range = [0, 2],     // Range for γ₁ (slope, typically positive)
    nGrid = 20,               // Grid resolution
    level = 0.95
  } = options;

  const k = studies.length;
  const yi = studies.map(s => s.yi);
  const vi = studies.map(s => s.vi);
  const sei = vi.map(v => Math.sqrt(v));

  // Standard random-effects estimate for comparison
  const wRE = vi.map(v => 1 / v);
  const sumW = wRE.reduce((a, b) => a + b, 0);
  const thetaFE = wRE.reduce((sum, w, i) => sum + w * yi[i], 0) / sumW;
  const Q = wRE.reduce((sum, w, i) => sum + w * (yi[i] - thetaFE) ** 2, 0);
  const C = sumW - wRE.reduce((sum, w) => sum + w * w, 0) / sumW;
  const tau2_init = Math.max(0, (Q - (k - 1)) / C);

  // Grid search over selection parameters
  const results = [];

  for (let i = 0; i <= nGrid; i++) {
    const gamma0 = gamma0Range[0] + (gamma0Range[1] - gamma0Range[0]) * i / nGrid;

    for (let j = 0; j <= nGrid; j++) {
      const gamma1 = gamma1Range[0] + (gamma1Range[1] - gamma1Range[0]) * j / nGrid;

      // Estimate theta and tau2 given selection parameters
      const result = copasEstimate(yi, sei, tau2_init, gamma0, gamma1);

      if (result && !isNaN(result.theta)) {
        results.push({
          gamma0,
          gamma1,
          ...result
        });
      }
    }
  }

  if (results.length === 0) {
    return { error: 'Copas model failed to converge' };
  }

  // Find best fitting model (highest likelihood)
  results.sort((a, b) => b.logLik - a.logLik);
  const best = results[0];

  // Calculate probability of publication for each study
  const pubProbs = sei.map(se => stats.pnorm(best.gamma0 + best.gamma1 / se));

  // Expected number of unpublished studies
  const expectedMissing = pubProbs.reduce((sum, p) => sum + (1 - p) / p, 0);

  // Sensitivity analysis: range of estimates across selection scenarios
  const thetaRange = [
    Math.min(...results.map(r => r.theta)),
    Math.max(...results.map(r => r.theta))
  ];

  // Standard unadjusted estimate
  const w = vi.map(v => 1 / (v + tau2_init));
  const sumWRE = w.reduce((a, b) => a + b, 0);
  const thetaUnadj = w.reduce((sum, ww, i) => sum + ww * yi[i], 0) / sumWRE;

  return {
    // Best model
    theta: best.theta,
    se: best.se,
    ci_lower: best.theta - stats.qnorm(1 - (1 - level) / 2) * best.se,
    ci_upper: best.theta + stats.qnorm(1 - (1 - level) / 2) * best.se,
    tau2: best.tau2,
    tau: Math.sqrt(best.tau2),

    // Selection parameters
    gamma0: best.gamma0,
    gamma1: best.gamma1,

    // Unadjusted for comparison
    thetaUnadjusted: thetaUnadj,
    biasEstimate: thetaUnadj - best.theta,

    // Sensitivity
    thetaRange,
    sensitivityToSelection: thetaRange[1] - thetaRange[0],

    // Publication probability
    publicationProbabilities: pubProbs,
    expectedMissing: Math.round(expectedMissing),

    // Model fit
    logLik: best.logLik,

    k,
    method: 'Copas'
  };
}

/**
 * Estimate theta and tau2 for given Copas selection parameters
 */
function copasEstimate(yi, sei, tau2Init, gamma0, gamma1, maxIter = 50) {
  const k = yi.length;
  let tau2 = tau2Init;
  let theta;

  for (let iter = 0; iter < maxIter; iter++) {
    // Calculate weights adjusted for selection
    const w = [];
    let sumW = 0, sumWy = 0;

    for (let i = 0; i < k; i++) {
      const totalVar = sei[i] ** 2 + tau2;
      const sigma = Math.sqrt(totalVar);

      // Selection probability
      const u = gamma0 + gamma1 / sei[i];
      const pubProb = stats.pnorm(u);

      if (pubProb < 0.01) continue; // Skip if nearly certain to be unpublished

      // Inverse Mills ratio adjustment
      const lambda = stats.dnorm(u) / pubProb;

      // Adjusted weight
      const wi = 1 / totalVar;
      w.push(wi);
      sumW += wi;

      // Adjusted mean contribution
      // Account for truncation bias
      const rho = gamma1 * sei[i] / sigma;
      const adjustment = rho * lambda * sigma;
      sumWy += wi * (yi[i] - adjustment);
    }

    if (sumW === 0) return null;

    const newTheta = sumWy / sumW;

    // Update tau2 using modified DL
    let Q = 0;
    for (let i = 0; i < k; i++) {
      const totalVar = sei[i] ** 2 + tau2;
      Q += (yi[i] - newTheta) ** 2 / totalVar;
    }

    const df = k - 1;
    const newTau2 = Math.max(0, tau2 * (Q - df) / Q);

    if (Math.abs(newTheta - (theta || 0)) < 1e-6 && Math.abs(newTau2 - tau2) < 1e-6) {
      break;
    }

    theta = newTheta;
    tau2 = newTau2;
  }

  // Calculate log-likelihood
  let logLik = 0;
  for (let i = 0; i < k; i++) {
    const totalVar = sei[i] ** 2 + tau2;
    const u = gamma0 + gamma1 / sei[i];

    logLik -= 0.5 * Math.log(totalVar);
    logLik -= 0.5 * (yi[i] - theta) ** 2 / totalVar;
    logLik += Math.log(Math.max(1e-10, stats.pnorm(u)));
  }

  const se = Math.sqrt(1 / (k * (1 / (tau2 + sei.reduce((a, b) => a + b ** 2, 0) / k))));

  return { theta, tau2, se, logLik };
}

// ============================================================================
// 3. ARCSINE TEST FOR BINARY OUTCOMES
// Reference: Rücker et al. (2008) Statistics in Medicine
// More appropriate for binary data than Egger's test
// ============================================================================

/**
 * Arcsine Test for Publication Bias (binary outcomes)
 * Uses arcsine-transformed proportions - more appropriate variance stabilization
 */
export function arcsineTest(studies, options = {}) {
  const { measure = 'OR' } = options;

  const k = studies.length;
  if (k < 3) return { error: 'Need at least 3 studies' };

  // Transform to arcsine scale
  const transformed = studies.map(s => {
    const { a, b, c, d } = s;
    const n1 = a + b;
    const n2 = c + d;

    // Arcsine transformation
    const asin1 = Math.asin(Math.sqrt(a / n1));
    const asin2 = Math.asin(Math.sqrt(c / n2));

    // Effect on arcsine scale
    const yi = asin1 - asin2;

    // Variance (approximately constant)
    const vi = 0.25 * (1 / n1 + 1 / n2);

    // Precision
    const prec = 1 / Math.sqrt(vi);

    return { yi, vi, prec, n: n1 + n2 };
  });

  // Weighted regression of effect on precision
  const yi = transformed.map(t => t.yi);
  const prec = transformed.map(t => t.prec);
  const wi = transformed.map(t => 1 / t.vi);

  // Weighted least squares
  const sumW = wi.reduce((a, b) => a + b, 0);
  const meanY = wi.reduce((sum, w, i) => sum + w * yi[i], 0) / sumW;
  const meanX = wi.reduce((sum, w, i) => sum + w * prec[i], 0) / sumW;

  let num = 0, denom = 0;
  for (let i = 0; i < k; i++) {
    num += wi[i] * (prec[i] - meanX) * (yi[i] - meanY);
    denom += wi[i] * (prec[i] - meanX) ** 2;
  }

  const slope = denom > 0 ? num / denom : 0;
  const intercept = meanY - slope * meanX;

  // Standard error of intercept
  const residVar = wi.reduce((sum, w, i) => {
    const pred = intercept + slope * prec[i];
    return sum + w * (yi[i] - pred) ** 2;
  }, 0) / (k - 2);

  const seIntercept = Math.sqrt(residVar * (1/sumW + meanX ** 2 / denom));

  // Test statistic (intercept significantly different from 0)
  const t = intercept / seIntercept;
  const df = k - 2;
  const pvalue = 2 * (1 - stats.pt(Math.abs(t), df));

  return {
    intercept,
    slope,
    se_intercept: seIntercept,
    t_statistic: t,
    df,
    pvalue,
    significant: pvalue < 0.1, // Use 0.1 for small-study tests
    interpretation: pvalue < 0.1 ?
      'Evidence of small-study effects (potential publication bias)' :
      'No significant evidence of small-study effects',
    k,
    method: 'Arcsine'
  };
}

// ============================================================================
// 4. LIMIT META-ANALYSIS
// Reference: Rücker et al. (2011) Biostatistics
// Extrapolates to infinite precision (SE → 0)
// ============================================================================

/**
 * Limit Meta-Analysis
 * Estimates the effect that would be obtained from infinitely large studies
 * Robust to small-study effects
 */
export function limitMetaAnalysis(studies, options = {}) {
  const { method = 'shrunken' } = options;

  const k = studies.length;
  if (k < 3) return { error: 'Need at least 3 studies' };

  const yi = studies.map(s => s.yi);
  const vi = studies.map(s => s.vi);
  const sei = vi.map(v => Math.sqrt(v));

  // Standard random-effects for comparison
  const wRE = vi.map(v => 1 / v);
  const sumW = wRE.reduce((a, b) => a + b, 0);
  const thetaFE = wRE.reduce((sum, w, i) => sum + w * yi[i], 0) / sumW;
  const Q = wRE.reduce((sum, w, i) => sum + w * (yi[i] - thetaFE) ** 2, 0);
  const C = sumW - wRE.reduce((sum, w) => sum + w * w, 0) / sumW;
  const tau2 = Math.max(0, (Q - (k - 1)) / C);

  // Regression of effect on SE
  const w = vi.map(v => 1 / (v + tau2));
  const sumWLimit = w.reduce((a, b) => a + b, 0);

  const meanY = w.reduce((sum, ww, i) => sum + ww * yi[i], 0) / sumWLimit;
  const meanX = w.reduce((sum, ww, i) => sum + ww * sei[i], 0) / sumWLimit;

  let ssxy = 0, ssxx = 0;
  for (let i = 0; i < k; i++) {
    ssxy += w[i] * (sei[i] - meanX) * (yi[i] - meanY);
    ssxx += w[i] * (sei[i] - meanX) ** 2;
  }

  const beta = ssxx > 0 ? ssxy / ssxx : 0;

  // Limit estimate: extrapolate to SE = 0
  const thetaLimit = meanY - beta * meanX;

  // Shrunken limit estimate (reduces overfitting)
  let thetaShrunken = thetaLimit;
  if (method === 'shrunken') {
    // Shrink toward standard RE estimate
    const shrinkage = k / (k + 2);
    const thetaRE = w.reduce((sum, ww, i) => sum + ww * yi[i], 0) / sumWLimit;
    thetaShrunken = shrinkage * thetaLimit + (1 - shrinkage) * thetaRE;
  }

  // Variance of limit estimate
  const residVar = w.reduce((sum, ww, i) => {
    const pred = thetaLimit + beta * sei[i];
    return sum + ww * (yi[i] - pred) ** 2;
  }, 0) / (k - 2);

  const varLimit = residVar * (1 / sumWLimit + meanX ** 2 / ssxx);
  const seLimit = Math.sqrt(varLimit);

  // Adjusted heterogeneity (after accounting for small-study effect)
  const QAdj = w.reduce((sum, ww, i) => {
    const pred = thetaLimit + beta * sei[i];
    return sum + ww * (yi[i] - pred) ** 2;
  }, 0);
  const I2Adj = Math.max(0, (QAdj - (k - 2)) / QAdj * 100);

  return {
    thetaLimit,
    thetaShrunken,
    se: seLimit,
    ci_lower: thetaShrunken - 1.96 * seLimit,
    ci_upper: thetaShrunken + 1.96 * seLimit,

    // Small-study effect
    beta, // Slope (association between effect and SE)
    betaSE: Math.sqrt(residVar / ssxx),
    smallStudyEffect: Math.abs(beta) > 1.96 * Math.sqrt(residVar / ssxx),

    // Standard RE for comparison
    thetaRE: meanY,
    bias: meanY - thetaShrunken,

    // Adjusted heterogeneity
    I2Adjusted: I2Adj,

    k,
    method: 'Limit'
  };
}

// ============================================================================
// 5. RUBIN'S RULES FOR MULTIPLE IMPUTATION
// Reference: Rubin (1987); Barnard & Rubin (1999)
// ============================================================================

/**
 * Combine estimates from multiple imputation using Rubin's Rules
 *
 * @param {Array} estimates - Array of {theta, variance} from each imputation
 * @returns {Object} Combined estimate with proper variance
 */
export function rubinsRules(estimates) {
  const m = estimates.length;
  if (m < 2) return { error: 'Need at least 2 imputations' };

  const thetas = estimates.map(e => e.theta);
  const variances = estimates.map(e => e.variance);

  // Combined estimate (average)
  const thetaCombined = thetas.reduce((a, b) => a + b, 0) / m;

  // Within-imputation variance (average)
  const W = variances.reduce((a, b) => a + b, 0) / m;

  // Between-imputation variance
  const B = thetas.reduce((sum, theta) => sum + (theta - thetaCombined) ** 2, 0) / (m - 1);

  // Total variance with finite-sample correction
  const T = W + (1 + 1 / m) * B;

  // Degrees of freedom (Barnard & Rubin 1999)
  const gamma = (1 + 1 / m) * B / T;  // Fraction of missing information
  const df_old = (m - 1) / (gamma ** 2);

  // Small-sample adjustment for df
  const df_obs = estimates[0].df_complete || Infinity;
  const df_adj = 1 / (1 / df_old + 1 / ((1 - gamma) * (df_obs + 1) / (df_obs + 3) * df_obs));

  const df = Math.max(3, df_adj); // Minimum 3 df

  // Confidence interval
  const se = Math.sqrt(T);
  const t_crit = stats.qt(0.975, df);

  return {
    theta: thetaCombined,
    variance: T,
    se,
    ci_lower: thetaCombined - t_crit * se,
    ci_upper: thetaCombined + t_crit * se,

    // Components
    withinVariance: W,
    betweenVariance: B,

    // Missing information
    fractionMissing: gamma,
    relativeIncrease: (1 + 1 / m) * B / W,

    // Degrees of freedom
    df,

    m,
    method: 'Rubin'
  };
}

// ============================================================================
// 6. MODEL FIT STATISTICS
// ============================================================================

/**
 * Calculate model comparison statistics
 */
export function modelFitStatistics(logLik, nParams, nObs, options = {}) {
  const { saturatedLogLik = null } = options;

  // AIC: Akaike Information Criterion
  const aic = -2 * logLik + 2 * nParams;

  // AICc: Corrected AIC for small samples
  const aicc = aic + (2 * nParams * (nParams + 1)) / (nObs - nParams - 1);

  // BIC: Bayesian Information Criterion
  const bic = -2 * logLik + nParams * Math.log(nObs);

  // Deviance (if saturated log-likelihood provided)
  let deviance = null;
  let devianceP = null;
  if (saturatedLogLik !== null) {
    deviance = 2 * (saturatedLogLik - logLik);
    // Approximate p-value (chi-square with df = nObs - nParams)
    const df = nObs - nParams;
    if (df > 0) {
      devianceP = 1 - stats.betainc(df / (df + deviance), df / 2, 0.5);
    }
  }

  return {
    logLik,
    aic,
    aicc,
    bic,
    deviance,
    devianceP,
    nParams,
    nObs
  };
}

/**
 * Compare nested models using likelihood ratio test
 */
export function likelihoodRatioTest(logLik_full, logLik_reduced, df_diff) {
  const lrt = 2 * (logLik_full - logLik_reduced);
  const pvalue = 1 - stats.betainc(df_diff / (df_diff + lrt), df_diff / 2, 0.5);

  return {
    chi2: lrt,
    df: df_diff,
    pvalue,
    significant: pvalue < 0.05
  };
}

// ============================================================================
// 7. JOINT CONFIDENCE REGIONS FOR SENSITIVITY/SPECIFICITY
// ============================================================================

/**
 * Calculate joint confidence region for DTA studies
 * Uses exact or approximate methods based on sample size
 */
export function jointConfidenceRegion(sens, spec, n_diseased, n_healthy, options = {}) {
  const { level = 0.95, method = 'approximate', nPoints = 100 } = options;

  // On logit scale
  const logitSens = Math.log(sens / (1 - sens));
  const logitSpec = Math.log(spec / (1 - spec));

  // Variances on logit scale
  const varLogitSens = 1 / (n_diseased * sens * (1 - sens));
  const varLogitSpec = 1 / (n_healthy * spec * (1 - spec));

  // Covariance (typically assumed 0 within study)
  const covLogit = 0;

  // Chi-square quantile for confidence ellipse
  const chi2Crit = -2 * Math.log(1 - level); // Approximation for 2 df

  // Generate ellipse points
  const points = [];

  for (let i = 0; i <= nPoints; i++) {
    const angle = (2 * Math.PI * i) / nPoints;

    // Standard ellipse
    const a = Math.sqrt(chi2Crit * varLogitSens);
    const b = Math.sqrt(chi2Crit * varLogitSpec);

    const x = logitSens + a * Math.cos(angle);
    const y = logitSpec + b * Math.sin(angle);

    // Back-transform
    const sensPoint = 1 / (1 + Math.exp(-x));
    const specPoint = 1 / (1 + Math.exp(-y));

    points.push({
      sens: sensPoint,
      spec: specPoint,
      fpr: 1 - specPoint
    });
  }

  // Summary statistics
  const sensCI = [
    1 / (1 + Math.exp(-(logitSens - stats.qnorm(1 - (1 - level) / 2) * Math.sqrt(varLogitSens)))),
    1 / (1 + Math.exp(-(logitSens + stats.qnorm(1 - (1 - level) / 2) * Math.sqrt(varLogitSens))))
  ];

  const specCI = [
    1 / (1 + Math.exp(-(logitSpec - stats.qnorm(1 - (1 - level) / 2) * Math.sqrt(varLogitSpec)))),
    1 / (1 + Math.exp(-(logitSpec + stats.qnorm(1 - (1 - level) / 2) * Math.sqrt(varLogitSpec))))
  ];

  return {
    center: { sens, spec },
    ellipse: points,
    marginalCI: {
      sens: sensCI,
      spec: specCI
    },
    level
  };
}

// ============================================================================
// 8. ADDITIONAL SENSITIVITY ANALYSES
// ============================================================================

/**
 * Fragility Index for Meta-Analysis
 * Number of event swaps needed to change significance
 */
export function fragilityIndexMA(studies, options = {}) {
  const { alpha = 0.05, measure = 'OR' } = options;

  // Get initial pooled result
  const initial = poolBinaryStudies(studies, measure);
  const initialSignificant = initial.pvalue < alpha;

  let fragility = 0;
  const modifiedStudies = JSON.parse(JSON.stringify(studies));

  // Iteratively swap events until significance changes
  for (let iter = 0; iter < 1000; iter++) {
    // Find study where swapping has most impact
    let bestStudy = -1;
    let bestImpact = 0;

    for (let i = 0; i < modifiedStudies.length; i++) {
      // Try swapping one event
      const testStudies = JSON.parse(JSON.stringify(modifiedStudies));

      if (initialSignificant) {
        // Move toward null
        if (testStudies[i].a > 0 && testStudies[i].d > 0) {
          testStudies[i].a--;
          testStudies[i].b++;
        }
      } else {
        // Move away from null
        if (testStudies[i].b > 0) {
          testStudies[i].a++;
          testStudies[i].b--;
        }
      }

      const test = poolBinaryStudies(testStudies, measure);
      const impact = Math.abs(test.pvalue - initial.pvalue);

      if (impact > bestImpact) {
        bestImpact = impact;
        bestStudy = i;
      }
    }

    if (bestStudy === -1) break;

    // Apply the swap
    if (initialSignificant) {
      modifiedStudies[bestStudy].a--;
      modifiedStudies[bestStudy].b++;
    } else {
      modifiedStudies[bestStudy].a++;
      modifiedStudies[bestStudy].b--;
    }

    fragility++;

    // Check if significance changed
    const current = poolBinaryStudies(modifiedStudies, measure);
    if ((current.pvalue < alpha) !== initialSignificant) {
      break;
    }
  }

  return {
    fragilityIndex: fragility,
    initialPvalue: initial.pvalue,
    initialSignificant,
    interpretation: fragility < 10 ?
      'Fragile result - small changes could alter conclusion' :
      'Robust result',
    k: studies.length
  };
}

/**
 * Helper: Pool binary studies
 */
function poolBinaryStudies(studies, measure = 'OR') {
  let yi = [], vi = [];

  for (const s of studies) {
    const corrected = continuityCorrection(s.a, s.b, s.c, s.d);
    const { a, b, c, d } = corrected;

    if (measure === 'OR') {
      yi.push(Math.log((a * d) / (b * c)));
      vi.push(1/a + 1/b + 1/c + 1/d);
    } else if (measure === 'RR') {
      yi.push(Math.log((a / (a + b)) / (c / (c + d))));
      vi.push(1/a - 1/(a + b) + 1/c - 1/(c + d));
    }
  }

  const w = vi.map(v => 1 / v);
  const sumW = w.reduce((a, b) => a + b, 0);
  const theta = w.reduce((sum, ww, i) => sum + ww * yi[i], 0) / sumW;
  const se = Math.sqrt(1 / sumW);
  const z = theta / se;
  const pvalue = 2 * (1 - stats.pnorm(Math.abs(z)));

  return { theta, se, z, pvalue };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Utilities
  stats,

  // Continuity corrections
  continuityCorrection,
  correctedBinaryEffects,

  // Publication bias methods
  copasSelectionModel,
  arcsineTest,
  limitMetaAnalysis,

  // Multiple imputation
  rubinsRules,

  // Model fit
  modelFitStatistics,
  likelihoodRatioTest,

  // DTA
  jointConfidenceRegion,

  // Sensitivity
  fragilityIndexMA
};
