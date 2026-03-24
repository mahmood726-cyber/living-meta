// Fixed t-distribution functions using proper incomplete beta

function lnGamma(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
             -1.231739572450155, 0.001208650973866179, -5.395239384953e-6];
  let y = x, tmp = x + 5.5;
  tmp = (x + 0.5) * Math.log(tmp) - tmp;
  let ser = 1.000000000190015;
  for (let i = 0; i < 6; i++) ser += c[i] / ++y;
  return tmp + Math.log(2.5066282746310005 * ser / x);
}

// Regularized incomplete beta function using continued fraction (Lentz's method)
function betaIncomplete(x, a, b) {
  if (x === 0) return 0;
  if (x === 1) return 1;

  const lnBeta = lnGamma(a) + lnGamma(b) - lnGamma(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta) / a;

  // Use continued fraction representation
  const FPMIN = 1e-30;
  const EPS = 1e-14;
  const MAXIT = 200;

  let qab = a + b;
  let qap = a + 1;
  let qam = a - 1;
  let c = 1;
  let d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= MAXIT; m++) {
    let m2 = 2 * m;

    // Even step
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;

    // Odd step
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    let del = d * c;
    h *= del;

    if (Math.abs(del - 1) < EPS) break;
  }

  return front * h;
}

// Regularized incomplete beta I_x(a, b)
function betaRegularized(x, a, b) {
  if (x < 0 || x > 1) return NaN;
  if (x === 0) return 0;
  if (x === 1) return 1;

  // Use symmetry for better convergence
  if (x > (a + 1) / (a + b + 2)) {
    return 1 - betaIncomplete(1 - x, b, a);
  } else {
    return betaIncomplete(x, a, b);
  }
}

// t-distribution CDF
function tCDF(t, df) {
  if (df <= 0) return NaN;
  if (!isFinite(t)) return t > 0 ? 1 : 0;

  const x = df / (df + t * t);
  const prob = 0.5 * betaRegularized(x, df / 2, 0.5);

  return t > 0 ? 1 - prob : prob;
}

// t-distribution PDF
function tPDF(t, df) {
  return Math.exp(
    lnGamma((df + 1) / 2) - lnGamma(df / 2) -
    0.5 * Math.log(df * Math.PI) -
    ((df + 1) / 2) * Math.log(1 + t * t / df)
  );
}

// Normal quantile (Rational approximation - Abramowitz & Stegun)
function normalQuantile(p) {
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

// t-distribution quantile using bisection (more robust)
function tQuantile(p, df) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;

  // Use bisection method - more robust than Newton-Raphson
  // Initial bounds based on normal quantile scaled for t-distribution
  const z = normalQuantile(p);

  // For t-distribution, tails are heavier, so expand bounds
  let lower = z * 2 - 10;
  let upper = z * 2 + 10;

  // Ensure bounds bracket the solution
  while (tCDF(lower, df) > p) lower -= 10;
  while (tCDF(upper, df) < p) upper += 10;

  // Bisection
  for (let i = 0; i < 100; i++) {
    const mid = (lower + upper) / 2;
    const cdf = tCDF(mid, df);

    if (Math.abs(cdf - p) < 1e-12) return mid;

    if (cdf < p) {
      lower = mid;
    } else {
      upper = mid;
    }

    if (upper - lower < 1e-12) break;
  }

  return (lower + upper) / 2;
}

// Test
console.log('=== Testing fixed t-distribution functions ===\n');

console.log('tCDF tests:');
console.log('tCDF(2.262, 9):', tCDF(2.262, 9).toFixed(6), '(expected ~0.975)');
console.log('tCDF(1.833, 9):', tCDF(1.833, 9).toFixed(6), '(expected ~0.95)');
console.log('tCDF(1.0, 9):', tCDF(1.0, 9).toFixed(6), '(expected ~0.8267)');
console.log('tCDF(0, 9):', tCDF(0, 9).toFixed(6), '(expected 0.5)');
console.log('tCDF(-2.262, 9):', tCDF(-2.262, 9).toFixed(6), '(expected ~0.025)');

console.log('\ntQuantile tests:');
console.log('tQuantile(0.975, 9):', tQuantile(0.975, 9).toFixed(6), '(expected 2.262157)');
console.log('tQuantile(0.95, 9):', tQuantile(0.95, 9).toFixed(6), '(expected 1.833113)');
console.log('tQuantile(0.975, 5):', tQuantile(0.975, 5).toFixed(6), '(expected 2.570582)');
console.log('tQuantile(0.975, 49):', tQuantile(0.975, 49).toFixed(6), '(expected 2.009575)');
console.log('tQuantile(0.025, 9):', tQuantile(0.025, 9).toFixed(6), '(expected -2.262157)');

// Verify with R reference values
console.log('\n=== Verification with R reference ===');
const tests = [
  { p: 0.975, df: 9, expected: 2.262157 },
  { p: 0.975, df: 5, expected: 2.570582 },
  { p: 0.975, df: 49, expected: 2.009575 },
  { p: 0.95, df: 9, expected: 1.833113 },
  { p: 0.99, df: 9, expected: 2.821438 },
];

let allPass = true;
for (const test of tests) {
  const result = tQuantile(test.p, test.df);
  const error = Math.abs(result - test.expected);
  const pass = error < 0.0001;
  console.log(`qt(${test.p}, ${test.df}): ${result.toFixed(6)} vs ${test.expected} (error: ${error.toFixed(6)}) ${pass ? '✓' : '✗'}`);
  if (!pass) allPass = false;
}

console.log('\nAll t-quantile tests:', allPass ? 'PASS' : 'FAIL');
