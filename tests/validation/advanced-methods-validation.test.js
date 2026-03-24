/**
 * Validation Tests for Advanced Methods (40 functions)
 *
 * These tests validate:
 * 1. Functions exist and are callable
 * 2. Basic numerical accuracy against known results
 * 3. Input validation works correctly
 * 4. Edge cases are handled appropriately
 *
 * Run with: node --experimental-vm-modules advanced-methods-validation.test.js
 */

// ============================================================================
// TEST DATA
// ============================================================================

// Standard meta-analysis dataset (BCG vaccine trials)
const bcgTrials = [
  { yi: -0.89, vi: 0.083, sei: 0.288, n: 887, study: 'Trial 1' },
  { yi: -1.59, vi: 0.015, sei: 0.122, n: 306, study: 'Trial 2' },
  { yi: -1.35, vi: 0.076, sei: 0.276, n: 231, study: 'Trial 3' },
  { yi: -1.44, vi: 0.116, sei: 0.341, n: 127, study: 'Trial 4' },
  { yi: 0.02, vi: 0.196, sei: 0.443, n: 104, study: 'Trial 5' },
  { yi: -0.47, vi: 0.057, sei: 0.239, n: 260, study: 'Trial 6' },
  { yi: -0.22, vi: 0.009, sei: 0.095, n: 766, study: 'Trial 7' },
  { yi: -0.47, vi: 0.015, sei: 0.122, n: 495, study: 'Trial 8' },
  { yi: -1.40, vi: 0.067, sei: 0.259, n: 173, study: 'Trial 9' },
  { yi: -0.34, vi: 0.014, sei: 0.118, n: 524, study: 'Trial 10' }
];

// Studies with p-values for publication bias tests
const studiesWithPvalues = [
  { yi: 0.45, vi: 0.04, pValue: 0.015, n: 50, study: 'Study 1' },
  { yi: 0.32, vi: 0.05, pValue: 0.078, n: 40, study: 'Study 2' },
  { yi: 0.51, vi: 0.03, pValue: 0.002, n: 60, study: 'Study 3' },
  { yi: 0.28, vi: 0.06, pValue: 0.125, n: 35, study: 'Study 4' },
  { yi: 0.48, vi: 0.04, pValue: 0.008, n: 55, study: 'Study 5' },
  { yi: 0.22, vi: 0.07, pValue: 0.210, n: 30, study: 'Study 6' },
  { yi: 0.55, vi: 0.035, pValue: 0.001, n: 65, study: 'Study 7' },
  { yi: 0.38, vi: 0.045, pValue: 0.035, n: 45, study: 'Study 8' }
];

// DTA studies (2x2 table data)
const dtaStudies = [
  { TP: 85, FP: 15, FN: 10, TN: 90, study: 'DTA 1' },
  { TP: 78, FP: 22, FN: 12, TN: 88, study: 'DTA 2' },
  { TP: 92, FP: 8, FN: 5, TN: 95, study: 'DTA 3' },
  { TP: 70, FP: 30, FN: 18, TN: 82, study: 'DTA 4' },
  { TP: 88, FP: 12, FN: 8, TN: 92, study: 'DTA 5' }
];

// C-statistic studies
const cStatStudies = [
  { cstat: 0.75, se: 0.03, n: 500, study: 'Model 1' },
  { cstat: 0.78, se: 0.025, n: 600, study: 'Model 2' },
  { cstat: 0.72, se: 0.04, n: 400, study: 'Model 3' },
  { cstat: 0.80, se: 0.02, n: 800, study: 'Model 4' },
  { cstat: 0.74, se: 0.035, n: 450, study: 'Model 5' }
];

// ============================================================================
// TEST RUNNER
// ============================================================================

let testsPassed = 0;
let testsFailed = 0;
const failures = [];

function assert(condition, message) {
  if (condition) {
    testsPassed++;
    console.log(`  ✓ ${message}`);
  } else {
    testsFailed++;
    failures.push(message);
    console.log(`  ✗ ${message}`);
  }
}

function assertApproxEqual(actual, expected, tolerance, message) {
  const diff = Math.abs(actual - expected);
  if (diff <= tolerance) {
    testsPassed++;
    console.log(`  ✓ ${message} (${actual.toFixed(4)} ≈ ${expected.toFixed(4)})`);
  } else {
    testsFailed++;
    failures.push(`${message}: expected ${expected}, got ${actual}`);
    console.log(`  ✗ ${message} (${actual.toFixed(4)} ≠ ${expected.toFixed(4)})`);
  }
}

function assertInRange(value, min, max, message) {
  if (value >= min && value <= max) {
    testsPassed++;
    console.log(`  ✓ ${message} (${value.toFixed(4)} in [${min}, ${max}])`);
  } else {
    testsFailed++;
    failures.push(`${message}: ${value} not in [${min}, ${max}]`);
    console.log(`  ✗ ${message} (${value.toFixed(4)} not in [${min}, ${max}])`);
  }
}

// ============================================================================
// IMPORT TESTS
// ============================================================================

async function runTests() {
  console.log('\n' + '='.repeat(70));
  console.log('ADVANCED METHODS VALIDATION TESTS');
  console.log('='.repeat(70));

  // Test stats-utils imports
  console.log('\n--- Stats Utils Module ---');
  try {
    const statsUtils = await import('../../src/lib/stats-utils.js');

    assert(typeof statsUtils.mean === 'function', 'mean() exists');
    assert(typeof statsUtils.variance === 'function', 'variance() exists');
    assert(typeof statsUtils.sd === 'function', 'sd() exists');
    assert(typeof statsUtils.normalCDF === 'function', 'normalCDF() exists');
    assert(typeof statsUtils.normalQuantile === 'function', 'normalQuantile() exists');
    assert(typeof statsUtils.chiSquaredCDF === 'function', 'chiSquaredCDF() exists');
    assert(typeof statsUtils.validateStudies === 'function', 'validateStudies() exists');
    assert(typeof statsUtils.computeRhat === 'function', 'computeRhat() exists');
    assert(typeof statsUtils.computeESS === 'function', 'computeESS() exists');

    // Numerical validation
    assertApproxEqual(statsUtils.mean([1, 2, 3, 4, 5]), 3, 0.0001, 'mean([1,2,3,4,5]) = 3');
    assertApproxEqual(statsUtils.sd([1, 2, 3, 4, 5]), 1.5811, 0.001, 'sd([1,2,3,4,5]) ≈ 1.58');
    assertApproxEqual(statsUtils.normalCDF(0), 0.5, 0.0001, 'normalCDF(0) = 0.5');
    assertApproxEqual(statsUtils.normalCDF(1.96), 0.975, 0.001, 'normalCDF(1.96) ≈ 0.975');
    assertApproxEqual(statsUtils.normalQuantile(0.975), 1.96, 0.01, 'normalQuantile(0.975) ≈ 1.96');

  } catch (e) {
    console.log(`  ✗ Failed to import stats-utils: ${e.message}`);
    testsFailed++;
  }

  // ============================================================================
  // ADVANCED METHODS 1: Publication Bias & Power
  // ============================================================================

  console.log('\n--- Advanced Methods 1: Publication Bias & Power ---');
  try {
    const am1 = await import('../../src/lib/advanced-methods-1.js');

    // Check functions exist
    assert(typeof am1.pCurveAnalysis === 'function', 'pCurveAnalysis() exists');
    assert(typeof am1.pUniformStar === 'function', 'pUniformStar() exists');
    assert(typeof am1.zCurve2 === 'function', 'zCurve2() exists');
    assert(typeof am1.andrewsKasySelection === 'function', 'andrewsKasySelection() exists');
    assert(typeof am1.mathurVanderWeeleSensitivity === 'function', 'mathurVanderWeeleSensitivity() exists');
    assert(typeof am1.veveaWoodsSensitivityGrid === 'function', 'veveaWoodsSensitivityGrid() exists');
    assert(typeof am1.correctedPowerAnalysis === 'function', 'correctedPowerAnalysis() exists');
    assert(typeof am1.excessSignificanceTest === 'function', 'excessSignificanceTest() exists');
    assert(typeof am1.TIVA === 'function', 'TIVA() exists');
    assert(typeof am1.caliperTest === 'function', 'caliperTest() exists');

    // Test P-curve analysis
    const pcurveResult = am1.pCurveAnalysis(studiesWithPvalues.filter(s => s.pValue < 0.05));
    assert(pcurveResult !== null, 'pCurveAnalysis() returns result');
    assert(typeof pcurveResult.rightSkewZ === 'number', 'P-curve has rightSkewZ');
    assert(typeof pcurveResult.evidentialValue === 'string', 'P-curve has evidentialValue interpretation');

    // Test Z-curve 2.0
    const zcurveResult = am1.zCurve2(studiesWithPvalues);
    assert(zcurveResult !== null, 'zCurve2() returns result');
    assertInRange(zcurveResult.ERR, 0, 1, 'Z-curve ERR in [0, 1]');
    assertInRange(zcurveResult.EDR, 0, 1, 'Z-curve EDR in [0, 1]');

    // Test TIVA
    const tivaResult = am1.TIVA(studiesWithPvalues);
    assert(tivaResult !== null, 'TIVA() returns result');
    assert(typeof tivaResult.tivaStatistic === 'number', 'TIVA has tivaStatistic');

    // Test caliper test
    const caliperResult = am1.caliperTest(studiesWithPvalues.map(s => s.pValue));
    assert(caliperResult !== null, 'caliperTest() returns result');

  } catch (e) {
    console.log(`  ✗ Failed to test advanced-methods-1: ${e.message}`);
    testsFailed++;
  }

  // ============================================================================
  // ADVANCED METHODS 2: Bayesian & Robust
  // ============================================================================

  console.log('\n--- Advanced Methods 2: Bayesian & Robust ---');
  try {
    const am2 = await import('../../src/lib/advanced-methods-2.js');

    // Check functions exist
    assert(typeof am2.bayesianHeterogeneityBMA === 'function', 'bayesianHeterogeneityBMA() exists');
    assert(typeof am2.spikeAndSlabMA === 'function', 'spikeAndSlabMA() exists');
    assert(typeof am2.horseshoeMetaRegression === 'function', 'horseshoeMetaRegression() exists');
    assert(typeof am2.medianMetaAnalysis === 'function', 'medianMetaAnalysis() exists');
    assert(typeof am2.winsorizedMetaAnalysis === 'function', 'winsorizedMetaAnalysis() exists');
    assert(typeof am2.mEstimatorMetaAnalysis === 'function', 'mEstimatorMetaAnalysis() exists');
    assert(typeof am2.influenceTrimmedMA === 'function', 'influenceTrimmedMA() exists');
    assert(typeof am2.crossValidatedModeratorSelection === 'function', 'crossValidatedModeratorSelection() exists');
    assert(typeof am2.stackingEnsembleMA === 'function', 'stackingEnsembleMA() exists');
    assert(typeof am2.conformalPredictionIntervals === 'function', 'conformalPredictionIntervals() exists');

    // Test median meta-analysis
    const medianResult = am2.medianMetaAnalysis(bcgTrials);
    assert(medianResult !== null, 'medianMetaAnalysis() returns result');
    assertInRange(medianResult.median, -2, 0, 'Median effect in reasonable range');

    // Test winsorized MA
    const winsorResult = am2.winsorizedMetaAnalysis(bcgTrials);
    assert(winsorResult !== null, 'winsorizedMetaAnalysis() returns result');
    assert(typeof winsorResult.winsorizedMean === 'number', 'Winsorized MA has mean');

    // Test M-estimator MA
    const mEstResult = am2.mEstimatorMetaAnalysis(bcgTrials);
    assert(mEstResult !== null, 'mEstimatorMetaAnalysis() returns result');
    assert(typeof mEstResult.estimate === 'number', 'M-estimator has estimate');

    // Test influence-trimmed MA
    const trimResult = am2.influenceTrimmedMA(bcgTrials);
    assert(trimResult !== null, 'influenceTrimmedMA() returns result');

    // Test Bayesian heterogeneity BMA (basic check - full MCMC is slow)
    const bayesBMAResult = am2.bayesianHeterogeneityBMA(bcgTrials.slice(0, 5), {
      nIterations: 100, nBurnin: 50, nChains: 2
    });
    assert(bayesBMAResult !== null, 'bayesianHeterogeneityBMA() returns result');
    assert(bayesBMAResult.convergence !== undefined, 'Bayesian result has convergence diagnostics');

  } catch (e) {
    console.log(`  ✗ Failed to test advanced-methods-2: ${e.message}`);
    testsFailed++;
  }

  // ============================================================================
  // ADVANCED METHODS 3: NMA & IPD
  // ============================================================================

  console.log('\n--- Advanced Methods 3: NMA & IPD ---');
  try {
    const am3 = await import('../../src/lib/advanced-methods-3.js');

    // Check functions exist
    assert(typeof am3.nmaThresholdAnalysis === 'function', 'nmaThresholdAnalysis() exists');
    assert(typeof am3.matchingAdjustedIC === 'function', 'matchingAdjustedIC() exists');
    assert(typeof am3.simulatedTreatmentComparison === 'function', 'simulatedTreatmentComparison() exists');
    assert(typeof am3.unanchoredIndirectComparison === 'function', 'unanchoredIndirectComparison() exists');
    assert(typeof am3.heterogeneityPartitioning === 'function', 'heterogeneityPartitioning() exists');
    assert(typeof am3.heterogeneityLocalization === 'function', 'heterogeneityLocalization() exists');
    assert(typeof am3.crossClassifiedMA === 'function', 'crossClassifiedMA() exists');
    assert(typeof am3.oneVsTwoStageComparison === 'function', 'oneVsTwoStageComparison() exists');
    assert(typeof am3.timeVaryingEffectMA === 'function', 'timeVaryingEffectMA() exists');
    assert(typeof am3.recurrentEventsMA === 'function', 'recurrentEventsMA() exists');

    // Test heterogeneity partitioning
    const hetPartResult = am3.heterogeneityPartitioning(bcgTrials, 'study');
    assert(hetPartResult !== null, 'heterogeneityPartitioning() returns result');
    assertInRange(hetPartResult.totalI2, 0, 100, 'Total I² in valid range');

    // Test heterogeneity localization
    const hetLocResult = am3.heterogeneityLocalization(bcgTrials);
    assert(hetLocResult !== null, 'heterogeneityLocalization() returns result');
    assert(Array.isArray(hetLocResult.outliers), 'Localization has outliers array');

    // Test unanchored IC (should include warnings)
    const ipdData = [
      { treatment: 1, y: 1.2, x1: 0.5, x2: 45 },
      { treatment: 1, y: 0.8, x1: 0.6, x2: 50 },
      { treatment: 1, y: 1.5, x1: 0.4, x2: 40 }
    ];
    const aggData = { mean_y: 0.6, mean_x1: 0.55, mean_x2: 48 };
    const unanchoredResult = am3.unanchoredIndirectComparison(ipdData, aggData, ['x1', 'x2']);
    assert(unanchoredResult !== null, 'unanchoredIndirectComparison() returns result');
    assert(Array.isArray(unanchoredResult.warnings), 'Unanchored IC has warnings');
    assert(unanchoredResult.warnings.length >= 5, 'Unanchored IC has strong warnings (>=5)');

  } catch (e) {
    console.log(`  ✗ Failed to test advanced-methods-3: ${e.message}`);
    testsFailed++;
  }

  // ============================================================================
  // ADVANCED METHODS 4: DTA & Prediction
  // ============================================================================

  console.log('\n--- Advanced Methods 4: DTA & Prediction ---');
  try {
    const am4 = await import('../../src/lib/advanced-methods-4.js');

    // Check functions exist
    assert(typeof am4.multipleThresholdsDTA === 'function', 'multipleThresholdsDTA() exists');
    assert(typeof am4.comparativeDTA === 'function', 'comparativeDTA() exists');
    assert(typeof am4.testCombinationsMA === 'function', 'testCombinationsMA() exists');
    assert(typeof am4.cStatisticMetaAnalysis === 'function', 'cStatisticMetaAnalysis() exists');
    assert(typeof am4.calibrationMetaAnalysis === 'function', 'calibrationMetaAnalysis() exists');
    assert(typeof am4.netBenefitMetaAnalysis === 'function', 'netBenefitMetaAnalysis() exists');
    assert(typeof am4.cliffsDeltaMetaAnalysis === 'function', 'cliffsDeltaMetaAnalysis() exists');
    assert(typeof am4.overlapCoefficientMA === 'function', 'overlapCoefficientMA() exists');
    assert(typeof am4.wildBootstrapMetaRegression === 'function', 'wildBootstrapMetaRegression() exists');
    assert(typeof am4.clusteredBootstrapMA === 'function', 'clusteredBootstrapMA() exists');

    // Test C-statistic meta-analysis
    const cstatResult = am4.cStatisticMetaAnalysis(cStatStudies);
    assert(cstatResult !== null, 'cStatisticMetaAnalysis() returns result');
    assertInRange(cstatResult.pooled, 0.5, 1, 'Pooled C-statistic in valid range');
    assertInRange(cstatResult.ci[0], 0.5, cstatResult.pooled, 'C-stat CI lower bound valid');
    assertInRange(cstatResult.ci[1], cstatResult.pooled, 1, 'C-stat CI upper bound valid');

    // Test calibration MA
    const calibStudies = cStatStudies.map(s => ({
      oe: 0.95 + Math.random() * 0.1,
      se: 0.05,
      n: s.n,
      study: s.study
    }));
    const calibResult = am4.calibrationMetaAnalysis(calibStudies);
    assert(calibResult !== null, 'calibrationMetaAnalysis() returns result');
    assertInRange(calibResult.pooledOE, 0.5, 1.5, 'Pooled O/E in reasonable range');

    // Test Cliff's delta MA
    const cliffStudies = bcgTrials.map(s => ({
      ...s,
      delta: -0.3 + Math.random() * 0.2,
      n1: 50,
      n2: 50
    }));
    const cliffResult = am4.cliffsDeltaMetaAnalysis(cliffStudies);
    assert(cliffResult !== null, 'cliffsDeltaMetaAnalysis() returns result');
    assertInRange(cliffResult.pooledDelta, -1, 1, "Pooled Cliff's delta in valid range");

    // Test wild bootstrap meta-regression
    const modStudies = bcgTrials.map((s, i) => ({ ...s, year: 1950 + i * 5 }));
    const wildResult = am4.wildBootstrapMetaRegression(modStudies, ['year'], { nBoot: 100 });
    assert(wildResult !== null, 'wildBootstrapMetaRegression() returns result');
    assert(wildResult.coefficients !== undefined, 'Wild bootstrap has coefficients');

    // Test clustered bootstrap
    const clusteredStudies = bcgTrials.map((s, i) => ({ ...s, cluster: i % 3 }));
    const clustResult = am4.clusteredBootstrapMA(clusteredStudies, { nBoot: 100 });
    assert(clustResult !== null, 'clusteredBootstrapMA() returns result');
    assert(clustResult.clusterAdjustedSE !== undefined, 'Clustered bootstrap has adjusted SE');

  } catch (e) {
    console.log(`  ✗ Failed to test advanced-methods-4: ${e.message}`);
    testsFailed++;
  }

  // ============================================================================
  // INPUT VALIDATION TESTS
  // ============================================================================

  console.log('\n--- Input Validation Tests ---');
  try {
    const am1 = await import('../../src/lib/advanced-methods-1.js');
    const am2 = await import('../../src/lib/advanced-methods-2.js');

    // Test with empty array
    try {
      am1.pCurveAnalysis([]);
      assert(false, 'pCurveAnalysis should reject empty array');
    } catch (e) {
      assert(true, 'pCurveAnalysis rejects empty array');
    }

    // Test with null
    try {
      am2.medianMetaAnalysis(null);
      assert(false, 'medianMetaAnalysis should reject null');
    } catch (e) {
      assert(true, 'medianMetaAnalysis rejects null');
    }

    // Test with insufficient studies
    try {
      am2.winsorizedMetaAnalysis([{ yi: 0.5, vi: 0.1 }]);
      assert(false, 'winsorizedMetaAnalysis should reject single study');
    } catch (e) {
      assert(true, 'winsorizedMetaAnalysis rejects insufficient studies');
    }

  } catch (e) {
    console.log(`  ✗ Input validation test error: ${e.message}`);
    testsFailed++;
  }

  // ============================================================================
  // SUMMARY
  // ============================================================================

  console.log('\n' + '='.repeat(70));
  console.log('VALIDATION SUMMARY');
  console.log('='.repeat(70));
  console.log(`Tests passed: ${testsPassed}`);
  console.log(`Tests failed: ${testsFailed}`);
  console.log(`Total tests: ${testsPassed + testsFailed}`);

  if (testsFailed > 0) {
    console.log('\nFailed tests:');
    failures.forEach(f => console.log(`  - ${f}`));
  }

  console.log('\n' + (testsFailed === 0 ? '✓ ALL TESTS PASSED' : '✗ SOME TESTS FAILED'));

  return testsFailed === 0;
}

// Run tests
runTests().then(success => {
  process.exit(success ? 0 : 1);
}).catch(e => {
  console.error('Test runner error:', e);
  process.exit(1);
});
