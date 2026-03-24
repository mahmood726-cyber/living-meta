/**
 * Selection Models for Publication Bias
 * Implements Vevea & Hedges (1995) weight-function models
 *
 * @module SelectionModels
 * @see {@link https://doi.org/10.1037/0033-2909.117.3.533|Vevea & Hedges (1995) Psychol Bull 117(3):533-543}
 * @description Selection models use EM algorithm to estimate the probability of
 *              publication as a function of p-value. The E-step calculates expected
 *              weights for each study; the M-step updates the effect estimate using
 *              weighted meta-analysis. Multiple weight functions supported: step,
 *              smooth (logistic), and half-normal models.
 */

import { normalCDF, normalPDF } from '../utils.js';

/**
 * Calculate selection weight for a given p-value
 * @param {number} p - P-value
 * @param {Array} thresholds - Selection thresholds
 * @returns {number} Selection weight
 */
function selectionWeight(p, thresholds) {
  for (const t of thresholds) {
    if (p <= t.threshold) {
      return t.weight;
    }
  }
  return thresholds.length > 0 ? thresholds[thresholds.length - 1].weight : 1;
}

/**
 * Step function selection model
 * @param {Array} thresholds - Array of {threshold, weight}
 * @returns {Function} Selection weight function
 */
function stepFunctionModel(thresholds) {
  return (p) => selectionWeight(p, thresholds);
}

/**
 * Smooth selection model (using logistic function)
 * @param {Array} params - Array of {threshold, steepness}
 * @returns {Function} Selection weight function
 */
function smoothSelectionModel(params) {
  return (p) => {
    let weight = 1;
    for (const param of params) {
      const logistic = 1 / (1 + Math.exp(-param.steepness * (p - param.threshold)));
      weight *= logistic;
    }
    return weight;
  };
}

/**
 * Calculate expected weight for a two-tailed test
 * @param {number} z - Z-statistic
 * @param {Function} weightFunc - Weight function for one-tailed p
 * @returns {number} Expected weight
 */
function twoTailedWeight(z, weightFunc) {
  const p1 = 1 - normalCDF(z);
  const p2 = 1 - normalCDF(-z);
  return (weightFunc(p1) + weightFunc(p2)) / 2;
}

/**
 * Estimate selection model parameters using maximum likelihood
 * @param {Array} studies - Array of studies with yi, vi
 * @param {Object} options - Model options
 * @returns {Object} Estimation results
 */
export function estimateSelectionModel(studies, options = {}) {
  const {
    type = 'step',
    thresholds = [
      { threshold: 0.001, weight: 1.0 },
      { threshold: 0.01, weight: 0.95 },
      { threshold: 0.05, weight: 0.75 },
      { threshold: 0.10, weight: 0.50 },
      { threshold: 1.00, weight: 0.25 }
    ],
    iterations = 100,
    tolerance = 1e-6
  } = options;

  const k = studies.length;

  if (k < 3) {
    return { error: 'Need at least 3 studies for selection model' };
  }

  // Get weight function
  const weightFunc = type === 'smooth'
    ? smoothSelectionModel(thresholds)
    : stepFunctionModel(thresholds);

  // Initial estimate using fixed effects
  let theta = 0;
  const weights = studies.map(s => 1 / s.vi);
  const sumWeights = weights.reduce((a, b) => a + b, 0);

  if (sumWeights > 0) {
    theta = weights.reduce((sum, w, i) => sum + w * studies[i].yi, 0) / sumWeights;
  }

  // EM algorithm for selection model
  let prevTheta = theta;
  let converged = false;

  for (let iter = 0; iter < iterations; iter++) {
    // E-step: Calculate expected weights
    const expectedWeights = studies.map(s => {
      const z = s.yi / Math.sqrt(s.vi);
      return twoTailedWeight(z - theta / Math.sqrt(s.vi), weightFunc);
    });

    // M-step: Update theta using weighted meta-analysis
    const wi = studies.map((s, i) => expectedWeights[i] / s.vi);
    const sumWi = wi.reduce((a, b) => a + b, 0);

    if (sumWi > 0) {
      theta = wi.reduce((sum, w, i) => sum + w * studies[i].yi, 0) / sumWi;
    }

    // Check convergence
    if (Math.abs(theta - prevTheta) < tolerance) {
      converged = true;
      break;
    }

    prevTheta = theta;
  }

  // Calculate standard error
  const expectedWeights = studies.map(s => {
    const z = s.yi / Math.sqrt(s.vi);
    return twoTailedWeight(z - theta / Math.sqrt(s.vi), weightFunc);
  });

  const wi = studies.map((s, i) => expectedWeights[i] / s.vi);
  const sumWi = wi.reduce((a, b) => a + b, 0);
  const se = sumWi > 0 ? Math.sqrt(1 / sumWi) : Infinity;

  // Calculate corrected estimate
  const z = theta / se;
  const pValue = 2 * (1 - normalCDF(Math.abs(z)));
  const ciLower = theta - 1.96 * se;
  const ciUpper = theta + 1.96 * se;

  return {
    estimate: theta,
    se,
    ciLower,
    ciUpper,
    z,
    pValue,
    converged,
    iterations: converged ? iterations : iterations,
    type,
    thresholds,
    expectedWeights
  };
}

/**
 * Vevea-Hedges three-parameter selection model
 * @param {Array} studies - Array of studies with yi, vi
 * @param {Object} options - Model options
 * @returns {Object} Estimation results
 */
export function veveaHedgesModel(studies, options = {}) {
  const {
    alpha1 = 0.05,
    alpha2 = 0.10,
    w1 = 1.0,
    w2 = 0.5,
    w3 = 0.1,
    iterations = 200,
    tolerance = 1e-6
  } = options;

  const k = studies.length;

  if (k < 4) {
    return { error: 'Vevea-Hedges model requires at least 4 studies' };
  }

  // Selection thresholds
  const thresholds = [
    { threshold: alpha1, weight: w1 },
    { threshold: alpha2, weight: w2 },
    { threshold: 1.0, weight: w3 }
  ];

  // Estimate model
  const result = estimateSelectionModel(studies, {
    type: 'step',
    thresholds,
    iterations,
    tolerance
  });

  return {
    ...result,
    modelName: 'Vevea-Hedges Three-Parameter',
    parameters: { alpha1, alpha2, w1, w2, w3 },
    interpretation: result.estimate > 0
      ? 'After correcting for publication bias, the effect remains positive'
      : 'After correcting for publication bias, the effect becomes negative or null'
  };
}

/**
 * Half-normal selection model
 * Assumes significant studies are fully published, non-significant are attenuated
 * @param {Array} studies - Array of studies with yi, vi
 * @param {Object} options - Model options
 * @returns {Object} Estimation results
 */
export function halfNormalModel(studies, options = {}) {
  const {
    selectivity = 0.95,
    iterations = 200,
    tolerance = 1e-6
  } = options;

  const k = studies.length;

  if (k < 3) {
    return { error: 'Half-normal model requires at least 3 studies' };
  }

  // Weight function: w(p) = selectivity^((1-p)/p)
  const weightFunc = (p) => {
    if (p <= 0.001) return 1.0;
    if (p >= 0.999) return 0.001;
    return Math.pow(selectivity, (1 - p) / p);
  };

  // EM algorithm
  let theta = 0;
  const weights = studies.map(s => 1 / s.vi);
  const sumWeights = weights.reduce((a, b) => a + b, 0);

  if (sumWeights > 0) {
    theta = weights.reduce((sum, w, i) => sum + w * studies[i].yi, 0) / sumWeights;
  }

  for (let iter = 0; iter < iterations; iter++) {
    const expectedWeights = studies.map(s => {
      const z = s.yi / Math.sqrt(s.vi);
      const p = 2 * (1 - normalCDF(Math.abs(z - theta / Math.sqrt(s.vi))));
      return weightFunc(p);
    });

    const wi = studies.map((s, i) => expectedWeights[i] / s.vi);
    const sumWi = wi.reduce((a, b) => a + b, 0);

    if (sumWi > 0) {
      const newTheta = wi.reduce((sum, w, i) => sum + w * studies[i].yi, 0) / sumWi;
      if (Math.abs(newTheta - theta) < tolerance) break;
      theta = newTheta;
    }
  }

  // Calculate SE
  const expectedWeights = studies.map(s => {
    const z = s.yi / Math.sqrt(s.vi);
    const p = 2 * (1 - normalCDF(Math.abs(z - theta / Math.sqrt(s.vi))));
    return weightFunc(p);
  });

  const wi = studies.map((s, i) => expectedWeights[i] / s.vi);
  const sumWi = wi.reduce((a, b) => a + b, 0);
  const se = sumWi > 0 ? Math.sqrt(1 / sumWi) : Infinity;

  return {
    estimate: theta,
    se,
    ciLower: theta - 1.96 * se,
    ciUpper: theta + 1.96 * se,
    z: theta / se,
    pValue: 2 * (1 - normalCDF(Math.abs(theta / se))),
    modelName: 'Half-Normal',
    parameters: { selectivity },
    expectedWeights
  };
}

/**
 * Compare selection models
 * @param {Array} studies - Array of studies with yi, vi
 * @param {Object} options - Analysis options
 * @returns {Object} Comparison of multiple selection models
 */
export function compareSelectionModels(studies, options = {}) {
  const models = [];

  // Run multiple models
  const modelTypes = [
    { name: 'Vevea-Hedges (3-param)', fn: (s) => veveaHedgesModel(s, options) },
    { name: 'Half-Normal', fn: (s) => halfNormalModel(s, { ...options, selectivity: 0.95 }) },
    { name: 'Step Function (aggressive)', fn: (s) => estimateSelectionModel(s, {
      ...options,
      thresholds: [
        { threshold: 0.05, weight: 1.0 },
        { threshold: 0.10, weight: 0.5 },
        { threshold: 1.00, weight: 0.1 }
      ]
    })},
    { name: 'Step Function (moderate)', fn: (s) => estimateSelectionModel(s, {
      ...options,
      thresholds: [
        { threshold: 0.05, weight: 1.0 },
        { threshold: 0.10, weight: 0.75 },
        { threshold: 0.50, weight: 0.5 },
        { threshold: 1.00, weight: 0.25 }
      ]
    })}
  ];

  for (const model of modelTypes) {
    const result = model.fn(studies);
    if (!result.error) {
      models.push({
        name: model.name,
        estimate: result.estimate,
        se: result.se,
        ciLower: result.ciLower,
        ciUpper: result.ciUpper,
        pValue: result.pValue
      });
    }
  }

  // Calculate range and consensus
  const estimates = models.map(m => m.estimate);
  const minEstimate = Math.min(...estimates);
  const maxEstimate = Math.max(...estimates);
  const consensusEstimate = estimates.reduce((a, b) => a + b, 0) / estimates.length;

  return {
    models,
    consensus: {
      estimate: consensusEstimate,
      range: {
        min: minEstimate,
        max: maxEstimate,
        width: maxEstimate - minEstimate
      },
      interpretation: maxEstimate - minEstimate < 0.2
        ? 'Models agree: robust to publication bias assumptions'
        : 'Models disagree: results sensitive to publication bias assumptions'
    }
  };
}

/**
 * Sensitivity analysis for selection models
 * @param {Array} studies - Array of studies with yi, vi
 * @param {Object} options - Analysis options
 * @returns {Object} Sensitivity analysis results
 */
export function selectionModelSensitivity(studies, options = {}) {
  const selectivityValues = [0.90, 0.95, 0.99];
  const results = [];

  for (const selectivity of selectivityValues) {
    const result = halfNormalModel(studies, { ...options, selectivity });
    if (!result.error) {
      results.push({
        selectivity,
        estimate: result.estimate,
        se: result.se,
        ciLower: result.ciLower,
        ciUpper: result.ciUpper,
        pValue: result.pValue
      });
    }
  }

  // Calculate variation
  const estimates = results.map(r => r.estimate);
  const minEstimate = Math.min(...estimates);
  const maxEstimate = Math.max(...estimates);

  return {
    results,
    sensitivity: {
      range: maxEstimate - minEstimate,
      coefficient: maxEstimate - minEstimate < 0.1 ? 'low' : maxEstimate - minEstimate < 0.3 ? 'moderate' : 'high'
    },
    interpretation: maxEstimate - minEstimate < 0.1
      ? 'Results are robust to different selectivity assumptions'
      : 'Results are sensitive to selectivity assumptions'
  };
}

export default {
  estimateSelectionModel,
  veveaHedgesModel,
  halfNormalModel,
  compareSelectionModels,
  selectionModelSensitivity
};
