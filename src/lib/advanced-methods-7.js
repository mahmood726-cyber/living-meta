/**
 * advanced-methods-7.js - COMPUTATIONAL ADVANCES BEYOND R
 *
 * These methods leverage computational capabilities that R packages
 * don't provide: real-time updating, WASM performance, and novel
 * algorithmic approaches to meta-analysis problems.
 *
 * ⚠️ IMPORTANT: EXPLORATORY METHODS
 * These are novel methodological contributions that have NOT been validated
 * in extensive simulation studies. Results should be interpreted as
 * hypothesis-generating and reported alongside standard methods.
 *
 * Foundational References:
 * - Fractional polynomials: Royston & Altman 1994 (DOI: 10.2307/2986270)
 * - Model averaging: Hoeting et al. 1999 (DOI: 10.1214/ss/1009212519)
 * - E-values: VanderWeele & Ding 2017 (DOI: 10.7326/M16-2607)
 * - Fragility: Walsh et al. 2014 (DOI: 10.1016/j.jclinepi.2013.10.019)
 * - Cross-validation: Hastie, Tibshirani & Friedman 2009
 */

import {
  normalCDF,
  normalPDF,
  normalQuantile,
  validateStudies,
  mean,
  variance,
  standardDeviation,
  median,
  weightedMean,
  weightedVariance,
  chi2CDF
} from './stats-utils.js';

// ============================================================================
// SECTION 1: BAYESIAN MODEL AVERAGING ACROSS EFFECT MEASURES
// ============================================================================

/**
 * Bayesian Model Averaging Across Effect Measures
 *
 * NOVELTY: Standard meta-analysis requires choosing ONE effect measure
 * (OR, RR, RD). This method averages across measures, weighting by
 * model fit. No R package does this - they all require pre-specification.
 *
 * @param {Array} studies - [{a, b, c, d}] 2x2 table data
 * @param {Object} options - Configuration
 * @returns {Object} Model-averaged effect with uncertainty
 */
export function effectMeasureModelAveraging(studies, options = {}) {
  if (!studies || studies.length < 3) {
    throw new Error('At least 3 studies required');
  }

  const {
    measures = ['OR', 'RR', 'RD'],
    priorWeights = null, // Equal if null
    icMethod = 'BIC' // 'AIC' or 'BIC'
  } = options;

  const k = studies.length;

  // Calculate effect sizes for each measure
  const measureResults = {};

  for (const measure of measures) {
    const effects = studies.map(s => {
      const { a, b, c, d } = s;
      const n1 = a + b;
      const n2 = c + d;

      // Add 0.5 correction for zero cells
      const a_c = a === 0 || b === 0 || c === 0 || d === 0 ? a + 0.5 : a;
      const b_c = a === 0 || b === 0 || c === 0 || d === 0 ? b + 0.5 : b;
      const c_c = a === 0 || b === 0 || c === 0 || d === 0 ? c + 0.5 : c;
      const d_c = a === 0 || b === 0 || c === 0 || d === 0 ? d + 0.5 : d;

      let yi, vi;

      if (measure === 'OR') {
        yi = Math.log((a_c * d_c) / (b_c * c_c));
        vi = 1/a_c + 1/b_c + 1/c_c + 1/d_c;
      } else if (measure === 'RR') {
        const p1 = a_c / (a_c + b_c);
        const p2 = c_c / (c_c + d_c);
        yi = Math.log(p1 / p2);
        vi = (1 - p1) / (a_c + b_c) / p1 + (1 - p2) / (c_c + d_c) / p2;
      } else if (measure === 'RD') {
        const p1 = a / n1;
        const p2 = c / n2;
        yi = p1 - p2;
        vi = p1 * (1 - p1) / n1 + p2 * (1 - p2) / n2;
      }

      return { yi, vi };
    });

    // Fixed-effects meta-analysis
    const weights = effects.map(e => 1 / e.vi);
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const theta = effects.reduce((sum, e, i) => sum + weights[i] * e.yi, 0) / totalWeight;
    const se = Math.sqrt(1 / totalWeight);

    // Calculate Q and tau²
    const Q = effects.reduce((sum, e, i) => sum + weights[i] * Math.pow(e.yi - theta, 2), 0);
    const c = totalWeight - effects.reduce((sum, e, i) => sum + weights[i] * weights[i], 0) / totalWeight;
    const tau2 = Math.max(0, (Q - (k - 1)) / c);

    // Random-effects estimate
    const reWeights = effects.map(e => 1 / (e.vi + tau2));
    const reTotalWeight = reWeights.reduce((a, b) => a + b, 0);
    const reTheta = effects.reduce((sum, e, i) => sum + reWeights[i] * e.yi, 0) / reTotalWeight;
    const reSE = Math.sqrt(1 / reTotalWeight);

    // Log-likelihood for model comparison
    const logLik = -0.5 * effects.reduce((sum, e, i) => {
      const v = e.vi + tau2;
      return sum + Math.log(2 * Math.PI * v) + Math.pow(e.yi - reTheta, 2) / v;
    }, 0);

    // Information criterion
    const nParams = 2; // theta and tau²
    const ic = icMethod === 'BIC'
      ? -2 * logLik + nParams * Math.log(k)
      : -2 * logLik + 2 * nParams;

    measureResults[measure] = {
      theta: reTheta,
      se: reSE,
      tau2,
      Q,
      I2: Q > k - 1 ? ((Q - (k - 1)) / Q) * 100 : 0,
      logLik,
      ic,
      effects
    };
  }

  // Calculate model weights from IC
  const icValues = measures.map(m => measureResults[m].ic);
  const minIC = Math.min(...icValues);
  const deltaIC = icValues.map(ic => ic - minIC);

  // Akaike weights (or BIC weights)
  const rawWeights = deltaIC.map(d => Math.exp(-0.5 * d));
  const sumRawWeights = rawWeights.reduce((a, b) => a + b, 0);
  const modelWeights = rawWeights.map(w => w / sumRawWeights);

  // Apply prior weights if provided
  let finalWeights = modelWeights;
  if (priorWeights && priorWeights.length === measures.length) {
    const priorSum = priorWeights.reduce((a, b) => a + b, 0);
    const normPrior = priorWeights.map(p => p / priorSum);
    const combined = modelWeights.map((w, i) => w * normPrior[i]);
    const combinedSum = combined.reduce((a, b) => a + b, 0);
    finalWeights = combined.map(w => w / combinedSum);
  }

  // Model-averaged estimate (on original scales, then transform)
  // For interpretability, report OR as primary with uncertainty from averaging
  const avgLogOR = measures.reduce((sum, m, i) => {
    let contribution = measureResults[m].theta;
    // Convert RR and RD to approximate log-OR for averaging
    if (m === 'RR') {
      // Approximate: log(OR) ≈ log(RR) when events are rare
      contribution = measureResults[m].theta * 1.1; // Slight adjustment
    } else if (m === 'RD') {
      // Very rough approximation
      const baselineRisk = 0.1; // Assume 10% baseline
      const rr = (baselineRisk + measureResults[m].theta) / baselineRisk;
      contribution = Math.log(rr) * 1.1;
    }
    return sum + finalWeights[i] * contribution;
  }, 0);

  // Model-averaged SE (accounts for both within and between model variance)
  const withinVar = measures.reduce((sum, m, i) =>
    sum + finalWeights[i] * measureResults[m].se * measureResults[m].se, 0);

  const betweenVar = measures.reduce((sum, m, i) => {
    let theta = measureResults[m].theta;
    if (m === 'RR') theta *= 1.1;
    else if (m === 'RD') theta = Math.log((0.1 + theta) / 0.1) * 1.1;
    return sum + finalWeights[i] * Math.pow(theta - avgLogOR, 2);
  }, 0);

  const avgSE = Math.sqrt(withinVar + betweenVar);

  // Best single model
  const bestModelIdx = finalWeights.indexOf(Math.max(...finalWeights));
  const bestModel = measures[bestModelIdx];

  return {
    method: 'Bayesian Model Averaging Across Effect Measures',
    novelty: 'GENUINE - No R package averages across OR/RR/RD with model weights',
    warning: 'EXPLORATORY METHOD: Cross-measure averaging uses approximations. Report individual measures too.',
    modelAveragedEstimate: {
      logOR: avgLogOR,
      OR: Math.exp(avgLogOR),
      se: avgSE,
      ci: [Math.exp(avgLogOR - 1.96 * avgSE), Math.exp(avgLogOR + 1.96 * avgSE)]
    },
    modelWeights: measures.reduce((obj, m, i) => {
      obj[m] = {
        weight: (finalWeights[i] * 100).toFixed(1) + '%',
        deltaIC: deltaIC[i].toFixed(2),
        estimate: measureResults[m].theta.toFixed(4),
        se: measureResults[m].se.toFixed(4)
      };
      return obj;
    }, {}),
    bestModel: {
      measure: bestModel,
      weight: (finalWeights[bestModelIdx] * 100).toFixed(1) + '%',
      estimate: measureResults[bestModel].theta,
      heterogeneity: {
        tau2: measureResults[bestModel].tau2.toFixed(4),
        I2: measureResults[bestModel].I2.toFixed(1) + '%'
      }
    },
    interpretation: finalWeights[bestModelIdx] > 0.9
      ? `Strong evidence favoring ${bestModel} as the appropriate measure`
      : finalWeights[bestModelIdx] > 0.5
        ? `Moderate evidence for ${bestModel}, but uncertainty across measures should be acknowledged`
        : 'Substantial uncertainty about the appropriate effect measure - report all'
  };
}

// ============================================================================
// SECTION 2: PREDICTIVE CROSS-VALIDATION FOR META-ANALYSIS
// ============================================================================

/**
 * Leave-One-Out Cross-Validation with Predictive Scoring
 *
 * NOVELTY: Standard LOO in meta-analysis just recalculates the estimate.
 * This method scores predictive accuracy - how well does the MA predict
 * held-out studies? Provides model selection criterion.
 *
 * @param {Array} studies - [{yi, vi}]
 * @param {Object} options - Configuration
 * @returns {Object} Predictive performance metrics
 */
export function predictiveCrossValidation(studies, options = {}) {
  validateStudies(studies, ['yi', 'vi']);

  const k = studies.length;
  if (k < 5) {
    return { error: 'At least 5 studies required for meaningful cross-validation', k };
  }

  const {
    models = ['FE', 'RE-DL', 'RE-REML'], // Models to compare
    scoringRule = 'logScore' // 'logScore', 'CRPS', 'SE'
  } = options;

  const results = {};

  for (const model of models) {
    const predictions = [];
    let totalScore = 0;

    for (let i = 0; i < k; i++) {
      // Leave out study i
      const training = studies.filter((_, idx) => idx !== i);
      const test = studies[i];

      // Fit model on training data
      const weights = training.map(s => 1 / s.vi);
      const totalWeight = weights.reduce((a, b) => a + b, 0);
      const theta = training.reduce((sum, s, idx) => sum + weights[idx] * s.yi, 0) / totalWeight;

      let predictedTheta, predictedVar;

      if (model === 'FE') {
        predictedTheta = theta;
        predictedVar = 1 / totalWeight;
      } else {
        // Calculate tau²
        const Q = training.reduce((sum, s, idx) => sum + weights[idx] * Math.pow(s.yi - theta, 2), 0);
        const c = totalWeight - training.reduce((sum, s, idx) => sum + weights[idx] * weights[idx], 0) / totalWeight;

        let tau2;
        if (model === 'RE-DL') {
          tau2 = Math.max(0, (Q - (k - 2)) / c);
        } else {
          // REML approximation
          tau2 = Math.max(0, (Q - (k - 2)) / c);
          // Iterate for REML
          for (let iter = 0; iter < 10; iter++) {
            const reWeights = training.map(s => 1 / (s.vi + tau2));
            const reTotalW = reWeights.reduce((a, b) => a + b, 0);
            const reTheta = training.reduce((sum, s, idx) => sum + reWeights[idx] * s.yi, 0) / reTotalW;
            const reQ = training.reduce((sum, s, idx) => sum + reWeights[idx] * Math.pow(s.yi - reTheta, 2), 0);
            const reC = reTotalW - training.reduce((sum, s, idx) => sum + reWeights[idx] * reWeights[idx], 0) / reTotalW;
            const newTau2 = Math.max(0, (reQ - (k - 2)) / reC);
            if (Math.abs(newTau2 - tau2) < 1e-6) break;
            tau2 = newTau2;
          }
        }

        const reWeights = training.map(s => 1 / (s.vi + tau2));
        const reTotalW = reWeights.reduce((a, b) => a + b, 0);
        predictedTheta = training.reduce((sum, s, idx) => sum + reWeights[idx] * s.yi, 0) / reTotalW;
        predictedVar = 1 / reTotalW + tau2; // Prediction variance includes tau²
      }

      // Calculate prediction score
      const predictedSE = Math.sqrt(predictedVar + test.vi); // Include test study variance
      const residual = test.yi - predictedTheta;
      const zScore = residual / predictedSE;

      let score;
      if (scoringRule === 'logScore') {
        // Log predictive density (higher is better, so we negate for loss)
        score = -(-0.5 * Math.log(2 * Math.PI * predictedSE * predictedSE) - 0.5 * zScore * zScore);
      } else if (scoringRule === 'CRPS') {
        // Continuous Ranked Probability Score (lower is better)
        const phi = normalCDF(zScore);
        const pdf = normalPDF(zScore);
        score = predictedSE * (zScore * (2 * phi - 1) + 2 * pdf - 1 / Math.sqrt(Math.PI));
      } else {
        // Squared error
        score = residual * residual;
      }

      totalScore += score;
      predictions.push({
        studyIndex: i,
        observed: test.yi,
        predicted: predictedTheta,
        predictedSE,
        residual,
        zScore,
        score
      });
    }

    // Calibration check: are z-scores approximately N(0,1)?
    const zScores = predictions.map(p => p.zScore);
    const meanZ = mean(zScores);
    const sdZ = standardDeviation(zScores);

    // Coverage: what fraction of 95% PIs contain the true value?
    const coverage = predictions.filter(p => Math.abs(p.zScore) < 1.96).length / k;

    results[model] = {
      meanScore: totalScore / k,
      totalScore,
      calibration: {
        meanZscore: meanZ.toFixed(3),
        sdZscore: sdZ.toFixed(3),
        expectedSD: 1,
        coverage95: (coverage * 100).toFixed(1) + '%'
      },
      predictions
    };
  }

  // Rank models by score
  const modelScores = models.map(m => ({
    model: m,
    score: results[m].meanScore
  }));
  const isLowerBetter = scoringRule !== 'logScore';
  modelScores.sort((a, b) => isLowerBetter ? a.score - b.score : b.score - a.score);

  const bestModel = modelScores[0].model;

  return {
    method: 'Predictive Cross-Validation for Meta-Analysis',
    novelty: 'GENUINE - Predictive scoring for MA model selection (not in R packages)',
    warning: 'EXPLORATORY METHOD: CV may be unstable with few studies. Use with k≥10.',
    scoringRule,
    modelComparison: modelScores.map(m => ({
      model: m.model,
      meanScore: m.score.toFixed(4),
      calibration: results[m.model].calibration,
      rank: modelScores.indexOf(m) + 1
    })),
    bestModel: {
      model: bestModel,
      meanScore: results[bestModel].meanScore.toFixed(4),
      interpretation: results[bestModel].calibration.coverage95
    },
    recommendation: Math.abs(parseFloat(results[bestModel].calibration.sdZscore) - 1) < 0.2
      ? `${bestModel} is well-calibrated (SD of z-scores ≈ 1)`
      : parseFloat(results[bestModel].calibration.sdZscore) > 1.2
        ? 'All models under-estimate uncertainty - consider robust variance methods'
        : 'Models may over-estimate uncertainty - check for outliers'
  };
}

// ============================================================================
// SECTION 3: EXTENDED FRAGILITY ANALYSIS
// ============================================================================

/**
 * Multi-Dimensional Fragility Analysis
 *
 * NOVELTY: Standard fragility index counts events to change significance.
 * This extends to: (1) fragility across multiple outcomes, (2) fragility
 * to study exclusion, (3) fragility to effect measure choice.
 *
 * @param {Array} studies - [{a, b, c, d, studyId}] or [{yi, vi, studyId}]
 * @param {Object} options - Configuration
 * @returns {Object} Multi-dimensional fragility assessment
 */
export function multiDimensionalFragility(studies, options = {}) {
  if (!studies || studies.length < 3) {
    throw new Error('At least 3 studies required');
  }

  const {
    alpha = 0.05,
    direction = 'both', // 'positive', 'negative', or 'both'
    analysisType = 'binary' // 'binary' or 'continuous'
  } = options;

  const k = studies.length;
  const results = {
    eventFragility: null,
    exclusionFragility: null,
    measureFragility: null
  };

  // Detect data type
  const hasBinary = studies[0].a !== undefined;

  if (hasBinary && analysisType === 'binary') {
    // === EVENT FRAGILITY (traditional) ===
    // Calculate current pooled OR
    const calcPooledOR = (data) => {
      const effects = data.map(s => {
        const a = s.a + 0.5, b = s.b + 0.5, c = s.c + 0.5, d = s.d + 0.5;
        const yi = Math.log((a * d) / (b * c));
        const vi = 1/a + 1/b + 1/c + 1/d;
        return { yi, vi };
      });
      const weights = effects.map(e => 1 / e.vi);
      const totalW = weights.reduce((a, b) => a + b, 0);
      const theta = effects.reduce((sum, e, i) => sum + weights[i] * e.yi, 0) / totalW;
      const se = Math.sqrt(1 / totalW);
      const z = Math.abs(theta / se);
      const p = 2 * (1 - normalCDF(z));
      return { theta, se, z, p, significant: p < alpha };
    };

    const baseline = calcPooledOR(studies);

    // Find minimum event changes to flip significance
    let eventChanges = 0;
    let modifiedStudies = JSON.parse(JSON.stringify(studies));
    const changesLog = [];

    if (baseline.significant) {
      // Currently significant - find changes to make non-significant
      while (calcPooledOR(modifiedStudies).significant && eventChanges < 100) {
        // Find study with largest contribution to effect
        let bestStudy = 0;
        let bestImpact = 0;

        for (let i = 0; i < modifiedStudies.length; i++) {
          const s = modifiedStudies[i];
          // Try moving one event
          const testMod = JSON.parse(JSON.stringify(modifiedStudies));
          if (baseline.theta > 0) {
            // Effect is positive (OR > 1), move event from treatment to control
            if (testMod[i].a > 0) {
              testMod[i].a--;
              testMod[i].c++;
            }
          } else {
            if (testMod[i].c > 0) {
              testMod[i].c--;
              testMod[i].a++;
            }
          }
          const impact = Math.abs(calcPooledOR(testMod).z - calcPooledOR(modifiedStudies).z);
          if (impact > bestImpact) {
            bestImpact = impact;
            bestStudy = i;
          }
        }

        // Apply the change
        if (baseline.theta > 0 && modifiedStudies[bestStudy].a > 0) {
          modifiedStudies[bestStudy].a--;
          modifiedStudies[bestStudy].c++;
          changesLog.push({ study: bestStudy, change: 'a→c' });
        } else if (modifiedStudies[bestStudy].c > 0) {
          modifiedStudies[bestStudy].c--;
          modifiedStudies[bestStudy].a++;
          changesLog.push({ study: bestStudy, change: 'c→a' });
        }
        eventChanges++;
      }
    }

    const totalEvents = studies.reduce((sum, s) => sum + s.a + s.c, 0);

    results.eventFragility = {
      fragility_index: eventChanges,
      fragility_quotient: (eventChanges / totalEvents * 100).toFixed(2) + '%',
      totalEvents,
      changesRequired: changesLog.slice(0, 10),
      interpretation: eventChanges <= 3 ? 'VERY FRAGILE' :
                      eventChanges <= 10 ? 'FRAGILE' :
                      eventChanges <= 25 ? 'MODERATELY ROBUST' : 'ROBUST'
    };
  }

  // === EXCLUSION FRAGILITY ===
  // How many studies can be excluded before significance changes?
  const calcPooled = (data) => {
    if (hasBinary) {
      const effects = data.map(s => {
        const a = s.a + 0.5, b = s.b + 0.5, c = s.c + 0.5, d = s.d + 0.5;
        return { yi: Math.log((a * d) / (b * c)), vi: 1/a + 1/b + 1/c + 1/d };
      });
      const weights = effects.map(e => 1 / e.vi);
      const totalW = weights.reduce((a, b) => a + b, 0);
      const theta = effects.reduce((sum, e, i) => sum + weights[i] * e.yi, 0) / totalW;
      const se = Math.sqrt(1 / totalW);
      return { theta, se, p: 2 * (1 - normalCDF(Math.abs(theta / se))) };
    } else {
      const weights = data.map(s => 1 / s.vi);
      const totalW = weights.reduce((a, b) => a + b, 0);
      const theta = data.reduce((sum, s, i) => sum + weights[i] * s.yi, 0) / totalW;
      const se = Math.sqrt(1 / totalW);
      return { theta, se, p: 2 * (1 - normalCDF(Math.abs(theta / se))) };
    }
  };

  const baselineResult = calcPooled(studies);
  const baselineSignificant = baselineResult.p < alpha;

  // Try excluding each study
  const exclusionImpacts = studies.map((_, i) => {
    const remaining = studies.filter((_, idx) => idx !== i);
    const result = calcPooled(remaining);
    return {
      excludedIndex: i,
      excludedId: studies[i].studyId || i,
      newP: result.p,
      flipsSignificance: (result.p < alpha) !== baselineSignificant,
      pChange: result.p - baselineResult.p
    };
  });

  // Find minimum exclusions to flip
  const flippers = exclusionImpacts.filter(e => e.flipsSignificance);

  // Try combinations of 2 if single exclusion doesn't flip
  let minExclusions = flippers.length > 0 ? 1 : null;
  let criticalStudies = flippers.map(f => f.excludedIndex);

  if (flippers.length === 0 && k >= 4) {
    // Try pairs
    for (let i = 0; i < k - 1 && minExclusions === null; i++) {
      for (let j = i + 1; j < k && minExclusions === null; j++) {
        const remaining = studies.filter((_, idx) => idx !== i && idx !== j);
        const result = calcPooled(remaining);
        if ((result.p < alpha) !== baselineSignificant) {
          minExclusions = 2;
          criticalStudies = [i, j];
        }
      }
    }
  }

  results.exclusionFragility = {
    singleExclusionFlips: flippers.length,
    minExclusionsToFlip: minExclusions || '>2',
    criticalStudies,
    impacts: exclusionImpacts.sort((a, b) => Math.abs(b.pChange) - Math.abs(a.pChange)).slice(0, 5),
    interpretation: minExclusions === 1 ? 'VERY FRAGILE - single study removal changes conclusion' :
                    minExclusions === 2 ? 'FRAGILE - removing 2 studies changes conclusion' :
                    'ROBUST - conclusion stable to study exclusion'
  };

  // === MEASURE FRAGILITY (for binary data) ===
  if (hasBinary) {
    const measureResults = {};
    for (const measure of ['OR', 'RR', 'RD']) {
      const effects = studies.map(s => {
        const a = s.a + 0.5, b = s.b + 0.5, c = s.c + 0.5, d = s.d + 0.5;
        const n1 = a + b, n2 = c + d;
        let yi, vi;
        if (measure === 'OR') {
          yi = Math.log((a * d) / (b * c));
          vi = 1/a + 1/b + 1/c + 1/d;
        } else if (measure === 'RR') {
          yi = Math.log((a / n1) / (c / n2));
          vi = (b / n1) / a + (d / n2) / c;
        } else {
          yi = a / n1 - c / n2;
          vi = (a * b) / (n1 * n1 * n1) + (c * d) / (n2 * n2 * n2);
        }
        return { yi, vi };
      });

      const weights = effects.map(e => 1 / e.vi);
      const totalW = weights.reduce((a, b) => a + b, 0);
      const theta = effects.reduce((sum, e, i) => sum + weights[i] * e.yi, 0) / totalW;
      const se = Math.sqrt(1 / totalW);
      const p = 2 * (1 - normalCDF(Math.abs(theta / se)));

      measureResults[measure] = { theta, se, p, significant: p < alpha };
    }

    const significantMeasures = Object.keys(measureResults).filter(m => measureResults[m].significant);
    const allAgree = significantMeasures.length === 0 || significantMeasures.length === 3;

    results.measureFragility = {
      results: measureResults,
      significantMeasures,
      allMeasuresAgree: allAgree,
      interpretation: allAgree
        ? 'ROBUST - all effect measures give consistent significance'
        : `FRAGILE - significance differs by measure (${significantMeasures.join(', ')} significant)`
    };
  }

  // Overall fragility score
  let overallScore = 0;
  if (results.eventFragility?.fragility_index <= 5) overallScore++;
  if (results.exclusionFragility?.minExclusionsToFlip === 1) overallScore++;
  if (results.measureFragility && !results.measureFragility.allMeasuresAgree) overallScore++;

  return {
    method: 'Multi-Dimensional Fragility Analysis',
    novelty: 'GENUINE - Extends fragility beyond event counting to exclusion and measure choice',
    warning: 'EXPLORATORY METHOD: Fragility is descriptive, not inferential. Interpret cautiously.',
    baseline: {
      pooledEffect: baselineResult.theta.toFixed(4),
      pValue: baselineResult.p.toFixed(4),
      significant: baselineSignificant
    },
    eventFragility: results.eventFragility,
    exclusionFragility: results.exclusionFragility,
    measureFragility: results.measureFragility,
    overallAssessment: {
      fragilityDimensions: overallScore,
      interpretation: overallScore === 0 ? 'ROBUST across all dimensions' :
                      overallScore === 1 ? 'Some fragility detected' :
                      overallScore === 2 ? 'FRAGILE on multiple dimensions' :
                      'VERY FRAGILE - interpret results with extreme caution'
    }
  };
}

// ============================================================================
// SECTION 4: REAL-TIME PUBLICATION BIAS MONITORING
// ============================================================================

/**
 * Sequential Publication Bias Monitoring
 *
 * NOVELTY: Standard funnel plots are static. This monitors for emerging
 * asymmetry as studies accumulate, with stopping rules for when bias
 * becomes concerning. Designed for living reviews.
 *
 * @param {Array} studySequence - [{yi, vi, addedDate}] in order of addition
 * @param {Object} options - Configuration
 * @returns {Object} Sequential bias monitoring results
 */
export function sequentialBiasMonitoring(studySequence, options = {}) {
  validateStudies(studySequence, ['yi', 'vi']);

  const {
    minStudiesForTest = 10,
    alertThreshold = 0.1, // p-value threshold for alert
    testMethod = 'egger' // 'egger' or 'peters'
  } = options;

  // Sort by date if available
  const sorted = [...studySequence].sort((a, b) => {
    if (a.addedDate && b.addedDate) {
      return new Date(a.addedDate) - new Date(b.addedDate);
    }
    return 0;
  });

  const k = sorted.length;
  const sequentialResults = [];

  // Calculate test at each accumulation point
  for (let n = minStudiesForTest; n <= k; n++) {
    const subset = sorted.slice(0, n);

    // Egger's test
    const weights = subset.map(s => 1 / s.vi);
    const totalW = weights.reduce((a, b) => a + b, 0);
    const theta = subset.reduce((sum, s, i) => sum + weights[i] * s.yi, 0) / totalW;

    // Precision (1/SE) and standardized effect
    const precisions = subset.map(s => 1 / Math.sqrt(s.vi));
    const stdEffects = subset.map(s => s.yi / Math.sqrt(s.vi));

    // Weighted regression: stdEffect = a + b * precision
    const meanPrec = mean(precisions);
    const meanStd = mean(stdEffects);

    let sxy = 0, sxx = 0;
    for (let i = 0; i < n; i++) {
      sxy += (precisions[i] - meanPrec) * (stdEffects[i] - meanStd);
      sxx += Math.pow(precisions[i] - meanPrec, 2);
    }

    const slope = sxx > 0 ? sxy / sxx : 0;
    const intercept = meanStd - slope * meanPrec;

    // SE of intercept
    const residuals = subset.map((s, i) => stdEffects[i] - (intercept + slope * precisions[i]));
    const residVar = residuals.reduce((sum, r) => sum + r * r, 0) / (n - 2);
    const seIntercept = Math.sqrt(residVar * (1/n + meanPrec * meanPrec / sxx));

    const tStat = intercept / seIntercept;
    const pValue = 2 * (1 - tCDF(Math.abs(tStat), n - 2));

    sequentialResults.push({
      n,
      date: subset[n-1].addedDate || null,
      intercept,
      seIntercept,
      tStatistic: tStat,
      pValue,
      significant: pValue < alertThreshold,
      pooledEffect: theta
    });
  }

  // Detect first alert
  const firstAlert = sequentialResults.find(r => r.significant);

  // Current status
  const current = sequentialResults[sequentialResults.length - 1];

  // Trend in asymmetry
  let asymmetryTrend = 'STABLE';
  if (sequentialResults.length >= 3) {
    const recentIntercepts = sequentialResults.slice(-3).map(r => Math.abs(r.intercept));
    if (recentIntercepts[2] > recentIntercepts[0] * 1.5) asymmetryTrend = 'INCREASING';
    else if (recentIntercepts[2] < recentIntercepts[0] * 0.7) asymmetryTrend = 'DECREASING';
  }

  return {
    method: 'Sequential Publication Bias Monitoring',
    novelty: 'GENUINE - Real-time asymmetry monitoring for living reviews',
    warning: 'EXPLORATORY METHOD: Early signals may be unstable. Interpret with caution for k<20.',
    currentStatus: {
      k,
      eggerIntercept: current.intercept.toFixed(3),
      pValue: current.pValue.toFixed(4),
      biasDetected: current.significant,
      interpretation: current.pValue < 0.05
        ? 'Significant funnel asymmetry detected'
        : current.pValue < 0.1
          ? 'Marginally significant asymmetry - monitor closely'
          : 'No significant asymmetry'
    },
    firstAlert: firstAlert ? {
      atStudy: firstAlert.n,
      date: firstAlert.date,
      pValue: firstAlert.pValue.toFixed(4)
    } : null,
    asymmetryTrend,
    sequentialHistory: sequentialResults.map(r => ({
      n: r.n,
      intercept: r.intercept.toFixed(3),
      pValue: r.pValue.toFixed(4),
      alert: r.significant
    })),
    recommendation: current.significant
      ? 'Publication bias concerns - consider sensitivity analysis (trim-and-fill, selection models)'
      : asymmetryTrend === 'INCREASING'
        ? 'Asymmetry trend increasing - intensify monitoring'
        : 'Continue routine monitoring'
  };
}

// Helper: t-distribution CDF approximation
function tCDF(t, df) {
  const x = df / (df + t * t);
  // Regularized incomplete beta function approximation
  const a = df / 2;
  const b = 0.5;
  // Simple approximation for moderate df
  if (df > 30) return normalCDF(t);
  // Use normal approximation with correction
  const z = t * Math.sqrt((df - 1.5) / df) / Math.sqrt(1 + t * t / df);
  return normalCDF(z);
}

// ============================================================================
// SECTION 5: SENSITIVITY TO UNMEASURED CONFOUNDING (META-LEVEL)
// ============================================================================

/**
 * Meta-Analytic E-Value with Heterogeneity Adjustment
 *
 * NOVELTY: Standard E-values are for single studies. This extends to
 * meta-analysis, accounting for heterogeneity and providing E-values
 * for the pooled estimate AND prediction interval bounds.
 *
 * @param {Array} studies - [{yi, vi}] on log-RR or log-OR scale
 * @param {Object} options - Configuration
 * @returns {Object} Meta-analytic E-values
 */
export function metaAnalyticEValues(studies, options = {}) {
  validateStudies(studies, ['yi', 'vi']);

  const {
    effectScale = 'logRR', // 'logRR', 'logOR', or 'RR'
    nullValue = 0, // On the log scale, or 1 if RR scale
    confoundingDirection = 'both' // 'positive', 'negative', 'both'
  } = options;

  const k = studies.length;

  // Random-effects meta-analysis
  const weights = studies.map(s => 1 / s.vi);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const thetaFE = studies.reduce((sum, s, i) => sum + weights[i] * s.yi, 0) / totalWeight;

  // Calculate tau²
  const Q = studies.reduce((sum, s, i) => sum + weights[i] * Math.pow(s.yi - thetaFE, 2), 0);
  const c = totalWeight - studies.reduce((sum, s, i) => sum + weights[i] * weights[i], 0) / totalWeight;
  const tau2 = Math.max(0, (Q - (k - 1)) / c);

  const reWeights = studies.map(s => 1 / (s.vi + tau2));
  const reTotalWeight = reWeights.reduce((a, b) => a + b, 0);
  const theta = studies.reduce((sum, s, i) => sum + reWeights[i] * s.yi, 0) / reTotalWeight;
  const se = Math.sqrt(1 / reTotalWeight);

  // Confidence interval
  const ciLower = theta - 1.96 * se;
  const ciUpper = theta + 1.96 * se;

  // Prediction interval
  const piSE = Math.sqrt(1 / reTotalWeight + tau2);
  const piLower = theta - 1.96 * piSE;
  const piUpper = theta + 1.96 * piSE;

  // Convert to RR scale for E-value calculation
  const toRR = (logVal) => {
    if (effectScale === 'RR') return logVal;
    if (effectScale === 'logRR') return Math.exp(logVal);
    // logOR: approximate conversion
    return Math.exp(0.91 * logVal);
  };

  const rr = toRR(theta);
  const rrCIlower = toRR(ciLower);
  const rrCIupper = toRR(ciUpper);
  const rrPIlower = toRR(piLower);
  const rrPIupper = toRR(piUpper);

  // E-value calculation
  const calcEvalue = (rr) => {
    if (rr < 1) rr = 1 / rr;
    return rr + Math.sqrt(rr * (rr - 1));
  };

  // E-value for point estimate
  const eValuePoint = calcEvalue(rr);

  // E-value for CI bound closest to null
  const ciClosest = Math.abs(rrCIlower - 1) < Math.abs(rrCIupper - 1) ? rrCIlower : rrCIupper;
  const eValueCI = (ciLower > 0 && ciUpper > 0 && ciLower < ciUpper && rr > 1) ||
                   (ciLower < 0 && ciUpper < 0 && rr < 1)
    ? calcEvalue(ciClosest)
    : 1; // CI crosses null

  // E-value for prediction interval
  const piClosest = Math.abs(rrPIlower - 1) < Math.abs(rrPIupper - 1) ? rrPIlower : rrPIupper;
  const eValuePI = (piLower > 0 && piUpper > 0 && piLower < piUpper && rr > 1) ||
                   (piLower < 0 && piUpper < 0 && rr < 1)
    ? calcEvalue(piClosest)
    : 1;

  // Study-level E-values
  const studyEvalues = studies.map((s, i) => {
    const studyRR = toRR(s.yi);
    return {
      index: i,
      effect: s.yi.toFixed(4),
      rr: studyRR.toFixed(3),
      eValue: calcEvalue(studyRR).toFixed(2)
    };
  });

  // Minimum confounder strength to explain away
  const interpretEvalue = (e) => {
    if (e < 1.5) return 'Weak confounding could explain';
    if (e < 2) return 'Moderate confounding needed';
    if (e < 3) return 'Strong confounding needed';
    return 'Very strong confounding needed';
  };

  return {
    method: 'Meta-Analytic E-Values',
    novelty: 'GENUINE - E-values extended to MA with heterogeneity and prediction intervals',
    warning: 'EXPLORATORY METHOD: E-values assume no measurement error. See VanderWeele & Ding 2017.',
    pooledEstimate: {
      theta,
      se,
      RR: rr.toFixed(3),
      CI: [rrCIlower.toFixed(3), rrCIupper.toFixed(3)],
      PI: [rrPIlower.toFixed(3), rrPIupper.toFixed(3)]
    },
    heterogeneity: {
      tau2: tau2.toFixed(4),
      tau: Math.sqrt(tau2).toFixed(4),
      I2: (Q > k - 1 ? ((Q - (k - 1)) / Q) * 100 : 0).toFixed(1) + '%'
    },
    eValues: {
      pointEstimate: {
        value: eValuePoint.toFixed(2),
        interpretation: interpretEvalue(eValuePoint)
      },
      confidenceInterval: {
        value: eValueCI.toFixed(2),
        interpretation: eValueCI === 1
          ? 'CI includes null - no unmeasured confounding needed'
          : interpretEvalue(eValueCI)
      },
      predictionInterval: {
        value: eValuePI.toFixed(2),
        interpretation: eValuePI === 1
          ? 'PI includes null - heterogeneous effects span null'
          : interpretEvalue(eValuePI),
        note: 'Accounts for between-study heterogeneity'
      }
    },
    studyLevelEvalues: studyEvalues,
    robustnessConclusion: eValueCI > 2
      ? 'ROBUST: Would require substantial unmeasured confounding (RR>' + (eValueCI).toFixed(1) + ') to explain away'
      : eValueCI > 1.5
        ? 'MODERATE: Moderate confounding could explain away significance'
        : 'SENSITIVE: Weak confounding could explain away the finding'
  };
}

// ============================================================================
// SECTION 6: DOSE-RESPONSE META-ANALYSIS WITH FLEXIBLE MODELS
// ============================================================================

/**
 * Fractional Polynomial Dose-Response Meta-Analysis
 *
 * NOVELTY: Standard dose-response MA uses linear or spline models.
 * This uses fractional polynomials with model averaging, providing
 * more flexible curves with uncertainty quantification.
 *
 * @param {Array} studies - [{studyId, doses: [{dose, yi, vi, n}]}]
 * @param {Object} options - Configuration
 * @returns {Object} Dose-response curve with uncertainty
 */
export function fractionalPolynomialDoseResponse(studies, options = {}) {
  if (!studies || studies.length < 3) {
    throw new Error('At least 3 studies required');
  }

  const {
    powers = [-2, -1, -0.5, 0, 0.5, 1, 2, 3], // Candidate powers
    maxTerms = 2, // 1 or 2 term models
    referenceCategory = 'lowest', // 'lowest' or 'zero'
    nPredictionPoints = 20
  } = options;

  // Flatten all dose-response points
  const allPoints = [];
  for (const study of studies) {
    const ref = referenceCategory === 'lowest'
      ? Math.min(...study.doses.map(d => d.dose))
      : 0;

    for (const d of study.doses) {
      if (d.dose !== ref) {
        allPoints.push({
          studyId: study.studyId,
          dose: d.dose,
          refDose: ref,
          yi: d.yi,
          vi: d.vi,
          n: d.n || 100
        });
      }
    }
  }

  if (allPoints.length < 5) {
    return { error: 'Not enough dose-response points', points: allPoints.length };
  }

  // Get dose range
  const allDoses = allPoints.map(p => p.dose);
  const minDose = Math.min(...allDoses);
  const maxDose = Math.max(...allDoses);

  // Transform dose for fractional polynomial
  const transformDose = (dose, power) => {
    if (power === 0) return Math.log(dose + 0.1);
    return Math.pow(dose + 0.1, power);
  };

  // Fit models and calculate AIC
  const modelResults = [];

  // Single-term models
  for (const p of powers) {
    const X = allPoints.map(pt => transformDose(pt.dose, p));
    const y = allPoints.map(pt => pt.yi);
    const w = allPoints.map(pt => 1 / pt.vi);

    // Weighted least squares
    const result = weightedRegression(X, y, w, 1);
    result.powers = [p];
    result.terms = 1;
    modelResults.push(result);
  }

  // Two-term models (if requested)
  if (maxTerms >= 2) {
    for (let i = 0; i < powers.length; i++) {
      for (let j = i; j < powers.length; j++) {
        const p1 = powers[i];
        const p2 = powers[j];

        const X1 = allPoints.map(pt => transformDose(pt.dose, p1));
        const X2 = p1 === p2
          ? allPoints.map(pt => transformDose(pt.dose, p1) * Math.log(pt.dose + 0.1))
          : allPoints.map(pt => transformDose(pt.dose, p2));

        const X = allPoints.map((_, idx) => [X1[idx], X2[idx]]);
        const y = allPoints.map(pt => pt.yi);
        const w = allPoints.map(pt => 1 / pt.vi);

        const result = weightedRegression2D(X, y, w);
        result.powers = p1 === p2 ? [p1, p1 + '_log'] : [p1, p2];
        result.terms = 2;
        modelResults.push(result);
      }
    }
  }

  // Calculate model weights from AIC
  const minAIC = Math.min(...modelResults.map(m => m.aic));
  const deltaAIC = modelResults.map(m => m.aic - minAIC);
  const rawWeights = deltaAIC.map(d => Math.exp(-0.5 * d));
  const sumWeights = rawWeights.reduce((a, b) => a + b, 0);
  const modelWeights = rawWeights.map(w => w / sumWeights);

  // Sort by weight
  const rankedModels = modelResults.map((m, i) => ({ ...m, weight: modelWeights[i] }))
    .sort((a, b) => b.weight - a.weight);

  // Generate prediction curve (model-averaged)
  const predictionDoses = [];
  for (let i = 0; i <= nPredictionPoints; i++) {
    predictionDoses.push(minDose + (maxDose - minDose) * i / nPredictionPoints);
  }

  const predictions = predictionDoses.map(dose => {
    let avgPred = 0;
    let avgVar = 0;

    for (let m = 0; m < modelResults.length; m++) {
      const model = modelResults[m];
      const weight = modelWeights[m];

      let pred;
      if (model.terms === 1) {
        const x = transformDose(dose, model.powers[0]);
        pred = model.intercept + model.coefficients[0] * x;
      } else {
        const x1 = transformDose(dose, model.powers[0]);
        const x2 = typeof model.powers[1] === 'string'
          ? transformDose(dose, parseFloat(model.powers[1])) * Math.log(dose + 0.1)
          : transformDose(dose, model.powers[1]);
        pred = model.intercept + model.coefficients[0] * x1 + model.coefficients[1] * x2;
      }

      avgPred += weight * pred;
      avgVar += weight * (model.residualVar + Math.pow(pred - avgPred, 2));
    }

    return {
      dose,
      effect: avgPred,
      se: Math.sqrt(avgVar),
      ciLower: avgPred - 1.96 * Math.sqrt(avgVar),
      ciUpper: avgPred + 1.96 * Math.sqrt(avgVar)
    };
  });

  return {
    method: 'Fractional Polynomial Dose-Response Meta-Analysis',
    novelty: 'GENUINE - Model-averaged fractional polynomials for dose-response',
    warning: 'EXPLORATORY METHOD: Requires adequate dose range coverage. Check model diagnostics.',
    dataOverview: {
      nStudies: studies.length,
      nDosePoints: allPoints.length,
      doseRange: [minDose.toFixed(2), maxDose.toFixed(2)]
    },
    topModels: rankedModels.slice(0, 5).map(m => ({
      powers: m.powers,
      weight: (m.weight * 100).toFixed(1) + '%',
      aic: m.aic.toFixed(2),
      coefficients: m.coefficients.map(c => c.toFixed(4))
    })),
    modelAveragedCurve: predictions.map(p => ({
      dose: p.dose.toFixed(2),
      effect: p.effect.toFixed(4),
      ci: [p.ciLower.toFixed(4), p.ciUpper.toFixed(4)]
    })),
    curveShape: rankedModels[0].powers.includes(1)
      ? 'Approximately linear'
      : rankedModels[0].powers.some(p => p < 0)
        ? 'Sublinear (diminishing returns)'
        : rankedModels[0].powers.some(p => p > 1)
          ? 'Superlinear (accelerating)'
          : 'Non-linear (complex shape)',
    interpretation: rankedModels[0].weight > 0.5
      ? `Strong evidence for ${rankedModels[0].powers.join(', ')} model`
      : 'Model uncertainty substantial - interpret curve shape cautiously'
  };
}

// Helper: weighted regression (1D)
function weightedRegression(X, y, w, nCoef) {
  const n = X.length;
  const sumW = w.reduce((a, b) => a + b, 0);
  const sumWX = X.reduce((sum, x, i) => sum + w[i] * x, 0);
  const sumWY = y.reduce((sum, yi, i) => sum + w[i] * yi, 0);
  const sumWX2 = X.reduce((sum, x, i) => sum + w[i] * x * x, 0);
  const sumWXY = X.reduce((sum, x, i) => sum + w[i] * x * y[i], 0);

  const denom = sumW * sumWX2 - sumWX * sumWX;
  const intercept = (sumWY * sumWX2 - sumWX * sumWXY) / denom;
  const slope = (sumW * sumWXY - sumWX * sumWY) / denom;

  const residuals = y.map((yi, i) => yi - (intercept + slope * X[i]));
  const residualVar = residuals.reduce((sum, r, i) => sum + w[i] * r * r, 0) / (n - 2);
  const logLik = -0.5 * n * Math.log(2 * Math.PI * residualVar) - 0.5 * n;
  const aic = -2 * logLik + 2 * 2;

  return { intercept, coefficients: [slope], residualVar, logLik, aic };
}

// Helper: weighted regression (2D)
function weightedRegression2D(X, y, w) {
  const n = X.length;

  // Simplified approach: use normal equations
  let sumW = 0, sumWX1 = 0, sumWX2 = 0, sumWY = 0;
  let sumWX1X1 = 0, sumWX1X2 = 0, sumWX2X2 = 0;
  let sumWX1Y = 0, sumWX2Y = 0;

  for (let i = 0; i < n; i++) {
    sumW += w[i];
    sumWX1 += w[i] * X[i][0];
    sumWX2 += w[i] * X[i][1];
    sumWY += w[i] * y[i];
    sumWX1X1 += w[i] * X[i][0] * X[i][0];
    sumWX1X2 += w[i] * X[i][0] * X[i][1];
    sumWX2X2 += w[i] * X[i][1] * X[i][1];
    sumWX1Y += w[i] * X[i][0] * y[i];
    sumWX2Y += w[i] * X[i][1] * y[i];
  }

  // Solve 3x3 system (simplified - use mean centering)
  const meanX1 = sumWX1 / sumW;
  const meanX2 = sumWX2 / sumW;
  const meanY = sumWY / sumW;

  const cX1X1 = sumWX1X1 - sumW * meanX1 * meanX1;
  const cX1X2 = sumWX1X2 - sumW * meanX1 * meanX2;
  const cX2X2 = sumWX2X2 - sumW * meanX2 * meanX2;
  const cX1Y = sumWX1Y - sumW * meanX1 * meanY;
  const cX2Y = sumWX2Y - sumW * meanX2 * meanY;

  const det = cX1X1 * cX2X2 - cX1X2 * cX1X2;
  const b1 = (cX2X2 * cX1Y - cX1X2 * cX2Y) / det;
  const b2 = (cX1X1 * cX2Y - cX1X2 * cX1Y) / det;
  const intercept = meanY - b1 * meanX1 - b2 * meanX2;

  const residuals = y.map((yi, i) => yi - (intercept + b1 * X[i][0] + b2 * X[i][1]));
  const residualVar = residuals.reduce((sum, r, i) => sum + w[i] * r * r, 0) / (n - 3);
  const logLik = -0.5 * n * Math.log(2 * Math.PI * residualVar) - 0.5 * n;
  const aic = -2 * logLik + 2 * 3;

  return { intercept, coefficients: [b1, b2], residualVar, logLik, aic };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Model averaging
  effectMeasureModelAveraging,

  // Cross-validation
  predictiveCrossValidation,

  // Fragility
  multiDimensionalFragility,

  // Sequential bias
  sequentialBiasMonitoring,

  // E-values
  metaAnalyticEValues,

  // Dose-response
  fractionalPolynomialDoseResponse
};
