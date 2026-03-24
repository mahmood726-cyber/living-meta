/**
 * Advanced Meta-Analysis Methods - Part 3
 * NMA Extensions, IPD Methods, Heterogeneity Analysis
 *
 * EDITORIAL DISCLOSURE (2025):
 * This module provides JavaScript implementations of methods that ARE available
 * in R packages but are implemented here for browser-based analysis without
 * R dependencies. Each function documents the equivalent R packages.
 *
 * Key R packages with overlapping functionality:
 * - maic, maicplus: MAIC population adjustment
 * - netmeta, gemtc: NMA methods
 * - mimTC, STC: Simulated treatment comparison
 * - lme4, metafor: Cross-classified and heterogeneity partitioning
 *
 * Our contribution: Pure JavaScript implementations enabling browser-based
 * meta-analysis with full methodology transparency.
 */

import {
  sum, mean, variance, sd,
  normalCDF, normalPDF, normalQuantile,
  chiSquaredCDF,
  weightedMean, weightedVariance,
  randomNormal,
  validateStudies
} from './stats-utils.js';

// ============================================================================
// 21. THRESHOLD ANALYSIS FOR NMA
// ============================================================================

/**
 * NMA Threshold Analysis
 * Determines how much bias would be needed to change treatment rankings.
 *
 * R AVAILABILITY: gemtc::threshold.analysis() (partial), nmathresh package
 * OUR CONTRIBUTION: JavaScript implementation with simplified network handling
 *
 * @reference Phillippo, D. M., Dias, S., Ades, A. E., Didelez, V., & Welton, N. J. (2019).
 *   Sensitivity of treatment recommendations to bias in network meta-analysis.
 *   Journal of the Royal Statistical Society: Series A, 182(1), 93-107.
 *   https://doi.org/10.1111/rssa.12341
 *
 * @param {Array} contrasts - Array of {t1, t2, yi, vi} contrast objects
 * @param {Object} options - {reference, decision, targetTreatment}
 * @returns {Object} Threshold analysis results
 */
export function nmaThresholdAnalysis(contrasts, options = {}) {
  const validation = validateStudies(contrasts, ['t1', 't2', 'yi', 'vi']);
  if (!validation.valid) {
    return { error: validation.error, valid: false };
  }

  const {
    reference = null,
    decision = 'best'
  } = options;

  const treatments = [...new Set(contrasts.flatMap(c => [c.t1, c.t2]))];
  const ref = reference || treatments[0];

  // Get current NMA estimates using direct evidence weighted average
  const estimates = {};
  const variances = {};

  for (const t of treatments) {
    if (t === ref) {
      estimates[t] = 0;
      variances[t] = 0;
      continue;
    }

    const direct = contrasts.filter(c =>
      (c.t1 === ref && c.t2 === t) || (c.t1 === t && c.t2 === ref)
    );

    if (direct.length > 0) {
      const w = direct.map(d => 1 / d.vi);
      const sumW = sum(w);
      const yi = direct.map(d => d.t1 === ref ? d.yi : -d.yi);
      estimates[t] = sum(yi.map((y, i) => y * w[i])) / sumW;
      variances[t] = 1 / sumW;
    } else {
      estimates[t] = 0;
      variances[t] = 1;
    }
  }

  // Current ranking
  const ranking = treatments
    .map(t => ({ treatment: t, effect: estimates[t], se: Math.sqrt(variances[t]) }))
    .sort((a, b) => b.effect - a.effect);

  // Calculate thresholds
  const thresholds = {};

  for (const contrast of contrasts) {
    const key = `${contrast.t1}_vs_${contrast.t2}`;
    const t1Rank = ranking.findIndex(r => r.treatment === contrast.t1);
    const t2Rank = ranking.findIndex(r => r.treatment === contrast.t2);

    if (t1Rank < t2Rank) {
      const diff = estimates[contrast.t1] - estimates[contrast.t2];
      const threshold = diff / (1 / Math.sqrt(contrast.vi));
      thresholds[key] = {
        currentEffect: contrast.yi,
        thresholdToReverse: contrast.yi - diff,
        standardizedThreshold: threshold,
        wouldChangeRanking: Math.abs(threshold) < 1.96
      };
    } else {
      const diff = estimates[contrast.t2] - estimates[contrast.t1];
      const threshold = diff / (1 / Math.sqrt(contrast.vi));
      thresholds[key] = {
        currentEffect: contrast.yi,
        thresholdToReverse: contrast.yi + diff,
        standardizedThreshold: -threshold,
        wouldChangeRanking: Math.abs(threshold) < 1.96
      };
    }
  }

  const influential = Object.entries(thresholds)
    .map(([key, val]) => ({ contrast: key, ...val }))
    .sort((a, b) => Math.abs(a.standardizedThreshold) - Math.abs(b.standardizedThreshold))
    .slice(0, 5);

  const minThreshold = Math.min(...Object.values(thresholds)
    .map(t => Math.abs(t.standardizedThreshold)));

  return {
    ranking,
    thresholds,
    influential,
    robustness: {
      minStandardizedThreshold: minThreshold,
      robust: minThreshold > 1.96,
      interpretation: minThreshold > 1.96 ?
        'Rankings are robust to plausible bias adjustments' :
        `Rankings could change with ${minThreshold.toFixed(2)} SD adjustment`
    },
    method: 'NMA Threshold Analysis',
    reference: 'Phillippo et al. (2019) J R Stat Soc A. https://doi.org/10.1111/rssa.12341'
  };
}

// ============================================================================
// 22. POPULATION-ADJUSTED INDIRECT COMPARISON (MAIC)
// ============================================================================

/**
 * Matching-Adjusted Indirect Comparison (MAIC)
 * Reweights individual patient data to match aggregate study characteristics.
 *
 * R AVAILABILITY: maic::maic(), maicplus package, NICE-DSU TSD18 R code
 * OUR CONTRIBUTION: JavaScript implementation for browser-based analysis
 *
 * IMPORTANT LIMITATIONS:
 * - Only adjusts for OBSERVED effect modifiers
 * - Assumes no unmeasured confounding (strong, untestable assumption)
 * - Large weight variability indicates poor population overlap
 * - ESS much smaller than N indicates results are driven by few patients
 *
 * @reference Signorovitch, J. E., Wu, E. Q., Yu, A. P., Gerrits, C. M.,
 *   Kantor, E., Bao, Y., ... & Mulani, P. M. (2010). Comparative effectiveness
 *   without head-to-head trials. Pharmacoeconomics, 28(10), 935-945.
 *   https://doi.org/10.2165/11538370-000000000-00000
 *
 * @reference NICE Decision Support Unit Technical Support Document 18 (2016)
 *   https://www.ncbi.nlm.nih.gov/books/NBK493682/
 *
 * @param {Object} ipdStudy - {patients, outcome, treatment}
 * @param {Object} aggStudy - {meanCovariates, effect, se, n}
 * @param {Object} options - {effectMeasure, bootstrap}
 * @returns {Object} MAIC results with effective sample size
 */
export function matchingAdjustedIC(ipdStudy, aggStudy, options = {}) {
  const { effectMeasure = 'OR', bootstrap = 1000 } = options;

  const { patients, outcome, treatment } = ipdStudy;
  const { meanCovariates, effect: aggEffect, se: aggSE } = aggStudy;

  if (!patients || patients.length === 0) {
    return { error: 'No patient data provided', valid: false };
  }

  const covariateNames = Object.keys(meanCovariates);
  const targetMeans = covariateNames.map(name => meanCovariates[name]);

  // Extract covariates from IPD
  const X = patients.map(p => covariateNames.map(name => p[name]));

  // Optimize weights using entropy balancing
  const weights = optimizeMAICWeights(X, targetMeans);

  // Calculate weighted treatment effect
  const treated = patients.filter(p => p[treatment] === 1);
  const control = patients.filter(p => p[treatment] === 0);

  const treatedWeights = treated.map(p => weights[patients.indexOf(p)]);
  const controlWeights = control.map(p => weights[patients.indexOf(p)]);

  const treatedOutcome = sum(treated.map((p, i) => p[outcome] * treatedWeights[i])) /
                         sum(treatedWeights);
  const controlOutcome = sum(control.map((p, i) => p[outcome] * controlWeights[i])) /
                         sum(controlWeights);

  let ipdEffect, ipdSE;
  if (effectMeasure === 'OR') {
    const oddsT = treatedOutcome / (1 - treatedOutcome);
    const oddsC = controlOutcome / (1 - controlOutcome);
    ipdEffect = Math.log(oddsT / oddsC);
    ipdSE = Math.sqrt(1/(treatedOutcome * sum(treatedWeights)) +
                      1/((1-treatedOutcome) * sum(treatedWeights)) +
                      1/(controlOutcome * sum(controlWeights)) +
                      1/((1-controlOutcome) * sum(controlWeights)));
  } else {
    ipdEffect = treatedOutcome - controlOutcome;
    ipdSE = Math.sqrt(treatedOutcome * (1 - treatedOutcome) / sum(treatedWeights) +
                      controlOutcome * (1 - controlOutcome) / sum(controlWeights));
  }

  // Indirect comparison
  const indirectEffect = ipdEffect - aggEffect;
  const indirectSE = Math.sqrt(ipdSE ** 2 + aggSE ** 2);

  // Effective sample size
  const ESS = sum(weights) ** 2 / sum(weights.map(w => w ** 2));
  const efficiencyLoss = 1 - ESS / patients.length;

  // Bootstrap CI
  const bootEffects = [];
  for (let b = 0; b < bootstrap; b++) {
    const bootIdx = Array(patients.length).fill(0)
      .map(() => Math.floor(Math.random() * patients.length));
    const bootPatients = bootIdx.map(i => patients[i]);
    const bootWeights = bootIdx.map(i => weights[i]);

    const bootTreated = bootPatients.filter(p => p[treatment] === 1);
    const bootControl = bootPatients.filter(p => p[treatment] === 0);

    if (bootTreated.length === 0 || bootControl.length === 0) continue;

    const bootTW = bootTreated.map(p => bootWeights[bootPatients.indexOf(p)] || 1);
    const bootCW = bootControl.map(p => bootWeights[bootPatients.indexOf(p)] || 1);

    const bootTO = sum(bootTreated.map((p, i) => p[outcome] * bootTW[i])) / sum(bootTW);
    const bootCO = sum(bootControl.map((p, i) => p[outcome] * bootCW[i])) / sum(bootCW);

    let bootIPD;
    if (effectMeasure === 'OR') {
      if (bootTO > 0 && bootTO < 1 && bootCO > 0 && bootCO < 1) {
        bootIPD = Math.log((bootTO / (1 - bootTO)) / (bootCO / (1 - bootCO)));
      } else continue;
    } else {
      bootIPD = bootTO - bootCO;
    }

    bootEffects.push(bootIPD - aggEffect);
  }

  bootEffects.sort((a, b) => a - b);

  // Warnings based on diagnostics
  const warnings = [];
  if (efficiencyLoss > 0.5) {
    warnings.push('CAUTION: ESS is less than half original N - results driven by few patients');
  }
  if (Math.max(...weights) / Math.min(...weights) > 10) {
    warnings.push('WARNING: Extreme weight variability indicates poor population overlap');
  }
  if (ESS < 50) {
    warnings.push('WARNING: Very low ESS (<50) - consider if populations are comparable');
  }

  return {
    adjustedIPDEffect: ipdEffect,
    adjustedIPDSE: ipdSE,
    indirectEffect,
    indirectSE,
    ci_lower: bootEffects.length > 0 ? bootEffects[Math.floor(bootEffects.length * 0.025)] : indirectEffect - 1.96 * indirectSE,
    ci_upper: bootEffects.length > 0 ? bootEffects[Math.floor(bootEffects.length * 0.975)] : indirectEffect + 1.96 * indirectSE,
    effectiveSampleSize: ESS,
    originalN: patients.length,
    efficiencyLoss,
    weights: {
      min: Math.min(...weights),
      max: Math.max(...weights),
      mean: mean(weights),
      sd: sd(weights)
    },
    covariateBalance: covariateNames.map((name, i) => ({
      covariate: name,
      targetMean: targetMeans[i],
      weightedMean: sum(X.map((x, j) => x[i] * weights[j])) / sum(weights),
      unweightedMean: mean(X.map(x => x[i]))
    })),
    warnings,
    method: 'MAIC',
    reference: 'Signorovitch et al. (2010) Pharmacoeconomics. https://doi.org/10.2165/11538370-000000000-00000'
  };
}

function optimizeMAICWeights(X, targetMeans) {
  const n = X.length;
  const p = targetMeans.length;

  let beta = new Array(p).fill(0);

  for (let iter = 0; iter < 100; iter++) {
    const logW = X.map(x => sum(x.map((xj, j) => xj * beta[j])));
    const maxLogW = Math.max(...logW);
    const weights = logW.map(lw => Math.exp(lw - maxLogW));
    const sumW = sum(weights);

    const grad = new Array(p).fill(0);
    for (let j = 0; j < p; j++) {
      const weightedMean = sum(X.map((x, i) => x[j] * weights[i])) / sumW;
      grad[j] = weightedMean - targetMeans[j];
    }

    if (Math.max(...grad.map(Math.abs)) < 1e-6) break;

    const H = new Array(p).fill(0).map(() => new Array(p).fill(0));
    for (let j = 0; j < p; j++) {
      for (let k = 0; k < p; k++) {
        H[j][k] = sum(X.map((x, i) => x[j] * x[k] * weights[i])) / sumW;
        H[j][k] -= sum(X.map((x, i) => x[j] * weights[i])) / sumW *
                   sum(X.map((x, i) => x[k] * weights[i])) / sumW;
      }
    }

    const delta = solveLinear(H, grad);
    beta = beta.map((b, j) => b - 0.5 * delta[j]);
  }

  const logW = X.map(x => sum(x.map((xj, j) => xj * beta[j])));
  const maxLogW = Math.max(...logW);
  const weights = logW.map(lw => Math.exp(lw - maxLogW));
  const sumW = sum(weights);

  return weights.map(w => w / sumW * n);
}

// ============================================================================
// 23. SIMULATED TREATMENT COMPARISON (STC)
// ============================================================================

/**
 * Simulated Treatment Comparison (STC)
 * Outcome regression approach to population adjustment.
 *
 * R AVAILABILITY: STC package, mimTC::stc()
 * OUR CONTRIBUTION: JavaScript implementation for browser-based analysis
 *
 * KEY DIFFERENCE FROM MAIC:
 * - MAIC: Weights IPD to match aggregate covariates
 * - STC: Fits outcome model, predicts at aggregate covariate values
 * - STC uses model extrapolation; MAIC uses reweighting
 * - STC may be more efficient but assumes correct model specification
 *
 * @reference Caro, J. J., & Ishak, K. J. (2010). No head-to-head trial?
 *   Simulate the missing arms. Pharmacoeconomics, 28(10), 957-967.
 *   https://doi.org/10.2165/11537420-000000000-00000
 *
 * @reference NICE Decision Support Unit Technical Support Document 18 (2016)
 *
 * @param {Object} ipdStudy - {patients, outcome, treatment, covariates}
 * @param {Object} aggStudy - {meanCovariates, effect, se}
 * @param {Object} options - {effectMeasure, covariateModel}
 * @returns {Object} STC results with regression coefficients
 */
export function simulatedTreatmentComparison(ipdStudy, aggStudy, options = {}) {
  const { effectMeasure = 'OR', covariateModel = 'linear' } = options;

  const { patients, outcome, treatment, covariates } = ipdStudy;
  const { meanCovariates, effect: aggEffect, se: aggSE } = aggStudy;

  if (!patients || patients.length === 0) {
    return { error: 'No patient data provided', valid: false };
  }

  const n = patients.length;
  const p = covariates.length;

  // Build design matrix with interactions
  const X = patients.map(patient => {
    const row = [1, patient[treatment]];
    for (const cov of covariates) {
      row.push(patient[cov]);
      row.push(patient[treatment] * patient[cov]);
    }
    return row;
  });

  const y = patients.map(p => p[outcome]);

  // Fit logistic regression
  const beta = fitLogistic(X, y);

  // Predict at aggregate covariate values
  const targetCovs = covariates.map(cov => meanCovariates[cov]);

  // Treatment effect at target covariate values
  let adjustedEffect = beta[1];
  for (let j = 0; j < p; j++) {
    adjustedEffect += beta[3 + 2*j] * targetCovs[j];
  }

  // SE via delta method (simplified)
  const adjustedSE = Math.sqrt(
    1 / sum(patients.map(p => p[treatment])) +
    1 / sum(patients.map(p => 1 - p[treatment])) +
    sum(targetCovs.map(t => t * t * 0.01))
  );

  const indirectEffect = adjustedEffect - aggEffect;
  const indirectSE = Math.sqrt(adjustedSE ** 2 + aggSE ** 2);

  return {
    adjustedEffect,
    adjustedSE,
    indirectEffect,
    indirectSE,
    ci_lower: indirectEffect - 1.96 * indirectSE,
    ci_upper: indirectEffect + 1.96 * indirectSE,
    regressionCoefficients: {
      intercept: beta[0],
      treatment: beta[1],
      covariates: covariates.map((cov, j) => ({
        name: cov,
        main: beta[2 + 2*j],
        interaction: beta[3 + 2*j]
      }))
    },
    effectModification: covariates.map((cov, j) => ({
      covariate: cov,
      interactionEffect: beta[3 + 2*j],
      significant: Math.abs(beta[3 + 2*j]) > 0.5
    })),
    method: 'STC',
    reference: 'Caro & Ishak (2010) Pharmacoeconomics. https://doi.org/10.2165/11537420-000000000-00000'
  };
}

function fitLogistic(X, y, maxIter = 50) {
  const n = X.length;
  const p = X[0].length;
  let beta = new Array(p).fill(0);

  for (let iter = 0; iter < maxIter; iter++) {
    const eta = X.map(xi => sum(xi.map((x, j) => x * beta[j])));
    const prob = eta.map(e => 1 / (1 + Math.exp(-Math.max(-700, Math.min(700, e)))));

    const grad = new Array(p).fill(0);
    for (let j = 0; j < p; j++) {
      grad[j] = sum(X.map((xi, i) => xi[j] * (y[i] - prob[i])));
    }

    const H = new Array(p).fill(0).map(() => new Array(p).fill(0));
    for (let j = 0; j < p; j++) {
      for (let k = 0; k < p; k++) {
        H[j][k] = -sum(X.map((xi, i) => xi[j] * xi[k] * prob[i] * (1 - prob[i])));
      }
    }

    const delta = solveLinear(H.map(row => row.map(v => -v)), grad);
    beta = beta.map((b, j) => b + delta[j]);

    if (Math.max(...grad.map(Math.abs)) < 1e-6) break;
  }

  return beta;
}

// ============================================================================
// 24. UNANCHORED INDIRECT COMPARISON
// ============================================================================

/**
 * Unanchored Indirect Comparison
 * Compares treatments WITHOUT a common comparator - USE WITH EXTREME CAUTION.
 *
 * R AVAILABILITY: Not specifically packaged (usually discouraged)
 * OUR CONTRIBUTION: Implementation with STRONG methodological warnings
 *
 * CRITICAL METHODOLOGICAL WARNINGS:
 * 1. Unanchored comparisons CANNOT distinguish treatment effects from
 *    differences in patient populations, care quality, or outcome definitions
 * 2. Covariate adjustment only addresses MEASURED confounders
 * 3. Results are almost certainly biased - magnitude and direction unknown
 * 4. Should ONLY be used when:
 *    - No anchored comparison is possible
 *    - Decision-makers explicitly understand limitations
 *    - Results are presented with maximum uncertainty
 *
 * @reference Phillippo, D. M., et al. (2016). NICE DSU TSD 18: Methods for
 *   population-adjusted indirect comparisons in submissions to NICE.
 *   http://nicedsu.org.uk/wp-content/uploads/2018/08/Population-adjustment-TSD-FINAL-ref-rerun.pdf
 *
 * @reference ISPOR Task Force warnings on unanchored comparisons
 *
 * @param {Array} studies - Array of single-arm study data
 * @param {Object} options - {adjustmentMethod, commonCovariates}
 * @returns {Object} Comparison results with STRONG warnings
 */
export function unanchoredIndirectComparison(studies, options = {}) {
  const { commonCovariates = [] } = options;

  // MANDATORY WARNINGS - these should not be removable
  const warnings = [
    '*** CRITICAL: UNANCHORED COMPARISON - HIGH RISK OF BIAS ***',
    'This comparison has NO common reference arm',
    'Results CANNOT distinguish treatment effects from population differences',
    'Any observed difference may be entirely due to confounding',
    'Covariate adjustment does NOT ensure validity',
    'Results should be considered HYPOTHESIS-GENERATING ONLY',
    'Do NOT use for definitive treatment decisions'
  ];

  if (!studies || studies.length < 2) {
    return { error: 'At least 2 studies required', valid: false, warnings };
  }

  const studyData = studies.map(s => ({
    treatment: s.treatment,
    effect: s.effect,
    se: s.se,
    covariates: commonCovariates.map(cov => s[cov])
  }));

  // Covariate adjustment if possible
  if (commonCovariates.length > 0 && studyData.every(s => s.covariates.every(c => c !== undefined))) {
    const X = studyData.map(s => [1, ...s.covariates]);
    const y = studyData.map(s => s.effect);
    const w = studyData.map(s => 1 / (s.se ** 2));

    const beta = weightedLeastSquares(X, y, w);
    const meanCovs = commonCovariates.map((_, j) => mean(studyData.map(s => s.covariates[j])));

    const adjustedEffects = studyData.map(s => {
      const covDiff = s.covariates.map((c, j) => c - meanCovs[j]);
      const adjustment = sum(covDiff.map((d, j) => d * beta[j + 1]));
      return s.effect - adjustment;
    });

    const comparisons = [];
    for (let i = 0; i < studies.length; i++) {
      for (let j = i + 1; j < studies.length; j++) {
        const diff = adjustedEffects[i] - adjustedEffects[j];
        const seDiff = Math.sqrt(studyData[i].se ** 2 + studyData[j].se ** 2);

        comparisons.push({
          comparison: `${studies[i].treatment} vs ${studies[j].treatment}`,
          difference: diff,
          se: seDiff,
          ci_lower: diff - 1.96 * seDiff,
          ci_upper: diff + 1.96 * seDiff,
          pvalue: 2 * (1 - normalCDF(Math.abs(diff / seDiff))),
          reliability: 'VERY LOW - unanchored comparison'
        });
      }
    }

    return {
      adjustedEffects: studyData.map((s, i) => ({
        treatment: s.treatment,
        originalEffect: s.effect,
        adjustedEffect: adjustedEffects[i]
      })),
      comparisons,
      regressionCoefficients: beta,
      warnings,
      limitations: [
        'Only ' + commonCovariates.length + ' covariates adjusted',
        'Residual confounding is virtually certain',
        'Model assumes linear covariate effects'
      ],
      method: 'Unanchored IC (Covariate-Adjusted)',
      reference: 'NICE DSU TSD 18. http://nicedsu.org.uk/'
    };
  }

  // Unadjusted comparison - even more dangerous
  const comparisons = [];
  for (let i = 0; i < studies.length; i++) {
    for (let j = i + 1; j < studies.length; j++) {
      const diff = studyData[i].effect - studyData[j].effect;
      const seDiff = Math.sqrt(studyData[i].se ** 2 + studyData[j].se ** 2);

      comparisons.push({
        comparison: `${studies[i].treatment} vs ${studies[j].treatment}`,
        difference: diff,
        se: seDiff,
        ci_lower: diff - 1.96 * seDiff,
        ci_upper: diff + 1.96 * seDiff,
        pvalue: 2 * (1 - normalCDF(Math.abs(diff / seDiff))),
        reliability: 'EXTREMELY LOW - unadjusted unanchored'
      });
    }
  }

  return {
    comparisons,
    warnings: [...warnings,
      '*** ADDITIONAL WARNING: NO COVARIATE ADJUSTMENT ***',
      'This is a naive comparison of absolute effects',
      'Bias is virtually guaranteed'
    ],
    method: 'Unanchored IC (Unadjusted)',
    reference: 'NICE DSU TSD 18. http://nicedsu.org.uk/'
  };
}

// ============================================================================
// 25. GENERALIZED HETEROGENEITY PARTITIONING
// ============================================================================

/**
 * Generalized Heterogeneity Partitioning
 * Decomposes total heterogeneity into sources (between/within groups).
 *
 * R AVAILABILITY: metafor::rma() with moderators provides similar decomposition
 * OUR CONTRIBUTION: JavaScript implementation with multiple grouping variables
 *
 * @reference Higgins, J. P. T., & Thompson, S. G. (2002). Quantifying
 *   heterogeneity in a meta-analysis. Statistics in Medicine, 21(11), 1539-1558.
 *   https://doi.org/10.1002/sim.1186
 *
 * @reference Borenstein, M., Hedges, L. V., Higgins, J. P. T., & Rothstein, H. R. (2009).
 *   Introduction to Meta-Analysis. Wiley. Chapter 19.
 *
 * @param {Array} studies - Array of {yi, vi, label} objects
 * @param {Object} groupings - Object mapping group names to arrays of group assignments
 * @param {Object} options - Additional options
 * @returns {Object} Heterogeneity partitioning results
 */
export function heterogeneityPartitioning(studies, groupings, options = {}) {
  const validation = validateStudies(studies);
  if (!validation.valid) {
    return { error: validation.error, valid: false };
  }

  const yi = studies.map(s => s.yi);
  const vi = studies.map(s => s.vi);
  const k = studies.length;

  // Overall heterogeneity
  const w = vi.map(v => 1 / v);
  const sumW = sum(w);
  const thetaFE = sum(yi.map((y, i) => y * w[i])) / sumW;
  const QTotal = sum(yi.map((y, i) => w[i] * (y - thetaFE) ** 2));
  const dfTotal = k - 1;

  // Partition by each grouping variable
  const partitions = {};

  for (const [groupName, groups] of Object.entries(groupings)) {
    const uniqueGroups = [...new Set(groups)];
    const nGroups = uniqueGroups.length;

    let QBetween = 0;
    const groupEstimates = [];

    for (const g of uniqueGroups) {
      const idx = groups.map((grp, i) => grp === g ? i : -1).filter(i => i >= 0);
      const groupYi = idx.map(i => yi[i]);
      const groupVi = idx.map(i => vi[i]);
      const groupW = groupVi.map(v => 1 / v);
      const sumGW = sum(groupW);
      const groupTheta = sum(groupYi.map((y, j) => y * groupW[j])) / sumGW;

      groupEstimates.push({ group: g, theta: groupTheta, n: idx.length, weight: sumGW });
      QBetween += sumGW * (groupTheta - thetaFE) ** 2;
    }

    const dfBetween = nGroups - 1;

    let QWithin = 0;
    for (const g of uniqueGroups) {
      const idx = groups.map((grp, i) => grp === g ? i : -1).filter(i => i >= 0);
      const groupYi = idx.map(i => yi[i]);
      const groupVi = idx.map(i => vi[i]);
      const groupW = groupVi.map(v => 1 / v);
      const sumGW = sum(groupW);
      const groupTheta = sum(groupYi.map((y, j) => y * groupW[j])) / sumGW;

      QWithin += sum(groupYi.map((y, j) => groupW[j] * (y - groupTheta) ** 2));
    }

    const dfWithin = k - nGroups;
    const R2 = QTotal > 0 ? (QTotal - QWithin) / QTotal : 0;

    partitions[groupName] = {
      QBetween,
      dfBetween,
      pBetween: 1 - chiSquaredCDF(QBetween, dfBetween),
      QWithin,
      dfWithin,
      pWithin: 1 - chiSquaredCDF(QWithin, dfWithin),
      R2,
      groupEstimates
    };
  }

  // I-squared decomposition
  const C = sumW - sum(w.map(wi => wi * wi)) / sumW;
  const tau2Total = Math.max(0, (QTotal - dfTotal) / C);
  const I2Total = tau2Total / (tau2Total + mean(vi)) * 100;

  return {
    total: {
      Q: QTotal,
      df: dfTotal,
      p: 1 - chiSquaredCDF(QTotal, dfTotal),
      tau2: tau2Total,
      I2: I2Total
    },
    partitions,
    interpretation: Object.entries(partitions)
      .filter(([_, p]) => p.pBetween < 0.05)
      .map(([name, p]) =>
        `${name} explains ${(p.R2 * 100).toFixed(1)}% of heterogeneity (p = ${p.pBetween.toFixed(3)})`
      ),
    method: 'Heterogeneity Partitioning',
    reference: 'Higgins & Thompson (2002) Stat Med. https://doi.org/10.1002/sim.1186'
  };
}

// ============================================================================
// 26. HETEROGENEITY LOCALIZATION
// ============================================================================

/**
 * Heterogeneity Localization
 * Identifies specific studies driving heterogeneity.
 *
 * R AVAILABILITY: metafor::influence() provides similar diagnostics
 * OUR CONTRIBUTION: JavaScript implementation with cumulative Q decomposition
 *
 * @reference Viechtbauer, W., & Cheung, M. W. L. (2010). Outlier and influence
 *   diagnostics for meta-analysis. Research Synthesis Methods, 1(2), 112-125.
 *   https://doi.org/10.1002/jrsm.11
 *
 * @param {Array} studies - Array of {yi, vi, label} objects
 * @param {Object} options - {threshold}
 * @returns {Object} Heterogeneity localization results
 */
export function heterogeneityLocalization(studies, options = {}) {
  const validation = validateStudies(studies);
  if (!validation.valid) {
    return { error: validation.error, valid: false };
  }

  const { threshold = 0.75 } = options;

  const yi = studies.map(s => s.yi);
  const vi = studies.map(s => s.vi);
  const k = studies.length;

  const w = vi.map(v => 1 / v);
  const sumW = sum(w);
  const thetaFE = sum(yi.map((y, i) => y * w[i])) / sumW;
  const QFull = sum(yi.map((y, i) => w[i] * (y - thetaFE) ** 2));

  // Leave-one-out Q contribution
  const contributions = studies.map((study, i) => {
    const yiLOO = yi.filter((_, j) => j !== i);
    const viLOO = vi.filter((_, j) => j !== i);
    const wLOO = viLOO.map(v => 1 / v);
    const sumWLOO = sum(wLOO);
    const thetaLOO = sum(yiLOO.map((y, j) => y * wLOO[j])) / sumWLOO;
    const QLOO = sum(yiLOO.map((y, j) => wLOO[j] * (y - thetaLOO) ** 2));

    const contribution = QFull - QLOO;
    const proportionQ = QFull > 0 ? contribution / QFull : 0;

    return {
      index: i,
      label: study.label || `Study ${i + 1}`,
      yi: study.yi,
      QContribution: contribution,
      proportionQ,
      residual: study.yi - thetaFE,
      standardizedResidual: (study.yi - thetaFE) / Math.sqrt(vi[i])
    };
  });

  const sorted = [...contributions].sort((a, b) => b.QContribution - a.QContribution);

  // Find minimal set explaining threshold of Q
  let cumQ = 0;
  const drivers = [];
  for (const study of sorted) {
    cumQ += Math.max(0, study.QContribution);
    drivers.push(study);
    if (QFull > 0 && cumQ / QFull >= threshold) break;
  }

  const clusters = identifyHeterogeneityClusters(contributions, yi);

  return {
    contributions,
    sorted,
    drivers,
    summary: {
      totalQ: QFull,
      topContributor: sorted[0],
      nDrivers: drivers.length,
      thresholdExplained: threshold
    },
    clusters,
    interpretation: drivers.length === 1 ?
      `Study "${drivers[0].label}" is the primary source of heterogeneity` :
      `${drivers.length} studies explain ${(threshold * 100).toFixed(0)}% of heterogeneity`,
    method: 'Heterogeneity Localization',
    reference: 'Viechtbauer & Cheung (2010) Res Synth Methods. https://doi.org/10.1002/jrsm.11'
  };
}

function identifyHeterogeneityClusters(contributions, yi) {
  if (yi.length < 4) return null;

  const sorted = [...yi].sort((a, b) => a - b);
  const gap = sorted.slice(1).map((y, i) => y - sorted[i]);
  const maxGapIdx = gap.indexOf(Math.max(...gap));

  const cluster1 = yi.map((y, i) => y <= sorted[maxGapIdx] ? contributions[i] : null).filter(x => x);
  const cluster2 = yi.map((y, i) => y > sorted[maxGapIdx] ? contributions[i] : null).filter(x => x);

  if (cluster1.length === 0 || cluster2.length === 0) return null;

  return {
    cluster1: {
      studies: cluster1.map(c => c.label),
      meanEffect: mean(cluster1.map(c => c.yi)),
      n: cluster1.length
    },
    cluster2: {
      studies: cluster2.map(c => c.label),
      meanEffect: mean(cluster2.map(c => c.yi)),
      n: cluster2.length
    },
    gapSize: gap[maxGapIdx]
  };
}

// ============================================================================
// 27. CROSS-CLASSIFIED RANDOM EFFECTS
// ============================================================================

/**
 * Cross-Classified Random Effects Meta-Analysis
 * Handles multiple non-nested grouping structures (e.g., studies nested
 * in both countries AND research groups).
 *
 * R AVAILABILITY: lme4::lmer() with crossed random effects, metafor with complex VCV
 * OUR CONTRIBUTION: JavaScript implementation using simplified EM algorithm
 *
 * @reference Raudenbush, S. W., & Bryk, A. S. (2002). Hierarchical Linear Models.
 *   Sage Publications. Chapter 12.
 *
 * @reference Konstantopoulos, S. (2011). Fixed effects and variance components
 *   estimation in three-level meta-analysis. Research Synthesis Methods, 2(1), 61-76.
 *   https://doi.org/10.1002/jrsm.35
 *
 * @param {Array} studies - Array of {yi, vi} objects
 * @param {Object} groupings - Object mapping group names to arrays
 * @param {Object} options - {nIter}
 * @returns {Object} Cross-classified MA results
 */
export function crossClassifiedMA(studies, groupings, options = {}) {
  const validation = validateStudies(studies);
  if (!validation.valid) {
    return { error: validation.error, valid: false };
  }

  const { nIter = 1000 } = options;

  const yi = studies.map(s => s.yi);
  const vi = studies.map(s => s.vi);
  const k = studies.length;
  const groupNames = Object.keys(groupings);

  // Initialize variance components
  const tau2 = {};
  for (const g of groupNames) {
    tau2[g] = 0.1;
  }
  let tau2Resid = 0.1;

  // EM-style estimation
  for (let iter = 0; iter < nIter; iter++) {
    const randomEffects = {};
    for (const g of groupNames) {
      const levels = [...new Set(groupings[g])];
      randomEffects[g] = {};

      for (const level of levels) {
        const idx = groupings[g].map((l, i) => l === level ? i : -1).filter(i => i >= 0);
        const groupYi = idx.map(i => yi[i]);
        const groupVi = idx.map(i => vi[i] + tau2Resid);

        const w = groupVi.map(v => 1 / v);
        const sumW = sum(w);
        const meanY = sum(groupYi.map((y, j) => y * w[j])) / sumW;

        const shrinkage = tau2[g] / (tau2[g] + 1 / sumW);
        randomEffects[g][level] = shrinkage * meanY;
      }
    }

    for (const g of groupNames) {
      const levels = Object.keys(randomEffects[g]);
      const effects = levels.map(l => randomEffects[g][l]);
      tau2[g] = Math.max(0.001, variance(effects));
    }

    const residuals = yi.map((y, i) => {
      let pred = 0;
      for (const g of groupNames) {
        pred += randomEffects[g][groupings[g][i]] || 0;
      }
      return y - pred;
    });
    tau2Resid = Math.max(0.001, variance(residuals) - mean(vi));
  }

  // Final estimates
  const w = vi.map((v, i) => {
    let totalVar = v + tau2Resid;
    for (const g of groupNames) {
      totalVar += tau2[g];
    }
    return 1 / totalVar;
  });

  const sumW = sum(w);
  const theta = sum(yi.map((y, i) => y * w[i])) / sumW;
  const se = Math.sqrt(1 / sumW);

  const totalVariance = mean(vi) + tau2Resid + sum(Object.values(tau2));
  const varianceDecomp = {
    sampling: mean(vi) / totalVariance,
    residual: tau2Resid / totalVariance,
    ...Object.fromEntries(groupNames.map(g => [g, tau2[g] / totalVariance]))
  };

  return {
    theta,
    se,
    ci_lower: theta - 1.96 * se,
    ci_upper: theta + 1.96 * se,
    varianceComponents: tau2,
    residualVariance: tau2Resid,
    varianceDecomposition: varianceDecomp,
    ICC: Object.fromEntries(groupNames.map(g => [
      g,
      tau2[g] / (tau2[g] + tau2Resid + mean(vi))
    ])),
    method: 'Cross-Classified RE MA',
    reference: 'Konstantopoulos (2011) Res Synth Methods. https://doi.org/10.1002/jrsm.35'
  };
}

// ============================================================================
// 28. ONE-STAGE VS TWO-STAGE COMPARISON
// ============================================================================

/**
 * One-Stage vs Two-Stage IPD Meta-Analysis Comparison
 * Compares results from different aggregation approaches to verify consistency.
 *
 * R AVAILABILITY: lme4 + metafor combination for comparison
 * OUR CONTRIBUTION: JavaScript implementation with direct comparison metrics
 *
 * KEY CONCEPTS:
 * - Two-stage: Aggregate within studies first, then pool study-level estimates
 * - One-stage: Model all individual data simultaneously with study clustering
 * - Results should be similar if models are correctly specified
 * - Differences may indicate model misspecification or aggregation bias
 *
 * @reference Burke, D. L., Ensor, J., & Riley, R. D. (2017). Meta-analysis using
 *   individual participant data: one-stage and two-stage approaches.
 *   Research Synthesis Methods, 8(2), 204-214.
 *   https://doi.org/10.1002/jrsm.1224
 *
 * @reference Debray, T. P. A., et al. (2015). Get real in individual participant
 *   data (IPD) meta-analysis. Research Synthesis Methods, 6(4), 293-309.
 *   https://doi.org/10.1002/jrsm.1155
 *
 * @param {Array} ipdData - Individual patient data array
 * @param {Object} options - {outcome, treatment, studyId, covariates}
 * @returns {Object} Comparison of one-stage and two-stage results
 */
export function oneVsTwoStageComparison(ipdData, options = {}) {
  const { outcome, treatment, studyId, covariates = [] } = options;

  if (!ipdData || ipdData.length === 0) {
    return { error: 'No patient data provided', valid: false };
  }

  const studies = [...new Set(ipdData.map(p => p[studyId]))];

  // Two-Stage: aggregate within studies, then pool
  const studyEstimates = [];
  for (const study of studies) {
    const studyData = ipdData.filter(p => p[studyId] === study);
    const treated = studyData.filter(p => p[treatment] === 1);
    const control = studyData.filter(p => p[treatment] === 0);

    if (treated.length === 0 || control.length === 0) continue;

    const yT = mean(treated.map(p => p[outcome]));
    const yC = mean(control.map(p => p[outcome]));
    const seT = sd(treated.map(p => p[outcome])) / Math.sqrt(treated.length);
    const seC = sd(control.map(p => p[outcome])) / Math.sqrt(control.length);

    const effect = yT - yC;
    const se = Math.sqrt(seT ** 2 + seC ** 2);

    studyEstimates.push({ study, effect, se, vi: se ** 2, nT: treated.length, nC: control.length });
  }

  if (studyEstimates.length === 0) {
    return { error: 'No valid study estimates could be computed', valid: false };
  }

  // Pool study estimates
  const yi = studyEstimates.map(s => s.effect);
  const vi = studyEstimates.map(s => s.vi);
  const w = vi.map(v => 1 / v);
  const sumW = sum(w);

  const thetaFE2 = sum(yi.map((y, i) => y * w[i])) / sumW;
  const Q = sum(yi.map((y, i) => w[i] * (y - thetaFE2) ** 2));
  const C = sumW - sum(w.map(wi => wi * wi)) / sumW;
  const tau2 = Math.max(0, (Q - (yi.length - 1)) / C);

  const wRE = vi.map(v => 1 / (v + tau2));
  const sumWRE = sum(wRE);
  const thetaRE2 = sum(yi.map((y, i) => y * wRE[i])) / sumWRE;
  const seRE2 = Math.sqrt(1 / sumWRE);

  // One-Stage: simplified mixed model
  const n = ipdData.length;
  const oneStageResult = fitOneStageModel(ipdData, outcome, treatment, studyId);

  // Compare
  const difference = oneStageResult.effect - thetaRE2;
  const seDiff = Math.sqrt(oneStageResult.se ** 2 + seRE2 ** 2);

  return {
    twoStage: {
      effect: thetaRE2,
      se: seRE2,
      ci_lower: thetaRE2 - 1.96 * seRE2,
      ci_upper: thetaRE2 + 1.96 * seRE2,
      tau2,
      kStudies: studyEstimates.length
    },
    oneStage: {
      effect: oneStageResult.effect,
      se: oneStageResult.se,
      ci_lower: oneStageResult.effect - 1.96 * oneStageResult.se,
      ci_upper: oneStageResult.effect + 1.96 * oneStageResult.se,
      nPatients: n
    },
    comparison: {
      difference,
      relativeDiff: thetaRE2 !== 0 ? difference / Math.abs(thetaRE2) * 100 : null,
      consistent: Math.abs(difference) < 2 * seDiff
    },
    recommendation: Math.abs(difference) < 0.1 * Math.abs(thetaRE2) ?
      'Methods give similar results; two-stage is simpler' :
      'Methods differ; investigate potential aggregation bias',
    method: 'One-Stage vs Two-Stage Comparison',
    reference: 'Burke et al. (2017) Res Synth Methods. https://doi.org/10.1002/jrsm.1224'
  };
}

function fitOneStageModel(data, outcome, treatment, studyId) {
  const studies = [...new Set(data.map(p => p[studyId]))];

  let sumNum = 0, sumDenom = 0;

  for (const study of studies) {
    const studyData = data.filter(p => p[studyId] === study);
    const treated = studyData.filter(p => p[treatment] === 1);
    const control = studyData.filter(p => p[treatment] === 0);

    if (treated.length === 0 || control.length === 0) continue;

    const effect = mean(treated.map(p => p[outcome])) - mean(control.map(p => p[outcome]));
    const weight = Math.sqrt(treated.length * control.length);

    sumNum += effect * weight;
    sumDenom += weight;
  }

  const effect = sumDenom > 0 ? sumNum / sumDenom : 0;
  const se = Math.sqrt(variance(data.map(p => p[outcome]))) / Math.sqrt(data.length);

  return { effect, se };
}

// ============================================================================
// 29. TIME-VARYING TREATMENT EFFECTS
// ============================================================================

/**
 * Time-Varying Treatment Effect Meta-Analysis
 * Models how treatment effects change over follow-up time.
 *
 * R AVAILABILITY: metafor with time as moderator; dosresmeta for curves
 * OUR CONTRIBUTION: JavaScript implementation with spline modeling
 *
 * @reference Simmonds, M. C., et al. (2005). Meta-analysis of individual patient
 *   data from randomized trials: a review of methods used in practice.
 *   Clinical Trials, 2(3), 209-217.
 *   https://doi.org/10.1191/1740774505cn087oa
 *
 * @reference Ioannidis, J. P., & Lau, J. (2001). Evolution of treatment effects
 *   over time: empirical insight from recursive cumulative metaanalyses.
 *   PNAS, 98(3), 831-836.
 *   https://doi.org/10.1073/pnas.98.3.831
 *
 * @param {Array} studies - Array of {yi, vi, time} objects
 * @param {Object} options - {timeModel, knots}
 * @returns {Object} Time-varying effect analysis results
 */
export function timeVaryingEffectMA(studies, options = {}) {
  const validation = validateStudies(studies, ['yi', 'vi', 'time']);
  if (!validation.valid) {
    return { error: validation.error, valid: false };
  }

  const { timeModel = 'linear', knots = [6, 12, 24] } = options;

  const yi = studies.map(s => s.yi);
  const vi = studies.map(s => s.vi);
  const time = studies.map(s => s.time);
  const k = studies.length;

  // Build time design matrix
  let X;
  if (timeModel === 'linear') {
    X = time.map(t => [1, t]);
  } else if (timeModel === 'quadratic') {
    X = time.map(t => [1, t, t * t]);
  } else if (timeModel === 'spline') {
    X = time.map(t => {
      const row = [1, t];
      for (const knot of knots) {
        row.push(Math.max(0, t - knot));
      }
      return row;
    });
  } else {
    X = time.map(t => [1, t]);
  }

  const w = vi.map(v => 1 / v);
  const beta = weightedLeastSquares(X, yi, w);

  // Predict effects at different time points
  const maxTime = Math.max(...time);
  const predictTimes = [0, 3, 6, 12, 24, 36, 48, 60].filter(t => t <= maxTime);
  const predictions = predictTimes.map(t => {
    let x;
    if (timeModel === 'linear') x = [1, t];
    else if (timeModel === 'quadratic') x = [1, t, t * t];
    else x = [1, t, ...knots.map(k => Math.max(0, t - k))];

    const pred = sum(x.map((xi, j) => xi * beta[j]));
    return { time: t, effect: pred };
  });

  // Test for time-varying effect
  const XtWX = matMul(matTranspose(X), matDiag(w), X);
  const XtWXInv = invertMatrix(XtWX);
  const residuals = yi.map((y, i) => y - sum(X[i].map((x, j) => x * beta[j])));
  const sigmaHat = Math.sqrt(sum(residuals.map((r, i) => w[i] * r * r)) / (k - X[0].length));

  const seBeta = beta.map((_, j) => sigmaHat * Math.sqrt(Math.max(0, XtWXInv[j][j])));
  const tStats = beta.map((b, j) => seBeta[j] > 0 ? b / seBeta[j] : 0);
  const pValues = tStats.map(t => 2 * (1 - normalCDF(Math.abs(t))));

  const immediateEffect = beta[0];
  const timeSlope = beta[1];

  return {
    coefficients: beta,
    se: seBeta,
    pValues,
    predictions,
    immediateEffect,
    timeSlope,
    timeVaryingEvidence: pValues[1] < 0.05,
    halfLife: timeSlope < 0 && immediateEffect !== 0 ?
      -Math.log(2) * immediateEffect / timeSlope : null,
    interpretation: pValues[1] < 0.05 ?
      (timeSlope > 0 ? 'Effect increases over time' : 'Effect diminishes over time') :
      'No significant change in effect over time',
    method: 'Time-Varying Effect MA',
    reference: 'Ioannidis & Lau (2001) PNAS. https://doi.org/10.1073/pnas.98.3.831'
  };
}

// ============================================================================
// 30. RECURRENT EVENTS META-ANALYSIS
// ============================================================================

/**
 * Recurrent Events Meta-Analysis
 * For outcomes that can occur multiple times per patient (e.g., exacerbations).
 *
 * R AVAILABILITY: metafor can handle rate ratios; specialized packages exist
 * OUR CONTRIBUTION: JavaScript implementation with overdispersion handling
 *
 * @reference Rothman, K. J., Greenland, S., & Lash, T. L. (2008). Modern
 *   Epidemiology (3rd ed.). Lippincott Williams & Wilkins. Chapter 16.
 *
 * @reference Keene, O. N., et al. (2007). Statistical analysis of exacerbation
 *   rates in COPD: TRISTAN and ISOLDE revisited.
 *   European Respiratory Journal, 30(5), 898-906.
 *   https://doi.org/10.1183/09031936.00036307
 *
 * @param {Array} studies - Array of {events_t, personyears_t, events_c, personyears_c}
 * @param {Object} options - {model}
 * @returns {Object} Recurrent events MA results
 */
export function recurrentEventsMA(studies, options = {}) {
  const requiredFields = ['events_t', 'personyears_t', 'events_c', 'personyears_c'];
  for (const study of studies) {
    for (const field of requiredFields) {
      if (study[field] === undefined || study[field] === null) {
        return { error: `Missing required field: ${field}`, valid: false };
      }
    }
  }

  const { model = 'negative_binomial' } = options;

  const effects = studies.map(s => {
    const rateT = s.events_t / s.personyears_t;
    const rateC = s.events_c / s.personyears_c;

    // Rate ratio (log scale)
    const logRR = Math.log(rateT / rateC);

    // Variance (assuming Poisson)
    const viPoisson = 1 / s.events_t + 1 / s.events_c;

    // Variance with overdispersion
    const overdispersion = s.overdispersion || 1.5;
    const viNB = viPoisson * overdispersion;

    return {
      ...s,
      rateT,
      rateC,
      logRR,
      viPoisson,
      viNB,
      vi: model === 'negative_binomial' ? viNB : viPoisson
    };
  });

  const yi = effects.map(e => e.logRR);
  const vi = effects.map(e => e.vi);
  const k = effects.length;

  const w = vi.map(v => 1 / v);
  const sumW = sum(w);
  const thetaFE = sum(yi.map((y, i) => y * w[i])) / sumW;

  const Q = sum(yi.map((y, i) => w[i] * (y - thetaFE) ** 2));
  const C = sumW - sum(w.map(wi => wi * wi)) / sumW;
  const tau2 = Math.max(0, (Q - (k - 1)) / C);

  const wRE = vi.map(v => 1 / (v + tau2));
  const sumWRE = sum(wRE);
  const thetaRE = sum(yi.map((y, i) => y * wRE[i])) / sumWRE;
  const seRE = Math.sqrt(1 / sumWRE);

  // Rate difference
  const avgRateC = mean(effects.map(e => e.rateC));
  const avgRateT = avgRateC * Math.exp(thetaRE);
  const rateReduction = avgRateC - avgRateT;

  return {
    logRateRatio: thetaRE,
    rateRatio: Math.exp(thetaRE),
    se: seRE,
    ci_lower: Math.exp(thetaRE - 1.96 * seRE),
    ci_upper: Math.exp(thetaRE + 1.96 * seRE),
    absoluteEffect: {
      controlRate: avgRateC,
      treatmentRate: avgRateT,
      rateReduction,
      NNT: rateReduction !== 0 ? 1 / rateReduction : null
    },
    heterogeneity: {
      Q,
      df: k - 1,
      p: 1 - chiSquaredCDF(Q, k - 1),
      tau2,
      I2: Q > k - 1 ? (Q - (k - 1)) / Q * 100 : 0
    },
    studyEffects: effects.map(e => ({
      study: e.label,
      rateRatio: Math.exp(e.logRR),
      events_t: e.events_t,
      events_c: e.events_c
    })),
    model,
    method: 'Recurrent Events MA',
    reference: 'Keene et al. (2007) Eur Respir J. https://doi.org/10.1183/09031936.00036307'
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

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

function matMul(A, B, C) {
  if (!C) {
    return A.map((row, i) => B[0].map((_, j) => sum(row.map((_, k) => A[i][k] * B[k][j]))));
  }
  const AB = A.map((row, i) => row.map((val, j) => val * B[j]));
  return matMul(AB, C);
}

function matTranspose(A) { return A[0].map((_, j) => A.map(row => row[j])); }
function matDiag(d) { return d.map((v, i) => d.map((_, j) => i === j ? v : 0)); }

function invertMatrix(A) {
  const n = A.length;
  const result = A.map((row, i) => row.map((_, j) => i === j ? 1 : 0));
  const M = A.map(row => [...row]);

  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(M[k][i]) > Math.abs(M[maxRow][i])) maxRow = k;
    }
    [M[i], M[maxRow]] = [M[maxRow], M[i]];
    [result[i], result[maxRow]] = [result[maxRow], result[i]];

    if (Math.abs(M[i][i]) < 1e-10) continue;

    const pivot = M[i][i];
    for (let j = 0; j < n; j++) { M[i][j] /= pivot; result[i][j] /= pivot; }

    for (let k = 0; k < n; k++) {
      if (k !== i) {
        const c = M[k][i];
        for (let j = 0; j < n; j++) { M[k][j] -= c * M[i][j]; result[k][j] -= c * result[i][j]; }
      }
    }
  }

  return result;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  nmaThresholdAnalysis,
  matchingAdjustedIC,
  simulatedTreatmentComparison,
  unanchoredIndirectComparison,
  heterogeneityPartitioning,
  heterogeneityLocalization,
  crossClassifiedMA,
  oneVsTwoStageComparison,
  timeVaryingEffectMA,
  recurrentEventsMA
};
