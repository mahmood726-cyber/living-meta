/**
 * Cumulative Meta-Analysis
 * Implements cumulative meta-analysis with various ordering strategies
 *
 * @module CumulativeMetaAnalysis
 * @see {@link https://doi.org/10.1136/bmj.336.7654.1444|Wetterslev et al. (2008) BMJ 336:1444-1447}
 * @see {@link https://doi.org/10.1002/sim.4782|Lan & DeMets (1983) Biometrics 39(4):1021-1034}
 * @description Cumulative meta-analysis updates the pooled estimate as each study
 *              is added. Sequential monitoring boundaries (O'Brien-Fleming, Pocock,
 *              Haybittle-Peto) control Type I error for interim analyses. Trial
 *              Sequential Analysis (TSA) calculates required information size.
 */

import { normalCDF, normalQuantile, tCDF, tQuantile } from '../utils.js';

/**
 * Fixed effects cumulative meta-analysis
 * @param {Array} studies - Array of studies with yi, vi
 * @param {Array} order - Order of studies (indices)
 * @returns {Array} Cumulative results at each step
 */
function cumulativeFixedEffects(studies, order) {
  const results = [];
  let cumYi = 0;
  let cumWi = 0;

  for (let i = 0; i < order.length; i++) {
    const study = studies[order[i]];
    const wi = 1 / study.vi;

    cumYi += wi * study.yi;
    cumWi += wi;

    const theta = cumYi / cumWi;
    const se = Math.sqrt(1 / cumWi);
    const z = theta / se;
    const ci_lower = theta - 1.96 * se;
    const ci_upper = theta + 1.96 * se;
    const pValue = 2 * (1 - normalCDF(Math.abs(z)));

    results.push({
      k: i + 1,
      nctId: study.nctId || study.id || `Study ${order[i] + 1}`,
      theta,
      se,
      ci_lower,
      ci_upper,
      z,
      pValue,
      significant: pValue < 0.05
    });
  }

  return results;
}

/**
 * Random effects cumulative meta-analysis (DL)
 * @param {Array} studies - Array of studies with yi, vi
 * @param {Array} order - Order of studies (indices)
 * @returns {Array} Cumulative results at each step
 */
function cumulativeRandomEffects(studies, order) {
  const results = [];

  for (let i = 0; i < order.length; i++) {
    const currentStudies = studies.filter((_, idx) => order.indexOf(idx) <= i);

    // Calculate tau² using DL
    const k = currentStudies.length;
    const wi = currentStudies.map(s => 1 / s.vi);
    const sumWi = wi.reduce((a, b) => a + b, 0);
    const thetaFE = wi.reduce((sum, w, idx) => sum + w * currentStudies[idx].yi, 0) / sumWi;

    const Q = wi.reduce((sum, w, idx) =>
      sum + w * Math.pow(currentStudies[idx].yi - thetaFE, 2), 0);

    const sumWi2 = wi.reduce((a, b) => a + b * b, 0);
    const C = sumWi - sumWi2 / sumWi;

    let tau2 = 0;
    if (k > 1 && Q > k - 1) {
      tau2 = (Q - (k - 1)) / C;
    }

    // Calculate RE estimate
    const wiStar = currentStudies.map(s => 1 / (s.vi + tau2));
    const sumWiStar = wiStar.reduce((a, b) => a + b, 0);
    const theta = wiStar.reduce((sum, w, idx) =>
      sum + w * currentStudies[idx].yi, 0) / sumWiStar;

    const se = Math.sqrt(1 / sumWiStar);

    // HKSJ adjustment
    const tCrit = tQuantile(0.975, k - 1);
    const ci_lower = theta - tCrit * se;
    const ci_upper = theta + tCrit * se;
    const t = theta / se;
    const df = k - 1;
    const pValue = 2 * (1 - tCDF(Math.abs(t), df));

    results.push({
      k: i + 1,
      nctId: studies[order[i]].nctId || studies[order[i]].id || `Study ${order[i] + 1}`,
      theta,
      se,
      ci_lower,
      ci_upper,
      t,
      df,
      pValue,
      tau2,
      significant: pValue < 0.05
    });
  }

  return results;
}

/**
 * Perform cumulative meta-analysis
 * @param {Array} studies - Array of studies with yi, vi
 * @param {Object} options - Analysis options
 * @returns {Object} Cumulative meta-analysis results
 */
export function cumulativeMetaAnalysis(studies, options = {}) {
  const {
    model = 'RE', // 'FE' or 'RE'
    sortBy = 'chronological', // 'chronological', 'precision', 'effect', 'variance'
    ascending = true
  } = options;

  if (studies.length < 2) {
    return {
      error: 'Cumulative meta-analysis requires at least 2 studies',
      results: null
    };
  }

  // Determine order
  let order = studies.map((_, i) => i);

  switch (sortBy) {
    case 'chronological':
      // Sort by year/study ID if available
      order = studies.map((s, i) => i).sort((a, b) => {
        const yearA = parseInt(studies[a].nctId?.replace('NCT', '') || '0');
        const yearB = parseInt(studies[b].nctId?.replace('NCT', '') || '0');
        return ascending ? yearA - yearB : yearB - yearA;
      });
      break;

    case 'precision':
      // Sort by precision (1/se), most precise first
      order = studies.map((s, i) => i).sort((a, b) => {
        const precA = 1 / Math.sqrt(studies[a].vi);
        const precB = 1 / Math.sqrt(studies[b].vi);
        return ascending ? precB - precA : precA - precB;
      });
      break;

    case 'effect':
      // Sort by effect size
      order = studies.map((s, i) => i).sort((a, b) => {
        return ascending
          ? studies[a].yi - studies[b].yi
          : studies[b].yi - studies[a].yi;
      });
      break;

    case 'variance':
      // Sort by variance (smallest first)
      order = studies.map((s, i) => i).sort((a, b) => {
        return ascending
          ? studies[a].vi - studies[b].vi
          : studies[b].vi - studies[a].vi;
      });
      break;
  }

  // Perform cumulative analysis
  const results = model === 'RE'
    ? cumulativeRandomEffects(studies, order)
    : cumulativeFixedEffects(studies, order);

  // Find when significance was first achieved
  const firstSignificant = results.findIndex(r => r.significant);
  const significanceStep = firstSignificant >= 0 ? firstSignificant + 1 : null;

  return {
    model,
    sortBy,
    ascending,
    results,
    significanceStep,
    finalResult: results[results.length - 1],
    interpretation: significanceStep !== null
      ? `Effect became significant after ${significanceStep} studies`
      : 'Effect did not reach significance'
  };
}

/**
 * Generate cumulative meta-analysis plot data
 * @param {Array} studies - Array of studies with yi, vi
 * @param {Object} options - Analysis options
 * @returns {Object} Plot data for visualization
 */
export function cumulativePlotData(studies, options = {}) {
  const result = cumulativeMetaAnalysis(studies, options);

  if (result.error) {
    return { error: result.error };
  }

  const plotData = {
    x: result.results.map(r => r.k),
    y: result.results.map(r => r.theta),
    ciLower: result.results.map(r => r.ci_lower),
    ciUpper: result.results.map(r => r.ci_upper),
    labels: result.results.map(r => r.nctId),
    significant: result.results.map(r => r.significant),
    model: result.model,
    sortBy: result.sortBy
  };

  return {
    ...result,
    plotData
  };
}

/**
 * Test for cumulative meta-analysis stability
 * @param {Array} studies - Array of studies with yi, vi
 * @param {Object} options - Analysis options
 * @returns {Object} Stability test results
 */
export function testCumulativeStability(studies, options = {}) {
  const models = ['FE', 'RE'];
  const sortOptions = ['chronological', 'precision', 'effect'];

  const results = {};

  for (const model of models) {
    for (const sortBy of sortOptions) {
      const key = `${model}_${sortBy}`;
      const result = cumulativeMetaAnalysis(studies, { ...options, model, sortBy });

      if (!result.error) {
        results[key] = {
          finalEstimate: result.finalResult.theta,
          finalSE: result.finalResult.se,
          finalPValue: result.finalResult.pValue,
          significanceStep: result.significanceStep,
          everSignificant: result.results.some(r => r.significant)
        };
      }
    }
  }

  // Check consistency
  const estimates = Object.values(results).map(r => r.finalEstimate);
  const minEstimate = Math.min(...estimates);
  const maxEstimate = Math.max(...estimates);
  const range = maxEstimate - minEstimate;

  const consistent = range < 0.2;

  return {
    results,
    consistency: {
      minEstimate,
      maxEstimate,
      range,
      consistent,
      interpretation: consistent
        ? 'Cumulative results are stable across different ordering strategies'
        : 'Cumulative results vary substantially with ordering - may be sensitive to inclusion order'
    }
  };
}

/**
 * Sequential monitoring boundaries
 * @param {Array} studies - Array of studies with yi, vi
 * @param {Object} options - Analysis options
 * @returns {Object} Sequential monitoring results
 */
export function sequentialMonitoring(studies, options = {}) {
  const {
    alpha = 0.05,
    type = 'obrien-fleming', // 'obrien-fleming', 'pocock', 'haybittle-peto'
    looks = null // Number of interim analyses (null = use all studies)
  } = options;

  const k = studies.length;
  const nLooks = looks || k;

  if (k < 2) {
    return { error: 'Sequential monitoring requires at least 2 studies' };
  }

  // Calculate boundaries
  let boundaries;

  switch (type) {
    case 'obrien-fleming':
      // O'Brien-Fleming: conservative early, liberal late
      boundaries = [];
      for (let i = 1; i <= nLooks; i++) {
        const alpha_i = alpha * (i / nLooks) ** 2;
        const z_crit = normalQuantile(1 - alpha_i / 2);
        boundaries.push(z_crit);
      }
      break;

    case 'pocock':
      // Pocock: constant boundary
      const alpha_pocock = 2 * (1 - normalCDF(2.0)); // Approximate
      const z_pocock = normalQuantile(1 - alpha_pocock / 2);
      boundaries = Array(nLooks).fill(z_pocock);
      break;

    case 'haybittle-peto':
      // Haybittle-Peto: very conservative early (z=3), final alpha=0.05
      boundaries = Array(nLooks - 1).fill(3.0);
      boundaries.push(normalQuantile(1 - alpha / 2));
      break;

    default:
      boundaries = Array(nLooks).fill(normalQuantile(1 - alpha / 2));
  }

  // Perform cumulative analysis and check boundaries
  const cumulative = cumulativeMetaAnalysis(studies, { ...options, model: 'FE' });

  if (cumulative.error) {
    return cumulative;
  }

  const monitoring = cumulative.results.map((result, i) => {
    const zStat = result.z || result.t;
    const boundary = boundaries[Math.min(i, boundaries.length - 1)];
    const crossed = Math.abs(zStat) >= boundary;

    return {
      k: result.k,
      z: zStat,
      boundary,
      crossed,
      significant: result.significant
    };
  });

  const firstCrossed = monitoring.findIndex(m => m.crossed);

  return {
    type,
    alpha,
    monitoring,
    firstCrossed: firstCrossed >= 0 ? firstCrossed + 1 : null,
    conclusion: firstCrossed >= 0
      ? `Boundary crossed at look ${firstCrossed + 1} - may consider stopping`
      : 'No boundary crossed - continue monitoring',
    boundaries
  };
}

/**
 * Trial sequential analysis (TSA)
 * @param {Array} studies - Array of studies with yi, vi
 * @param {Object} options - Analysis options
 * @returns {Object} TSA results
 */
export function trialSequentialAnalysis(studies, options = {}) {
  const {
    effectSize = 0.5, // Minimal important effect
    alpha = 0.05,
    beta = 0.20, // Type II error (power = 1 - beta)
    sides = 2 // 1 or 2-sided
  } = options;

  const k = studies.length;

  if (k < 2) {
    return { error: 'TSA requires at least 2 studies' };
  }

  // Calculate required information size
  const z_alpha = normalQuantile(1 - alpha / sides);
  const z_beta = normalQuantile(1 - beta);

  // Get variance estimate from first study or average
  const avgVariance = studies.reduce((sum, s) => sum + s.vi, 0) / studies.length;

  // Required sample size formula (simplified)
  const requiredSize = (2 * avgVariance * Math.pow(z_alpha + z_beta, 2)) / Math.pow(effectSize, 2);

  // Perform cumulative analysis
  const cumulative = cumulativeMetaAnalysis(studies, { ...options, model: 'RE' });

  if (cumulative.error) {
    return cumulative;
  }

  // Generate monitoring boundaries
  const monitoring = cumulative.results.map((result, i) => {
    const n = result.k;
    const zCrit = normalQuantile(1 - alpha / sides);

    // Futility boundary (inner wedge)
    const futilityLower = -zCrit * (1 - Math.sqrt(n / requiredSize));
    const futilityUpper = zCrit * (1 - Math.sqrt(n / requiredSize));

    // Efficacy boundary (outer wedge)
    const efficacyLower = -zCrit * (1 + Math.sqrt(n / requiredSize));
    const efficacyUpper = zCrit * (1 + Math.sqrt(n / requiredSize));

    const zStat = result.z || result.t;

    return {
      k: n,
      z: zStat,
      futilityLower,
      futilityUpper,
      efficacyLower,
      efficacyUpper,
      crossedEfficacy: Math.abs(zStat) >= Math.abs(efficacyUpper),
      crossedFutility: Math.abs(zStat) <= Math.abs(futilityUpper),
      informationRatio: n / requiredSize
    };
  });

  const finalResult = monitoring[monitoring.length - 1];
  const informationSize = monitoring[monitoring.length - 1].informationRatio;

  return {
    effectSize,
    requiredSize,
    achievedSize: k,
    informationRatio: informationSize,
    monitoring,
    conclusion: finalResult.crossedEfficacy
      ? 'Efficacy boundary crossed - sufficient evidence'
      : finalResult.crossedFutility
        ? 'Futility boundary crossed - unlikely to find effect'
        : informationSize >= 1
          ? 'Required information size reached, boundaries not crossed - no significant effect'
          : `Information size not reached (${(informationSize * 100).toFixed(1)}% of required) - continue monitoring`
  };
}

export default {
  cumulativeMetaAnalysis,
  cumulativePlotData,
  testCumulativeStability,
  sequentialMonitoring,
  trialSequentialAnalysis
};
