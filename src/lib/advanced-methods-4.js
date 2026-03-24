/**
 * Advanced Meta-Analysis Methods - Part 4
 * DTA Extensions, Prediction Models, Special Effect Sizes
 *
 * EDITORIAL DISCLOSURE (2025):
 * This module provides JavaScript implementations of methods that ARE available
 * in R packages but are implemented here for browser-based analysis without
 * R dependencies. Each function documents the equivalent R packages.
 *
 * Key R packages with overlapping functionality:
 * - metamisc: C-statistic MA, calibration MA, prediction model validation
 * - mada, DTAsurv: DTA meta-analysis methods
 * - effsize: Cliff's delta calculations
 * - boot: Bootstrap methods
 *
 * Our contribution: Pure JavaScript implementations enabling browser-based
 * meta-analysis with full methodology transparency.
 */

import {
  sum, mean, variance, sd,
  normalCDF, normalPDF, normalQuantile,
  chiSquaredCDF,
  randomNormal,
  validateStudies
} from './stats-utils.js';

// ============================================================================
// 31. MULTIPLE THRESHOLDS DTA META-ANALYSIS
// ============================================================================

/**
 * Multiple Thresholds DTA Meta-Analysis
 * Handles diagnostic tests reported at multiple cutoff values.
 *
 * R AVAILABILITY: DTAsurv package provides some threshold handling
 * OUR CONTRIBUTION: JavaScript implementation with pooled ROC curve generation
 *
 * @reference Defined by clinical practice; methodology based on:
 *   Steinhauser, S., Schumacher, M., & Rücker, G. (2016). Modelling multiple
 *   thresholds in meta-analysis of diagnostic test accuracy studies.
 *   BMC Medical Research Methodology, 16, 97.
 *   https://doi.org/10.1186/s12874-016-0196-1
 *
 * @param {Array} studies - Array of {threshold, tp, fp, fn, tn} objects
 * @param {Object} options - {method}
 * @returns {Object} Threshold analysis results with pooled ROC
 */
export function multipleThresholdsDTA(studies, options = {}) {
  if (!studies || studies.length === 0) {
    return { error: 'No studies provided', valid: false };
  }

  const { method = 'pooled_roc' } = options;

  const thresholds = [...new Set(studies.map(s => s.threshold))].sort((a, b) => a - b);

  const thresholdResults = thresholds.map(thresh => {
    const studiesAtThresh = studies.filter(s => s.threshold === thresh);

    const sensitivities = studiesAtThresh.map(s => {
      const denom = s.tp + s.fn;
      return denom > 0 ? s.tp / denom : 0;
    });
    const specificities = studiesAtThresh.map(s => {
      const denom = s.tn + s.fp;
      return denom > 0 ? s.tn / denom : 0;
    });

    // Pool using logit transformation
    const logitSens = sensitivities.map(s =>
      s > 0 && s < 1 ? Math.log(s / (1 - s)) : (s <= 0 ? -5 : 5)
    );
    const logitSpec = specificities.map(s =>
      s > 0 && s < 1 ? Math.log(s / (1 - s)) : (s <= 0 ? -5 : 5)
    );

    const viSens = studiesAtThresh.map((s, i) => {
      const sens = sensitivities[i];
      const n = s.tp + s.fn;
      return sens > 0 && sens < 1 && n > 0 ? 1 / (sens * (1 - sens) * n) : 1;
    });
    const viSpec = studiesAtThresh.map((s, i) => {
      const spec = specificities[i];
      const n = s.tn + s.fp;
      return spec > 0 && spec < 1 && n > 0 ? 1 / (spec * (1 - spec) * n) : 1;
    });

    const pooledLogitSens = poolRE(logitSens, viSens);
    const pooledLogitSpec = poolRE(logitSpec, viSpec);

    const pooledSens = 1 / (1 + Math.exp(-pooledLogitSens.theta));
    const pooledSpec = 1 / (1 + Math.exp(-pooledLogitSpec.theta));

    return {
      threshold: thresh,
      nStudies: studiesAtThresh.length,
      sensitivity: pooledSens,
      sensCI: [
        1 / (1 + Math.exp(-(pooledLogitSens.theta - 1.96 * pooledLogitSens.se))),
        1 / (1 + Math.exp(-(pooledLogitSens.theta + 1.96 * pooledLogitSens.se)))
      ],
      specificity: pooledSpec,
      specCI: [
        1 / (1 + Math.exp(-(pooledLogitSpec.theta - 1.96 * pooledLogitSpec.se))),
        1 / (1 + Math.exp(-(pooledLogitSpec.theta + 1.96 * pooledLogitSpec.se)))
      ],
      fpr: 1 - pooledSpec,
      ppv: calculatePPV(pooledSens, pooledSpec, 0.1),
      npv: calculateNPV(pooledSens, pooledSpec, 0.1)
    };
  });

  // Find optimal threshold (Youden's J)
  const youdenJ = thresholdResults.map(t => ({
    threshold: t.threshold,
    J: t.sensitivity + t.specificity - 1
  }));
  const optimalIdx = youdenJ.reduce((best, curr, i) =>
    curr.J > youdenJ[best].J ? i : best, 0);

  // Generate pooled ROC curve
  const rocCurve = thresholdResults.map(t => ({
    fpr: t.fpr,
    sens: t.sensitivity,
    threshold: t.threshold
  }));

  // Calculate AUC using trapezoidal rule
  const sortedROC = [...rocCurve].sort((a, b) => a.fpr - b.fpr);
  let auc = 0;
  for (let i = 1; i < sortedROC.length; i++) {
    const width = sortedROC[i].fpr - sortedROC[i-1].fpr;
    const height = (sortedROC[i].sens + sortedROC[i-1].sens) / 2;
    auc += width * height;
  }

  return {
    thresholdResults,
    optimalThreshold: thresholdResults[optimalIdx],
    rocCurve,
    auc,
    summary: {
      nThresholds: thresholds.length,
      nStudies: studies.length,
      sensRange: [
        Math.min(...thresholdResults.map(t => t.sensitivity)),
        Math.max(...thresholdResults.map(t => t.sensitivity))
      ],
      specRange: [
        Math.min(...thresholdResults.map(t => t.specificity)),
        Math.max(...thresholdResults.map(t => t.specificity))
      ]
    },
    method: 'Multiple Thresholds DTA',
    reference: 'Steinhauser et al. (2016) BMC Med Res Methodol. https://doi.org/10.1186/s12874-016-0196-1'
  };
}

function calculatePPV(sens, spec, prevalence) {
  const denom = sens * prevalence + (1 - spec) * (1 - prevalence);
  return denom > 0 ? (sens * prevalence) / denom : 0;
}

function calculateNPV(sens, spec, prevalence) {
  const denom = (1 - sens) * prevalence + spec * (1 - prevalence);
  return denom > 0 ? (spec * (1 - prevalence)) / denom : 0;
}

// ============================================================================
// 32. COMPARATIVE DTA META-ANALYSIS
// ============================================================================

/**
 * Comparative DTA Meta-Analysis
 * Direct comparison of two diagnostic tests in the same studies.
 *
 * R AVAILABILITY: mada package provides bivariate models; comparative functionality limited
 * OUR CONTRIBUTION: JavaScript implementation with paired test comparison
 *
 * @reference Takwoingi, Y., Leeflang, M. M., & Deeks, J. J. (2013). Empirical
 *   evidence of the importance of comparative studies of diagnostic test accuracy.
 *   Annals of Internal Medicine, 158(7), 544-554.
 *   https://doi.org/10.7326/0003-4819-158-7-201304020-00006
 *
 * @param {Array} studies - Array of paired DTA data for two tests
 * @param {Object} options - Additional options
 * @returns {Object} Comparative DTA results
 */
export function comparativeDTA(studies, options = {}) {
  if (!studies || studies.length === 0) {
    return { error: 'No studies provided', valid: false };
  }

  const comparisons = studies.map(s => {
    const sens1 = (s.test1_tp + s.test1_fn) > 0 ? s.test1_tp / (s.test1_tp + s.test1_fn) : 0;
    const spec1 = (s.test1_tn + s.test1_fp) > 0 ? s.test1_tn / (s.test1_tn + s.test1_fp) : 0;
    const sens2 = (s.test2_tp + s.test2_fn) > 0 ? s.test2_tp / (s.test2_tp + s.test2_fn) : 0;
    const spec2 = (s.test2_tn + s.test2_fp) > 0 ? s.test2_tn / (s.test2_tn + s.test2_fp) : 0;

    const sensDiff = sens1 - sens2;
    const specDiff = spec1 - spec2;

    const nDis = s.test1_tp + s.test1_fn;
    const nNonDis = s.test1_tn + s.test1_fp;

    const viSensDiff = nDis > 0 ? (sens1 * (1 - sens1) + sens2 * (1 - sens2)) / nDis : 1;
    const viSpecDiff = nNonDis > 0 ? (spec1 * (1 - spec1) + spec2 * (1 - spec2)) / nNonDis : 1;

    return {
      ...s,
      sens1, spec1, sens2, spec2,
      sensDiff, specDiff,
      viSensDiff, viSpecDiff
    };
  });

  const sensDiffs = comparisons.map(c => c.sensDiff);
  const viSensDiffs = comparisons.map(c => c.viSensDiff);
  const specDiffs = comparisons.map(c => c.specDiff);
  const viSpecDiffs = comparisons.map(c => c.viSpecDiff);

  const pooledSensDiff = poolRE(sensDiffs, viSensDiffs);
  const pooledSpecDiff = poolRE(specDiffs, viSpecDiffs);

  const sensSuperiority = {
    test1Better: pooledSensDiff.theta > 0 && pooledSensDiff.theta - 1.96 * pooledSensDiff.se > 0,
    test2Better: pooledSensDiff.theta < 0 && pooledSensDiff.theta + 1.96 * pooledSensDiff.se < 0,
    equivalent: Math.abs(pooledSensDiff.theta) < 0.05
  };

  const specSuperiority = {
    test1Better: pooledSpecDiff.theta > 0 && pooledSpecDiff.theta - 1.96 * pooledSpecDiff.se > 0,
    test2Better: pooledSpecDiff.theta < 0 && pooledSpecDiff.theta + 1.96 * pooledSpecDiff.se < 0,
    equivalent: Math.abs(pooledSpecDiff.theta) < 0.05
  };

  // Relative DOR
  const logRDOR = comparisons.map(c => {
    const dor1 = (c.sens1 / (1 - c.sens1 + 1e-10)) * (c.spec1 / (1 - c.spec1 + 1e-10));
    const dor2 = (c.sens2 / (1 - c.sens2 + 1e-10)) * (c.spec2 / (1 - c.spec2 + 1e-10));
    return Math.log(dor1 / (dor2 + 1e-10));
  });
  const viLogRDOR = comparisons.map(c =>
    1/(c.test1_tp+0.5) + 1/(c.test1_fp+0.5) + 1/(c.test1_fn+0.5) + 1/(c.test1_tn+0.5) +
    1/(c.test2_tp+0.5) + 1/(c.test2_fp+0.5) + 1/(c.test2_fn+0.5) + 1/(c.test2_tn+0.5)
  );

  const pooledRDOR = poolRE(logRDOR.filter(isFinite), viLogRDOR.filter((_, i) => isFinite(logRDOR[i])));

  return {
    sensitivityDifference: {
      pooled: pooledSensDiff.theta,
      se: pooledSensDiff.se,
      ci: [pooledSensDiff.theta - 1.96 * pooledSensDiff.se,
           pooledSensDiff.theta + 1.96 * pooledSensDiff.se],
      ...sensSuperiority
    },
    specificityDifference: {
      pooled: pooledSpecDiff.theta,
      se: pooledSpecDiff.se,
      ci: [pooledSpecDiff.theta - 1.96 * pooledSpecDiff.se,
           pooledSpecDiff.theta + 1.96 * pooledSpecDiff.se],
      ...specSuperiority
    },
    relativeDOR: {
      pooled: Math.exp(pooledRDOR.theta),
      ci: [Math.exp(pooledRDOR.theta - 1.96 * pooledRDOR.se),
           Math.exp(pooledRDOR.theta + 1.96 * pooledRDOR.se)],
      test1Better: pooledRDOR.theta > 0 && pooledRDOR.theta - 1.96 * pooledRDOR.se > 0
    },
    overallConclusion: determineOverallConclusion(sensSuperiority, specSuperiority),
    studyComparisons: comparisons.map(c => ({
      study: c.label,
      sens1: c.sens1, sens2: c.sens2, sensDiff: c.sensDiff,
      spec1: c.spec1, spec2: c.spec2, specDiff: c.specDiff
    })),
    nStudies: studies.length,
    method: 'Comparative DTA',
    reference: 'Takwoingi et al. (2013) Ann Intern Med. https://doi.org/10.7326/0003-4819-158-7-201304020-00006'
  };
}

function determineOverallConclusion(sens, spec) {
  if (sens.test1Better && spec.test1Better) return 'Test 1 superior (both sens and spec)';
  if (sens.test2Better && spec.test2Better) return 'Test 2 superior (both sens and spec)';
  if (sens.test1Better && spec.test2Better) return 'Trade-off: Test 1 more sensitive, Test 2 more specific';
  if (sens.test2Better && spec.test1Better) return 'Trade-off: Test 2 more sensitive, Test 1 more specific';
  if (sens.equivalent && spec.equivalent) return 'Tests are equivalent';
  return 'No clear winner';
}

// ============================================================================
// 33. TEST COMBINATIONS META-ANALYSIS
// ============================================================================

/**
 * Test Combinations Meta-Analysis
 * Evaluates accuracy of combining multiple diagnostic tests.
 *
 * R AVAILABILITY: No specific package; typically custom analysis
 * OUR CONTRIBUTION: JavaScript implementation with multiple combination strategies
 *
 * @reference Defined by clinical practice; based on:
 *   Macaskill, P., et al. (2010). Chapter 10: Analysing and Presenting Results.
 *   In: Cochrane Handbook for Systematic Reviews of Diagnostic Test Accuracy.
 *
 * @param {Array} studies - Array with test1_sens, test1_spec, test2_sens, test2_spec
 * @param {Object} options - {strategy}
 * @returns {Object} Combined test accuracy results
 */
export function testCombinationsMA(studies, options = {}) {
  if (!studies || studies.length === 0) {
    return { error: 'No studies provided', valid: false };
  }

  const { strategy = 'serial_positive' } = options;

  const results = studies.map(s => {
    const sens1 = s.test1_sens, spec1 = s.test1_spec;
    const sens2 = s.test2_sens, spec2 = s.test2_spec;
    const corr = s.correlation || 0;

    let combinedSens, combinedSpec;

    switch (strategy) {
      case 'serial_positive':
        combinedSens = sens1 * sens2 + corr * Math.sqrt(sens1 * (1-sens1) * sens2 * (1-sens2));
        combinedSpec = 1 - (1 - spec1) * (1 - spec2) -
                       corr * Math.sqrt((1-spec1) * spec1 * (1-spec2) * spec2);
        break;
      case 'parallel_positive':
        combinedSens = 1 - (1 - sens1) * (1 - sens2) -
                       corr * Math.sqrt((1-sens1) * sens1 * (1-sens2) * sens2);
        combinedSpec = spec1 * spec2 + corr * Math.sqrt(spec1 * (1-spec1) * spec2 * (1-spec2));
        break;
      case 'sequential_sens':
        combinedSens = sens1 * sens2;
        combinedSpec = spec1 + (1 - spec1) * spec2;
        break;
      case 'sequential_spec':
        combinedSens = sens1 + (1 - sens1) * sens2;
        combinedSpec = spec1 * spec2;
        break;
      default:
        combinedSens = sens1 * sens2;
        combinedSpec = 1 - (1 - spec1) * (1 - spec2);
    }

    combinedSens = Math.max(0, Math.min(1, combinedSens));
    combinedSpec = Math.max(0, Math.min(1, combinedSpec));

    const n = s.n || 100;
    const viSens = combinedSens * (1 - combinedSens) / (n * 0.5);
    const viSpec = combinedSpec * (1 - combinedSpec) / (n * 0.5);

    return { ...s, combinedSens, combinedSpec, viSens, viSpec };
  });

  const logitSens = results.map(r =>
    r.combinedSens > 0 && r.combinedSens < 1 ?
    Math.log(r.combinedSens / (1 - r.combinedSens)) : 0
  );
  const logitSpec = results.map(r =>
    r.combinedSpec > 0 && r.combinedSpec < 1 ?
    Math.log(r.combinedSpec / (1 - r.combinedSpec)) : 0
  );
  const viSens = results.map(r => r.viSens);
  const viSpec = results.map(r => r.viSpec);

  const validSens = logitSens.map((x, i) => ({ x, v: viSens[i] })).filter(d => isFinite(d.x));
  const validSpec = logitSpec.map((x, i) => ({ x, v: viSpec[i] })).filter(d => isFinite(d.x));

  const pooledSens = validSens.length > 0 ? poolRE(validSens.map(d => d.x), validSens.map(d => d.v)) : { theta: 0, se: 1 };
  const pooledSpec = validSpec.length > 0 ? poolRE(validSpec.map(d => d.x), validSpec.map(d => d.v)) : { theta: 0, se: 1 };

  const finalSens = 1 / (1 + Math.exp(-pooledSens.theta));
  const finalSpec = 1 / (1 + Math.exp(-pooledSpec.theta));

  const test1Sens = mean(studies.map(s => s.test1_sens));
  const test1Spec = mean(studies.map(s => s.test1_spec));
  const test2Sens = mean(studies.map(s => s.test2_sens));
  const test2Spec = mean(studies.map(s => s.test2_spec));

  return {
    combined: {
      sensitivity: finalSens,
      sensCI: [
        1 / (1 + Math.exp(-(pooledSens.theta - 1.96 * pooledSens.se))),
        1 / (1 + Math.exp(-(pooledSens.theta + 1.96 * pooledSens.se)))
      ],
      specificity: finalSpec,
      specCI: [
        1 / (1 + Math.exp(-(pooledSpec.theta - 1.96 * pooledSpec.se))),
        1 / (1 + Math.exp(-(pooledSpec.theta + 1.96 * pooledSpec.se)))
      ]
    },
    comparison: {
      test1: { sens: test1Sens, spec: test1Spec },
      test2: { sens: test2Sens, spec: test2Spec },
      combined: { sens: finalSens, spec: finalSpec }
    },
    strategy,
    nStudies: studies.length,
    interpretation: `${strategy} strategy: Sensitivity ${finalSens > Math.max(test1Sens, test2Sens) ? 'improved' : 'reduced'}, ` +
                    `Specificity ${finalSpec > Math.max(test1Spec, test2Spec) ? 'improved' : 'reduced'}`,
    method: 'Test Combinations MA',
    reference: 'Cochrane Handbook for DTA Reviews, Chapter 10'
  };
}

// ============================================================================
// 34. C-STATISTIC META-ANALYSIS
// ============================================================================

/**
 * C-Statistic Meta-Analysis
 * Pools AUC/C-statistics from prediction model validation studies.
 *
 * R AVAILABILITY: metamisc::valmeta() provides C-statistic pooling
 * OUR CONTRIBUTION: JavaScript implementation for browser-based analysis
 *
 * @reference Debray, T. P. A., Damen, J. A. A., Snell, K. I. E., Ensor, J.,
 *   Hooft, L., Reitsma, J. B., Riley, R. D., & Moons, K. G. M. (2017).
 *   A guide to systematic review and meta-analysis of prediction model performance.
 *   BMJ, 356, i6460.
 *   https://doi.org/10.1136/bmj.i6460
 *
 * @reference Debray, T. P. A., et al. (2019). A framework for meta-analysis
 *   of prediction model studies with binary and time-to-event outcomes.
 *   Statistical Methods in Medical Research, 28(9), 2768-2786.
 *   https://doi.org/10.1177/0962280218785504
 *
 * @param {Array} studies - Array of {c_statistic, se} or {c_statistic, n, events}
 * @param {Object} options - {transform}
 * @returns {Object} Pooled C-statistic results
 */
export function cStatisticMA(studies, options = {}) {
  if (!studies || studies.length === 0) {
    return { error: 'No studies provided', valid: false };
  }

  const { transform = 'logit' } = options;

  const transformed = studies.map(s => {
    const c = s.c_statistic;
    if (c === undefined || c === null || c <= 0 || c >= 1) {
      return { yi: null, vi: null, original_c: c };
    }

    let yi, vi;

    if (transform === 'logit') {
      yi = Math.log(c / (1 - c));
      if (s.se && s.se > 0) {
        vi = s.se ** 2 / (c * (1 - c)) ** 2;
      } else {
        const n = s.n || 100;
        const events = s.events || n / 2;
        const nonevents = s.nonevents || n / 2;
        const q1 = c / (2 - c);
        const q2 = 2 * c ** 2 / (1 + c);
        vi = (c * (1 - c) + (events - 1) * (q1 - c ** 2) +
              (nonevents - 1) * (q2 - c ** 2)) / (events * nonevents);
        vi = vi / (c * (1 - c)) ** 2;
      }
    } else {
      yi = c;
      vi = s.se && s.se > 0 ? s.se ** 2 : 0.01;
    }

    return { ...s, yi, vi, original_c: c };
  }).filter(t => t.yi !== null && isFinite(t.yi) && isFinite(t.vi));

  if (transformed.length === 0) {
    return { error: 'No valid C-statistics to pool', valid: false };
  }

  const yi = transformed.map(t => t.yi);
  const vi = transformed.map(t => t.vi);

  const pooled = poolRE(yi, vi);

  let pooledC, pooledCI;
  if (transform === 'logit') {
    pooledC = 1 / (1 + Math.exp(-pooled.theta));
    pooledCI = [
      1 / (1 + Math.exp(-(pooled.theta - 1.96 * pooled.se))),
      1 / (1 + Math.exp(-(pooled.theta + 1.96 * pooled.se)))
    ];
  } else {
    pooledC = pooled.theta;
    pooledCI = [pooled.theta - 1.96 * pooled.se, pooled.theta + 1.96 * pooled.se];
  }

  // Prediction interval
  const pi = transform === 'logit' ? [
    1 / (1 + Math.exp(-(pooled.theta - normalQuantile(0.975) * Math.sqrt(pooled.se ** 2 + pooled.tau2)))),
    1 / (1 + Math.exp(-(pooled.theta + normalQuantile(0.975) * Math.sqrt(pooled.se ** 2 + pooled.tau2))))
  ] : [
    pooled.theta - normalQuantile(0.975) * Math.sqrt(pooled.se ** 2 + pooled.tau2),
    pooled.theta + normalQuantile(0.975) * Math.sqrt(pooled.se ** 2 + pooled.tau2)
  ];

  return {
    pooledCStatistic: pooledC,
    ci: pooledCI,
    predictionInterval: pi,
    heterogeneity: {
      tau2: pooled.tau2,
      I2: pooled.I2
    },
    discrimination: interpretCStatistic(pooledC),
    studyResults: transformed.map(t => ({
      study: t.label,
      cStatistic: t.original_c,
      weight: t.vi > 0 ? 1 / (t.vi + pooled.tau2) : 0
    })),
    nStudies: transformed.length,
    method: 'C-Statistic MA',
    reference: 'Debray et al. (2017) BMJ. https://doi.org/10.1136/bmj.i6460'
  };
}

function interpretCStatistic(c) {
  if (c >= 0.9) return 'Outstanding discrimination';
  if (c >= 0.8) return 'Excellent discrimination';
  if (c >= 0.7) return 'Acceptable discrimination';
  if (c >= 0.6) return 'Poor discrimination';
  return 'No discrimination';
}

// ============================================================================
// 35. CALIBRATION-IN-THE-LARGE META-ANALYSIS
// ============================================================================

/**
 * Calibration-in-the-Large Meta-Analysis
 * Pools calibration intercepts/slopes from prediction model validation studies.
 *
 * R AVAILABILITY: metamisc::valmeta() provides calibration pooling
 * OUR CONTRIBUTION: JavaScript implementation for browser-based analysis
 *
 * @reference Debray, T. P. A., et al. (2017). A guide to systematic review
 *   and meta-analysis of prediction model performance. BMJ, 356, i6460.
 *   https://doi.org/10.1136/bmj.i6460
 *
 * @reference Van Calster, B., et al. (2019). Calibration: the Achilles heel
 *   of predictive analytics. BMC Medicine, 17, 230.
 *   https://doi.org/10.1186/s12916-019-1466-7
 *
 * @param {Array} studies - Array of {intercept, se} or {slope, se}
 * @param {Object} options - {measure}
 * @returns {Object} Pooled calibration results
 */
export function calibrationMA(studies, options = {}) {
  if (!studies || studies.length === 0) {
    return { error: 'No studies provided', valid: false };
  }

  const { measure = 'intercept' } = options;

  const yi = studies.map(s => s[measure] !== undefined ? s[measure] : s.yi);
  const vi = studies.map(s => {
    const se = s.se || 0.1;
    return se ** 2;
  });

  const validIdx = yi.map((y, i) => y !== undefined && isFinite(y) && isFinite(vi[i]));
  const validYi = yi.filter((_, i) => validIdx[i]);
  const validVi = vi.filter((_, i) => validIdx[i]);

  if (validYi.length === 0) {
    return { error: 'No valid calibration measures to pool', valid: false };
  }

  const pooled = poolRE(validYi, validVi);

  const perfectValue = measure === 'slope' ? 1 : 0;
  const deviation = pooled.theta - perfectValue;
  const significant = Math.abs(deviation / pooled.se) > 1.96;

  let interpretation;
  if (measure === 'intercept') {
    if (Math.abs(pooled.theta) < 0.1) {
      interpretation = 'Good calibration-in-the-large (mean predictions accurate)';
    } else if (pooled.theta > 0) {
      interpretation = 'Underprediction: model underestimates risk';
    } else {
      interpretation = 'Overprediction: model overestimates risk';
    }
  } else {
    if (Math.abs(pooled.theta - 1) < 0.1) {
      interpretation = 'Good calibration slope (predictions well-spread)';
    } else if (pooled.theta < 1) {
      interpretation = 'Overfitting: predictions too extreme';
    } else {
      interpretation = 'Underfitting: predictions too conservative';
    }
  }

  return {
    pooled: pooled.theta,
    se: pooled.se,
    ci: [pooled.theta - 1.96 * pooled.se, pooled.theta + 1.96 * pooled.se],
    perfectCalibration: perfectValue,
    deviation,
    significantMiscalibration: significant,
    interpretation,
    heterogeneity: {
      tau2: pooled.tau2,
      I2: pooled.I2
    },
    studyResults: studies.filter((_, i) => validIdx[i]).map((s, i) => ({
      study: s.label,
      value: validYi[i],
      se: Math.sqrt(validVi[i])
    })),
    measure,
    method: 'Calibration MA',
    reference: 'Debray et al. (2017) BMJ. https://doi.org/10.1136/bmj.i6460'
  };
}

// ============================================================================
// 36. NET BENEFIT META-ANALYSIS
// ============================================================================

/**
 * Net Benefit Meta-Analysis
 * Pools decision curve analysis results for clinical utility assessment.
 *
 * R AVAILABILITY: dcurves package for individual DCA; pooling not standardized
 * OUR CONTRIBUTION: JavaScript implementation with threshold-specific pooling
 *
 * @reference Vickers, A. J., van Calster, B., & Steyerberg, E. W. (2016).
 *   Net benefit approaches to the evaluation of prediction models, molecular
 *   markers, and diagnostic tests. BMJ, 352, i6.
 *   https://doi.org/10.1136/bmj.i6
 *
 * @param {Array} studies - Array of {sens, spec, prevalence, n}
 * @param {Object} options - {thresholds}
 * @returns {Object} Net benefit analysis results
 */
export function netBenefitMA(studies, options = {}) {
  if (!studies || studies.length === 0) {
    return { error: 'No studies provided', valid: false };
  }

  const { thresholds = [0.01, 0.05, 0.10, 0.20, 0.30] } = options;

  const results = thresholds.map(pt => {
    if (pt <= 0 || pt >= 1) return null;

    const netBenefits = studies.map(s => {
      const prev = s.prevalence || 0.1;
      const nb = s.sens * prev - (1 - s.spec) * (1 - prev) * (pt / (1 - pt));
      const vi = (s.sens * (1 - s.sens) * prev ** 2 +
                  s.spec * (1 - s.spec) * (1 - prev) ** 2 * (pt / (1 - pt)) ** 2) /
                 (s.n || 100);
      return { nb, vi };
    });

    const yi = netBenefits.map(n => n.nb);
    const vi = netBenefits.map(n => n.vi);

    const pooled = poolRE(yi, vi);

    const avgPrev = mean(studies.map(s => s.prevalence || 0.1));
    const treatAll = avgPrev - (1 - avgPrev) * (pt / (1 - pt));
    const treatNone = 0;

    return {
      threshold: pt,
      netBenefit: pooled.theta,
      se: pooled.se,
      ci: [pooled.theta - 1.96 * pooled.se, pooled.theta + 1.96 * pooled.se],
      treatAll,
      treatNone,
      useful: pooled.theta > Math.max(treatAll, treatNone)
    };
  }).filter(r => r !== null);

  const usefulRange = results.filter(r => r.useful);

  return {
    thresholdResults: results,
    usefulThresholdRange: usefulRange.length > 0 ?
      [usefulRange[0].threshold, usefulRange[usefulRange.length - 1].threshold] :
      null,
    maxNetBenefit: Math.max(...results.map(r => r.netBenefit)),
    clinicalUtility: usefulRange.length > 0 ?
      'Model provides clinical utility at some thresholds' :
      'Model does not provide clinical utility over default strategies',
    nStudies: studies.length,
    method: 'Net Benefit MA',
    reference: 'Vickers et al. (2016) BMJ. https://doi.org/10.1136/bmj.i6'
  };
}

// ============================================================================
// 37. CLIFF'S DELTA META-ANALYSIS
// ============================================================================

/**
 * Cliff's Delta Meta-Analysis
 * Pools non-parametric ordinal effect sizes.
 *
 * R AVAILABILITY: effsize::cliff.delta() for individual calculation
 * OUR CONTRIBUTION: JavaScript meta-analysis implementation with pooling
 *
 * @reference Cliff, N. (1993). Dominance statistics: Ordinal analyses to
 *   answer ordinal questions. Psychological Bulletin, 114(3), 494-509.
 *   https://doi.org/10.1037/0033-2909.114.3.494
 *
 * @param {Array} studies - Array of {cliffs_delta, vi} or {d, n1, n2}
 * @param {Object} options - Additional options
 * @returns {Object} Pooled Cliff's delta results
 */
export function cliffsDeltaMA(studies, options = {}) {
  if (!studies || studies.length === 0) {
    return { error: 'No studies provided', valid: false };
  }

  const deltas = studies.map(s => {
    if (s.cliffs_delta !== undefined) {
      const delta = Math.max(-0.9999, Math.min(0.9999, s.cliffs_delta));
      return {
        delta,
        vi: s.vi || (1 - delta ** 2) ** 2 / ((s.n1 || 50) + (s.n2 || 50))
      };
    }

    if (s.d !== undefined) {
      const delta = Math.max(-0.9999, Math.min(0.9999, 2 * normalCDF(s.d / Math.sqrt(2)) - 1));
      const vi = (1 - delta ** 2) ** 2 / ((s.n1 || 50) + (s.n2 || 50));
      return { delta, vi };
    }

    if (s.mean1 !== undefined && s.mean2 !== undefined && s.sd1 !== undefined && s.sd2 !== undefined) {
      const pooledSD = Math.sqrt(((s.n1 - 1) * s.sd1 ** 2 + (s.n2 - 1) * s.sd2 ** 2) /
                                  (s.n1 + s.n2 - 2));
      const d = pooledSD > 0 ? (s.mean1 - s.mean2) / pooledSD : 0;
      const delta = Math.max(-0.9999, Math.min(0.9999, 2 * normalCDF(d / Math.sqrt(2)) - 1));
      const vi = (1 - delta ** 2) ** 2 / (s.n1 + s.n2);
      return { delta, vi };
    }

    return { delta: 0, vi: 1 };
  });

  const yi = deltas.map(d => d.delta);
  const vi = deltas.map(d => d.vi);

  // Fisher's z-like transformation
  const zTransformed = yi.map(d => {
    const bounded = Math.max(-0.9999, Math.min(0.9999, d));
    return 0.5 * Math.log((1 + bounded) / (1 - bounded));
  });
  const viZ = vi.map((v, i) => {
    const d = yi[i];
    const denom = (1 - d ** 2) ** 2;
    return denom > 0.0001 ? v / denom : v;
  });

  const pooledZ = poolRE(zTransformed, viZ);

  const pooledDelta = (Math.exp(2 * pooledZ.theta) - 1) / (Math.exp(2 * pooledZ.theta) + 1);
  const ciLowerZ = pooledZ.theta - 1.96 * pooledZ.se;
  const ciUpperZ = pooledZ.theta + 1.96 * pooledZ.se;
  const ciLower = (Math.exp(2 * ciLowerZ) - 1) / (Math.exp(2 * ciLowerZ) + 1);
  const ciUpper = (Math.exp(2 * ciUpperZ) - 1) / (Math.exp(2 * ciUpperZ) + 1);

  const probSup = (pooledDelta + 1) / 2;

  return {
    cliffsDelta: pooledDelta,
    ci: [ciLower, ciUpper],
    probabilityOfSuperiority: probSup,
    interpretation: interpretCliffsDelta(pooledDelta),
    heterogeneity: {
      tau2: pooledZ.tau2,
      I2: pooledZ.I2
    },
    studyDeltas: deltas.map((d, i) => ({
      study: studies[i].label,
      delta: d.delta
    })),
    method: "Cliff's Delta MA",
    reference: 'Cliff (1993) Psychol Bull. https://doi.org/10.1037/0033-2909.114.3.494'
  };
}

function interpretCliffsDelta(delta) {
  const abs = Math.abs(delta);
  let size;
  if (abs < 0.147) size = 'negligible';
  else if (abs < 0.33) size = 'small';
  else if (abs < 0.474) size = 'medium';
  else size = 'large';

  const direction = delta > 0 ? 'Group 1 > Group 2' : 'Group 2 > Group 1';
  return `${size} effect (${direction})`;
}

// ============================================================================
// 38. OVERLAP COEFFICIENT META-ANALYSIS
// ============================================================================

/**
 * Overlap Coefficient Meta-Analysis
 * Pools distributional overlap measures (OVL, U1, U3).
 *
 * R AVAILABILITY: No specific package for meta-analysis of overlap measures
 * OUR CONTRIBUTION: JavaScript implementation with multiple overlap measures
 *
 * @reference Cohen, J. (1988). Statistical Power Analysis for the Behavioral
 *   Sciences (2nd ed.). Lawrence Erlbaum Associates.
 *
 * @param {Array} studies - Array of {d} or {yi, vi}
 * @param {Object} options - {measure}
 * @returns {Object} Pooled overlap coefficient results
 */
export function overlapCoefficientMA(studies, options = {}) {
  if (!studies || studies.length === 0) {
    return { error: 'No studies provided', valid: false };
  }

  const { measure = 'OVL' } = options;

  const overlaps = studies.map(s => {
    let d = s.d !== undefined ? s.d : (s.yi !== undefined ? s.yi : 0);
    const n = (s.n1 || 50) + (s.n2 || 50);

    let yi, vi;

    switch (measure) {
      case 'OVL':
        yi = 2 * normalCDF(-Math.abs(d) / 2);
        vi = normalPDF(-Math.abs(d) / 2) ** 2 * (4 / n + d ** 2 / (2 * n));
        break;
      case 'U1':
        yi = 2 * normalCDF(-Math.abs(d) / 2);
        vi = 0.25 / n;
        break;
      case 'U3':
        yi = normalCDF(d);
        vi = normalPDF(d) ** 2 * (1 / n + d ** 2 / (2 * n));
        break;
      default:
        yi = 2 * normalCDF(-Math.abs(d) / 2);
        vi = 0.25 / n;
    }

    return { yi, vi, d };
  });

  const yi = overlaps.map(o => o.yi);
  const vi = overlaps.map(o => o.vi);

  const pooled = poolRE(yi, vi);

  return {
    pooledOverlap: pooled.theta,
    ci: [pooled.theta - 1.96 * pooled.se, pooled.theta + 1.96 * pooled.se],
    measure,
    interpretation: interpretOverlap(pooled.theta, measure),
    heterogeneity: {
      tau2: pooled.tau2,
      I2: pooled.I2
    },
    studyResults: overlaps.map((o, i) => ({
      study: studies[i].label,
      overlap: o.yi,
      d: o.d
    })),
    method: 'Overlap Coefficient MA',
    reference: 'Cohen (1988) Statistical Power Analysis for the Behavioral Sciences'
  };
}

function interpretOverlap(ovl, measure) {
  if (measure === 'U3') {
    if (ovl > 0.9) return 'Very large effect: >90% of treatment above control mean';
    if (ovl > 0.75) return 'Large effect: 75-90% above control mean';
    if (ovl > 0.6) return 'Medium effect: 60-75% above control mean';
    return 'Small effect: <60% above control mean';
  }
  if (ovl > 0.9) return 'Near-complete overlap: negligible difference';
  if (ovl > 0.7) return 'Substantial overlap: small effect';
  if (ovl > 0.5) return 'Moderate overlap: medium effect';
  return 'Little overlap: large effect';
}

// ============================================================================
// 39. WILD BOOTSTRAP META-REGRESSION
// ============================================================================

/**
 * Wild Bootstrap Meta-Regression
 * Robust inference for heteroskedasticity in meta-regression.
 *
 * R AVAILABILITY: boot package provides generic bootstrap; wild bootstrap less common
 * OUR CONTRIBUTION: JavaScript implementation with Rademacher/Mammen distributions
 *
 * @reference Cameron, A. C., & Trivedi, P. K. (2005). Microeconometrics:
 *   Methods and Applications. Cambridge University Press. Chapter 11.
 *
 * @reference Liu, R. Y. (1988). Bootstrap procedures under some non-iid models.
 *   The Annals of Statistics, 16(4), 1696-1708.
 *   https://doi.org/10.1214/aos/1176351062
 *
 * @param {Array} studies - Array of {yi, vi, [moderator]}
 * @param {string} moderator - Name of moderator variable
 * @param {Object} options - {nBoot, distribution}
 * @returns {Object} Wild bootstrap meta-regression results
 */
export function wildBootstrapMetaReg(studies, moderator, options = {}) {
  const validation = validateStudies(studies);
  if (!validation.valid) {
    return { error: validation.error, valid: false };
  }

  const { nBoot = 1000, distribution = 'rademacher' } = options;

  const yi = studies.map(s => s.yi);
  const vi = studies.map(s => s.vi);
  const xi = studies.map(s => s[moderator]);

  if (xi.some(x => x === undefined)) {
    return { error: `Moderator '${moderator}' not found in all studies`, valid: false };
  }

  const X = xi.map(x => [1, x]);
  const w = vi.map(v => 1 / v);
  const beta = weightedLeastSquares(X, yi, w);

  const residuals = yi.map((y, i) => y - (beta[0] + beta[1] * xi[i]));

  const bootBetas = [];

  for (let b = 0; b < nBoot; b++) {
    let wildWeights;
    if (distribution === 'rademacher') {
      wildWeights = residuals.map(() => Math.random() < 0.5 ? -1 : 1);
    } else {
      const p = (Math.sqrt(5) + 1) / (2 * Math.sqrt(5));
      wildWeights = residuals.map(() =>
        Math.random() < p ? -(Math.sqrt(5) - 1) / 2 : (Math.sqrt(5) + 1) / 2
      );
    }

    const bootY = yi.map((y, i) => beta[0] + beta[1] * xi[i] + wildWeights[i] * residuals[i]);
    const bootBeta = weightedLeastSquares(X, bootY, w);
    bootBetas.push(bootBeta);
  }

  const beta1Samples = bootBetas.map(b => b[1]);
  beta1Samples.sort((a, b) => a - b);

  const ciLower = beta1Samples[Math.floor(nBoot * 0.025)];
  const ciUpper = beta1Samples[Math.floor(nBoot * 0.975)];

  const centered = beta1Samples.map(b => b - beta[1]);
  const pValue = 2 * Math.min(
    centered.filter(b => b <= 0).length / nBoot,
    centered.filter(b => b >= 0).length / nBoot
  );

  return {
    intercept: beta[0],
    slope: beta[1],
    bootstrapCI: [ciLower, ciUpper],
    bootstrapSE: sd(beta1Samples),
    bootstrapP: pValue,
    significant: pValue < 0.05,
    robustness: 'Wild bootstrap provides valid inference under heteroskedasticity',
    nBoot,
    distribution,
    method: 'Wild Bootstrap Meta-Regression',
    reference: 'Cameron & Trivedi (2005) Microeconometrics, Chapter 11'
  };
}

// ============================================================================
// 40. CLUSTERED BOOTSTRAP META-ANALYSIS
// ============================================================================

/**
 * Clustered Bootstrap Meta-Analysis
 * Accounts for clustering within studies (e.g., multi-arm trials).
 *
 * R AVAILABILITY: boot package can handle clusters; clubSandwich for robust SE
 * OUR CONTRIBUTION: JavaScript implementation with cluster resampling
 *
 * @reference Cameron, A. C., Gelbach, J. B., & Miller, D. L. (2008).
 *   Bootstrap-based improvements for inference with clustered errors.
 *   Review of Economics and Statistics, 90(3), 414-427.
 *   https://doi.org/10.1162/rest.90.3.414
 *
 * @param {Array} studies - Array of {yi, vi, [clusterVar]}
 * @param {string} clusterVar - Name of cluster variable
 * @param {Object} options - {nBoot}
 * @returns {Object} Clustered bootstrap results
 */
export function clusteredBootstrapMA(studies, clusterVar, options = {}) {
  const validation = validateStudies(studies);
  if (!validation.valid) {
    return { error: validation.error, valid: false };
  }

  const { nBoot = 1000 } = options;

  const yi = studies.map(s => s.yi);
  const vi = studies.map(s => s.vi);
  const clusters = studies.map(s => s[clusterVar]);

  if (clusters.some(c => c === undefined)) {
    return { error: `Cluster variable '${clusterVar}' not found in all studies`, valid: false };
  }

  const uniqueClusters = [...new Set(clusters)];
  const nClusters = uniqueClusters.length;

  const w = vi.map(v => 1 / v);
  const sumW = sum(w);
  const thetaOrig = sum(yi.map((y, i) => y * w[i])) / sumW;

  const bootThetas = [];

  for (let b = 0; b < nBoot; b++) {
    const bootClusters = [];
    for (let i = 0; i < nClusters; i++) {
      bootClusters.push(uniqueClusters[Math.floor(Math.random() * nClusters)]);
    }

    const bootYi = [];
    const bootVi = [];

    for (const cluster of bootClusters) {
      for (let i = 0; i < studies.length; i++) {
        if (clusters[i] === cluster) {
          bootYi.push(yi[i]);
          bootVi.push(vi[i]);
        }
      }
    }

    if (bootYi.length === 0) continue;

    const bootW = bootVi.map(v => 1 / v);
    const bootSumW = sum(bootW);
    const bootTheta = sum(bootYi.map((y, i) => y * bootW[i])) / bootSumW;
    bootThetas.push(bootTheta);
  }

  if (bootThetas.length === 0) {
    return { error: 'Bootstrap failed to produce valid estimates', valid: false };
  }

  bootThetas.sort((a, b) => a - b);

  const clusterSE = sd(bootThetas);
  const unconditionalSE = Math.sqrt(1 / sumW);
  const designEffect = unconditionalSE > 0 ? (clusterSE / unconditionalSE) ** 2 : 1;

  const avgClusterSize = studies.length / nClusters;
  const icc = designEffect > 1 && avgClusterSize > 1 ?
    (designEffect - 1) / (avgClusterSize - 1) : 0;

  return {
    theta: thetaOrig,
    clusteredSE: clusterSE,
    unconditionalSE,
    ci: [
      bootThetas[Math.floor(bootThetas.length * 0.025)],
      bootThetas[Math.floor(bootThetas.length * 0.975)]
    ],
    designEffect,
    effectiveSampleSize: designEffect > 0 ? studies.length / designEffect : studies.length,
    intraClusterCorrelation: icc,
    interpretation: designEffect > 1.5 ?
      'Substantial clustering: standard errors underestimate uncertainty' :
      'Minimal clustering effect',
    nClusters,
    nStudies: studies.length,
    nBoot,
    method: 'Clustered Bootstrap MA',
    reference: 'Cameron et al. (2008) Rev Econ Stat. https://doi.org/10.1162/rest.90.3.414'
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function poolRE(yi, vi) {
  const k = yi.length;
  if (k === 0) return { theta: 0, se: 1, tau2: 0, I2: 0, Q: 0 };

  const w = vi.map(v => v > 0 ? 1 / v : 0);
  const sumW = sum(w);

  if (sumW === 0) return { theta: mean(yi), se: 1, tau2: 0, I2: 0, Q: 0 };

  const thetaFE = sum(yi.map((y, i) => y * w[i])) / sumW;

  const Q = sum(yi.map((y, i) => w[i] * (y - thetaFE) ** 2));
  const C = sumW - sum(w.map(wi => wi * wi)) / sumW;
  const tau2 = C > 0 ? Math.max(0, (Q - (k - 1)) / C) : 0;

  const wRE = vi.map(v => 1 / (v + tau2));
  const sumWRE = sum(wRE);
  const theta = sumWRE > 0 ? sum(yi.map((y, i) => y * wRE[i])) / sumWRE : mean(yi);
  const se = sumWRE > 0 ? Math.sqrt(1 / sumWRE) : 1;

  const I2 = Q > k - 1 ? (Q - (k - 1)) / Q * 100 : 0;

  return { theta, se, tau2, I2, Q };
}

function weightedLeastSquares(X, y, w) {
  const p = X[0].length;
  const XtWX = new Array(p).fill(0).map(() => new Array(p).fill(0));
  const XtWy = new Array(p).fill(0);

  for (let i = 0; i < X.length; i++) {
    for (let j = 0; j < p; j++) {
      XtWy[j] += X[i][j] * w[i] * y[i];
      for (let k = 0; k < p; k++) {
        XtWX[j][k] += X[i][j] * w[i] * X[i][k];
      }
    }
  }

  return solveLinear(XtWX, XtWy);
}

function solveLinear(A, b) {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(M[k][i]) > Math.abs(M[maxRow][i])) maxRow = k;
    }
    [M[i], M[maxRow]] = [M[maxRow], M[i]];
    if (Math.abs(M[i][i]) < 1e-10) continue;
    for (let k = i + 1; k < n; k++) {
      const c = M[k][i] / M[i][i];
      for (let j = i; j <= n; j++) M[k][j] -= c * M[i][j];
    }
  }

  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    if (Math.abs(M[i][i]) < 1e-10) continue;
    x[i] = M[i][n] / M[i][i];
    for (let k = i - 1; k >= 0; k--) M[k][n] -= M[k][i] * x[i];
  }
  return x;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  multipleThresholdsDTA,
  comparativeDTA,
  testCombinationsMA,
  cStatisticMA,
  calibrationMA,
  netBenefitMA,
  cliffsDeltaMA,
  overlapCoefficientMA,
  wildBootstrapMetaReg,
  clusteredBootstrapMA
};
