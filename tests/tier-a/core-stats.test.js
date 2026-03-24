/**
 * Core Statistical Functions Test Suite
 * Tier-A: Numerical validation against known values
 */

import {
  normalCDF,
  normalPDF,
  normalQuantile,
  tCDF,
  tPDF,
  tQuantile,
  logGamma,
  betaIncomplete,
  chiSquaredCDF,
  fCDF
} from '../../src/lib/stats-utils.js';

import {
  oddsRatio,
  riskRatio,
  riskDifference,
  meanDifference,
  standardizedMeanDifference
} from '../../src/lib/effect-sizes.js';

import { derSimonianLaird } from '../../src/lib/meta-dl.js';
import { fixedEffects } from '../../src/lib/meta-fe.js';

/**
 * Test result tracking
 */
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

/**
 * Tolerance for floating point comparisons
 */
const TOL = 1e-6;

/**
 * Assert approximately equal
 */
function assertApprox(actual, expected, testName, tolerance = TOL) {
  const passed = Math.abs(actual - expected) < tolerance ||
    (isNaN(actual) && isNaN(expected)) ||
    (actual === expected);

  if (passed) {
    results.passed++;
    results.tests.push({ name: testName, passed: true });
  } else {
    results.failed++;
    results.tests.push({
      name: testName,
      passed: false,
      actual,
      expected,
      diff: Math.abs(actual - expected)
    });
  }
}

/**
 * Test Normal Distribution Functions
 */
function testNormalDistribution() {
  console.log('\n=== Normal Distribution Tests ===');

  // normalCDF - known values
  assertApprox(normalCDF(0), 0.5, 'normalCDF(0) = 0.5');
  assertApprox(normalCDF(1.96), 0.975, 'normalCDF(1.96) ≈ 0.975', 0.001);
  assertApprox(normalCDF(-1.96), 0.025, 'normalCDF(-1.96) ≈ 0.025', 0.001);
  assertApprox(normalCDF(1), 0.8413, 'normalCDF(1) ≈ 0.8413', 0.001);

  // normalQuantile - inverse of CDF
  assertApprox(normalQuantile(0.5), 0, 'normalQuantile(0.5) = 0');
  assertApprox(normalQuantile(0.975), 1.96, 'normalQuantile(0.975) ≈ 1.96', 0.01);
  assertApprox(normalQuantile(0.025), -1.96, 'normalQuantile(0.025) ≈ -1.96', 0.01);

  // normalPDF - known values
  assertApprox(normalPDF(0), 0.3989, 'normalPDF(0) ≈ 0.3989', 0.001);
}

/**
 * Test t-Distribution Functions
 */
function testTDistribution() {
  console.log('\n=== t-Distribution Tests ===');

  // tCDF - df=1 (Cauchy)
  assertApprox(tCDF(0, 1), 0.5, 'tCDF(0, df=1) = 0.5');

  // tCDF - df=10
  assertApprox(tCDF(0, 10), 0.5, 'tCDF(0, df=10) = 0.5');
  assertApprox(tCDF(2.228, 10), 0.975, 'tCDF(2.228, df=10) ≈ 0.975', 0.01);

  // tCDF - negative t values (critical fix test)
  assertApprox(tCDF(-2.228, 10), 0.025, 'tCDF(-2.228, df=10) ≈ 0.025', 0.01);
  assertApprox(tCDF(-1, 10), 0.1703, 'tCDF(-1, df=10) ≈ 0.1703', 0.01);

  // tQuantile - known values
  assertApprox(tQuantile(0.5, 10), 0, 'tQuantile(0.5, df=10) = 0');
  assertApprox(tQuantile(0.975, 10), 2.228, 'tQuantile(0.975, df=10) ≈ 2.228', 0.01);
  assertApprox(tQuantile(0.025, 10), -2.228, 'tQuantile(0.025, df=10) ≈ -2.228', 0.01);

  // tQuantile - df=Infinity converges to normal
  assertApprox(tQuantile(0.975, 1000), 1.96, 'tQuantile(0.975, df=1000) ≈ 1.96', 0.05);
}

/**
 * Test Log-Gamma Function
 */
function testLogGamma() {
  console.log('\n=== Log-Gamma Tests ===');

  // logGamma - known values
  // Γ(1) = 1, so log(Γ(1)) = 0
  assertApprox(logGamma(1), 0, 'logGamma(1) = 0');

  // Γ(2) = 1, so log(Γ(2)) = 0
  assertApprox(logGamma(2), 0, 'logGamma(2) = 0');

  // Γ(5) = 4! = 24, so log(Γ(5)) = log(24) ≈ 3.178
  assertApprox(logGamma(5), Math.log(24), 'logGamma(5) = log(24)', 0.001);

  // Γ(0.5) = √π, so log(Γ(0.5)) = 0.5*log(π) ≈ 0.5724
  assertApprox(logGamma(0.5), 0.5 * Math.log(Math.PI), 'logGamma(0.5) = 0.5*log(π)', 0.001);
}

/**
 * Test Incomplete Beta Function
 */
function testBetaIncomplete() {
  console.log('\n=== Incomplete Beta Tests ===');

  // Edge cases
  assertApprox(betaIncomplete(0, 1, 1), 0, 'betaIncomplete(0, 1, 1) = 0');
  assertApprox(betaIncomplete(1, 1, 1), 1, 'betaIncomplete(1, 1, 1) = 1');

  // B(1,1) is uniform, so I_x(1,1) = x
  assertApprox(betaIncomplete(0.5, 1, 1), 0.5, 'betaIncomplete(0.5, 1, 1) = 0.5');
  assertApprox(betaIncomplete(0.3, 1, 1), 0.3, 'betaIncomplete(0.3, 1, 1) = 0.3');

  // Known values for other parameters
  assertApprox(betaIncomplete(0.5, 2, 2), 0.5, 'betaIncomplete(0.5, 2, 2) = 0.5');
}

/**
 * Test Effect Size Calculations
 */
function testEffectSizes() {
  console.log('\n=== Effect Size Tests ===');

  // Odds Ratio - simple case
  const or1 = oddsRatio(10, 90, 5, 95);
  assertApprox(or1.or, 2.111, 'OR(10/90 vs 5/95) ≈ 2.111', 0.01);

  // Risk Ratio
  const rr1 = riskRatio(10, 100, 5, 100, 0);
  assertApprox(rr1.rr, 2.0, 'RR(10/100 vs 5/100) = 2.0');

  // Risk Difference
  const rd1 = riskDifference(10, 100, 5, 100);
  assertApprox(rd1.rd, 0.05, 'RD(10/100 vs 5/100) = 0.05');

  // Mean Difference
  const md1 = meanDifference(10, 2, 50, 8, 2, 50);
  assertApprox(md1.yi, 2, 'MD(10 vs 8) = 2');

  // Standardized Mean Difference (Cohen's d)
  const smd1 = standardizedMeanDifference(10, 2, 50, 8, 2, 50);
  assertApprox(smd1.d, 1.0, 'SMD(10,sd=2 vs 8,sd=2) = 1.0');
}

/**
 * Test Meta-Analysis Functions
 */
function testMetaAnalysis() {
  console.log('\n=== Meta-Analysis Tests ===');

  // Simple fixed effects test
  const studies = [
    { yi: 0.5, vi: 0.1, id: 'study1' },
    { yi: 0.6, vi: 0.15, id: 'study2' },
    { yi: 0.4, vi: 0.08, id: 'study3' }
  ];

  const fe = fixedEffects(studies);
  assertApprox(fe.theta, 0.4706, 'FE pooled estimate ≈ 0.47', 0.01);

  // DerSimonian-Laird
  const dl = derSimonianLaird(studies, { hksj: false });
  assertApprox(dl.theta, 0.4884, 'DL pooled estimate ≈ 0.49', 0.02);

  // Heterogeneity test - Q statistic
  // With these 3 studies, Q should be small (similar effects)
  if (fe.Q !== undefined) {
    assertApprox(fe.Q < 10, true, 'Q statistic is reasonable');
  }
}

/**
 * Test Chi-squared and F distributions
 */
function testChiSquaredAndF() {
  console.log('\n=== Chi-squared and F Distribution Tests ===');

  // Chi-squared CDF
  assertApprox(chiSquaredCDF(0, 5), 0, 'chiSquaredCDF(0, df=5) = 0');
  assertApprox(chiSquaredCDF(11.07, 5), 0.95, 'chiSquaredCDF(11.07, df=5) ≈ 0.95', 0.01);

  // F distribution CDF
  assertApprox(fCDF(0, 5, 10), 0, 'fCDF(0, 5, 10) = 0');
  assertApprox(fCDF(3.33, 5, 10), 0.95, 'fCDF(3.33, 5, 10) ≈ 0.95', 0.02);
}

/**
 * Run all tests
 */
function runTests() {
  console.log('Starting Core Statistics Test Suite...\n');

  try { testNormalDistribution(); } catch (e) { console.error('Normal tests error:', e); }
  try { testTDistribution(); } catch (e) { console.error('t-Distribution tests error:', e); }
  try { testLogGamma(); } catch (e) { console.error('LogGamma tests error:', e); }
  try { testBetaIncomplete(); } catch (e) { console.error('Beta tests error:', e); }
  try { testEffectSizes(); } catch (e) { console.error('Effect size tests error:', e); }
  try { testMetaAnalysis(); } catch (e) { console.error('Meta-analysis tests error:', e); }
  try { testChiSquaredAndF(); } catch (e) { console.error('Chi-squared/F tests error:', e); }

  // Print summary
  console.log('\n================================');
  console.log(`RESULTS: ${results.passed} passed, ${results.failed} failed`);
  console.log('================================\n');

  if (results.failed > 0) {
    console.log('Failed tests:');
    results.tests.filter(t => !t.passed).forEach(t => {
      console.log(`  ✗ ${t.name}`);
      console.log(`    Expected: ${t.expected}, Got: ${t.actual}, Diff: ${t.diff}`);
    });
  }

  return results;
}

// Export for test runner
export { runTests, results };

// Run if executed directly
if (typeof window !== 'undefined') {
  runTests();
}
