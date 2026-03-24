// Debug t-distribution functions

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
    console.log(`iter ${i}: t=${t.toFixed(6)}, cdf=${cdf.toFixed(6)}, pdf=${pdf.toFixed(6)}, delta=${delta.toFixed(6)}`);
    if (Math.abs(delta) < 1e-10) break;
  }
  return t;
}

console.log('Testing t-distribution:');
console.log('');

console.log('tCDF(2.262, 9):', tCDF(2.262, 9));
console.log('Expected: ~0.975');
console.log('');

console.log('tCDF(1.0, 9):', tCDF(1.0, 9));
console.log('Expected: ~0.828');
console.log('');

console.log('tQuantile(0.975, 9):');
const result = tQuantile(0.975, 9);
console.log('Result:', result);
console.log('Expected: 2.262');
