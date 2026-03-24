/**
 * Living Meta-Analysis - Comprehensive Validation Test
 * Compares JavaScript implementation against metafor (R) reference values
 *
 * Run with: node js_validation_test.js
 */

const fs = require('fs');
const path = require('path');

// Load reference data from R/metafor
const referenceFile = path.join(__dirname, 'metafor_reference.json');
const reference = JSON.parse(fs.readFileSync(referenceFile, 'utf8'));

// Test counters
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

// Tolerance for numerical comparison
const TOLERANCE = 0.001;  // 0.1% relative tolerance
const ABS_TOLERANCE = 0.0001;  // Absolute tolerance for values near zero

/**
 * Compare two values within tolerance
 */
function compare(jsVal, rVal, testName, options = {}) {
  totalTests++;

  if (jsVal === null || jsVal === undefined || rVal === null || rVal === undefined) {
    if ((jsVal === null || jsVal === undefined) && (rVal === null || rVal === undefined)) {
      passedTests++;
      return true;
    }
    failedTests++;
    failures.push({ test: testName, js: jsVal, r: rVal, error: 'One value is null/undefined' });
    return false;
  }

  const absDiff = Math.abs(jsVal - rVal);
  const relDiff = rVal !== 0 ? Math.abs(absDiff / rVal) : absDiff;

  const tolerance = options.tolerance || TOLERANCE;
  const absTolerance = options.absTolerance || ABS_TOLERANCE;

  const passed = absDiff < absTolerance || relDiff < tolerance;

  if (passed) {
    passedTests++;
    console.log(`  PASS: ${testName}`);
    console.log(`        JS: ${jsVal.toFixed(6)}, R: ${rVal.toFixed(6)}, Diff: ${absDiff.toFixed(8)}`);
  } else {
    failedTests++;
    console.log(`  FAIL: ${testName}`);
    console.log(`        JS: ${jsVal.toFixed(6)}, R: ${rVal.toFixed(6)}, Diff: ${absDiff.toFixed(8)} (>${tolerance*100}%)`);
    failures.push({ test: testName, js: jsVal, r: rVal, diff: absDiff, relDiff });
  }

  return passed;
}

// =============================================================================
// Effect Size Calculations (Pure JS, no workers needed)
// =============================================================================

/**
 * Odds Ratio calculation
 */
function oddsRatio(a, b, c, d, cc = 0.5) {
  const needsCorrection = a === 0 || b === 0 || c === 0 || d === 0;
  if (needsCorrection && cc > 0) {
    a += cc; b += cc; c += cc; d += cc;
  }
  if (a <= 0 || b <= 0 || c <= 0 || d <= 0) {
    return { yi: null, vi: null };
  }
  const logOR = Math.log(a * d / (b * c));
  const variance = 1/a + 1/b + 1/c + 1/d;
  return { yi: logOR, vi: variance, or: Math.exp(logOR) };
}

/**
 * Risk Ratio calculation
 */
function riskRatio(a, n1, c, n2, cc = 0.5) {
  const needsCorrection = a === 0 || c === 0;
  if (needsCorrection && cc > 0) {
    a += cc; c += cc; n1 += cc; n2 += cc;
  }
  if (a <= 0 || c <= 0 || n1 <= 0 || n2 <= 0) {
    return { yi: null, vi: null };
  }
  const p1 = a / n1;
  const p2 = c / n2;
  const logRR = Math.log(p1 / p2);
  const variance = (1 - p1) / a + (1 - p2) / c;
  return { yi: logRR, vi: variance };
}

/**
 * Standardized Mean Difference (Hedges' g)
 */
function standardizedMeanDifference(m1, sd1, n1, m2, sd2, n2) {
  if (n1 <= 1 || n2 <= 1 || sd1 <= 0 || sd2 <= 0) {
    return { yi: null, vi: null };
  }

  const pooledSD = Math.sqrt(
    ((n1 - 1) * sd1 * sd1 + (n2 - 1) * sd2 * sd2) / (n1 + n2 - 2)
  );

  if (pooledSD === 0) {
    return { yi: null, vi: null };
  }

  const d = (m1 - m2) / pooledSD;
  const df = n1 + n2 - 2;
  const J = 1 - (3 / (4 * df - 1));  // Hedges' correction
  const g = J * d;
  const variance = (n1 + n2) / (n1 * n2) + (g * g) / (2 * df);

  return { yi: g, vi: variance };
}

// =============================================================================
// Meta-Analysis Functions
// =============================================================================

/**
 * Normal CDF approximation
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
 * Fixed Effects meta-analysis
 */
function fixedEffects(studies) {
  const k = studies.length;
  const weights = studies.map(s => 1 / s.vi);
  const sumWeights = weights.reduce((a, b) => a + b, 0);

  const estimate = studies.reduce((sum, s, i) => sum + weights[i] * s.yi, 0) / sumWeights;
  const variance = 1 / sumWeights;
  const se = Math.sqrt(variance);

  return {
    estimate,
    se,
    variance,
    ci_lower: estimate - 1.96 * se,
    ci_upper: estimate + 1.96 * se,
    k
  };
}

/**
 * DerSimonian-Laird estimator
 */
function derSimonianLaird(studies) {
  const k = studies.length;
  const weights = studies.map(s => 1 / s.vi);
  const sumWeights = weights.reduce((a, b) => a + b, 0);
  const sumWeights2 = weights.reduce((a, b) => a + b * b, 0);

  // Fixed effects estimate for Q
  const thetaFE = studies.reduce((sum, s, i) => sum + weights[i] * s.yi, 0) / sumWeights;

  // Cochran's Q
  const Q = studies.reduce((sum, s, i) => sum + weights[i] * Math.pow(s.yi - thetaFE, 2), 0);
  const df = k - 1;

  // DL tau² estimate
  const c = sumWeights - sumWeights2 / sumWeights;
  let tau2 = Math.max(0, (Q - df) / c);

  // Random effects weights
  const reWeights = studies.map(s => 1 / (s.vi + tau2));
  const sumREWeights = reWeights.reduce((a, b) => a + b, 0);

  const estimate = studies.reduce((sum, s, i) => sum + reWeights[i] * s.yi, 0) / sumREWeights;
  const variance = 1 / sumREWeights;
  const se = Math.sqrt(variance);

  // I² calculation
  const I2 = df > 0 ? Math.max(0, 100 * (Q - df) / Q) : 0;

  return {
    estimate,
    variance,
    se,
    ci_lower: estimate - 1.96 * se,
    ci_upper: estimate + 1.96 * se,
    tau2,
    tau: Math.sqrt(tau2),
    Q,
    df,
    I2,
    k
  };
}

/**
 * Paule-Mandel estimator
 */
function pauleMandel(studies, maxIter = 1000, tol = 1e-8) {
  const k = studies.length;
  const df = k - 1;

  // Start with DL estimate
  const dlResult = derSimonianLaird(studies);
  let tau2 = dlResult.tau2;

  // Iterative estimation
  for (let iter = 0; iter < maxIter; iter++) {
    const weights = studies.map(s => 1 / (s.vi + tau2));
    const sumWeights = weights.reduce((a, b) => a + b, 0);

    const theta = studies.reduce((sum, s, i) => sum + weights[i] * s.yi, 0) / sumWeights;
    const Q = studies.reduce((sum, s, i) => sum + weights[i] * Math.pow(s.yi - theta, 2), 0);

    // PM criterion: Q should equal k-1
    if (Math.abs(Q - df) < tol || tau2 === 0 && Q < df) {
      break;
    }

    // Update tau2 using method of moments style update
    const c = sumWeights - weights.reduce((a, w) => a + w * w, 0) / sumWeights;
    const tau2_new = Math.max(0, (Q - df) / c + tau2 * (Q - df) / df);

    if (Math.abs(tau2_new - tau2) < tol) break;
    tau2 = tau2_new;
  }

  // Final calculation
  const weights = studies.map(s => 1 / (s.vi + tau2));
  const sumWeights = weights.reduce((a, b) => a + b, 0);
  const estimate = studies.reduce((sum, s, i) => sum + weights[i] * s.yi, 0) / sumWeights;
  const variance = 1 / sumWeights;
  const se = Math.sqrt(variance);

  return {
    estimate,
    variance,
    se,
    ci_lower: estimate - 1.96 * se,
    ci_upper: estimate + 1.96 * se,
    tau2,
    tau: Math.sqrt(tau2),
    k,
    estimator: 'PM'
  };
}

/**
 * REML estimator using Fisher scoring
 */
function remlEstimator(studies, maxIter = 1000, tol = 1e-8) {
  const k = studies.length;
  const vi = studies.map(s => s.vi);
  const yi = studies.map(s => s.yi);

  // Start with DL estimate
  const dlResult = derSimonianLaird(studies);
  let tau2 = dlResult.tau2;

  // Fisher scoring iterations
  for (let iter = 0; iter < maxIter; iter++) {
    const weights = vi.map(v => 1 / (v + tau2));
    const sumWeights = weights.reduce((a, b) => a + b, 0);

    const theta = yi.reduce((sum, y, i) => sum + weights[i] * y, 0) / sumWeights;

    // REML log-likelihood derivative
    const P = weights.map(w => w - w * w / sumWeights);
    const resid = yi.map((y, i) => y - theta);

    // Score (first derivative of REML log-likelihood)
    let score = 0;
    for (let i = 0; i < k; i++) {
      score += -0.5 * weights[i] * weights[i] + 0.5 * weights[i] * weights[i] * resid[i] * resid[i];
    }

    // Fisher information (negative expected second derivative)
    let info = 0;
    for (let i = 0; i < k; i++) {
      info += 0.5 * weights[i] * weights[i];
    }

    if (info === 0) break;

    const tau2_new = Math.max(0, tau2 + score / info);

    if (Math.abs(tau2_new - tau2) < tol) break;
    tau2 = tau2_new;
  }

  // Final calculation
  const weights = vi.map(v => 1 / (v + tau2));
  const sumWeights = weights.reduce((a, b) => a + b, 0);
  const estimate = yi.reduce((sum, y, i) => sum + weights[i] * y, 0) / sumWeights;
  const variance = 1 / sumWeights;
  const se = Math.sqrt(variance);

  return {
    estimate,
    variance,
    se,
    ci_lower: estimate - 1.96 * se,
    ci_upper: estimate + 1.96 * se,
    tau2,
    tau: Math.sqrt(tau2),
    k,
    estimator: 'REML'
  };
}

/**
 * HKSJ (Knapp-Hartung-Sidik-Jonkman) adjustment
 */
function applyHKSJ(studies, reResult) {
  const k = studies.length;
  const df = k - 1;

  if (df < 1) return reResult;

  // Calculate q (HKSJ scaling factor)
  const weights = studies.map(s => 1 / (s.vi + reResult.tau2));
  const sumWeights = weights.reduce((a, b) => a + b, 0);

  const qNumerator = studies.reduce((sum, s, i) =>
    sum + weights[i] * Math.pow(s.yi - reResult.estimate, 2), 0);
  const q = qNumerator / df;

  // HKSJ SE adjustment (with "never narrower" rule)
  const seHKSJ = reResult.se * Math.sqrt(Math.max(1, q));

  // t-critical value for df = k-1
  const tCrit = tQuantile(0.975, df);

  // Apply "never narrower" rule from IntHout et al. 2014
  const ciHalfWidth = Math.max(
    tCrit * seHKSJ,       // HKSJ CI half-width
    1.96 * reResult.se    // Wald CI half-width
  );

  return {
    ...reResult,
    se: seHKSJ,
    se_original: reResult.se,
    ci_lower: reResult.estimate - ciHalfWidth,
    ci_upper: reResult.estimate + ciHalfWidth,
    hksj_applied: true,
    hksj_q: q,
    hksj_t_crit: tCrit,
    never_narrower_applied: tCrit * seHKSJ < 1.96 * reResult.se
  };
}

/**
 * t-distribution quantile approximation
 */
function tQuantile(p, df) {
  // Simple approximation for t quantile
  // For accurate values, use a proper statistical library
  if (df >= 30) {
    // Normal approximation for large df
    return normalQuantile(p);
  }

  // Lookup table for common quantiles (0.975, various df)
  const tTable = {
    1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571,
    6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228,
    11: 2.201, 12: 2.179, 13: 2.160, 14: 2.145, 15: 2.131,
    20: 2.086, 25: 2.060, 30: 2.042
  };

  if (tTable[df]) return tTable[df];

  // Interpolate or use closest
  const dfs = Object.keys(tTable).map(Number).sort((a,b) => a-b);
  for (let i = 0; i < dfs.length - 1; i++) {
    if (df > dfs[i] && df < dfs[i+1]) {
      const w = (df - dfs[i]) / (dfs[i+1] - dfs[i]);
      return tTable[dfs[i]] * (1-w) + tTable[dfs[i+1]] * w;
    }
  }

  return 1.96; // fallback
}

/**
 * Normal quantile (inverse CDF)
 */
function normalQuantile(p) {
  // Approximation using Abramowitz and Stegun formula 26.2.23
  if (p <= 0 || p >= 1) return NaN;
  if (p === 0.5) return 0;

  const sign = p < 0.5 ? -1 : 1;
  p = p < 0.5 ? p : 1 - p;

  const t = Math.sqrt(-2 * Math.log(p));
  const c0 = 2.515517;
  const c1 = 0.802853;
  const c2 = 0.010328;
  const d1 = 1.432788;
  const d2 = 0.189269;
  const d3 = 0.001308;

  const result = t - (c0 + c1*t + c2*t*t) / (1 + d1*t + d2*t*t + d3*t*t*t);
  return sign * result;
}

/**
 * Prediction interval calculation
 */
function calculatePredictionInterval(estimate, tau2, se, k) {
  const df = k - 2;
  if (df < 1) return { lower: null, upper: null, df: null };

  const tCrit = tQuantile(0.975, df);
  const piSE = Math.sqrt(tau2 + se * se);

  return {
    lower: estimate - tCrit * piSE,
    upper: estimate + tCrit * piSE,
    df
  };
}

/**
 * Egger's test (radial regression)
 */
function runEggerTest(studies) {
  const k = studies.length;
  if (k < 3) return { intercept: null, p_value: null, error: 'k < 3' };

  // Radial regression: standardized effect ~ precision
  // yi/sqrt(vi) ~ 1/sqrt(vi)
  const precision = studies.map(s => 1 / Math.sqrt(s.vi));
  const standardEffect = studies.map(s => s.yi / Math.sqrt(s.vi));

  // Linear regression
  const n = k;
  const sumX = precision.reduce((a, b) => a + b, 0);
  const sumY = standardEffect.reduce((a, b) => a + b, 0);
  const sumXY = precision.reduce((sum, x, i) => sum + x * standardEffect[i], 0);
  const sumX2 = precision.reduce((sum, x) => sum + x * x, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // Calculate SE of intercept
  const yHat = precision.map(x => intercept + slope * x);
  const residuals = standardEffect.map((y, i) => y - yHat[i]);
  const sse = residuals.reduce((sum, r) => sum + r * r, 0);
  const mse = sse / (n - 2);
  const seIntercept = Math.sqrt(mse * (1/n + Math.pow(sumX/n, 2) / (sumX2 - sumX*sumX/n)));

  // t-test for intercept
  const t = intercept / seIntercept;
  const df = n - 2;
  const pValue = 2 * (1 - tCDF(Math.abs(t), df));

  return {
    intercept,
    se: seIntercept,
    t_value: t,
    p_value: pValue,
    df,
    power_warning: k < 10 ? 'Low power with k < 10 studies' : null
  };
}

/**
 * t-distribution CDF approximation
 */
function tCDF(t, df) {
  // Use normal approximation for large df
  if (df >= 30) {
    return normalCDF(t);
  }

  // Beta function approximation for smaller df
  const x = df / (df + t * t);
  return 1 - 0.5 * incompleteBeta(df/2, 0.5, x);
}

/**
 * Incomplete beta function (simple approximation)
 */
function incompleteBeta(a, b, x) {
  // Simple power series approximation
  if (x === 0) return 0;
  if (x === 1) return 1;

  // Use continued fraction for better accuracy
  const bt = Math.exp(
    lgamma(a + b) - lgamma(a) - lgamma(b) +
    a * Math.log(x) + b * Math.log(1 - x)
  );

  if (x < (a + 1) / (a + b + 2)) {
    return bt * betaCF(a, b, x) / a;
  } else {
    return 1 - bt * betaCF(b, a, 1 - x) / b;
  }
}

/**
 * Log gamma function
 */
function lgamma(x) {
  const g = 7;
  const C = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7
  ];

  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  }

  x -= 1;
  let a = C[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) {
    a += C[i] / (x + i);
  }

  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/**
 * Beta continued fraction
 */
function betaCF(a, b, x) {
  const maxIter = 100;
  const eps = 1e-10;

  let qab = a + b;
  let qap = a + 1;
  let qam = a - 1;
  let c = 1;
  let d = 1 - qab * x / qap;
  if (Math.abs(d) < eps) d = eps;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= maxIter; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < eps) d = eps;
    c = 1 + aa / c;
    if (Math.abs(c) < eps) c = eps;
    d = 1 / d;
    h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < eps) d = eps;
    c = 1 + aa / c;
    if (Math.abs(c) < eps) c = eps;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < eps) break;
  }

  return h;
}

/**
 * Heterogeneity calculation with I² CI
 */
function calculateHeterogeneity(studies, reResult) {
  const k = studies.length;
  const df = k - 1;

  const weights = studies.map(s => 1 / s.vi);
  const sumWeights = weights.reduce((a, b) => a + b, 0);
  const thetaFE = studies.reduce((sum, s, i) => sum + weights[i] * s.yi, 0) / sumWeights;

  const Q = studies.reduce((sum, s, i) => sum + weights[i] * Math.pow(s.yi - thetaFE, 2), 0);
  const I2 = df > 0 ? Math.max(0, 100 * (Q - df) / Q) : 0;
  const H2 = df > 0 ? Q / df : 1;

  // I² CI using test-based method (Higgins & Thompson 2002)
  // This is an approximation - Q-profile method is more accurate
  const seLogH = Math.sqrt(1/(2*(k-1)) * (1 - 1/(3*Math.pow(k-1, 2))));
  const logH = 0.5 * Math.log(H2);
  const H_lower = Math.exp(logH - 1.96 * seLogH);
  const H_upper = Math.exp(logH + 1.96 * seLogH);

  const I2_lower = Math.max(0, 100 * (H_lower * H_lower - 1) / (H_lower * H_lower));
  const I2_upper = Math.min(100, 100 * (H_upper * H_upper - 1) / (H_upper * H_upper));

  // Chi-square p-value for Q
  const Q_p = 1 - chiSquareCDF(Q, df);

  return {
    Q,
    df,
    Q_p,
    I2,
    I2_ci_lower: I2_lower,
    I2_ci_upper: I2_upper,
    H2,
    method: 'test-based (Higgins & Thompson 2002)'
  };
}

/**
 * Chi-square CDF approximation
 */
function chiSquareCDF(x, df) {
  // Approximation using incomplete gamma
  return gammainc(df/2, x/2);
}

/**
 * Regularized incomplete gamma function
 */
function gammainc(a, x) {
  if (x < 0 || a <= 0) return NaN;
  if (x === 0) return 0;

  if (x < a + 1) {
    // Series expansion
    let sum = 1 / a;
    let term = sum;
    for (let n = 1; n < 100; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < 1e-10 * Math.abs(sum)) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - lgamma(a));
  } else {
    // Continued fraction
    let b = x + 1 - a;
    let c = 1e30;
    let d = 1 / b;
    let h = d;
    for (let n = 1; n < 100; n++) {
      const an = -n * (n - a);
      b += 2;
      d = an * d + b;
      if (Math.abs(d) < 1e-30) d = 1e-30;
      c = b + an / c;
      if (Math.abs(c) < 1e-30) c = 1e-30;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < 1e-10) break;
    }
    return 1 - h * Math.exp(-x + a * Math.log(x) - lgamma(a));
  }
}

// =============================================================================
// BCG Dataset (from metafor)
// =============================================================================
const bcgData = [
  { trial: 1, tpos: 4, tneg: 119, cpos: 11, cneg: 128 },
  { trial: 2, tpos: 6, tneg: 300, cpos: 29, cneg: 274 },
  { trial: 3, tpos: 3, tneg: 228, cpos: 11, cneg: 209 },
  { trial: 4, tpos: 62, tneg: 13536, cpos: 248, cneg: 12619 },
  { trial: 5, tpos: 33, tneg: 5036, cpos: 47, cneg: 5761 },
  { trial: 6, tpos: 180, tneg: 1361, cpos: 372, cneg: 1079 },
  { trial: 7, tpos: 8, tneg: 2537, cpos: 10, cneg: 619 },
  { trial: 8, tpos: 505, tneg: 87886, cpos: 499, cneg: 87892 },
  { trial: 9, tpos: 29, tneg: 7470, cpos: 45, cneg: 7232 },
  { trial: 10, tpos: 17, tneg: 1699, cpos: 65, cneg: 1600 },
  { trial: 11, tpos: 186, tneg: 50448, cpos: 141, cneg: 27197 },
  { trial: 12, tpos: 5, tneg: 2493, cpos: 3, cneg: 2338 },
  { trial: 13, tpos: 27, tneg: 16886, cpos: 29, cneg: 17825 }
];

// Calculate OR for each study
const bcgStudies = bcgData.map((d, i) => {
  const or = oddsRatio(d.tpos, d.tneg, d.cpos, d.cneg, 0);
  return {
    id: d.trial,
    label: `Trial ${d.trial}`,
    yi: or.yi,
    vi: or.vi
  };
});

// =============================================================================
// Run Tests
// =============================================================================
console.log('='.repeat(70));
console.log('LIVING META-ANALYSIS VALIDATION TEST');
console.log('='.repeat(70));
console.log();

// Test 1: Effect Size Calculations
console.log('-'.repeat(70));
console.log('TEST 1: Effect Size Calculations');
console.log('-'.repeat(70));

// OR calculation
const orTest = oddsRatio(100, 200, 150, 250, 0);
compare(orTest.yi, reference.or_calc.log_or, 'OR: log(OR)');
compare(orTest.vi, reference.or_calc.variance, 'OR: variance');

// RR calculation
const rrTest = riskRatio(100, 300, 150, 400, 0);
compare(rrTest.yi, reference.rr_calc.log_rr, 'RR: log(RR)');
compare(rrTest.vi, reference.rr_calc.variance, 'RR: variance');

// SMD calculation
const smdTest = standardizedMeanDifference(10, 2, 30, 8, 2.5, 35);
compare(smdTest.yi, reference.smd_calc.g, 'SMD: Hedges\' g');
compare(smdTest.vi, reference.smd_calc.variance, 'SMD: variance');

// Test 2: Fixed Effects
console.log();
console.log('-'.repeat(70));
console.log('TEST 2: Fixed Effects Model (BCG Data)');
console.log('-'.repeat(70));

const feResult = fixedEffects(bcgStudies);
compare(feResult.estimate, reference.fe.pooled_log, 'FE: pooled estimate');
compare(feResult.se, reference.fe.se, 'FE: SE');
compare(feResult.ci_lower, reference.fe.ci_lower, 'FE: CI lower');
compare(feResult.ci_upper, reference.fe.ci_upper, 'FE: CI upper');

// Test 3: DerSimonian-Laird
console.log();
console.log('-'.repeat(70));
console.log('TEST 3: DerSimonian-Laird (BCG Data)');
console.log('-'.repeat(70));

const dlResult = derSimonianLaird(bcgStudies);
compare(dlResult.estimate, reference.bcg_dl.pooled_log, 'DL: pooled estimate');
compare(dlResult.se, reference.bcg_dl.se, 'DL: SE');
compare(dlResult.tau2, reference.bcg_dl.tau2, 'DL: tau2');
compare(dlResult.Q, reference.bcg_dl.Q, 'DL: Q statistic');
compare(dlResult.I2, reference.bcg_dl.I2, 'DL: I2');

// Test 4: Paule-Mandel
console.log();
console.log('-'.repeat(70));
console.log('TEST 4: Paule-Mandel (BCG Data)');
console.log('-'.repeat(70));

const pmResult = pauleMandel(bcgStudies);
compare(pmResult.tau2, reference.bcg_pm.tau2, 'PM: tau2', { tolerance: 0.01 });
compare(pmResult.estimate, reference.bcg_pm.pooled_log, 'PM: pooled estimate', { tolerance: 0.01 });

// Test 5: REML
console.log();
console.log('-'.repeat(70));
console.log('TEST 5: REML (BCG Data)');
console.log('-'.repeat(70));

const remlResult = remlEstimator(bcgStudies);
compare(remlResult.tau2, reference.bcg_reml.tau2, 'REML: tau2', { tolerance: 0.05 });
compare(remlResult.estimate, reference.bcg_reml.pooled_log, 'REML: pooled estimate', { tolerance: 0.01 });

// Test 6: HKSJ Adjustment
console.log();
console.log('-'.repeat(70));
console.log('TEST 6: HKSJ Adjustment (BCG Data)');
console.log('-'.repeat(70));

const hksjResult = applyHKSJ(bcgStudies, dlResult);
compare(hksjResult.ci_lower, reference.bcg_hksj.ci_lower, 'HKSJ: CI lower');
compare(hksjResult.ci_upper, reference.bcg_hksj.ci_upper, 'HKSJ: CI upper');

// Test 7: Prediction Interval
console.log();
console.log('-'.repeat(70));
console.log('TEST 7: Prediction Interval (BCG Data)');
console.log('-'.repeat(70));

const piResult = calculatePredictionInterval(dlResult.estimate, dlResult.tau2, dlResult.se, dlResult.k);
compare(piResult.lower, reference.bcg_pi.pi_lower, 'PI: lower');
compare(piResult.upper, reference.bcg_pi.pi_upper, 'PI: upper');
compare(piResult.df, reference.bcg_pi.df, 'PI: df');

// Test 8: Heterogeneity (I² CI)
console.log();
console.log('-'.repeat(70));
console.log('TEST 8: Heterogeneity & I² CI (BCG Data)');
console.log('-'.repeat(70));

const hetResult = calculateHeterogeneity(bcgStudies, dlResult);
compare(hetResult.I2, reference.bcg_i2ci.I2, 'I2: point estimate');
// Note: I² CI from test-based method differs from Q-profile
console.log(`  INFO: I² CI (test-based): [${hetResult.I2_ci_lower.toFixed(2)}%, ${hetResult.I2_ci_upper.toFixed(2)}%]`);
console.log(`  INFO: I² CI (Q-profile/R): [${reference.bcg_i2ci.I2_lower.toFixed(2)}%, ${reference.bcg_i2ci.I2_upper.toFixed(2)}%]`);

// Test 9: Egger's Test
console.log();
console.log('-'.repeat(70));
console.log('TEST 9: Egger\'s Test (BCG Data)');
console.log('-'.repeat(70));

const eggerResult = runEggerTest(bcgStudies);
compare(eggerResult.intercept, reference.bcg_egger.intercept, 'Egger: intercept');
compare(eggerResult.t_value, reference.bcg_egger.t_value, 'Egger: t-value');
compare(eggerResult.p_value, reference.bcg_egger.p_value, 'Egger: p-value', { tolerance: 0.05 });

// Test 10: Edge Cases
console.log();
console.log('-'.repeat(70));
console.log('TEST 10: Edge Cases');
console.log('-'.repeat(70));

// Homogeneous studies (zero heterogeneity)
const homoStudies = [
  { yi: -0.5, vi: 0.1 },
  { yi: -0.5, vi: 0.1 },
  { yi: -0.5, vi: 0.1 },
  { yi: -0.5, vi: 0.1 },
  { yi: -0.5, vi: 0.1 }
];
const homoResult = derSimonianLaird(homoStudies);
compare(homoResult.tau2, reference.homogeneous.tau2, 'Homogeneous: tau2');
compare(homoResult.I2, reference.homogeneous.I2, 'Homogeneous: I2');

// Heterogeneous studies
const heteroStudies = [
  { yi: -1.5, vi: 0.1 },
  { yi: -0.5, vi: 0.1 },
  { yi: 0.5, vi: 0.1 },
  { yi: 1.0, vi: 0.1 },
  { yi: -2.0, vi: 0.1 }
];
const heteroResult = derSimonianLaird(heteroStudies);
compare(heteroResult.tau2, reference.heterogeneous.tau2, 'Heterogeneous: tau2');
compare(heteroResult.I2, reference.heterogeneous.I2, 'Heterogeneous: I2');
compare(heteroResult.estimate, reference.heterogeneous.pooled, 'Heterogeneous: pooled');

// =============================================================================
// Summary
// =============================================================================
console.log();
console.log('='.repeat(70));
console.log('VALIDATION SUMMARY');
console.log('='.repeat(70));
console.log();
console.log(`Total tests: ${totalTests}`);
console.log(`Passed: ${passedTests} (${(100 * passedTests / totalTests).toFixed(1)}%)`);
console.log(`Failed: ${failedTests} (${(100 * failedTests / totalTests).toFixed(1)}%)`);
console.log();

if (failures.length > 0) {
  console.log('FAILURES:');
  failures.forEach(f => {
    console.log(`  - ${f.test}: JS=${f.js?.toFixed?.(6) ?? f.js}, R=${f.r?.toFixed?.(6) ?? f.r}`);
  });
} else {
  console.log('ALL TESTS PASSED!');
}

console.log();
console.log('Note: I² CI uses test-based method (Higgins & Thompson 2002).');
console.log('For Q-profile CI (more accurate), use the R implementation.');
console.log();
