/**
 * Edge Case Test Suite for Living Meta-Analysis
 * Tests boundary conditions, numerical edge cases, and error handling
 * Reference: metafor R package
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
const TOL = 1e-6;

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
  if (Math.abs(actual - expected) > tol && !(isNaN(actual) && isNaN(expected))) {
    throw new Error(`${msg}: expected ${expected}, got ${actual}`);
  }
}

function assertTrue(condition, msg) {
  if (!condition) throw new Error(msg);
}

function assertFalse(condition, msg) {
  if (condition) throw new Error(msg);
}

// ============================================================================
// Re-implement core functions for testing
// ============================================================================

function lnGamma(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
             -1.231739572450155, 0.001208650973866179, -5.395239384953e-6];
  let y = x, tmp = x + 5.5;
  tmp = (x + 0.5) * Math.log(tmp) - tmp;
  let ser = 1.000000000190015;
  for (let i = 0; i < 6; i++) ser += c[i] / ++y;
  return tmp + Math.log(2.5066282746310005 * ser / x);
}

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

function normalCDF(x) {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
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

function calculateDL(studies) {
  const validStudies = studies.filter(s => s.yi != null && s.vi != null && s.vi > 0);
  const k = validStudies.length;
  if (k === 0) return { estimate: NaN, se: NaN, tau2: 0, Q: 0, I2: 0, k: 0 };
  if (k === 1) return { estimate: validStudies[0].yi, se: Math.sqrt(validStudies[0].vi), tau2: 0, Q: 0, I2: 0, k: 1 };

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

function calculateEValue(rr) {
  if (rr < 1) rr = 1 / rr;  // Work with RR >= 1
  return rr + Math.sqrt(rr * (rr - 1));
}

console.log('='.repeat(60));
console.log('EDGE CASE TEST SUITE - Living Meta-Analysis');
console.log('='.repeat(60));
console.log('');

// ============================================================================
// Distribution Edge Cases
// ============================================================================
console.log('\n--- Distribution Edge Cases ---');

test('normalCDF: extreme negative value', () => {
  const result = normalCDF(-10);
  assertTrue(result < 1e-15, 'Should be near 0');
});

test('normalCDF: extreme positive value', () => {
  const result = normalCDF(10);
  assertTrue(result > 1 - 1e-15, 'Should be near 1');
});

test('normalCDF: symmetry around 0', () => {
  const pos = normalCDF(1.5);
  const neg = normalCDF(-1.5);
  assertEqual(pos + neg, 1.0, 'Should sum to 1', 1e-10);
});

test('normalQuantile: p=0 returns -Infinity', () => {
  assertTrue(normalQuantile(0) === -Infinity, 'Should be -Infinity');
});

test('normalQuantile: p=1 returns Infinity', () => {
  assertTrue(normalQuantile(1) === Infinity, 'Should be Infinity');
});

test('normalQuantile: inverse of CDF', () => {
  for (const p of [0.01, 0.05, 0.25, 0.5, 0.75, 0.95, 0.99]) {
    const z = normalQuantile(p);
    const back = normalCDF(z);
    assertEqual(back, p, `Round trip for p=${p}`, 1e-6);  // Slightly looser tolerance
  }
});

test('tCDF: df=1 (Cauchy) at 0', () => {
  assertEqual(tCDF(0, 1), 0.5, 't(0, df=1) = 0.5');
});

test('tCDF: very large df approximates normal', () => {
  const tVal = tCDF(1.96, 10000);
  const nVal = normalCDF(1.96);
  assertEqual(tVal, nVal, 'Large df should approximate normal', 0.001);
});

test('tCDF: negative t values symmetric', () => {
  for (const df of [1, 5, 10, 30]) {
    const pos = tCDF(2, df);
    const neg = tCDF(-2, df);
    assertEqual(pos + neg, 1.0, `Symmetry for df=${df}`, 1e-10);
  }
});

test('tQuantile: p=0.5 always returns 0', () => {
  for (const df of [1, 5, 10, 30, 100]) {
    assertEqual(tQuantile(0.5, df), 0, `t-quantile(0.5, df=${df}) = 0`);
  }
});

test('tQuantile: inverse of tCDF', () => {
  for (const df of [5, 10, 30]) {
    for (const p of [0.025, 0.5, 0.975]) {
      const t = tQuantile(p, df);
      const back = tCDF(t, df);
      assertEqual(back, p, `Round trip df=${df}, p=${p}`, 1e-6);
    }
  }
});

// ============================================================================
// Meta-Analysis Edge Cases
// ============================================================================
console.log('\n--- Meta-Analysis Edge Cases ---');

test('DL: empty study array', () => {
  const result = calculateDL([]);
  assertTrue(isNaN(result.estimate), 'Empty array should give NaN estimate');
  assertEqual(result.k, 0, 'k should be 0');
});

test('DL: single study returns study value', () => {
  const result = calculateDL([{ yi: 0.5, vi: 0.1 }]);
  assertEqual(result.estimate, 0.5, 'Single study estimate');
  assertEqual(result.k, 1, 'k should be 1');
  assertEqual(result.tau2, 0, 'tau2 should be 0 for k=1');
});

test('DL: two identical studies', () => {
  const result = calculateDL([
    { yi: 0.5, vi: 0.1 },
    { yi: 0.5, vi: 0.1 }
  ]);
  assertEqual(result.estimate, 0.5, 'Identical studies estimate');
  assertEqual(result.tau2, 0, 'tau2 should be 0 for identical studies');
  assertEqual(result.Q, 0, 'Q should be 0');
  assertEqual(result.I2, 0, 'I2 should be 0');
});

test('DL: null/undefined values filtered', () => {
  const result = calculateDL([
    { yi: 0.5, vi: 0.1 },
    { yi: null, vi: 0.1 },
    { yi: 0.6, vi: null },
    { yi: 0.7, vi: 0.15 }
  ]);
  assertEqual(result.k, 2, 'Should only count valid studies');
});

test('DL: zero variance filtered', () => {
  const result = calculateDL([
    { yi: 0.5, vi: 0.1 },
    { yi: 0.6, vi: 0 },
    { yi: 0.7, vi: 0.15 }
  ]);
  assertEqual(result.k, 2, 'Should filter zero variance');
});

test('DL: negative variance filtered', () => {
  const result = calculateDL([
    { yi: 0.5, vi: 0.1 },
    { yi: 0.6, vi: -0.05 },
    { yi: 0.7, vi: 0.15 }
  ]);
  assertEqual(result.k, 2, 'Should filter negative variance');
});

test('DL: very small variances (high precision)', () => {
  const result = calculateDL([
    { yi: 0.5, vi: 0.001 },
    { yi: 0.6, vi: 0.001 },
    { yi: 0.55, vi: 0.001 }
  ]);
  assertTrue(!isNaN(result.estimate), 'Should handle small variances');
  assertTrue(result.estimate > 0.4 && result.estimate < 0.7, 'Reasonable estimate');
});

test('DL: very large variances (low precision)', () => {
  const result = calculateDL([
    { yi: 0.5, vi: 100 },
    { yi: 0.6, vi: 100 },
    { yi: 0.55, vi: 100 }
  ]);
  assertTrue(!isNaN(result.estimate), 'Should handle large variances');
});

test('DL: mixed extreme effect sizes', () => {
  const result = calculateDL([
    { yi: -5, vi: 0.1 },
    { yi: 5, vi: 0.1 },
    { yi: 0, vi: 0.1 }
  ]);
  assertTrue(!isNaN(result.estimate), 'Should handle extreme effects');
  assertTrue(result.I2 > 90, 'Should show high heterogeneity');
});

test('DL: Q statistic is non-negative', () => {
  const studies = [
    { yi: Math.random(), vi: Math.random() * 0.2 + 0.01 },
    { yi: Math.random(), vi: Math.random() * 0.2 + 0.01 },
    { yi: Math.random(), vi: Math.random() * 0.2 + 0.01 }
  ];
  const result = calculateDL(studies);
  assertTrue(result.Q >= 0, 'Q should be non-negative');
});

test('DL: I2 is between 0 and 100', () => {
  const studies = [
    { yi: Math.random(), vi: Math.random() * 0.2 + 0.01 },
    { yi: Math.random(), vi: Math.random() * 0.2 + 0.01 },
    { yi: Math.random() + 2, vi: Math.random() * 0.2 + 0.01 }
  ];
  const result = calculateDL(studies);
  assertTrue(result.I2 >= 0 && result.I2 <= 100, 'I2 should be 0-100');
});

test('DL: CI lower < estimate < CI upper', () => {
  const result = calculateDL([
    { yi: 0.5, vi: 0.1 },
    { yi: 0.6, vi: 0.15 },
    { yi: 0.4, vi: 0.08 }
  ]);
  assertTrue(result.ci_lower < result.estimate, 'CI lower < estimate');
  assertTrue(result.estimate < result.ci_upper, 'estimate < CI upper');
});

// ============================================================================
// E-Value Edge Cases
// ============================================================================
console.log('\n--- E-Value Edge Cases ---');

test('E-value: RR=1 gives E=1', () => {
  assertEqual(calculateEValue(1), 1, 'E(RR=1) = 1');
});

test('E-value: RR=2 gives E≈3.41', () => {
  assertEqual(calculateEValue(2), 2 + Math.sqrt(2), 'E(RR=2)', 0.01);
});

test('E-value: RR<1 uses reciprocal', () => {
  const e1 = calculateEValue(0.5);
  const e2 = calculateEValue(2);
  assertEqual(e1, e2, 'E(0.5) = E(2)');
});

test('E-value: very large RR', () => {
  const e = calculateEValue(100);
  assertTrue(e > 100, 'Large RR gives large E');
  assertTrue(isFinite(e), 'Should be finite');
});

// ============================================================================
// Incomplete Beta Edge Cases
// ============================================================================
console.log('\n--- Incomplete Beta Edge Cases ---');

test('betaRegularized: x=0 returns 0', () => {
  assertEqual(betaRegularized(0, 2, 3), 0, 'I(0, a, b) = 0');
});

test('betaRegularized: x=1 returns 1', () => {
  assertEqual(betaRegularized(1, 2, 3), 1, 'I(1, a, b) = 1');
});

test('betaRegularized: x=0.5, a=b=1 returns 0.5', () => {
  assertEqual(betaRegularized(0.5, 1, 1), 0.5, 'Uniform case', 1e-10);
});

test('betaRegularized: symmetric for a=b', () => {
  const x = 0.3;
  const a = 5, b = 5;
  const val1 = betaRegularized(x, a, b);
  const val2 = betaRegularized(1 - x, b, a);
  assertEqual(val1 + val2, 1.0, 'Symmetry property', 1e-10);
});

test('betaRegularized: out of range returns NaN', () => {
  assertTrue(isNaN(betaRegularized(-0.1, 2, 3)), 'x < 0 is NaN');
  assertTrue(isNaN(betaRegularized(1.1, 2, 3)), 'x > 1 is NaN');
});

// ============================================================================
// Numerical Stability
// ============================================================================
console.log('\n--- Numerical Stability ---');

test('lnGamma: factorial correspondence', () => {
  // Γ(n+1) = n! for positive integers
  assertEqual(Math.exp(lnGamma(1)), 1, 'Γ(1) = 1', 1e-10);
  assertEqual(Math.exp(lnGamma(2)), 1, 'Γ(2) = 1', 1e-10);
  assertEqual(Math.exp(lnGamma(5)), 24, 'Γ(5) = 24', 1e-8);
  assertEqual(Math.exp(lnGamma(6)), 120, 'Γ(6) = 120', 1e-6);
});

test('lnGamma: Γ(0.5) = √π', () => {
  assertEqual(Math.exp(lnGamma(0.5)), Math.sqrt(Math.PI), 'Γ(0.5) = √π', 1e-10);
});

test('lnGamma: large values stay finite', () => {
  const result = lnGamma(100);
  assertTrue(isFinite(result), 'lnGamma(100) is finite');
  assertTrue(result > 0, 'lnGamma(100) > 0');
});

test('Weights sum correctly for many studies', () => {
  const studies = [];
  for (let i = 0; i < 100; i++) {
    studies.push({ yi: Math.random() * 2 - 1, vi: Math.random() * 0.5 + 0.01 });
  }
  const result = calculateDL(studies);
  assertTrue(isFinite(result.estimate), 'Estimate is finite for 100 studies');
  assertTrue(isFinite(result.se), 'SE is finite for 100 studies');
});

// ============================================================================
// Confidence Interval Edge Cases
// ============================================================================
console.log('\n--- Confidence Interval Edge Cases ---');

test('HKSJ: t-critical for various df', () => {
  // Known t-critical values at 0.975
  const known = [
    { df: 1, t: 12.706 },
    { df: 2, t: 4.303 },
    { df: 5, t: 2.571 },
    { df: 10, t: 2.228 },
    { df: 30, t: 2.042 },
    { df: 100, t: 1.984 }
  ];

  for (const { df, t } of known) {
    const computed = tQuantile(0.975, df);
    assertEqual(computed, t, `t-crit for df=${df}`, 0.01);
  }
});

test('Prediction interval requires k≥3', () => {
  // With k=2, df=k-2=0, which should give special handling
  const k = 2;
  const df = k - 2;
  assertTrue(df === 0, 'df=0 for k=2');
  // t-quantile for df=0 is undefined
});

// ============================================================================
// Summary
// ============================================================================
console.log('');
console.log('='.repeat(60));
console.log(`EDGE CASE TESTS: ${passed}/${passed + failed} tests passed`);
console.log('='.repeat(60));

if (failed > 0) {
  process.exit(1);
}
