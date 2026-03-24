/**
 * Influence Diagnostics for Meta-Analysis
 * Leave-one-out and other sensitivity analyses
 *
 * @module InfluenceDiagnostics
 * @see {@link https://doi.org/10.1002/sim.4782|Hartung & Knapp (2001) Stat Med 20(4):591-603}
 * @see {@link https://doi.org/10.1002/jrsm.1188|Baujat et al. (2002) Stat Med 21(4):521-537}
 * @description Influence diagnostics assess the robustness of meta-analysis results.
 *              Leave-one-out analysis removes each study sequentially and recalculates
 *              the pooled estimate. Baujat plots identify studies that contribute
 *              disproportionately to heterogeneity. GOSH plots examine the distribution
 *              of estimates across all possible study subsets.
 */

import { normalCDF, chiSquareCDF, tCDF, tQuantile } from '../utils.js';

/**
 * Fixed effects meta-analysis
 * @param {Array} studies - Array of studies with yi, vi
 * @returns {Object} Fixed effects result
 */
function fixedEffects(studies) {
  const k = studies.length;

  if (k === 0) {
    return { error: 'No studies provided' };
  }

  const weights = studies.map(s => 1 / s.vi);
  const sumWeights = weights.reduce((a, b) => a + b, 0);

  if (sumWeights === 0) {
    return { error: 'Invalid weights' };
  }

  const theta = weights.reduce((sum, w, i) => sum + w * studies[i].yi, 0) / sumWeights;
  const se = Math.sqrt(1 / sumWeights);
  const z = theta / se;
  const ci_lower = theta - 1.96 * se;
  const ci_upper = theta + 1.96 * se;
  const pValue = 2 * (1 - normalCDF(Math.abs(z)));

  // Q statistic
  const Q = weights.reduce((sum, w, i) => sum + w * Math.pow(studies[i].yi - theta, 2), 0);
  const df = k - 1;
  const pQ = 1 - chiSquareCDF(Q, df);
  const I2 = df > 0 ? Math.max(0, ((Q - df) / Q) * 100) : 0;

  return {
    model: 'FE',
    k,
    theta,
    se,
    ci_lower,
    ci_upper,
    z,
    pValue,
    Q,
    df,
    pQ,
    I2,
    weights
  };
}

/**
 * Random effects meta-analysis (DL)
 * @param {Array} studies - Array of studies with yi, vi
 * @returns {Object} Random effects result
 */
function randomEffectsDL(studies, options = {}) {
  const { hksj = true } = options;

  const k = studies.length;

  if (k === 0) {
    return { error: 'No studies provided' };
  }

  // Get FE estimate first
  const fe = fixedEffects(studies);
  if (fe.error) {
    return fe;
  }

  // Calculate tau²
  const wi = studies.map(s => 1 / s.vi);
  const sumWi = wi.reduce((a, b) => a + b, 0);
  const sumWi2 = wi.reduce((a, b) => a + b * b, 0);
  const C = sumWi - sumWi2 / sumWi;

  let tau2 = 0;
  if (k > 1 && fe.Q > k - 1) {
    tau2 = (fe.Q - (k - 1)) / C;
  }

  // Calculate RE estimate
  const wiStar = studies.map(s => 1 / (s.vi + tau2));
  const sumWiStar = wiStar.reduce((a, b) => a + b, 0);

  if (sumWiStar === 0) {
    return { error: 'Invalid weights after tau² adjustment' };
  }

  const theta = wiStar.reduce((sum, w, i) => sum + w * studies[i].yi, 0) / sumWiStar;
  let se = Math.sqrt(1 / sumWiStar);

  // HKSJ adjustment
  let hksjApplied = false;
  let tStat;
  let df = k - 1;

  if (hksj && k >= 2) {
    const qStar = wiStar.reduce((sum, w, i) =>
      sum + w * Math.pow(studies[i].yi - theta, 2), 0);
    const hksjMultiplier = qStar / df;

    if (hksjMultiplier > 1) {
      se = se * Math.sqrt(hksjMultiplier);
      hksjApplied = true;
    }

    const tCrit = tQuantile(0.975, df);
    const ci_lower = theta - tCrit * se;
    const ci_upper = theta + tCrit * se;
    tStat = theta / se;

    const pValue = 2 * (1 - tCDF(Math.abs(tStat), df));

    // Prediction interval
    let pi_lower = null;
    let pi_upper = null;

    if (k >= 3) {
      const piDF = k - 2;
      const piTCrit = tQuantile(0.975, piDF);
      const piSE = Math.sqrt(1 / sumWiStar + tau2);
      pi_lower = theta - piTCrit * piSE;
      pi_upper = theta + piTCrit * piSE;
    }

    return {
      model: 'RE-DL',
      k,
      theta,
      se,
      ci_lower,
      ci_upper,
      t: tStat,
      df,
      pValue,
      tau2,
      tau: Math.sqrt(tau2),
      pi_lower,
      pi_upper,
      Q: fe.Q,
      I2: fe.I2,
      hksj: hksjApplied,
      qStar,
      weights: wiStar
    };
  }

  // No HKSJ
  const ci_lower = theta - 1.96 * se;
  const ci_upper = theta + 1.96 * se;
  zStat = theta / se;
  const pValue = 2 * (1 - normalCDF(Math.abs(zStat)));

  return {
    model: 'RE-DL',
    k,
    theta,
    se,
    ci_lower,
    ci_upper,
    z: zStat,
    pValue,
    tau2,
    tau: Math.sqrt(tau2),
    Q: fe.Q,
    I2: fe.I2,
    hksj: false,
    weights: wiStar
  };
}

/**
 * Leave-one-out analysis
 * @param {Array} studies - Array of studies with yi, vi
 * @param {Object} options - Analysis options
 * @returns {Object} Leave-one-out results
 */
export function leaveOneOut(studies, options = {}) {
  const { model = 'RE', hksj = true } = options;

  const k = studies.length;

  if (k < 2) {
    return {
      error: 'Leave-one-out analysis requires at least 2 studies'
    };
  }

  // Full analysis
  const fullResult = model === 'RE'
    ? randomEffectsDL(studies, { hksj })
    : fixedEffects(studies);

  if (fullResult.error) {
    return fullResult;
  }

  // Leave-one-out results
  const leaveOneOutResults = [];

  for (let i = 0; i < k; i++) {
    const leftOutStudies = studies.filter((_, idx) => idx !== i);
    const result = model === 'RE'
      ? randomEffectsDL(leftOutStudies, { hksj })
      : fixedEffects(leftOutStudies);

    if (!result.error) {
      const diff = result.theta - fullResult.theta;
      const diffPercent = fullResult.theta !== 0
        ? (diff / Math.abs(fullResult.theta)) * 100
        : 0;

      leaveOneOutResults.push({
        omitted: studies[i].nctId || studies[i].id || `Study ${i + 1}`,
        k: result.k,
        theta: result.theta,
        se: result.se,
        ci_lower: result.ci_lower,
        ci_upper: result.ci_upper,
        pValue: result.pValue,
        diff,
        diffPercent,
        tau2: result.tau2,
        I2: result.I2,
        influential: Math.abs(diffPercent) > 10 // Flag if >10% change
      });
    }
  }

  // Find most influential study
  const sortedByInfluence = [...leaveOneOutResults].sort((a, b) =>
    Math.abs(b.diffPercent) - Math.abs(a.diffPercent)
  );

  const mostInfluential = sortedByInfluence[0];

  // Check if full estimate is within all leave-one-out CIs
  const withinAllCIs = leaveOneOutResults.every(r =>
    fullResult.theta >= r.ci_lower && fullResult.theta <= r.ci_upper
  );

  return {
    full: {
      theta: fullResult.theta,
      se: fullResult.se,
      ci_lower: fullResult.ci_lower,
      ci_upper: fullResult.ci_upper,
      pValue: fullResult.pValue,
      tau2: fullResult.tau2,
      I2: fullResult.I2
    },
    leaveOneOut: leaveOneOutResults,
    mostInfluential,
    withinAllCIs,
    interpretation: mostInfluential && Math.abs(mostInfluential.diffPercent) > 10
      ? `Study "${mostInfluential.omitted}" has substantial influence (${mostInfluential.diffPercent.toFixed(1)}% change when omitted)`
      : 'No single study has substantial influence on the overall estimate'
  };
}

/**
 * Baujat plot data (influence vs heterogeneity)
 * @param {Array} studies - Array of studies with yi, vi
 * @param {Object} options - Analysis options
 * @returns {Object} Baujat plot data
 */
export function baujatPlot(studies, options = {}) {
  const k = studies.length;

  if (k < 3) {
    return { error: 'Baujat plot requires at least 3 studies' };
  }

  const influence = [];
  const heterogeneity = [];

  for (let i = 0; i < k; i++) {
    const leftOut = studies.filter((_, idx) => idx !== i);
    const result = randomEffectsDL(leftOut, options);

    if (!result.error) {
      // Influence: squared difference from full estimate
      const full = randomEffectsDL(studies, options);
      const diff = full.theta - result.theta;
      influence.push(Math.pow(diff, 2));

      // Heterogeneity: contribution to Q
      const wi = leftOut.map(s => 1 / s.vi);
      const sumWi = wi.reduce((a, b) => a + b, 0);
      const thetaLO = wi.reduce((sum, w, idx) => sum + w * leftOut[idx].yi, 0) / sumWi;
      const Q = wi.reduce((sum, w, idx) =>
        sum + w * Math.pow(leftOut[idx].yi - thetaLO, 2), 0);
      heterogeneity.push(Q);
    }
  }

  return {
    x: heterogeneity,
    y: influence,
    labels: studies.map((s, i) => s.nctId || s.id || `Study ${i + 1}`),
    interpretation: 'Studies in the upper-right corner are both influential and contribute to heterogeneity'
  };
}

/**
 * GOSH plot (Graphical Display of Study Heterogeneity)
 * @param {Array} studies - Array of studies with yi, vi
 * @param {Object} options - Analysis options
 * @returns {Object} GOSH plot data
 */
export function goshPlot(studies, options = {}) {
  const {
    nSubsets = 1000,
    minStudiesPerSubset = 3
  } = options;

  const k = studies.length;

  if (k < 4) {
    return { error: 'GOSH plot requires at least 4 studies' };
  }

  const estimates = [];
  const heterogeneity = [];

  // Generate random subsets
  for (let i = 0; i < nSubsets; i++) {
    // Random subset size (at least minStudiesPerSubset)
    const subsetSize = Math.floor(
      Math.random() * (k - minStudiesPerSubset + 1) + minStudiesPerSubset
    );

    // Randomly select studies
    const indices = new Set();
    while (indices.size < subsetSize) {
      indices.add(Math.floor(Math.random() * k));
    }

    const subset = Array.from(indices).map(i => studies[i]);
    const result = randomEffectsDL(subset, options);

    if (!result.error) {
      estimates.push(result.theta);
      heterogeneity.push(result.I2 || 0);
    }
  }

  // Calculate contours
  const estimateMean = estimates.reduce((a, b) => a + b, 0) / estimates.length;
  const estimateSD = Math.sqrt(
    estimates.reduce((sum, e) => sum + Math.pow(e - estimateMean, 2), 0) / estimates.length
  );
  const i2Mean = heterogeneity.reduce((a, b) => a + b, 0) / heterogeneity.length;

  return {
    x: heterogeneity,
    y: estimates,
    contours: {
      estimateMean,
      estimateSD,
      i2Mean
    },
    interpretation: `Cloud center represents typical estimates (mean=${estimateMean.toFixed(3)}, I²=${i2Mean.toFixed(1)}%)`
  };
}

/**
 * Sensitivity analysis statistics
 * @param {Array} studies - Array of studies with yi, vi
 * @param {Object} options - Analysis options
 * @returns {Object} Sensitivity analysis summary
 */
export function sensitivityAnalysis(studies, options = {}) {
  const loo = leaveOneOut(studies, options);

  if (loo.error) {
    return loo;
  }

  // Calculate statistics
  const thetaDiff = loo.leaveOneOut.map(r => r.diff);
  const thetaDiffPercent = loo.leaveOneOut.map(r => r.diffPercent);

  const minDiff = Math.min(...thetaDiff);
  const maxDiff = Math.max(...thetaDiff);
  const meanDiff = thetaDiff.reduce((a, b) => a + b, 0) / thetaDiff.length;

  const minDiffPercent = Math.min(...thetaDiffPercent);
  const maxDiffPercent = Math.max(...thetaDiffPercent);
  const meanDiffPercent = thetaDiffPercent.reduce((a, b) => a + b, 0) / thetaDiffPercent.length;

  // Count influential studies
  const influentialCount = loo.leaveOneOut.filter(r => r.influential).length;

  return {
    ...loo,
    statistics: {
      minDiff,
      maxDiff,
      meanDiff,
      minDiffPercent,
      maxDiffPercent,
      meanDiffPercent,
      influentialCount,
      totalStudies: studies.length,
      influentialProportion: influentialCount / studies.length
    },
    interpretation: influentialCount === 0
      ? 'Results are robust: no single study substantially affects the overall estimate'
      : influentialCount === 1
        ? 'One influential study identified: consider sensitivity analysis without this study'
        : `${influentialCount} influential studies identified: results may be sensitive to individual studies`
  };
}

/**
    * Influence report generation
    * @param {Array} studies - Array of studies with yi, vi
    * @param {Object} options - Analysis options
    * @returns {string} HTML report
    */
export function generateInfluenceReport(studies, options = {}) {
  const sensitivity = sensitivityAnalysis(studies, options);

  if (sensitivity.error) {
    return `<div class="error">${sensitivity.error}</div>`;
  }

  let html = `
    <div class="influence-report p-6">
      <h2 class="text-xl font-bold mb-4">Influence Diagnostics Report</h2>

      <div class="mb-6 p-4 bg-gray-50 rounded-lg">
        <h3 class="font-semibold mb-2">Overall Interpretation</h3>
        <p class="text-gray-700">${sensitivity.interpretation}</p>
      </div>

      <div class="mb-6">
        <h3 class="font-semibold mb-2">Full Analysis</h3>
        <div class="grid grid-cols-2 gap-4 text-sm">
          <div>Estimate: <strong>${sensitivity.full.theta.toFixed(4)}</strong></div>
          <div>SE: <strong>${sensitivity.full.se.toFixed(4)}</strong></div>
          <div>95% CI: <strong>[${sensitivity.full.ci_lower.toFixed(4)}, ${sensitivity.full.ci_upper.toFixed(4)}]</strong></div>
          <div>p-value: <strong>${sensitivity.full.pValue.toFixed(4)}</strong></div>
          ${sensitivity.full.tau2 !== undefined ? `
            <div>τ²: <strong>${sensitivity.full.tau2.toFixed(4)}</strong></div>
            <div>I²: <strong>${sensitivity.full.I2.toFixed(1)}%</strong></div>
          ` : ''}
        </div>
      </div>

      <div class="mb-6">
        <h3 class="font-semibold mb-2">Sensitivity Statistics</h3>
        <div class="grid grid-cols-2 gap-4 text-sm">
          <div>Min change: <strong>${sensitivity.statistics.minDiffPercent.toFixed(1)}%</strong></div>
          <div>Max change: <strong>${sensitivity.statistics.maxDiffPercent.toFixed(1)}%</strong></div>
          <div>Mean change: <strong>${sensitivity.statistics.meanDiffPercent.toFixed(1)}%</strong></div>
          <div>Influential studies: <strong>${sensitivity.statistics.influentialCount}/${sensitivity.statistics.totalStudies}</strong></div>
        </div>
      </div>

      <div class="mb-6">
        <h3 class="font-semibold mb-2">Leave-One-Out Results</h3>
        <div class="overflow-x-auto">
          <table class="min-w-full text-sm">
            <thead class="bg-gray-100">
              <tr>
                <th class="px-4 py-2 text-left">Omitted Study</th>
                <th class="px-4 py-2 text-right">Estimate</th>
                <th class="px-4 py-2 text-right">SE</th>
                <th class="px-4 py-2 text-right">95% CI</th>
                <th class="px-4 py-2 text-right">Change</th>
                <th class="px-4 py-2 text-right">Change %</th>
              </tr>
            </thead>
            <tbody>
  `;

  for (const result of sensitivity.leaveOneOut) {
    const isInfluential = result.influential;
    html += `
      <tr class="${isInfluential ? 'bg-yellow-50' : ''}">
        <td class="px-4 py-2 ${isInfluential ? 'font-semibold text-yellow-700' : ''}">${result.omitted}</td>
        <td class="px-4 py-2 text-right">${result.theta.toFixed(4)}</td>
        <td class="px-4 py-2 text-right">${result.se.toFixed(4)}</td>
        <td class="px-4 py-2 text-right">[${result.ci_lower.toFixed(4)}, ${result.ci_upper.toFixed(4)}]</td>
        <td class="px-4 py-2 text-right">${result.diff.toFixed(4)}</td>
        <td class="px-4 py-2 text-right">${result.diffPercent.toFixed(1)}%</td>
      </tr>
    `;
  }

  html += `
            </tbody>
          </table>
        </div>
      </div>

      ${sensitivity.mostInfluential && Math.abs(sensitivity.mostInfluential.diffPercent) > 10 ? `
        <div class="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h3 class="font-semibold text-yellow-800 mb-1">Most Influential Study</h3>
          <p class="text-yellow-700">
            <strong>${sensitivity.mostInfluential.omitted}</strong> causes a
            ${sensitivity.mostInfluential.diffPercent.toFixed(1)}% change in the overall estimate.
            Consider reporting results with and without this study.
          </p>
        </div>
      ` : ''}
    </div>
  `;

  return html;
}

export default {
  leaveOneOut,
  baujatPlot,
  goshPlot,
  sensitivityAnalysis,
  generateInfluenceReport
};
