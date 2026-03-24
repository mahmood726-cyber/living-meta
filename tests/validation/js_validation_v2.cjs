/**
 * Living Meta-Analysis - Validation Test v2
 * Correct implementations of PM and REML
 */

const fs = require('fs');
const path = require('path');

// Load reference data
const referenceFile = path.join(__dirname, 'metafor_reference.json');
const reference = JSON.parse(fs.readFileSync(referenceFile, 'utf8'));

let totalTests = 0, passedTests = 0, failedTests = 0;
const failures = [];

function compare(jsVal, rVal, testName, tol = 0.001) {
  totalTests++;
  if (jsVal == null || rVal == null) {
    if (jsVal == null && rVal == null) { passedTests++; return true; }
    failedTests++;
    failures.push({ test: testName, js: jsVal, r: rVal });
    return false;
  }
  const absDiff = Math.abs(jsVal - rVal);
  const relDiff = rVal !== 0 ? Math.abs(absDiff / rVal) : absDiff;
  const passed = absDiff < 0.0001 || relDiff < tol;
  if (passed) {
    passedTests++;
    console.log(`  PASS: ${testName}`);
    console.log(`        JS: ${jsVal.toFixed(6)}, R: ${rVal.toFixed(6)}, Diff: ${absDiff.toFixed(8)}`);
  } else {
    failedTests++;
    console.log(`  FAIL: ${testName}`);
    console.log(`        JS: ${jsVal.toFixed(6)}, R: ${rVal.toFixed(6)}, Diff: ${absDiff.toFixed(8)}`);
    failures.push({ test: testName, js: jsVal, r: rVal, diff: absDiff });
  }
  return passed;
}

// Effect size calculations
function oddsRatio(a, b, c, d) {
  const logOR = Math.log(a * d / (b * c));
  const variance = 1/a + 1/b + 1/c + 1/d;
  return { yi: logOR, vi: variance };
}

function riskRatio(a, n1, c, n2) {
  const p1 = a / n1, p2 = c / n2;
  const logRR = Math.log(p1 / p2);
  const variance = (1 - p1) / a + (1 - p2) / c;
  return { yi: logRR, vi: variance };
}

function standardizedMeanDifference(m1, sd1, n1, m2, sd2, n2) {
  const pooledSD = Math.sqrt(((n1 - 1) * sd1 * sd1 + (n2 - 1) * sd2 * sd2) / (n1 + n2 - 2));
  const d = (m1 - m2) / pooledSD;
  const df = n1 + n2 - 2;
  const J = 1 - (3 / (4 * df - 1));
  const g = J * d;
  const variance = (n1 + n2) / (n1 * n2) + (g * g) / (2 * df);
  return { yi: g, vi: variance };
}

// Fixed Effects
function fixedEffects(studies) {
  const weights = studies.map(s => 1 / s.vi);
  const sumW = weights.reduce((a, b) => a + b, 0);
  const estimate = studies.reduce((sum, s, i) => sum + weights[i] * s.yi, 0) / sumW;
  const se = Math.sqrt(1 / sumW);
  return { estimate, se, ci_lower: estimate - 1.96 * se, ci_upper: estimate + 1.96 * se };
}

// DerSimonian-Laird
function derSimonianLaird(studies) {
  const k = studies.length;
  const weights = studies.map(s => 1 / s.vi);
  const sumW = weights.reduce((a, b) => a + b, 0);
  const sumW2 = weights.reduce((a, w) => a + w * w, 0);
  const thetaFE = studies.reduce((sum, s, i) => sum + weights[i] * s.yi, 0) / sumW;
  const Q = studies.reduce((sum, s, i) => sum + weights[i] * Math.pow(s.yi - thetaFE, 2), 0);
  const c = sumW - sumW2 / sumW;
  const tau2 = Math.max(0, (Q - (k - 1)) / c);
  const reW = studies.map(s => 1 / (s.vi + tau2));
  const sumREW = reW.reduce((a, b) => a + b, 0);
  const estimate = studies.reduce((sum, s, i) => sum + reW[i] * s.yi, 0) / sumREW;
  const se = Math.sqrt(1 / sumREW);
  const I2 = k > 1 ? Math.max(0, 100 * (Q - (k-1)) / Q) : 0;
  return { estimate, se, tau2, Q, I2, k, ci_lower: estimate - 1.96 * se, ci_upper: estimate + 1.96 * se };
}

// Paule-Mandel (bisection)
function pauleMandel(studies) {
  const k = studies.length;
  const target = k - 1;

  function Qstar(tau2) {
    const wi = studies.map(s => 1 / (s.vi + tau2));
    const sumWi = wi.reduce((a, b) => a + b, 0);
    const theta = studies.reduce((sum, s, i) => sum + wi[i] * s.yi, 0) / sumWi;
    return studies.reduce((sum, s, i) => sum + wi[i] * Math.pow(s.yi - theta, 2), 0);
  }

  const Q0 = Qstar(0);
  if (Q0 <= target) {
    const wi = studies.map(s => 1 / s.vi);
    const sumWi = wi.reduce((a, b) => a + b, 0);
    const estimate = studies.reduce((sum, s, i) => sum + wi[i] * s.yi, 0) / sumWi;
    return { tau2: 0, estimate, se: Math.sqrt(1/sumWi) };
  }

  let lower = 0, upper = 1;
  while (Qstar(upper) > target) upper *= 2;

  for (let i = 0; i < 100; i++) {
    const mid = (lower + upper) / 2;
    const Qm = Qstar(mid);
    if (Math.abs(Qm - target) < 1e-10) { lower = upper = mid; break; }
    if (Qm > target) lower = mid; else upper = mid;
  }
  const tau2 = (lower + upper) / 2;
  const wi = studies.map(s => 1 / (s.vi + tau2));
  const sumWi = wi.reduce((a, b) => a + b, 0);
  const estimate = studies.reduce((sum, s, i) => sum + wi[i] * s.yi, 0) / sumWi;
  return { tau2, estimate, se: Math.sqrt(1/sumWi) };
}

// REML (Fisher scoring)
function remlEstimator(studies) {
  const k = studies.length;
  const yi = studies.map(s => s.yi);
  const vi = studies.map(s => s.vi);

  const dl = derSimonianLaird(studies);
  let tau2 = dl.tau2;

  for (let iter = 0; iter < 1000; iter++) {
    const wi = vi.map(v => 1 / (v + tau2));
    const sumWi = wi.reduce((a, b) => a + b, 0);
    const theta = yi.reduce((sum, y, i) => sum + wi[i] * y, 0) / sumWi;

    let sumW2 = 0, sumW2resid = 0;
    for (let i = 0; i < k; i++) {
      sumW2 += wi[i] * wi[i];
      sumW2resid += wi[i] * wi[i] * Math.pow(yi[i] - theta, 2);
    }

    // tr(P²) for intercept model
    const trP2 = sumW2 - sumW2 * sumW2 / sumWi;
    // REML score
    const score = -0.5 * trP2 + 0.5 * sumW2resid;
    const info = 0.5 * trP2;

    if (info < 1e-15) break;

    const tau2New = Math.max(0, tau2 + score / info);
    if (Math.abs(tau2New - tau2) < 1e-10) { tau2 = tau2New; break; }
    tau2 = tau2New;
  }

  const wi = vi.map(v => 1 / (v + tau2));
  const sumWi = wi.reduce((a, b) => a + b, 0);
  const estimate = yi.reduce((sum, y, i) => sum + wi[i] * y, 0) / sumWi;
  return { tau2, estimate, se: Math.sqrt(1/sumWi) };
}

// HKSJ adjustment
function applyHKSJ(studies, reResult) {
  const k = studies.length;
  const df = k - 1;
  if (df < 1) return reResult;

  const wi = studies.map(s => 1 / (s.vi + reResult.tau2));
  const sumWi = wi.reduce((a, b) => a + b, 0);

  const qNum = studies.reduce((sum, s, i) => sum + wi[i] * Math.pow(s.yi - reResult.estimate, 2), 0);
  const q = qNum / df;

  const seHKSJ = reResult.se * Math.sqrt(Math.max(1, q));
  const tCrit = tQuantile(0.975, df);

  // "Never narrower" rule
  const ciHalf = Math.max(tCrit * seHKSJ, 1.96 * reResult.se);
  return {
    ...reResult,
    se: seHKSJ,
    ci_lower: reResult.estimate - ciHalf,
    ci_upper: reResult.estimate + ciHalf
  };
}

function tQuantile(p, df) {
  const tTable = {1:12.706,2:4.303,3:3.182,4:2.776,5:2.571,6:2.447,7:2.365,8:2.306,9:2.262,10:2.228,11:2.201,12:2.179};
  if (tTable[df]) return tTable[df];
  if (df >= 30) return 1.96;
  // Linear interpolate
  const dfs = Object.keys(tTable).map(Number).sort((a,b)=>a-b);
  for (let i = 0; i < dfs.length - 1; i++) {
    if (df > dfs[i] && df < dfs[i+1]) {
      const w = (df - dfs[i]) / (dfs[i+1] - dfs[i]);
      return tTable[dfs[i]] * (1-w) + tTable[dfs[i+1]] * w;
    }
  }
  return 1.96;
}

// Prediction interval
function predictionInterval(estimate, tau2, se, k) {
  const df = k - 2;
  if (df < 1) return { lower: null, upper: null };
  const tCrit = tQuantile(0.975, df);
  const piSE = Math.sqrt(tau2 + se * se);
  return { lower: estimate - tCrit * piSE, upper: estimate + tCrit * piSE, df };
}

// Egger's test
function eggerTest(studies) {
  const k = studies.length;
  if (k < 3) return { intercept: null, p_value: null };
  const precision = studies.map(s => 1 / Math.sqrt(s.vi));
  const stdEffect = studies.map(s => s.yi / Math.sqrt(s.vi));
  const n = k;
  const sumX = precision.reduce((a,b) => a+b, 0);
  const sumY = stdEffect.reduce((a,b) => a+b, 0);
  const sumXY = precision.reduce((sum, x, i) => sum + x * stdEffect[i], 0);
  const sumX2 = precision.reduce((sum, x) => sum + x*x, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  const yHat = precision.map(x => intercept + slope * x);
  const sse = stdEffect.reduce((sum, y, i) => sum + Math.pow(y - yHat[i], 2), 0);
  const mse = sse / (n - 2);
  const seInt = Math.sqrt(mse * (1/n + Math.pow(sumX/n, 2) / (sumX2 - sumX*sumX/n)));
  const t = intercept / seInt;
  // Simple p-value approximation
  const pValue = 2 * (1 - normalCDF(Math.abs(t)));
  return { intercept, se: seInt, t_value: t, p_value: pValue };
}

function normalCDF(x) {
  const a1=0.254829592, a2=-0.284496736, a3=1.421413741, a4=-1.453152027, a5=1.061405429, p=0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5*t + a4)*t) + a3)*t + a2)*t + a1)*t * Math.exp(-x*x);
  return 0.5 * (1 + sign * y);
}

// BCG data
const bcgData = [
  {tpos:4,tneg:119,cpos:11,cneg:128},{tpos:6,tneg:300,cpos:29,cneg:274},
  {tpos:3,tneg:228,cpos:11,cneg:209},{tpos:62,tneg:13536,cpos:248,cneg:12619},
  {tpos:33,tneg:5036,cpos:47,cneg:5761},{tpos:180,tneg:1361,cpos:372,cneg:1079},
  {tpos:8,tneg:2537,cpos:10,cneg:619},{tpos:505,tneg:87886,cpos:499,cneg:87892},
  {tpos:29,tneg:7470,cpos:45,cneg:7232},{tpos:17,tneg:1699,cpos:65,cneg:1600},
  {tpos:186,tneg:50448,cpos:141,cneg:27197},{tpos:5,tneg:2493,cpos:3,cneg:2338},
  {tpos:27,tneg:16886,cpos:29,cneg:17825}
];
const bcgStudies = bcgData.map(d => oddsRatio(d.tpos, d.tneg, d.cpos, d.cneg));

// Run tests
console.log('='.repeat(70));
console.log('LIVING META-ANALYSIS VALIDATION TEST v2');
console.log('='.repeat(70));

console.log('\n--- TEST 1: Effect Sizes ---');
const orTest = oddsRatio(100, 200, 150, 250);
compare(orTest.yi, reference.or_calc.log_or, 'OR log');
compare(orTest.vi, reference.or_calc.variance, 'OR variance');
const rrTest = riskRatio(100, 300, 150, 400);
compare(rrTest.yi, reference.rr_calc.log_rr, 'RR log');
const smdTest = standardizedMeanDifference(10, 2, 30, 8, 2.5, 35);
compare(smdTest.yi, reference.smd_calc.g, 'SMD g');

console.log('\n--- TEST 2: Fixed Effects ---');
const fe = fixedEffects(bcgStudies);
compare(fe.estimate, reference.fe.pooled_log, 'FE estimate');
compare(fe.se, reference.fe.se, 'FE SE');

console.log('\n--- TEST 3: DerSimonian-Laird ---');
const dl = derSimonianLaird(bcgStudies);
compare(dl.estimate, reference.bcg_dl.pooled_log, 'DL estimate');
compare(dl.tau2, reference.bcg_dl.tau2, 'DL tau2');
compare(dl.Q, reference.bcg_dl.Q, 'DL Q');
compare(dl.I2, reference.bcg_dl.I2, 'DL I2');

console.log('\n--- TEST 4: Paule-Mandel ---');
const pm = pauleMandel(bcgStudies);
compare(pm.tau2, reference.bcg_pm.tau2, 'PM tau2');
compare(pm.estimate, reference.bcg_pm.pooled_log, 'PM estimate');

console.log('\n--- TEST 5: REML ---');
const reml = remlEstimator(bcgStudies);
compare(reml.tau2, reference.bcg_reml.tau2, 'REML tau2');
compare(reml.estimate, reference.bcg_reml.pooled_log, 'REML estimate');

console.log('\n--- TEST 6: HKSJ ---');
const hksj = applyHKSJ(bcgStudies, dl);
compare(hksj.ci_lower, reference.bcg_hksj.ci_lower, 'HKSJ CI lower');
compare(hksj.ci_upper, reference.bcg_hksj.ci_upper, 'HKSJ CI upper');

console.log('\n--- TEST 7: Prediction Interval ---');
const pi = predictionInterval(dl.estimate, dl.tau2, dl.se, dl.k);
compare(pi.lower, reference.bcg_pi.pi_lower, 'PI lower');
compare(pi.upper, reference.bcg_pi.pi_upper, 'PI upper');

console.log('\n--- TEST 8: Egger Test ---');
const egger = eggerTest(bcgStudies);
compare(egger.intercept, reference.bcg_egger.intercept, 'Egger intercept');
compare(egger.t_value, reference.bcg_egger.t_value, 'Egger t');

console.log('\n--- TEST 9: Edge Cases ---');
const homo = [{yi:-0.5,vi:0.1},{yi:-0.5,vi:0.1},{yi:-0.5,vi:0.1},{yi:-0.5,vi:0.1},{yi:-0.5,vi:0.1}];
const homoRes = derSimonianLaird(homo);
compare(homoRes.tau2, reference.homogeneous.tau2, 'Homo tau2');
const hetero = [{yi:-1.5,vi:0.1},{yi:-0.5,vi:0.1},{yi:0.5,vi:0.1},{yi:1.0,vi:0.1},{yi:-2.0,vi:0.1}];
const hetRes = derSimonianLaird(hetero);
compare(hetRes.tau2, reference.heterogeneous.tau2, 'Hetero tau2');

console.log('\n' + '='.repeat(70));
console.log(`SUMMARY: ${passedTests}/${totalTests} passed (${failedTests} failed)`);
if (failures.length > 0) {
  console.log('\nFAILURES:');
  failures.forEach(f => console.log(`  ${f.test}: JS=${f.js?.toFixed?.(4)}, R=${f.r?.toFixed?.(4)}`));
}
console.log('='.repeat(70));
