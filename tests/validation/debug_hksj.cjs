// Debug HKSJ computation
const smd_data = [
  { yi: 0.728362, vi: 0.089004 },
  { yi: 0.853154, vi: 0.075322 },
  { yi: 0.646115, vi: 0.091659 },
  { yi: 0.634716, vi: 0.062828 },
  { yi: 0.531524, vi: 0.071483 },
  { yi: 0.725031, vi: 0.054685 },
  { yi: 0.769912, vi: 0.064245 },
  { yi: 0.708831, vi: 0.078828 },
  { yi: 0.873785, vi: 0.059252 },
  { yi: 0.713559, vi: 0.067677 }
];

// t-distribution quantile
function lnGamma(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
             -1.231739572450155, 0.001208650973866179, -5.395239384953e-6];
  let y = x, tmp = x + 5.5;
  tmp = (x + 0.5) * Math.log(tmp) - tmp;
  let ser = 1.000000000190015;
  for (let i = 0; i < 6; i++) ser += c[i] / ++y;
  return tmp + Math.log(2.5066282746310005 * ser / x);
}

function tCDF(t, df) {
  const x = df / (df + t * t);
  const a = df / 2, b = 0.5;
  if (x === 0) return t > 0 ? 1 : 0;
  if (x === 1) return 0.5;
  const bt = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  let sum = 1, term = 1;
  for (let n = 0; n < 200; n++) {
    term *= (a + n) * (1 - x) / (a + b + n);
    sum += term;
    if (Math.abs(term) < 1e-10) break;
  }
  const Ix = bt * sum / a;
  return t > 0 ? 1 - Ix / 2 : Ix / 2;
}

function tQuantile(p, df) {
  let t = p > 0.5 ? 1 : -1;
  for (let i = 0; i < 50; i++) {
    const cdf = tCDF(t, df);
    const pdf = Math.exp(lnGamma((df + 1) / 2) - lnGamma(df / 2) - 0.5 * Math.log(df * Math.PI) - ((df + 1) / 2) * Math.log(1 + t * t / df));
    const delta = (cdf - p) / pdf;
    t -= delta;
    if (Math.abs(delta) < 1e-10) break;
  }
  return t;
}

// DL
const k = smd_data.length;
const weights = smd_data.map(s => 1 / s.vi);
const sumW = weights.reduce((a, b) => a + b, 0);
const sumW2 = weights.reduce((a, w) => a + w * w, 0);
const thetaFE = smd_data.reduce((sum, s, i) => sum + weights[i] * s.yi, 0) / sumW;
const Q = smd_data.reduce((sum, s, i) => sum + weights[i] * Math.pow(s.yi - thetaFE, 2), 0);
const c = sumW - sumW2 / sumW;
const tau2 = Math.max(0, (Q - (k - 1)) / c);

console.log('=== DL Results ===');
console.log('k:', k);
console.log('FE estimate:', thetaFE);
console.log('Q:', Q);
console.log('tau2:', tau2);

const reW = smd_data.map(s => 1 / (s.vi + tau2));
const sumREW = reW.reduce((a, b) => a + b, 0);
const estimate = smd_data.reduce((sum, s, i) => sum + reW[i] * s.yi, 0) / sumREW;
const se = Math.sqrt(1 / sumREW);

console.log('RE estimate:', estimate);
console.log('RE SE:', se);

// HKSJ
const wi = smd_data.map(s => 1 / (s.vi + tau2));
const sumWi = wi.reduce((a, b) => a + b, 0);
let numerator = 0;
for (let i = 0; i < k; i++) {
  numerator += wi[i] * Math.pow(smd_data[i].yi - estimate, 2);
}
const q = numerator / (k - 1);

console.log('\n=== HKSJ ===');
console.log('q (sum of weighted squared deviations / (k-1)):', q);
console.log('sqrt(q):', Math.sqrt(q));
console.log('SE_HKSJ:', se * Math.sqrt(q));

const t_crit = tQuantile(0.975, k - 1);
console.log('t_crit (0.975, df=9):', t_crit);

const ci_lower = estimate - t_crit * se * Math.sqrt(q);
const ci_upper = estimate + t_crit * se * Math.sqrt(q);
console.log('CI lower:', ci_lower);
console.log('CI upper:', ci_upper);

console.log('\n=== Expected from R ===');
console.log('CI lower: 0.648923');
console.log('CI upper: 0.795105');
