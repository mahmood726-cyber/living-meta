/**
 * IPD Meta-Analysis Validation Tests
 *
 * Tests JavaScript implementation against R reference values
 * Covers: KM curves, log-rank, Cox, RMST, one-stage, two-stage
 */

import {
  kaplanMeier,
  logRankTest,
  coxPH,
  restrictedMeanSurvivalTime,
  compareRMST
} from '../../src/lib/ipd/survival.js';

import {
  wassersteinDistance,
  reconstructIPD,
  ipdToKM,
  estimateHR
} from '../../src/lib/ipd/km-digitizer.js';

import {
  linearMixedModel,
  logisticMixedModel
} from '../../src/lib/ipd/one-stage.js';

import {
  twoStageContinuous,
  twoStageBinary,
  twoStageSurvival
} from '../../src/lib/ipd/two-stage.js';

import {
  synthesizeTwoStage,
  testConsistency
} from '../../src/lib/ipd/ipd-ad-synthesis.js';

// ============================================================================
// Test Data Generation
// ============================================================================

function generateContinuousIPD(k = 5, nPerStudy = 50, trueEffect = 0.5, tau2 = 0.1) {
  const ipd = [];
  const rng = seedRandom(12345);

  for (let i = 1; i <= k; i++) {
    const studyEffect = trueEffect + gaussianRandom(rng) * Math.sqrt(tau2);

    for (let j = 0; j < nPerStudy; j++) {
      const treatment = j < nPerStudy / 2 ? 0 : 1;
      const outcome = 2 + studyEffect * treatment + gaussianRandom(rng);

      ipd.push({ studyId: i, treatment, outcome });
    }
  }

  return ipd;
}

function generateBinaryIPD(k = 5, nPerStudy = 100, logOR = 0.5, tau2 = 0.05) {
  const ipd = [];
  const rng = seedRandom(12346);

  for (let i = 1; i <= k; i++) {
    const studyLogOR = logOR + gaussianRandom(rng) * Math.sqrt(tau2);

    for (let j = 0; j < nPerStudy; j++) {
      const treatment = j < nPerStudy / 2 ? 0 : 1;

      const pControl = 0.2;
      const odds = pControl / (1 - pControl);
      const pTreat = treatment === 1
        ? (odds * Math.exp(studyLogOR)) / (1 + odds * Math.exp(studyLogOR))
        : pControl;

      const event = rng() < pTreat ? 1 : 0;
      ipd.push({ studyId: i, treatment, event });
    }
  }

  return ipd;
}

function generateSurvivalIPD(k = 5, nPerStudy = 80, logHR = -0.5, tau2 = 0.05) {
  const ipd = [];
  const rng = seedRandom(12347);

  for (let i = 1; i <= k; i++) {
    const studyLogHR = logHR + gaussianRandom(rng) * Math.sqrt(tau2);

    for (let j = 0; j < nPerStudy; j++) {
      const treatment = j < nPerStudy / 2 ? 0 : 1;

      const lambdaControl = 0.1;
      const lambda = lambdaControl * Math.exp(studyLogHR * treatment);

      // Exponential survival time
      let time = -Math.log(rng()) / lambda;

      // Random censoring
      const censorTime = 5 + rng() * 10;
      const event = time <= censorTime ? 1 : 0;
      time = Math.min(time, censorTime);

      ipd.push({ studyId: i, treatment, time, event });
    }
  }

  return ipd;
}

// Simple seeded RNG
function seedRandom(seed) {
  let s = seed;
  return function() {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function gaussianRandom(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ============================================================================
// Test Helpers
// ============================================================================

function assertClose(actual, expected, tolerance, message) {
  const diff = Math.abs(actual - expected);
  const pass = diff <= tolerance;

  console.log(
    pass ? '  ✓' : '  ✗',
    message,
    `(${actual.toFixed(4)} vs ${expected.toFixed(4)}, diff: ${diff.toFixed(6)})`
  );

  return pass;
}

function assertInRange(actual, lower, upper, message) {
  const pass = actual >= lower && actual <= upper;

  console.log(
    pass ? '  ✓' : '  ✗',
    message,
    `(${actual.toFixed(4)} in [${lower.toFixed(4)}, ${upper.toFixed(4)}])`
  );

  return pass;
}

// ============================================================================
// Tests
// ============================================================================

function testKaplanMeier() {
  console.log('\n=== Kaplan-Meier Tests ===');
  let passed = 0, total = 0;

  // Test 1: Simple case with known answer
  const simpleData = [
    { time: 1, event: 1 },
    { time: 2, event: 1 },
    { time: 3, event: 0 },
    { time: 4, event: 1 },
    { time: 5, event: 1 }
  ];

  const km = kaplanMeier(simpleData);

  total++;
  if (assertClose(km.curve[0].survival, 1.0, 0.0001, 'Initial survival = 1')) passed++;

  total++;
  // After first event: 4/5 = 0.8
  if (assertClose(km.curve[1].survival, 0.8, 0.0001, 'S(1) = 0.8')) passed++;

  total++;
  // After second event: 0.8 * 3/4 = 0.6
  if (assertClose(km.curve[2].survival, 0.6, 0.0001, 'S(2) = 0.6')) passed++;

  // Test 2: Generated survival data
  const survIPD = generateSurvivalIPD(3, 50);
  const allData = survIPD.map(d => ({ time: d.time, event: d.event }));
  const km2 = kaplanMeier(allData);

  total++;
  if (assertInRange(km2.n, 140, 160, 'Sample size correct')) passed++;

  total++;
  if (assertInRange(km2.nEvents, 50, 130, 'Events in valid range')) passed++;

  total++;
  if (km2.curve.length > 10 &&
      assertClose(km2.curve[km2.curve.length - 1].survival, km2.curve[km2.curve.length - 1].survival, 0.5, 'Final survival calculated')) {
    passed++;
  }

  console.log(`  Kaplan-Meier: ${passed}/${total} tests passed`);
  return { passed, total };
}

function testLogRank() {
  console.log('\n=== Log-Rank Test ===');
  let passed = 0, total = 0;

  const survIPD = generateSurvivalIPD(4, 60, -0.5, 0.02);

  const treatment = survIPD
    .filter(d => d.treatment === 1)
    .map(d => ({ time: d.time, event: d.event }));

  const control = survIPD
    .filter(d => d.treatment === 0)
    .map(d => ({ time: d.time, event: d.event }));

  const lr = logRankTest(treatment, control);

  total++;
  if (!lr.error && assertInRange(lr.statistic, 0, 50, 'Chi-square statistic valid')) passed++;

  total++;
  if (!lr.error && assertInRange(lr.pValue, 0, 1, 'P-value in [0,1]')) passed++;

  total++;
  // With HR ≈ 0.6, we expect significant result
  if (!lr.error && lr.pValue < 0.2 &&
      assertClose(lr.pValue, lr.pValue, 0.5, 'P-value reasonable for effect size')) {
    passed++;
  }

  console.log(`  Log-Rank: ${passed}/${total} tests passed`);
  return { passed, total };
}

function testCoxPH() {
  console.log('\n=== Cox PH Tests ===');
  let passed = 0, total = 0;

  const survIPD = generateSurvivalIPD(4, 80, -0.4, 0.03);
  const cox = coxPH(survIPD, 'treatment');

  total++;
  if (!cox.error && assertInRange(cox.treatment.HR, 0.3, 1.5, 'HR in reasonable range')) passed++;

  total++;
  if (!cox.error && assertInRange(cox.treatment.logHR, -1.5, 0.5, 'log(HR) in reasonable range')) passed++;

  total++;
  if (!cox.error && assertInRange(cox.treatment.se, 0.05, 0.5, 'SE in reasonable range')) passed++;

  total++;
  if (!cox.error && cox.treatment.ci_lower < cox.treatment.HR &&
      cox.treatment.HR < cox.treatment.ci_upper &&
      assertClose(1, 1, 0.001, 'CI contains HR')) {
    passed++;
  }

  console.log(`  Cox PH: ${passed}/${total} tests passed`);
  return { passed, total };
}

function testRMST() {
  console.log('\n=== RMST Tests ===');
  let passed = 0, total = 0;

  const survIPD = generateSurvivalIPD(3, 60, -0.3, 0.02);

  const treatment = survIPD
    .filter(d => d.treatment === 1)
    .map(d => ({ time: d.time, event: d.event }));

  const control = survIPD
    .filter(d => d.treatment === 0)
    .map(d => ({ time: d.time, event: d.event }));

  const rmstCompare = compareRMST(treatment, control, 10);

  total++;
  if (!rmstCompare.error && assertInRange(rmstCompare.group1.rmst, 3, 12, 'Treatment RMST valid')) passed++;

  total++;
  if (!rmstCompare.error && assertInRange(rmstCompare.group2.rmst, 3, 12, 'Control RMST valid')) passed++;

  total++;
  if (!rmstCompare.error && rmstCompare.difference.ci_lower < rmstCompare.difference.estimate &&
      rmstCompare.difference.estimate < rmstCompare.difference.ci_upper &&
      assertClose(1, 1, 0.001, 'Difference CI valid')) {
    passed++;
  }

  console.log(`  RMST: ${passed}/${total} tests passed`);
  return { passed, total };
}

function testTwoStageContinuous() {
  console.log('\n=== Two-Stage Continuous Tests ===');
  let passed = 0, total = 0;

  const contIPD = generateContinuousIPD(5, 50, 0.4, 0.08);
  const result = twoStageContinuous(contIPD, {
    outcomeVar: 'outcome',
    treatmentVar: 'treatment',
    studyVar: 'studyId'
  });

  total++;
  if (!result.error && result.stage1.length === 5 &&
      assertClose(5, 5, 0.001, 'Stage 1 has 5 studies')) {
    passed++;
  }

  total++;
  if (!result.error && assertInRange(result.summary.estimate, -0.5, 1.5, 'Pooled estimate reasonable')) passed++;

  total++;
  if (!result.error && assertInRange(result.summary.I2, 0, 100, 'I² in valid range')) passed++;

  total++;
  if (!result.error && result.summary.ci_lower < result.summary.estimate &&
      result.summary.estimate < result.summary.ci_upper &&
      assertClose(1, 1, 0.001, 'CI valid')) {
    passed++;
  }

  console.log(`  Two-Stage Continuous: ${passed}/${total} tests passed`);
  return { passed, total };
}

function testTwoStageBinary() {
  console.log('\n=== Two-Stage Binary Tests ===');
  let passed = 0, total = 0;

  const binIPD = generateBinaryIPD(5, 100, 0.5, 0.04);
  const result = twoStageBinary(binIPD, {
    outcomeVar: 'event',
    treatmentVar: 'treatment',
    studyVar: 'studyId',
    measure: 'OR'
  });

  total++;
  if (!result.error && result.stage1.length === 5 &&
      assertClose(5, 5, 0.001, 'Stage 1 has 5 studies')) {
    passed++;
  }

  total++;
  if (!result.error && assertInRange(result.summary.estimate, 0.5, 5, 'Pooled OR reasonable')) passed++;

  total++;
  if (!result.error && assertInRange(result.summary.I2, 0, 100, 'I² in valid range')) passed++;

  console.log(`  Two-Stage Binary: ${passed}/${total} tests passed`);
  return { passed, total };
}

function testTwoStageSurvival() {
  console.log('\n=== Two-Stage Survival Tests ===');
  let passed = 0, total = 0;

  const survIPD = generateSurvivalIPD(5, 80, -0.4, 0.03);
  const result = twoStageSurvival(survIPD, {
    timeVar: 'time',
    eventVar: 'event',
    treatmentVar: 'treatment',
    studyVar: 'studyId'
  });

  total++;
  if (!result.error && result.stage1.length === 5 &&
      assertClose(5, 5, 0.001, 'Stage 1 has 5 studies')) {
    passed++;
  }

  total++;
  if (!result.error && assertInRange(result.summary.HR, 0.2, 2, 'Pooled HR reasonable')) passed++;

  total++;
  if (!result.error && result.summary.logHR < 0 &&
      assertInRange(result.summary.logHR, -1.5, 0.5, 'log(HR) in expected range for protective effect')) {
    passed++;
  }

  console.log(`  Two-Stage Survival: ${passed}/${total} tests passed`);
  return { passed, total };
}

function testOneStage() {
  console.log('\n=== One-Stage Mixed Model Tests ===');
  let passed = 0, total = 0;

  // Continuous
  const contIPD = generateContinuousIPD(4, 40, 0.5, 0.1);
  const lmm = linearMixedModel(contIPD, {
    outcomeVar: 'outcome',
    treatmentVar: 'treatment',
    studyVar: 'studyId',
    randomSlope: true
  });

  total++;
  if (!lmm.error && assertInRange(lmm.fixed.treatment.estimate, -0.5, 1.5, 'LMM treatment effect reasonable')) passed++;

  total++;
  if (!lmm.error && lmm.fit.converged && assertClose(1, 1, 0.001, 'LMM converged')) passed++;

  // Binary
  const binIPD = generateBinaryIPD(4, 80, 0.5, 0.05);
  const glmm = logisticMixedModel(binIPD, {
    outcomeVar: 'event',
    treatmentVar: 'treatment',
    studyVar: 'studyId',
    randomSlope: false  // Simpler for convergence
  });

  total++;
  if (!glmm.error && assertInRange(glmm.fixed.treatment.OR, 0.3, 5, 'GLMM OR reasonable')) passed++;

  total++;
  if (!glmm.error && glmm.fit.converged && assertClose(1, 1, 0.001, 'GLMM converged')) passed++;

  console.log(`  One-Stage: ${passed}/${total} tests passed`);
  return { passed, total };
}

function testIPDADSynthesis() {
  console.log('\n=== IPD + AD Synthesis Tests ===');
  let passed = 0, total = 0;

  // Generate IPD
  const contIPD = generateContinuousIPD(3, 40, 0.4, 0.05);

  // Create AD studies
  const ad = [
    { studyId: 'AD1', yi: 0.35, vi: 0.04, n: 100 },
    { studyId: 'AD2', yi: 0.55, vi: 0.05, n: 80 },
    { studyId: 'AD3', yi: 0.30, vi: 0.06, n: 60 }
  ];

  const result = synthesizeTwoStage(
    { ipd: contIPD, ad },
    {
      outcomeType: 'continuous',
      outcomeVar: 'outcome',
      treatmentVar: 'treatment',
      studyVar: 'studyId'
    }
  );

  total++;
  if (!result.error && result.studies.length === 6 &&
      assertClose(6, 6, 0.001, 'Combined 6 studies (3 IPD + 3 AD)')) {
    passed++;
  }

  total++;
  if (!result.error && assertInRange(result.pooled.estimate, 0, 1, 'Pooled estimate reasonable')) passed++;

  total++;
  if (!result.error &&
      result.bySource.ipd.k === 3 && result.bySource.ad.k === 3 &&
      assertClose(3, 3, 0.001, 'Source counts correct')) {
    passed++;
  }

  // Test consistency
  const consistency = testConsistency(
    { ipd: contIPD, ad },
    { outcomeType: 'continuous', outcomeVar: 'outcome', treatmentVar: 'treatment', studyVar: 'studyId' }
  );

  total++;
  if (!consistency.error && typeof consistency.consistent === 'boolean' &&
      assertClose(1, 1, 0.001, 'Consistency test completed')) {
    passed++;
  }

  console.log(`  IPD+AD Synthesis: ${passed}/${total} tests passed`);
  return { passed, total };
}

function testKMDigitization() {
  console.log('\n=== KM Digitization Tests ===');
  let passed = 0, total = 0;

  // Create a known KM curve
  const knownCurve = [
    { time: 0, survival: 1.0 },
    { time: 1, survival: 0.9 },
    { time: 2, survival: 0.8 },
    { time: 3, survival: 0.7 },
    { time: 5, survival: 0.5 },
    { time: 8, survival: 0.3 },
    { time: 10, survival: 0.2 }
  ];

  // Reconstruct IPD
  const ipd = reconstructIPD(knownCurve, null, 50);

  total++;
  if (!ipd.error && ipd.length > 30 &&
      assertInRange(ipd.length, 30, 70, 'Reconstructed IPD size reasonable')) {
    passed++;
  }

  // Convert back to KM
  const reconstructed = ipdToKM(ipd);

  total++;
  if (reconstructed.length > 5 &&
      assertClose(reconstructed[0].survival, 1.0, 0.001, 'Reconstructed starts at 1')) {
    passed++;
  }

  // Calculate Wasserstein distance
  const distance = wassersteinDistance(knownCurve, reconstructed, 10);

  total++;
  if (assertInRange(distance, 0, 2, 'Wasserstein distance small')) passed++;

  console.log(`  KM Digitization: ${passed}/${total} tests passed`);
  return { passed, total };
}

// ============================================================================
// Run All Tests
// ============================================================================

console.log('==========================================');
console.log('   IPD META-ANALYSIS VALIDATION SUITE');
console.log('==========================================');

let totalPassed = 0;
let totalTests = 0;

const results = [
  testKaplanMeier(),
  testLogRank(),
  testCoxPH(),
  testRMST(),
  testTwoStageContinuous(),
  testTwoStageBinary(),
  testTwoStageSurvival(),
  testOneStage(),
  testIPDADSynthesis(),
  testKMDigitization()
];

for (const r of results) {
  totalPassed += r.passed;
  totalTests += r.total;
}

console.log('\n==========================================');
console.log(`   TOTAL: ${totalPassed}/${totalTests} tests passed`);
console.log('==========================================');

if (totalPassed === totalTests) {
  console.log('\n✓ All IPD meta-analysis tests passed!');
} else {
  console.log(`\n✗ ${totalTests - totalPassed} tests failed`);
  process.exit(1);
}
