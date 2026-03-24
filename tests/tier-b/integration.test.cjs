/**
 * Integration Test Suite for Living Meta-Analysis
 * Tests data flow, component interactions, and workflow validation
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

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

function assertEqual(actual, expected, msg, tol = 1e-6) {
  if (typeof actual === 'number' && typeof expected === 'number') {
    if (Math.abs(actual - expected) > tol && !(isNaN(actual) && isNaN(expected))) {
      throw new Error(`${msg}: expected ${expected}, got ${actual}`);
    }
  } else if (actual !== expected) {
    throw new Error(`${msg}: expected ${expected}, got ${actual}`);
  }
}

function assertTrue(condition, msg) {
  if (!condition) throw new Error(msg);
}

function assertArrayEqual(arr1, arr2, msg) {
  if (arr1.length !== arr2.length) {
    throw new Error(`${msg}: length mismatch ${arr1.length} vs ${arr2.length}`);
  }
  for (let i = 0; i < arr1.length; i++) {
    if (arr1[i] !== arr2[i]) {
      throw new Error(`${msg}: mismatch at index ${i}`);
    }
  }
}

console.log('='.repeat(60));
console.log('INTEGRATION TEST SUITE - Living Meta-Analysis');
console.log('='.repeat(60));
console.log('');

// ============================================================================
// Effect Size Calculation Integration
// ============================================================================
console.log('\n--- Effect Size Calculation Integration ---');

function calculateOddsRatio(e1, n1, e2, n2) {
  const a = e1, b = n1 - e1, c = e2, d = n2 - e2;
  const or = (a * d) / (b * c);
  const logOr = Math.log(or);
  const vi = 1/a + 1/b + 1/c + 1/d;
  return { or, logOr, vi, se: Math.sqrt(vi) };
}

function calculateRiskRatio(e1, n1, e2, n2) {
  const r1 = e1 / n1, r2 = e2 / n2;
  const rr = r1 / r2;
  const logRr = Math.log(rr);
  const vi = (1 - r1) / (e1) + (1 - r2) / (e2);
  return { rr, logRr, vi, se: Math.sqrt(vi) };
}

function calculateSMD(m1, sd1, n1, m2, sd2, n2) {
  const pooledSD = Math.sqrt(((n1-1)*sd1*sd1 + (n2-1)*sd2*sd2) / (n1 + n2 - 2));
  const d = (m1 - m2) / pooledSD;
  const j = 1 - 3 / (4 * (n1 + n2 - 2) - 1);  // Hedges g correction
  const g = d * j;
  const vi = (n1 + n2) / (n1 * n2) + (g * g) / (2 * (n1 + n2));
  return { d, g, vi, se: Math.sqrt(vi) };
}

test('OR: basic calculation', () => {
  const result = calculateOddsRatio(10, 100, 5, 100);
  assertEqual(result.or, 2.111, 'OR', 0.01);
  assertTrue(result.vi > 0, 'Variance positive');
  assertTrue(result.logOr > 0, 'Log OR positive for OR > 1');
});

test('RR: basic calculation', () => {
  const result = calculateRiskRatio(10, 100, 5, 100);
  assertEqual(result.rr, 2.0, 'RR');
  assertTrue(result.logRr > 0, 'Log RR positive for RR > 1');
});

test('SMD: Cohen d to Hedges g', () => {
  const result = calculateSMD(10, 2, 50, 8, 2, 50);
  assertEqual(result.d, 1.0, 'Cohen d');
  assertTrue(result.g < result.d, 'Hedges g smaller than d');
  assertTrue(result.g > 0.95, 'Hedges g close to d for large n');
});

test('Effect size pipeline: raw data to yi/vi', () => {
  // Simulate study data flow
  const rawStudy = {
    treat_events: 25, treat_n: 100,
    ctrl_events: 15, ctrl_n: 100
  };

  const or = calculateOddsRatio(
    rawStudy.treat_events, rawStudy.treat_n,
    rawStudy.ctrl_events, rawStudy.ctrl_n
  );

  const processedStudy = {
    yi: or.logOr,
    vi: or.vi
  };

  assertTrue(processedStudy.yi !== undefined, 'yi computed');
  assertTrue(processedStudy.vi !== undefined, 'vi computed');
  assertTrue(!isNaN(processedStudy.yi), 'yi is valid number');
  assertTrue(!isNaN(processedStudy.vi), 'vi is valid number');
});

// ============================================================================
// Meta-Analysis Pipeline Integration
// ============================================================================
console.log('\n--- Meta-Analysis Pipeline Integration ---');

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
  const x = validStudies.map(s => 1 / Math.sqrt(s.vi));
  const y = validStudies.map(s => s.yi / Math.sqrt(s.vi));
  const n = k;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  const yHat = x.map(xi => intercept + slope * xi);
  const sse = y.reduce((sum, yi, i) => sum + Math.pow(yi - yHat[i], 2), 0);
  const mse = sse / (n - 2);
  const sxx = sumX2 - sumX * sumX / n;
  const seIntercept = Math.sqrt(mse * sumX2 / (n * sxx));
  const zStat = intercept / seIntercept;
  const pValue = 2 * (1 - normalCDF(Math.abs(zStat)));
  return { intercept, slope, seIntercept, zStat, pValue, df: n - 2 };
}

test('Full pipeline: studies → DL → heterogeneity', () => {
  const studies = [
    { yi: -0.5, vi: 0.1 },
    { yi: -0.6, vi: 0.15 },
    { yi: -0.4, vi: 0.08 },
    { yi: -0.55, vi: 0.12 }
  ];

  const result = calculateDL(studies);

  assertTrue(result.k === 4, 'All studies included');
  assertTrue(result.estimate < 0, 'Negative pooled effect');
  assertTrue(result.se > 0, 'Positive SE');
  assertTrue(result.tau2 >= 0, 'Non-negative tau2');
  assertTrue(result.I2 >= 0 && result.I2 <= 100, 'Valid I2');
  assertTrue(result.ci_lower < result.ci_upper, 'Valid CI');
});

test('Pipeline: effect size → meta → small study test', () => {
  // BCG-like data
  const studies = [
    { yi: -0.89, vi: 0.33 },
    { yi: -1.59, vi: 0.19 },
    { yi: -1.35, vi: 0.42 },
    { yi: -1.44, vi: 0.02 },
    { yi: -0.22, vi: 0.05 },
    { yi: -0.79, vi: 0.007 }
  ];

  const dlResult = calculateDL(studies);
  const egger = runEggerTest(studies);

  assertTrue(dlResult.estimate < 0, 'Protective effect');
  assertTrue(egger.intercept !== undefined, 'Egger intercept computed');
  assertTrue(egger.pValue >= 0 && egger.pValue <= 1, 'Valid p-value');
});

test('Pipeline: handle missing data gracefully', () => {
  const studies = [
    { yi: 0.5, vi: 0.1 },
    { yi: null, vi: 0.1 },  // Missing effect
    { yi: 0.6, vi: null },  // Missing variance
    { id: 'incomplete' },    // No effect data
    { yi: 0.7, vi: 0.15 }
  ];

  const result = calculateDL(studies);
  assertEqual(result.k, 2, 'Only valid studies counted');
  assertTrue(!isNaN(result.estimate), 'Estimate computed despite missing data');
});

// ============================================================================
// Output Formatting Integration
// ============================================================================
console.log('\n--- Output Formatting Integration ---');

function formatEffect(value, effectType) {
  if (effectType === 'OR' || effectType === 'RR') {
    return Math.exp(value).toFixed(3);  // Back-transform
  }
  return value.toFixed(3);
}

function formatCI(lower, upper, effectType) {
  const lo = effectType === 'OR' || effectType === 'RR' ? Math.exp(lower) : lower;
  const hi = effectType === 'OR' || effectType === 'RR' ? Math.exp(upper) : upper;
  return `[${lo.toFixed(3)}, ${hi.toFixed(3)}]`;
}

function formatHeterogeneity(result) {
  return {
    tau2: result.tau2.toFixed(4),
    I2: result.I2.toFixed(1) + '%',
    Q: result.Q.toFixed(2),
    Qp: result.Qp ? result.Qp.toFixed(4) : 'N/A'
  };
}

test('Format: OR back-transformation', () => {
  const logOR = 0.693;  // log(2)
  const formatted = formatEffect(logOR, 'OR');
  assertEqual(parseFloat(formatted), 2.0, 'OR formatted', 0.01);
});

test('Format: CI back-transformation', () => {
  const ci = formatCI(0.5, 1.5, 'OR');
  assertTrue(ci.includes('['), 'Has brackets');
  assertTrue(ci.includes(','), 'Has comma separator');
});

test('Format: heterogeneity display', () => {
  const result = { tau2: 0.1234, I2: 75.5, Q: 12.34, Qp: 0.0234 };
  const fmt = formatHeterogeneity(result);
  assertEqual(fmt.I2, '75.5%', 'I2 formatted with %');
  assertTrue(fmt.tau2.length <= 6, 'tau2 reasonable length');
});

// ============================================================================
// Data Quality Checks Integration
// ============================================================================
console.log('\n--- Data Quality Checks Integration ---');

function checkStudyQuality(study) {
  const flags = [];

  // Check for imputed values
  if (study.sd_imputed) flags.push({ type: 'SD_IMPUTED', severity: 'moderate' });

  // Check for sample size issues
  if (study.n1 !== undefined && study.n2 !== undefined) {
    const totalN = study.n1 + study.n2;
    if (totalN < 20) flags.push({ type: 'SMALL_SAMPLE', severity: 'high' });
    if (study.n1 < 5 || study.n2 < 5) flags.push({ type: 'VERY_SMALL_ARM', severity: 'high' });
  }

  // Check for event rate issues (binary outcomes)
  if (study.events1 !== undefined && study.events2 !== undefined) {
    if (study.events1 === 0 || study.events2 === 0) {
      flags.push({ type: 'ZERO_EVENTS', severity: 'moderate' });
    }
    if (study.events1 === study.n1 || study.events2 === study.n2) {
      flags.push({ type: 'ALL_EVENTS', severity: 'moderate' });
    }
  }

  // Check variance
  if (study.vi !== undefined) {
    if (study.vi === 0) flags.push({ type: 'ZERO_VARIANCE', severity: 'critical' });
    if (study.vi > 10) flags.push({ type: 'HIGH_VARIANCE', severity: 'warning' });
  }

  return flags;
}

test('Quality check: small sample flagged', () => {
  const study = { yi: 0.5, vi: 0.2, n1: 5, n2: 5 };
  const flags = checkStudyQuality(study);
  assertTrue(flags.some(f => f.type === 'SMALL_SAMPLE'), 'Small sample flagged');
});

test('Quality check: zero events flagged', () => {
  const study = { yi: 0.5, vi: 0.2, events1: 0, events2: 10, n1: 50, n2: 50 };
  const flags = checkStudyQuality(study);
  assertTrue(flags.some(f => f.type === 'ZERO_EVENTS'), 'Zero events flagged');
});

test('Quality check: zero variance flagged critical', () => {
  const study = { yi: 0.5, vi: 0 };
  const flags = checkStudyQuality(study);
  assertTrue(flags.some(f => f.type === 'ZERO_VARIANCE' && f.severity === 'critical'),
    'Zero variance flagged critical');
});

test('Quality check: good study has no flags', () => {
  const study = { yi: 0.5, vi: 0.1, n1: 100, n2: 100, events1: 25, events2: 15 };
  const flags = checkStudyQuality(study);
  assertEqual(flags.length, 0, 'No flags for good study');
});

// ============================================================================
// Outcome Matching Integration
// ============================================================================
console.log('\n--- Outcome Matching Integration ---');

function calculateSimilarity(str1, str2) {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (s1 === s2) return 1.0;

  // Jaccard similarity on words
  const words1 = new Set(s1.split(/\s+/));
  const words2 = new Set(s2.split(/\s+/));
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

function matchOutcome(query, candidates, threshold = 0.5) {
  const scores = candidates.map(c => ({
    outcome: c,
    score: calculateSimilarity(query, c)
  }));

  scores.sort((a, b) => b.score - a.score);

  if (scores[0].score >= threshold) {
    return { match: scores[0].outcome, score: scores[0].score, type: 'exact' };
  }

  return { match: null, score: 0, type: 'none' };
}

test('Outcome matching: exact match', () => {
  const candidates = ['Overall Survival', 'Progression Free Survival', 'Response Rate'];
  const result = matchOutcome('Overall Survival', candidates);
  assertEqual(result.match, 'Overall Survival', 'Exact match found');
  assertEqual(result.score, 1.0, 'Perfect score');
});

test('Outcome matching: case insensitive', () => {
  const candidates = ['Overall Survival', 'Progression Free Survival'];
  const result = matchOutcome('overall survival', candidates);
  assertEqual(result.match, 'Overall Survival', 'Case insensitive match');
});

test('Outcome matching: partial match', () => {
  const candidates = ['Overall Survival at 12 months', 'PFS'];
  const result = matchOutcome('Overall Survival', candidates, 0.3);
  assertTrue(result.match !== null, 'Partial match found');
});

test('Outcome matching: no match below threshold', () => {
  const candidates = ['Blood Pressure', 'Heart Rate'];
  const result = matchOutcome('Overall Survival', candidates, 0.5);
  assertEqual(result.match, null, 'No match found');
});

// ============================================================================
// SD Imputation Integration
// ============================================================================
console.log('\n--- SD Imputation Integration ---');

function imputeSDFromSE(se, n) {
  return se * Math.sqrt(n);
}

function imputeSDFromCI(lower, upper, n, alpha = 0.05) {
  const z = 1.96;  // Approximate for alpha=0.05
  const se = (upper - lower) / (2 * z);
  return se * Math.sqrt(n);
}

function imputeSDFromIQR(iqr) {
  return iqr / 1.35;  // Approximate for normal distribution
}

test('SD imputation from SE: basic calculation', () => {
  const se = 2, n = 100;
  const sd = imputeSDFromSE(se, n);
  assertEqual(sd, 20, 'SD from SE');
});

test('SD imputation from CI: symmetric', () => {
  const lower = 8, upper = 12, n = 100;
  const sd = imputeSDFromCI(lower, upper, n);
  assertTrue(sd > 0, 'Positive SD');
  assertTrue(sd > 5 && sd < 15, 'Reasonable SD magnitude');
});

test('SD imputation from IQR: normal approximation', () => {
  const iqr = 1.35;  // IQR for standard normal
  const sd = imputeSDFromIQR(iqr);
  assertEqual(sd, 1.0, 'SD from IQR', 0.01);
});

// ============================================================================
// Publication Bias Assessment Integration
// ============================================================================
console.log('\n--- Publication Bias Assessment Integration ---');

function assessPublicationBias(meta, egger, peters, trimfill) {
  const assessment = {
    risk: 'low',
    indicators: [],
    recommendation: ''
  };

  // Check Egger's test
  if (egger && egger.pValue < 0.1) {
    assessment.indicators.push({
      test: 'Egger',
      result: `p = ${egger.pValue.toFixed(4)}`,
      concern: true
    });
  }

  // Check Peters' test
  if (peters && peters.pValue < 0.1) {
    assessment.indicators.push({
      test: 'Peters',
      result: `p = ${peters.pValue.toFixed(4)}`,
      concern: true
    });
  }

  // Check trim-and-fill
  if (trimfill && trimfill.k0 > 0) {
    const change = Math.abs(trimfill.adjusted_estimate - trimfill.original_estimate);
    assessment.indicators.push({
      test: 'Trim-and-Fill',
      result: `k0 = ${trimfill.k0}, Δ = ${change.toFixed(3)}`,
      concern: change > 0.1
    });
  }

  // Determine overall risk
  const concerns = assessment.indicators.filter(i => i.concern).length;
  if (concerns >= 2) {
    assessment.risk = 'high';
    assessment.recommendation = 'Interpret results with caution due to potential publication bias';
  } else if (concerns === 1) {
    assessment.risk = 'moderate';
    assessment.recommendation = 'Some evidence of asymmetry; consider sensitivity analyses';
  } else {
    assessment.risk = 'low';
    assessment.recommendation = 'No strong evidence of publication bias detected';
  }

  return assessment;
}

test('Bias assessment: high risk with multiple concerns', () => {
  const egger = { pValue: 0.01 };
  const peters = { pValue: 0.05 };
  const trimfill = { k0: 3, original_estimate: -0.5, adjusted_estimate: -0.3 };

  const result = assessPublicationBias(null, egger, peters, trimfill);
  assertEqual(result.risk, 'high', 'High risk detected');
  assertTrue(result.indicators.length >= 2, 'Multiple indicators');
});

test('Bias assessment: low risk with no concerns', () => {
  const egger = { pValue: 0.5 };
  const peters = { pValue: 0.6 };
  const trimfill = { k0: 0, original_estimate: -0.5, adjusted_estimate: -0.5 };

  const result = assessPublicationBias(null, egger, peters, trimfill);
  assertEqual(result.risk, 'low', 'Low risk detected');
});

// ============================================================================
// E-Value Integration
// ============================================================================
console.log('\n--- E-Value Integration ---');

function calculateEValue(rr, ci_bound = null) {
  function eValue(r) {
    if (r < 1) r = 1 / r;
    return r + Math.sqrt(r * (r - 1));
  }

  const result = {
    point: eValue(rr),
    ci_bound: ci_bound ? eValue(ci_bound) : null
  };

  return result;
}

function interpretEValue(eVal) {
  if (eVal.point >= 3) return { strength: 'strong', description: 'Large unmeasured confounding needed' };
  if (eVal.point >= 2) return { strength: 'moderate', description: 'Moderate confounding needed' };
  if (eVal.point >= 1.5) return { strength: 'weak', description: 'Modest confounding could explain' };
  return { strength: 'very weak', description: 'Small confounding could explain' };
}

test('E-value: point estimate calculation', () => {
  const result = calculateEValue(2.0);
  const expected = 2 + Math.sqrt(2);
  assertEqual(result.point, expected, 'E-value for RR=2', 0.01);
});

test('E-value: CI bound calculation', () => {
  const result = calculateEValue(2.0, 1.5);
  assertTrue(result.ci_bound < result.point, 'CI bound E-value smaller');
});

test('E-value: interpretation strong', () => {
  const eVal = calculateEValue(2.5);  // E-value ≈ 4.45
  const interp = interpretEValue(eVal);
  assertEqual(interp.strength, 'strong', 'Strong effect for RR=2.5');
});

// ============================================================================
// Full Workflow Integration Test
// ============================================================================
console.log('\n--- Full Workflow Integration ---');

test('Complete analysis workflow', () => {
  // Step 1: Raw data
  const rawStudies = [
    { id: 'Study1', treat_events: 25, treat_n: 100, ctrl_events: 35, ctrl_n: 100 },
    { id: 'Study2', treat_events: 30, treat_n: 150, ctrl_events: 45, ctrl_n: 150 },
    { id: 'Study3', treat_events: 15, treat_n: 80, ctrl_events: 25, ctrl_n: 80 },
    { id: 'Study4', treat_events: 40, treat_n: 200, ctrl_events: 55, ctrl_n: 200 }
  ];

  // Step 2: Calculate effect sizes
  const studies = rawStudies.map(s => {
    const or = calculateOddsRatio(s.treat_events, s.treat_n, s.ctrl_events, s.ctrl_n);
    return { id: s.id, yi: or.logOr, vi: or.vi, n: s.treat_n + s.ctrl_n };
  });

  assertTrue(studies.every(s => !isNaN(s.yi)), 'All effect sizes computed');

  // Step 3: Run meta-analysis
  const meta = calculateDL(studies);

  assertTrue(meta.k === 4, 'All studies included');
  assertTrue(!isNaN(meta.estimate), 'Estimate computed');

  // Step 4: Check for publication bias
  const egger = runEggerTest(studies);

  assertTrue(egger.pValue >= 0 && egger.pValue <= 1, 'Valid Egger p-value');

  // Step 5: Calculate E-value
  const rr = Math.exp(meta.estimate);  // Back-transform
  const eVal = calculateEValue(rr);

  assertTrue(eVal.point >= 1, 'E-value >= 1');

  // Step 6: Quality checks
  studies.forEach(s => {
    const flags = checkStudyQuality(s);
    // No critical flags expected for these studies
    assertTrue(!flags.some(f => f.severity === 'critical'), 'No critical flags');
  });

  console.log('  Full workflow completed successfully');
});

// ============================================================================
// Summary
// ============================================================================
console.log('');
console.log('='.repeat(60));
console.log(`INTEGRATION TESTS: ${passed}/${passed + failed} tests passed`);
console.log('='.repeat(60));

if (failed > 0) {
  process.exit(1);
}
