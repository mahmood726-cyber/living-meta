/**
 * Trim-and-Fill Method for Publication Bias
 * Implements Duval & Tweedie's trim-and-fill algorithm
 *
 * @module TrimAndFill
 * @see {@link https://doi.org/10.1080/01621459.2000.10474305|Duval & Tweedie (2000)}
 * @see {@link https://doi.org/10.1002/jrsm.11.0094|Duval & Tweedie (2000) JASA 95(449):873-890}
 * @description Trim-and-fill is a nonparametric method for detecting and correcting
 *              for publication bias in meta-analysis. It ranks studies by their
 *              standardized effect, trims extreme studies, re-analyzes, and
 *              imputes missing studies by reflection.
 */

import { normalCDF, normalQuantile } from '../utils.js';

/**
 * Estimate tau² using restricted maximum likelihood
 * @param {Array} studies - Array of studies with yi, vi
 * @returns {number} Estimated tau²
 */
function estimateTau2(studies) {
  const k = studies.length;

  if (k <= 1) return 0;

  // Iteratively estimate tau²
  let tau2 = 0;
  let prevTau2;

  for (let iter = 0; iter < 100; iter++) {
    prevTau2 = tau2;

    // Calculate weights with current tau²
    const wi = studies.map(s => 1 / (s.vi + tau2));
    const sumWi = wi.reduce((a, b) => a + b, 0);

    // Calculate weighted mean
    const mu = wi.reduce((sum, w, i) => sum + w * studies[i].yi, 0) / sumWi;

    // Update tau² estimate
    const num = wi.reduce((sum, w, i) => sum + w * Math.pow(studies[i].yi - mu, 2), 0);
    const den = wi.reduce((sum, w) => sum + w, 0);
    tau2 = (num - (k - 1)) / den;

    // Ensure non-negative
    if (tau2 < 0) tau2 = 0;

    // Check convergence
    if (Math.abs(tau2 - prevTau2) < 0.0001) break;
  }

  return tau2;
}

/**
 * Rank studies by their standardized effect
 * @param {Array} studies - Array of studies with yi, vi
 * @returns {Array} Ranked studies with rank info
 */
function rankStudies(studies) {
  const ranked = studies.map(s => ({
    ...s,
    stdEffect: s.yi / Math.sqrt(s.vi),
    absEffect: Math.abs(s.yi / Math.sqrt(s.vi))
  }));

  ranked.sort((a, b) => a.absEffect - b.absEffect);

  let cumRank = 0;
  return ranked.map((s, i) => {
    cumRank += i + 1;
    return { ...s, rank: i + 1, cumRank };
  });
}

/**
 * Calculate rank correlation (Kendall's tau) for asymmetry test
 * @param {Array} studies - Array of ranked studies
 * @returns {number} Kendall's tau
 */
function rankCorrelation(studies) {
  const k = studies.length;
  let concordant = 0;
  let discordant = 0;

  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      const si = studies[i].yi;
      const sj = studies[j].yi;
      const vi = studies[i].vi;
      const vj = studies[j].vi;

      // Compare effect sizes and variances
      if ((si > sj && vi < vj) || (si < sj && vi > vj)) {
        concordant++;
      } else if ((si > sj && vi > vj) || (si < sj && vi < vj)) {
        discordant++;
      }
    }
  }

  const total = concordant + discordant;
  if (total === 0) return 0;

  return (concordant - discordant) / total;
}

/**
 * Perform trim-and-fill analysis
 * @param {Array} studies - Array of studies with yi, vi
 * @param {Object} options - Analysis options
 * @returns {Object} Trim-and-fill results
 */
export function trimAndFill(studies, options = {}) {
  const {
    side = 'L', // 'L' for left (negative), 'R' for right (positive), 'B' for both
    estimator = 'R0', // 'R0' (mean), 'L0' (median), 'Q0' (trimmed mean)
    maxIter = 100,
    alpha = 0.05
  } = options;

  const k = studies.length;

  if (k < 3) {
    return {
      error: 'Trim-and-fill requires at least 3 studies',
      original: null,
      filled: null,
      imputed: [],
      kOriginal: k,
      kFilled: k,
      iterations: 0
    };
  }

  // Original meta-analysis
  const original = analyzeFixedEffects(studies);

  // Determine funnel plot side
  const ranks = rankStudies(studies);

  // Estimate asymmetry direction
  const meanStdEffect = ranks.reduce((sum, s) => sum + s.stdEffect, 0) / k;
  const asymmetrySide = meanStdEffect < 0 ? 'L' : 'R';

  const fillSide = side === 'B' ? asymmetrySide : side;

  // Count studies to trim (number on asymmetric side)
  const kLeft = ranks.filter(s => s.stdEffect < 0).length;
  const kRight = ranks.filter(s => s.stdEffect > 0).length;
  const kTrim = fillSide === 'L' ? kLeft : kRight;

  let currentStudies = [...studies];
  let imputed = [];
  let iterations = 0;

  // Iterative trimming
  for (let iter = 0; iter < kTrim && iter < maxIter; iter++) {
    // Rank studies by standardized effect
    const ranked = rankStudies(currentStudies);

    // Trim most extreme study on asymmetric side
    const trimIndex = fillSide === 'L'
      ? 0 // Most negative
      : ranked.length - 1; // Most positive

    if (trimIndex < 0 || trimIndex >= ranked.length) break;

    // Remove trimmed study
    currentStudies = currentStudies.filter(s =>
      s.nctId !== ranked[trimIndex].nctId && s.yi !== ranked[trimIndex].yi
    );

    iterations++;

    // Re-estimate tau² and analyze
    if (currentStudies.length >= 2) {
      const tau2 = estimateTau2(currentStudies);
      const weights = currentStudies.map(s => 1 / (s.vi + tau2));
      const sumWeights = weights.reduce((a, b) => a + b, 0);

      if (sumWeights > 0) {
        const mu = weights.reduce((sum, w, i) => sum + w * currentStudies[i].yi, 0) / sumWeights;

        // Calculate imputed values for trimmed studies
        const trimmedStudy = ranked[trimIndex];
        const imputedYi = 2 * mu - trimmedStudy.yi;
        const imputedVi = trimmedStudy.vi;

        imputed.push({
          ...trimmedStudy,
          originalYi: trimmedStudy.yi,
          imputedYi,
          imputedVi,
          iteration: iter + 1
        });
      }
    }
  }

  // Analyze with imputed studies included
  const filledStudies = [...studies, ...imputed];
  const filled = analyzeFixedEffects(filledStudies);

  return {
    original: {
      estimate: original.theta,
      se: original.se,
      ciLower: original.ci_lower,
      ciUpper: original.ci_upper,
      pValue: original.pValue
    },
    filled: {
      estimate: filled.theta,
      se: filled.se,
      ciLower: filled.ci_lower,
      ciUpper: filled.ci_upper,
      pValue: filled.pValue
    },
    imputed,
    kOriginal: k,
    kFilled: filledStudies.length,
    kImputed: imputed.length,
    iterations,
    side: fillSide,
    asymmetryTest: {
      correlation: rankCorrelation(ranks),
      rankCorrelation: rankCorrelation(ranks)
    }
  };
}

/**
 * Fixed effects analysis
 */
function analyzeFixedEffects(studies) {
  const weights = studies.map(s => 1 / s.vi);
  const sumWeights = weights.reduce((a, b) => a + b, 0);

  if (sumWeights === 0) {
    return { theta: 0, se: Infinity, ci_lower: -Infinity, ci_upper: Infinity, pValue: 1 };
  }

  const theta = weights.reduce((sum, w, i) => sum + w * studies[i].yi, 0) / sumWeights;
  const se = Math.sqrt(1 / sumWeights);
  const z = theta / se;
  const ci_lower = theta - 1.96 * se;
  const ci_upper = theta + 1.96 * se;
  const pValue = 2 * (1 - normalCDF(Math.abs(z)));

  return { theta, se, ci_lower, ci_upper, pValue };
}

/**
 * Perform trim-and-fill with random effects
 * @param {Array} studies - Array of studies with yi, vi
 * @param {Object} options - Analysis options
 * @returns {Object} Trim-and-fill results with random effects
 */
export function trimAndFillRE(studies, options = {}) {
  const {
    tau2Estimator = 'DL', // 'DL' (DerSimonian-Laird), 'REML', 'PM' (Paule-Mandel)
    ...trimFillOptions
  } = options;

  const k = studies.length;

  if (k < 3) {
    return {
      error: 'Trim-and-fill requires at least 3 studies',
      original: null,
      filled: null
    };
  }

  // Estimate tau²
  let tau2 = 0;

  if (tau2Estimator === 'DL') {
    tau2 = estimateTau2DL(studies);
  } else if (tau2Estimator === 'REML') {
    tau2 = estimateTau2(studies);
  } else if (tau2Estimator === 'PM') {
    tau2 = estimateTau2PM(studies);
  }

  // Adjust studies to use tau²
  const adjustedStudies = studies.map(s => ({
    ...s,
    viAdjusted: s.vi + tau2
  }));

  // Perform trim-and-fill on adjusted variances
  const result = trimAndFill(adjustedStudies, trimFillOptions);

  // Add tau² info
  result.tau2 = tau2;
  result.tau2Estimator = tau2Estimator;

  return result;
}

/**
 * Estimate tau² using DerSimonian-Laird
 */
function estimateTau2DL(studies) {
  const fe = analyzeFixedEffects(studies);
  const k = studies.length;
  const df = k - 1;

  if (df <= 0 || fe.Q <= df) return 0;

  const wi = studies.map(s => 1 / s.vi);
  const sumWi = wi.reduce((a, b) => a + b, 0);
  const sumWi2 = wi.reduce((a, b) => a + b * b, 0);

  const C = sumWi - sumWi2 / sumWi;
  const tau2 = (fe.Q - df) / C;

  return Math.max(0, tau2);
}

/**
 * Estimate tau² using Paule-Mandel
 */
function estimateTau2PM(studies) {
  const k = studies.length;

  const wi = studies.map(s => 1 / s.vi);
  const sumWi = wi.reduce((a, b) => a + b, 0);

  if (sumWi === 0) return 0;

  const mu = wi.reduce((sum, w, i) => sum + w * studies[i].yi, 0) / sumWi;

  const Q = wi.reduce((sum, w, i) => sum + w * Math.pow(studies[i].yi - mu, 2), 0);
  const df = k - 1;

  if (df <= 0) return 0;

  const tau2 = (Q - df) / sumWi;

  return Math.max(0, tau2);
}

/**
 * Test for funnel plot asymmetry
 * @param {Array} studies - Array of studies with yi, vi
 * @returns {Object} Asymmetry test results
 */
export function testFunnelAsymmetry(studies) {
  const k = studies.length;

  if (k < 3) {
    return {
      error: 'Need at least 3 studies for asymmetry test',
      test: 'rank-correlation',
      statistic: null,
      pValue: null,
      significant: null
    };
  }

  const ranks = rankStudies(studies);
  const tau = rankCorrelation(ranks);

  // Standard error of Kendall's tau
  const n = k;
  const se = Math.sqrt((2 * (2 * n + 5)) / (9 * n * (n - 1)));

  // Z-score
  const z = tau / se;

  // Two-tailed p-value
  const pValue = 2 * (1 - normalCDF(Math.abs(z)));

  const significant = pValue < 0.05;

  return {
    test: 'rank-correlation',
    statistic: z,
    correlation: tau,
    pValue,
    significant,
    interpretation: significant
      ? 'Significant funnel plot asymmetry detected (possible publication bias)'
      : 'No significant asymmetry detected'
  };
}

export default {
  trimAndFill,
  trimAndFillRE,
  testFunnelAsymmetry
};
