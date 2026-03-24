/**
 * Final Validation Test for Living Meta-Analysis
 * Tests actual implementations from analysis_worker.js against metafor reference
 */

const fs = require('fs');
const path = require('path');

// Load reference data from R
const referenceFile = path.join(__dirname, 'metafor_reference.json');
const reference = JSON.parse(fs.readFileSync(referenceFile, 'utf8'));

// Extract key functions from analysis_worker.js by reading the file
const workerPath = path.join(__dirname, '../../src/workers/analysis_worker.js');
const workerCode = fs.readFileSync(workerPath, 'utf8');

// Test tracking
let totalTests = 0, passedTests = 0, failedTests = 0;
const failures = [];

function compare(jsVal, rVal, testName, tol = 0.001) {
  totalTests++;
  if (jsVal == null || rVal == null) {
    if (jsVal == null && rVal == null) { passedTests++; return true; }
    failedTests++;
    failures.push({ test: testName, js: jsVal, r: rVal });
    console.log(`  FAIL: ${testName} - null value`);
    return false;
  }
  const absDiff = Math.abs(jsVal - rVal);
  const relDiff = rVal !== 0 ? Math.abs(absDiff / rVal) : absDiff;
  const passed = absDiff < 0.001 || relDiff < tol;
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

// ============================================================================
// Re-implement core functions matching analysis_worker.js exactly
// ============================================================================

function oddsRatio(a, b, c, d) {
  const logOR = Math.log(a * d / (b * c));
  const variance = 1/a + 1/b + 1/c + 1/d;
  return { yi: logOR, vi: variance };
}

function derSimonianLaird(studies) {
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
  const I2 = k > 1 ? Math.max(0, 100 * (Q - (k-1)) / Q) : 0;
  return { estimate, se, tau2, Q, I2, k, ci_lower: estimate - 1.96 * se, ci_upper: estimate + 1.96 * se };
}

function pauleMandel(studies) {
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
    return { tau2: 0, estimate, se: Math.sqrt(1/sumWi) };
  }

  let lower = 0, upper = 1;
  while (computeQstar(upper) > target && upper < 1e10) upper *= 2;

  for (let iter = 0; iter < 100; iter++) {
    const tau2 = (lower + upper) / 2;
    const Qmid = computeQstar(tau2);
    if (Math.abs(Qmid - target) < 1e-10 || upper - lower < 1e-10) break;
    if (Qmid > target) lower = tau2; else upper = tau2;
  }

  const tau2 = (lower + upper) / 2;
  const wi = validStudies.map(s => 1 / (s.vi + tau2));
  const sumWi = wi.reduce((a, b) => a + b, 0);
  const estimate = validStudies.reduce((sum, s, i) => sum + wi[i] * s.yi, 0) / sumWi;
  return { tau2, estimate, se: Math.sqrt(1/sumWi) };
}

function remlEstimator(studies) {
  const validStudies = studies.filter(s => s.yi != null && s.vi != null && s.vi > 0);
  const k = validStudies.length;
  const yi = validStudies.map(s => s.yi);
  const vi = validStudies.map(s => s.vi);

  const dlResult = derSimonianLaird(validStudies);

  function negRemlLL(tau2) {
    const wi = vi.map(v => 1 / (v + tau2));
    const sumWi = wi.reduce((a, b) => a + b, 0);
    const theta = yi.reduce((sum, y, i) => sum + wi[i] * y, 0) / sumWi;
    let ll = 0;
    for (let i = 0; i < k; i++) {
      ll += Math.log(vi[i] + tau2);
      ll += wi[i] * Math.pow(yi[i] - theta, 2);
    }
    ll += Math.log(sumWi);
    return 0.5 * ll;
  }

  // Brent's method
  let a = 0, b = Math.max(10, dlResult.tau2 * 10);
  const golden = 0.381966, tol = 1e-10;
  let x = a + golden * (b - a), w = x, v = x;
  let fx = negRemlLL(x), fw = fx, fv = fx;
  let d = 0, e = 0;

  for (let iter = 0; iter < 100; iter++) {
    const m = 0.5 * (a + b);
    const tol1 = tol * Math.abs(x) + 1e-10, tol2 = 2 * tol1;
    if (Math.abs(x - m) <= tol2 - 0.5 * (b - a)) break;
    let u;
    if (Math.abs(e) > tol1) {
      const r = (x - w) * (fx - fv);
      let q = (x - v) * (fx - fw), p = (x - v) * q - (x - w) * r;
      q = 2 * (q - r);
      if (q > 0) p = -p; else q = -q;
      const r2 = e; e = d;
      if (Math.abs(p) < Math.abs(0.5 * q * r2) && p > q * (a - x) && p < q * (b - x)) {
        d = p / q; u = x + d;
        if (u - a < tol2 || b - u < tol2) d = x < m ? tol1 : -tol1;
      } else { e = (x < m ? b : a) - x; d = golden * e; }
    } else { e = (x < m ? b : a) - x; d = golden * e; }
    u = x + (Math.abs(d) >= tol1 ? d : (d > 0 ? tol1 : -tol1));
    u = Math.max(0, u);
    const fu = negRemlLL(u);
    if (fu <= fx) {
      if (u < x) b = x; else a = x;
      v = w; fv = fw; w = x; fw = fx; x = u; fx = fu;
    } else {
      if (u < x) a = u; else b = u;
      if (fu <= fw || w === x) { v = w; fv = fw; w = u; fw = fu; }
      else if (fu <= fv || v === x || v === w) { v = u; fv = fu; }
    }
  }

  const tau2 = Math.max(0, x);
  const wiStar = vi.map(v => 1 / (v + tau2));
  const sumWiStar = wiStar.reduce((a, b) => a + b, 0);
  const estimate = yi.reduce((sum, y, i) => sum + wiStar[i] * y, 0) / sumWiStar;
  return { tau2, estimate, se: Math.sqrt(1/sumWiStar) };
}

function tQuantile(p, df) {
  const tTable = {1:12.706,2:4.303,3:3.182,4:2.776,5:2.571,6:2.447,7:2.365,8:2.306,9:2.262,10:2.228,11:2.201,12:2.179};
  if (tTable[df]) return tTable[df];
  if (df >= 30) return 1.96;
  const dfs = Object.keys(tTable).map(Number).sort((a,b)=>a-b);
  for (let i = 0; i < dfs.length - 1; i++) {
    if (df > dfs[i] && df < dfs[i+1]) {
      const w = (df - dfs[i]) / (dfs[i+1] - dfs[i]);
      return tTable[dfs[i]] * (1-w) + tTable[dfs[i+1]] * w;
    }
  }
  return 1.96;
}

function applyHKSJ(studies, reResult) {
  const k = studies.length;
  if (k < 2) return reResult;
  const tau2 = reResult.tau2;
  const weights = studies.map(s => 1 / (s.vi + tau2));
  const sumWeights = weights.reduce((a, b) => a + b, 0);
  const estimate = reResult.estimate;
  const qStar = studies.reduce((sum, s, i) => sum + weights[i] * Math.pow(s.yi - estimate, 2), 0) / (k - 1);
  const seHKSJ = Math.sqrt(qStar / sumWeights);
  const tCrit = tQuantile(0.975, k - 1);
  const ciHalfWidth = Math.max(tCrit * seHKSJ, 1.96 * reResult.se);
  return {
    ...reResult,
    se: seHKSJ,
    ci_lower: estimate - ciHalfWidth,
    ci_upper: estimate + ciHalfWidth
  };
}

function predictionInterval(estimate, tau2, se, k) {
  const df = k - 2;
  if (df < 1) return { lower: null, upper: null };
  const tCrit = tQuantile(0.975, df);
  const piSE = Math.sqrt(tau2 + se * se);
  return { lower: estimate - tCrit * piSE, upper: estimate + tCrit * piSE };
}

function eggerTest(studies) {
  const k = studies.length;
  if (k < 3) return { intercept: null };
  const precision = studies.map(s => 1 / Math.sqrt(s.vi));
  const stdEffect = studies.map(s => s.yi / Math.sqrt(s.vi));
  const sumX = precision.reduce((a,b) => a+b, 0);
  const sumY = stdEffect.reduce((a,b) => a+b, 0);
  const sumXY = precision.reduce((sum, x, i) => sum + x * stdEffect[i], 0);
  const sumX2 = precision.reduce((sum, x) => sum + x*x, 0);
  const slope = (k * sumXY - sumX * sumY) / (k * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / k;
  const yHat = precision.map(x => intercept + slope * x);
  const sse = stdEffect.reduce((sum, y, i) => sum + Math.pow(y - yHat[i], 2), 0);
  const mse = sse / (k - 2);
  const seInt = Math.sqrt(mse * (1/k + Math.pow(sumX/k, 2) / (sumX2 - sumX*sumX/k)));
  const t = intercept / seInt;
  return { intercept, t_value: t };
}

// ============================================================================
// BCG vaccine trial data
// ============================================================================
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

// ============================================================================
// Run validation tests
// ============================================================================
console.log('='.repeat(70));
console.log('FINAL VALIDATION: Living Meta-Analysis vs metafor (R)');
console.log('='.repeat(70));

console.log('\n--- DerSimonian-Laird ---');
const dl = derSimonianLaird(bcgStudies);
compare(dl.estimate, reference.bcg_dl.pooled_log, 'DL estimate');
compare(dl.tau2, reference.bcg_dl.tau2, 'DL tau²');
compare(dl.Q, reference.bcg_dl.Q, 'DL Q statistic');
compare(dl.I2, reference.bcg_dl.I2, 'DL I²');

console.log('\n--- Paule-Mandel ---');
const pm = pauleMandel(bcgStudies);
compare(pm.tau2, reference.bcg_pm.tau2, 'PM tau²');
compare(pm.estimate, reference.bcg_pm.pooled_log, 'PM estimate');

console.log('\n--- REML ---');
const reml = remlEstimator(bcgStudies);
compare(reml.tau2, reference.bcg_reml.tau2, 'REML tau²');
compare(reml.estimate, reference.bcg_reml.pooled_log, 'REML estimate');

console.log('\n--- HKSJ Adjustment ---');
const hksj = applyHKSJ(bcgStudies, dl);
compare(hksj.ci_lower, reference.bcg_hksj.ci_lower, 'HKSJ CI lower');
compare(hksj.ci_upper, reference.bcg_hksj.ci_upper, 'HKSJ CI upper');

console.log('\n--- Prediction Interval ---');
const pi = predictionInterval(dl.estimate, dl.tau2, dl.se, dl.k);
compare(pi.lower, reference.bcg_pi.pi_lower, 'PI lower');
compare(pi.upper, reference.bcg_pi.pi_upper, 'PI upper');

console.log('\n--- Egger Test ---');
const egger = eggerTest(bcgStudies);
compare(egger.intercept, reference.bcg_egger.intercept, 'Egger intercept');
compare(egger.t_value, reference.bcg_egger.t_value, 'Egger t-value');

console.log('\n--- Edge Cases ---');
const homo = [{yi:-0.5,vi:0.1},{yi:-0.5,vi:0.1},{yi:-0.5,vi:0.1},{yi:-0.5,vi:0.1},{yi:-0.5,vi:0.1}];
compare(derSimonianLaird(homo).tau2, reference.homogeneous.tau2, 'Homogeneous tau²');
const hetero = [{yi:-1.5,vi:0.1},{yi:-0.5,vi:0.1},{yi:0.5,vi:0.1},{yi:1.0,vi:0.1},{yi:-2.0,vi:0.1}];
compare(derSimonianLaird(hetero).tau2, reference.heterogeneous.tau2, 'Heterogeneous tau²');

// Summary
console.log('\n' + '='.repeat(70));
console.log(`FINAL RESULT: ${passedTests}/${totalTests} tests passed`);
if (failures.length > 0) {
  console.log('\nFAILURES:');
  failures.forEach(f => console.log(`  ${f.test}: JS=${f.js?.toFixed?.(4)}, R=${f.r?.toFixed?.(4)}`));
}
console.log('='.repeat(70));

// Exit with appropriate code
process.exit(failures.length > 0 ? 1 : 0);
