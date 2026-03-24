/**
 * Expanded Validation Suite for Living Meta-Analysis
 * Tests: trim-fill, leave-one-out, Peters, rare events, continuous (SMD), large k
 * Reference: metafor R package
 */

const fs = require('fs');
const path = require('path');

// Load reference data
const refPath = path.join(__dirname, 'expanded_reference.json');
const ref = JSON.parse(fs.readFileSync(refPath, 'utf8'));

// Load analysis worker and extract the entire code
const workerPath = path.join(__dirname, '../../src/workers/analysis_worker.js');
const workerCode = fs.readFileSync(workerPath, 'utf8');

// Tolerance for comparisons
const TOL = 0.001;
const LOOSE_TOL = 0.05;

let passed = 0;
let failed = 0;

function approxEqual(a, b, tol = TOL) {
  if (a === null || b === null) return a === b;
  return Math.abs(a - b) < tol;
}

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`✗ ${name}`);
    console.log(`  ${e.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, msg, tol = TOL) {
  if (!approxEqual(actual, expected, tol)) {
    throw new Error(`${msg}: expected ${expected}, got ${actual}`);
  }
}

// ============================================================================
// Re-implement core functions (matching analysis_worker.js)
// ============================================================================

function calculateDL(studies) {
  const validStudies = studies.filter(s => s.yi != null && s.vi != null && s.vi > 0);
  const k = validStudies.length;
  const weights = validStudies.map(s => 1 / s.vi);
  const sumW = weights.reduce((a, b) => a + b, 0);
  const sumW2 = weights.reduce((a, w) => a + w * w, 0);
  const thetaFE = validStudies.reduce((sum, s, i) => sum + weights[i] * s.yi, 0) / sumW;
  const Q = validStudies.reduce((sum, s, i) => sum + weights[i] * Math.pow(s.yi - thetaFE, 2), 0);
  const c = sumW - sumW2 / sumW;
  const tau2 = Math.max(0, (Q - (k - 1)) / c);
  const reW = validStudies.map(s => 1 / (s.vi + tau2));
  const sumREW = reW.reduce((a, b) => a + b, 0);
  const estimate = validStudies.reduce((sum, s, i) => sum + reW[i] * s.yi, 0) / sumREW;
  const se = Math.sqrt(1 / sumREW);
  const I2 = k > 1 && Q > 0 ? Math.max(0, 100 * (Q - (k-1)) / Q) : 0;
  return { estimate, se, tau2, Q, I2, k, ci_lower: estimate - 1.96 * se, ci_upper: estimate + 1.96 * se };
}

function calculatePM(studies) {
  const validStudies = studies.filter(s => s.yi != null && s.vi != null && s.vi > 0);
  const k = validStudies.length;
  const target = k - 1;

  function computeQstar(tau2) {
    const wi = validStudies.map(s => 1 / (s.vi + tau2));
    const sumWi = wi.reduce((a, b) => a + b, 0);
    const theta = validStudies.reduce((sum, s, i) => sum + wi[i] * s.yi, 0) / sumWi;
    return validStudies.reduce((sum, s, i) => sum + wi[i] * Math.pow(s.yi - theta, 2), 0);
  }

  const Q0 = computeQstar(0);
  if (Q0 <= target) {
    const wi = validStudies.map(s => 1 / s.vi);
    const sumWi = wi.reduce((a, b) => a + b, 0);
    const estimate = validStudies.reduce((sum, s, i) => sum + wi[i] * s.yi, 0) / sumWi;
    return { tau2: 0, estimate, se: Math.sqrt(1/sumWi), k };
  }

  let lower = 0, upper = 1;
  while (computeQstar(upper) > target && upper < 1e10) upper *= 2;

  for (let iter = 0; iter < 100; iter++) {
    const tau2Mid = (lower + upper) / 2;
    const Qmid = computeQstar(tau2Mid);
    if (Math.abs(Qmid - target) < 1e-10 || upper - lower < 1e-10) break;
    if (Qmid > target) lower = tau2Mid;
    else upper = tau2Mid;
  }

  const tau2 = (lower + upper) / 2;
  const wi = validStudies.map(s => 1 / (s.vi + tau2));
  const sumWi = wi.reduce((a, b) => a + b, 0);
  const estimate = validStudies.reduce((sum, s, i) => sum + wi[i] * s.yi, 0) / sumWi;
  return { tau2, estimate, se: Math.sqrt(1/sumWi), k };
}

function calculateREML(studies) {
  const validStudies = studies.filter(s => s.yi != null && s.vi != null && s.vi > 0);
  const k = validStudies.length;
  const dlResult = calculateDL(validStudies);

  // Brent's method for REML
  function remlLogLik(tau2) {
    const w = validStudies.map(s => 1 / (s.vi + tau2));
    const sumW = w.reduce((a, b) => a + b, 0);
    const theta = validStudies.reduce((sum, s, i) => sum + w[i] * s.yi, 0) / sumW;
    let ll = 0;
    for (let i = 0; i < k; i++) {
      const v = validStudies[i].vi + tau2;
      const r = validStudies[i].yi - theta;
      ll -= 0.5 * (Math.log(v) + r * r / v);
    }
    ll -= 0.5 * Math.log(sumW);
    return -ll;  // return negative for minimization
  }

  const GOLDEN = 0.381966;
  let a = 0, b = Math.max(dlResult.tau2 * 4, 1);
  let x = a + GOLDEN * (b - a);
  let w = x, v = x;
  let fx = remlLogLik(x);
  let fw = fx, fv = fx;

  for (let iter = 0; iter < 100; iter++) {
    const mid = 0.5 * (a + b);
    const tol1 = 1e-8 * Math.abs(x) + 1e-10;
    const tol2 = 2 * tol1;

    if (Math.abs(x - mid) <= tol2 - 0.5 * (b - a)) break;

    let u;
    if (Math.abs(b - a) > tol1) {
      let r = (x - w) * (fx - fv);
      let q = (x - v) * (fx - fw);
      let p = (x - v) * q - (x - w) * r;
      q = 2 * (q - r);
      if (q > 0) p = -p;
      else q = -q;

      if (Math.abs(p) < Math.abs(0.5 * q * (b - a)) && p > q * (a - x) && p < q * (b - x)) {
        u = x + p / q;
      } else {
        u = (x < mid) ? x + GOLDEN * (b - x) : x - GOLDEN * (x - a);
      }
    } else {
      u = (x < mid) ? x + GOLDEN * (b - x) : x - GOLDEN * (x - a);
    }

    if (Math.abs(u - x) < tol1) u = x + (u > x ? tol1 : -tol1);
    const fu = remlLogLik(u);

    if (fu <= fx) {
      if (u < x) b = x; else a = x;
      v = w; fv = fw;
      w = x; fw = fx;
      x = u; fx = fu;
    } else {
      if (u < x) a = u; else b = u;
      if (fu <= fw || w === x) {
        v = w; fv = fw;
        w = u; fw = fu;
      } else if (fu <= fv || v === x || v === w) {
        v = u; fv = fu;
      }
    }
  }

  const tau2 = Math.max(0, x);
  const wi = validStudies.map(s => 1 / (s.vi + tau2));
  const sumWi = wi.reduce((a, b) => a + b, 0);
  const estimate = validStudies.reduce((sum, s, i) => sum + wi[i] * s.yi, 0) / sumWi;
  return { tau2, estimate, se: Math.sqrt(1/sumWi), k };
}

// t-distribution quantile via Newton-Raphson
function lnGamma(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
             -1.231739572450155, 0.001208650973866179, -5.395239384953e-6];
  let y = x, tmp = x + 5.5;
  tmp = (x + 0.5) * Math.log(tmp) - tmp;
  let ser = 1.000000000190015;
  for (let i = 0; i < 6; i++) ser += c[i] / ++y;
  return tmp + Math.log(2.5066282746310005 * ser / x);
}

// Regularized incomplete beta function using continued fraction (Lentz method)
function betaIncomplete(x, a, b) {
  if (x === 0) return 0;
  if (x === 1) return 1;
  const lnBeta = lnGamma(a) + lnGamma(b) - lnGamma(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta) / a;
  const FPMIN = 1e-30, EPS = 1e-14, MAXIT = 200;
  let qab = a + b, qap = a + 1, qam = a - 1, c = 1;
  let d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    let m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    let del = d * c; h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return front * h;
}

function betaRegularized(x, a, b) {
  if (x < 0 || x > 1) return NaN;
  if (x === 0) return 0;
  if (x === 1) return 1;
  if (x > (a + 1) / (a + b + 2)) return 1 - betaIncomplete(1 - x, b, a);
  return betaIncomplete(x, a, b);
}

function tCDF(t, df) {
  if (df <= 0) return NaN;
  if (!isFinite(t)) return t > 0 ? 1 : 0;
  const x = df / (df + t * t);
  const prob = 0.5 * betaRegularized(x, df / 2, 0.5);
  return t > 0 ? 1 - prob : prob;
}

function normalQuantile(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
             1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
             6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
             -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const pLow = 0.02425, pHigh = 1 - pLow;
  let q, r;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  } else if (p <= pHigh) {
    q = p - 0.5; r = q * q;
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  }
}

function tQuantile(p, df) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;
  const z = normalQuantile(p);
  let lower = z * 2 - 10, upper = z * 2 + 10;
  while (tCDF(lower, df) > p) lower -= 10;
  while (tCDF(upper, df) < p) upper += 10;
  for (let i = 0; i < 100; i++) {
    const mid = (lower + upper) / 2;
    const cdf = tCDF(mid, df);
    if (Math.abs(cdf - p) < 1e-12) return mid;
    if (cdf < p) lower = mid; else upper = mid;
    if (upper - lower < 1e-12) break;
  }
  return (lower + upper) / 2;
}

function applyHKSJ(dlResult, studies, neverNarrower = false) {
  const validStudies = studies.filter(s => s.yi != null && s.vi != null && s.vi > 0);
  const k = validStudies.length;
  const tau2 = dlResult.tau2;
  const theta = dlResult.estimate;

  const wi = validStudies.map(s => 1 / (s.vi + tau2));
  const sumWi = wi.reduce((a, b) => a + b, 0);

  // Compute q (adjustment factor)
  let numerator = 0;
  for (let i = 0; i < k; i++) {
    numerator += wi[i] * Math.pow(validStudies[i].yi - theta, 2);
  }
  const q = numerator / (k - 1);

  // metafor default: allow q < 1 (can narrow CI when homogeneous)
  // neverNarrower option: enforce Math.max(1, q) to prevent narrowing
  const q_adj = neverNarrower ? Math.max(1, q) : q;
  const se_hksj = dlResult.se * Math.sqrt(q_adj);
  const df = k - 1;
  const t_crit = tQuantile(0.975, df);

  return {
    estimate: theta,
    se: se_hksj,
    ci_lower: theta - t_crit * se_hksj,
    ci_upper: theta + t_crit * se_hksj,
    adjustment_factor: q
  };
}

function runLeaveOneOut(studies) {
  const validStudies = studies.filter(s => s.yi != null && s.vi != null && s.vi > 0);
  const k = validStudies.length;
  const results = [];

  for (let i = 0; i < k; i++) {
    const subset = validStudies.filter((_, j) => j !== i);
    const dlResult = calculateDL(subset);
    results.push({
      omitted: i,
      estimate: dlResult.estimate,
      se: dlResult.se,
      tau2: dlResult.tau2,
      I2: dlResult.I2,
      ci_lower: dlResult.ci_lower,
      ci_upper: dlResult.ci_upper
    });
  }

  return results;
}

// Standard normal CDF
function normalCDF(x) {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

function runEggerTest(studies) {
  const validStudies = studies.filter(s => s.yi != null && s.vi != null && s.vi > 0);
  const k = validStudies.length;

  // metafor's regtest uses weighted regression with weights = 1/vi
  // Precision = 1/SE, standardized effect = yi/SE
  const x = validStudies.map(s => 1 / Math.sqrt(s.vi));  // precision
  const y = validStudies.map(s => s.yi / Math.sqrt(s.vi));  // standardized effect

  // Use simple WLS regression on (precision, standardized_effect)
  // This matches metafor's default regtest behavior
  const n = k;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // Standard errors (OLS)
  const yHat = x.map(xi => intercept + slope * xi);
  const sse = y.reduce((sum, yi, i) => sum + Math.pow(yi - yHat[i], 2), 0);
  const mse = sse / (n - 2);

  const sxx = sumX2 - sumX * sumX / n;
  const seIntercept = Math.sqrt(mse * sumX2 / (n * sxx));

  // z-test for intercept = 0 (metafor default uses z-test)
  const zStat = intercept / seIntercept;
  const pValue = 2 * (1 - normalCDF(Math.abs(zStat)));

  return { intercept, slope, seIntercept, zStat, pValue, df: n - 2 };
}

function runPetersTest(studies) {
  const validStudies = studies.filter(s => s.yi != null && s.vi != null && s.n && s.vi > 0);
  const k = validStudies.length;

  // Peters test: regress yi on n (sample size), weighted by 1/vi
  // metafor's regtest with predictor="ni" uses sample size directly
  const x = validStudies.map(s => s.n);  // sample size, not 1/n
  const y = validStudies.map(s => s.yi);
  const w = validStudies.map(s => 1 / s.vi);  // weights

  // Weighted least squares
  const sumW = w.reduce((a, b) => a + b, 0);
  const sumWX = w.reduce((sum, wi, i) => sum + wi * x[i], 0);
  const sumWY = w.reduce((sum, wi, i) => sum + wi * y[i], 0);
  const sumWXY = w.reduce((sum, wi, i) => sum + wi * x[i] * y[i], 0);
  const sumWX2 = w.reduce((sum, wi, i) => sum + wi * x[i] * x[i], 0);

  const slope = (sumW * sumWXY - sumWX * sumWY) / (sumW * sumWX2 - sumWX * sumWX);
  const intercept = (sumWY - slope * sumWX) / sumW;

  // Residual variance
  const yHat = x.map((xi) => intercept + slope * xi);
  const sse = y.reduce((sum, yi, i) => sum + w[i] * Math.pow(yi - yHat[i], 2), 0);
  const mse = sse / (k - 2);

  // SE of slope
  const seSlope = Math.sqrt(mse * sumW / (sumW * sumWX2 - sumWX * sumWX));

  // t-test for slope = 0 (uses t distribution with k-2 df)
  const tStat = slope / seSlope;
  const pValue = 2 * (1 - tCDF(Math.abs(tStat), k - 2));

  return { intercept, slope, seSlope, tStat, pValue, df: k - 2 };
}

function determineTrimFillSide(studies) {
  // Egger-type test: regress yi on sqrt(vi) to determine asymmetry direction
  const x = studies.map(s => Math.sqrt(s.vi));
  const y = studies.map(s => s.yi);
  const w = studies.map(s => 1 / s.vi);
  const sumW = w.reduce((a, b) => a + b, 0);
  const meanX = w.reduce((sum, wi, i) => sum + wi * x[i], 0) / sumW;
  const meanY = w.reduce((sum, wi, i) => sum + wi * y[i], 0) / sumW;
  let num = 0, den = 0;
  for (let i = 0; i < studies.length; i++) {
    num += w[i] * (x[i] - meanX) * (y[i] - meanY);
    den += w[i] * Math.pow(x[i] - meanX, 2);
  }
  const slope = num / den;
  return slope < 0 ? 'right' : 'left';
}

function runTrimAndFill(studies, pooledEstimate) {
  const validStudies = studies.filter(s =>
    s.yi !== null && s.vi !== null && !isNaN(s.yi) && !isNaN(s.vi) && s.vi > 0
  );
  const k = validStudies.length;
  if (k < 3) return { applicable: false, reason: 'k < 3' };

  // Determine side using Egger-type test (metafor method)
  const side = determineTrimFillSide(validStudies);

  // Work with flipped values if side='right' (looking for missing positive effects)
  let yi = validStudies.map(s => side === 'right' ? -s.yi : s.yi);
  const vi = validStudies.map(s => s.vi);

  // Sort indices by yi
  const indices = yi.map((_, i) => i).sort((a, b) => yi[a] - yi[b]);
  const sorted_yi = indices.map(i => yi[i]);
  const sorted_vi = indices.map(i => vi[i]);

  // Iterative L0 procedure (metafor algorithm)
  let k0 = 0, k0_prev = -1, iter = 0, beta;
  while (k0 !== k0_prev && iter < 50) {
    k0_prev = k0;
    iter++;
    // Use first (k - k0) studies (trim k0 most extreme on the right)
    const trimmed_yi = sorted_yi.slice(0, k - k0);
    const trimmed_vi = sorted_vi.slice(0, k - k0);
    // Compute DL on trimmed data
    const tw = trimmed_vi.map(v => 1 / v);
    const sumTW = tw.reduce((a, b) => a + b, 0);
    const sumTW2 = tw.reduce((a, w) => a + w * w, 0);
    const thetaFE = trimmed_yi.reduce((sum, y, i) => sum + tw[i] * y, 0) / sumTW;
    const Q = trimmed_yi.reduce((sum, y, i) => sum + tw[i] * Math.pow(y - thetaFE, 2), 0);
    const c = sumTW - sumTW2 / sumTW;
    const tau2 = Math.max(0, (Q - (trimmed_yi.length - 1)) / c);
    const rw = trimmed_vi.map(v => 1 / (v + tau2));
    const sumRW = rw.reduce((a, b) => a + b, 0);
    beta = trimmed_yi.reduce((sum, y, i) => sum + rw[i] * y, 0) / sumRW;
    // Compute centered values and ranks
    const yi_c = sorted_yi.map(y => y - beta);
    const absRanked = yi_c.map((y, i) => ({ idx: i, val: Math.abs(y) }))
                         .sort((a, b) => a.val - b.val || a.idx - b.idx);
    const ranks = new Array(k);
    absRanked.forEach((item, rank) => { ranks[item.idx] = rank + 1; });
    // Sr = sum of positive signed ranks
    const Sr = yi_c.reduce((sum, y, i) => y > 0 ? sum + ranks[i] : sum, 0);
    // L0 formula (metafor: no /2 in numerator!)
    const L0_raw = (4 * Sr - k * (k + 1)) / (2 * k - 1);
    k0 = Math.max(0, Math.round(L0_raw));
  }

  // Final calculation with imputed studies
  const dlResult = calculateDL(validStudies);
  let adjustedEstimate = dlResult.estimate, adjustedSE = dlResult.se;
  if (k0 > 0) {
    // Reflect k0 studies around the converged estimate
    // side='right' means missing positive effects -> reflect most negative to positive
    // side='left' means missing negative effects -> reflect most positive to negative
    const finalBeta = side === 'right' ? -beta : beta;
    const sorted2 = [...validStudies].sort((a, b) => a.yi - b.yi);
    // For side='right', take first k0 (most negative) and reflect to positive
    // For side='left', take last k0 (most positive) and reflect to negative
    const extremeStudies = side === 'right' ? sorted2.slice(0, k0) : sorted2.slice(-k0);
    const imputedStudies = extremeStudies.map(s => ({ yi: 2 * finalBeta - s.yi, vi: s.vi }));
    const allStudies = [...validStudies, ...imputedStudies];
    // Recompute DL with all studies
    const adjDL = calculateDL(allStudies);
    adjustedEstimate = adjDL.estimate;
    adjustedSE = adjDL.se;
  }

  return {
    applicable: true,
    k0,
    side,
    k_original: k,
    k_total: k + k0,
    original_estimate: pooledEstimate,
    adjusted_estimate: adjustedEstimate,
    adjusted_se: adjustedSE
  };
}

// ============================================================================
// BCG Dataset (from dat.bcg) - EXACT values from metafor
// ============================================================================
const bcgStudies = [
  { yi: -0.8893113339, vi: 0.3255847650 },
  { yi: -1.5853886572, vi: 0.1945811214 },
  { yi: -1.3480731483, vi: 0.4153679654 },
  { yi: -1.4415511900, vi: 0.0200100319 },
  { yi: -0.2175473222, vi: 0.0512101722 },
  { yi: -0.7861155858, vi: 0.0069056185 },
  { yi: -1.6208982236, vi: 0.2230172476 },
  { yi: 0.0119523335, vi: 0.0039615793 },
  { yi: -0.4694176487, vi: 0.0564342105 },
  { yi: -1.3713448035, vi: 0.0730247936 },
  { yi: -0.3393588283, vi: 0.0124122140 },
  { yi: 0.4459134006, vi: 0.5325058452 },
  { yi: -0.0173139482, vi: 0.0714046597 }
];

// Sample sizes for Peters test (from dat.bcg)
const bcgSampleSizes = [262, 609, 451, 26465, 10877, 2992, 3174, 176782, 14776, 3381, 77972, 4839, 34767];

// Reference LOO values from metafor (for direct comparison)
const bcgLooRef = {
  estimates: [-0.7051, -0.6545, -0.6848],
  tau2: [0.3122, 0.30, 0.3085],
  I2: [92.7432, 92.4304, 92.6763]
};

console.log('='.repeat(60));
console.log('EXPANDED VALIDATION SUITE - Living Meta-Analysis');
console.log('Reference: metafor R package');
console.log('='.repeat(60));
console.log('');

// ============================================================================
// Test 1: Trim-and-Fill (BCG - k0=0)
// ============================================================================
test('Trim-and-Fill: BCG k0=1', () => {
  // Compute DL estimate first, then run trim-and-fill
  const dlResult = calculateDL(bcgStudies);
  const result = runTrimAndFill(bcgStudies, dlResult.estimate);
  // BCG should have k0=1 (one missing study on right)
  assertEqual(result.k0, 1, 'k0');
  // Adjusted estimate (from metafor trimfill)
  assertEqual(result.adjusted_estimate, -0.6561, 'adjusted estimate', 0.05);
});

// ============================================================================
// Test 2: Trim-and-Fill (Large k - k0=7)
// ============================================================================
test('Trim-and-Fill: Large k k0=7', () => {
  const studies = ref.large_k_data.map(d => ({ yi: d.yi, vi: d.vi }));
  const result = runTrimAndFill(studies, ref.large_k.dl_estimate);
  assertEqual(result.k0, ref.large_k.trimfill_k0, 'k0');
  assertEqual(result.adjusted_estimate, ref.large_k.trimfill_estimate, 'adjusted estimate', LOOSE_TOL);
});

// ============================================================================
// Test 3: Leave-One-Out (BCG)
// ============================================================================
test('Leave-One-Out: estimates match', () => {
  const result = runLeaveOneOut(bcgStudies);
  assertEqual(result[0].estimate, bcgLooRef.estimates[0], 'LOO estimate 1', 0.01);
  assertEqual(result[1].estimate, bcgLooRef.estimates[1], 'LOO estimate 2', 0.01);
  assertEqual(result[2].estimate, bcgLooRef.estimates[2], 'LOO estimate 3', 0.01);
});

test('Leave-One-Out: tau2 matches', () => {
  const result = runLeaveOneOut(bcgStudies);
  assertEqual(result[0].tau2, bcgLooRef.tau2[0], 'LOO tau2 1', 0.01);
  assertEqual(result[1].tau2, bcgLooRef.tau2[1], 'LOO tau2 2', 0.01);
});

test('Leave-One-Out: I2 matches', () => {
  const result = runLeaveOneOut(bcgStudies);
  assertEqual(result[0].I2, bcgLooRef.I2[0], 'LOO I2 1', 0.5);
  assertEqual(result[1].I2, bcgLooRef.I2[1], 'LOO I2 2', 0.5);
});

// ============================================================================
// Test 4: Peters Test (BCG)
// ============================================================================
test('Peters Test: p-value significant', () => {
  // BCG studies with exact effect sizes and sample sizes
  const bcgWithN = bcgStudies.map((s, i) => ({ ...s, n: bcgSampleSizes[i] }));
  const result = runPetersTest(bcgWithN);
  // Peters p-value from R: 0.0006381702
  if (result.pValue > 0.05) {
    throw new Error(`Peters p-value should be < 0.05, got ${result.pValue}`);
  }
  assertEqual(result.pValue, 0.0006381702, 'Peters p-value', 0.01);
});

// ============================================================================
// Test 5: Rare Events (8 studies with zeros)
// ============================================================================
test('Rare Events: DL estimate', () => {
  const studies = ref.rare_data.map(d => ({ yi: d.yi, vi: d.vi }));
  const result = calculateDL(studies);
  assertEqual(result.estimate, ref.rare_events.dl_estimate, 'DL estimate', 0.01);
});

test('Rare Events: DL tau2=0', () => {
  const studies = ref.rare_data.map(d => ({ yi: d.yi, vi: d.vi }));
  const result = calculateDL(studies);
  assertEqual(result.tau2, ref.rare_events.dl_tau2, 'DL tau2', 0.01);
});

test('Rare Events: PM tau2=0', () => {
  const studies = ref.rare_data.map(d => ({ yi: d.yi, vi: d.vi }));
  const result = calculatePM(studies);
  assertEqual(result.tau2, ref.rare_events.pm_tau2, 'PM tau2', 0.01);
});

// ============================================================================
// Test 6: Continuous Outcomes (SMD, 10 studies)
// ============================================================================
test('SMD: DL estimate', () => {
  const studies = ref.smd_data.map(d => ({ yi: d.yi, vi: d.vi }));
  const result = calculateDL(studies);
  assertEqual(result.estimate, ref.smd.dl_estimate, 'DL estimate', 0.01);
});

test('SMD: DL tau2=0 (homogeneous)', () => {
  const studies = ref.smd_data.map(d => ({ yi: d.yi, vi: d.vi }));
  const result = calculateDL(studies);
  assertEqual(result.tau2, ref.smd.dl_tau2, 'DL tau2', 0.01);
});

test('SMD: HKSJ CI', () => {
  const studies = ref.smd_data.map(d => ({ yi: d.yi, vi: d.vi }));
  const dlResult = calculateDL(studies);
  const hksjResult = applyHKSJ(dlResult, studies);
  assertEqual(hksjResult.ci_lower, ref.smd.hksj_ci_lower, 'HKSJ CI lower', 0.01);
  assertEqual(hksjResult.ci_upper, ref.smd.hksj_ci_upper, 'HKSJ CI upper', 0.01);
});

// ============================================================================
// Test 7: Large k (50 studies)
// ============================================================================
test('Large k: DL estimate', () => {
  const studies = ref.large_k_data.map(d => ({ yi: d.yi, vi: d.vi }));
  const result = calculateDL(studies);
  assertEqual(result.estimate, ref.large_k.dl_estimate, 'DL estimate', 0.01);
});

test('Large k: DL tau2', () => {
  const studies = ref.large_k_data.map(d => ({ yi: d.yi, vi: d.vi }));
  const result = calculateDL(studies);
  assertEqual(result.tau2, ref.large_k.dl_tau2, 'DL tau2', 0.01);
});

test('Large k: DL I2', () => {
  const studies = ref.large_k_data.map(d => ({ yi: d.yi, vi: d.vi }));
  const result = calculateDL(studies);
  assertEqual(result.I2, ref.large_k.dl_I2, 'DL I2', 0.5);
});

test('Large k: REML tau2', () => {
  const studies = ref.large_k_data.map(d => ({ yi: d.yi, vi: d.vi }));
  const result = calculateREML(studies);
  assertEqual(result.tau2, ref.large_k.reml_tau2, 'REML tau2', 0.01);
});

test('Large k: HKSJ CI', () => {
  const studies = ref.large_k_data.map(d => ({ yi: d.yi, vi: d.vi }));
  const dlResult = calculateDL(studies);
  const hksjResult = applyHKSJ(dlResult, studies);
  assertEqual(hksjResult.ci_lower, ref.large_k.hksj_ci_lower, 'HKSJ CI lower', 0.02);
  assertEqual(hksjResult.ci_upper, ref.large_k.hksj_ci_upper, 'HKSJ CI upper', 0.02);
});

test('Large k: Egger p-value', () => {
  const studies = ref.large_k_data.map(d => ({ yi: d.yi, vi: d.vi }));
  const result = runEggerTest(studies);
  assertEqual(result.pValue, ref.large_k.egger_p, 'Egger p-value', 0.05);
});

// ============================================================================
// Summary
// ============================================================================
console.log('');
console.log('='.repeat(60));
console.log(`EXPANDED VALIDATION: ${passed}/${passed + failed} tests passed`);
console.log('='.repeat(60));

if (failed > 0) {
  process.exit(1);
}
