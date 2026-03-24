/**
 * Network Meta-Analysis - Inconsistency Measures
 * Tests for inconsistency in treatment networks
 *
 * @module InconsistencyMeasures
 * @see {@link https://doi.org/10.1002/jrsm.1278|White et al. (2012) RSM 3:80-89}
 * @description Implements node-splitting, side-splitting, and design-by-treatment
 *              interaction tests for detecting inconsistency in NMA networks.
 */

import { normalCDF, tCDF, tQuantile, chiSquareCDF } from '../statistics-utils.js';
import { buildNetworkGraph } from './graph-builder.js';

/**
 * Node-splitting approach for detecting local inconsistency
 * Splits the network at a node and compares direct vs indirect evidence
 *
 * @param {Array} studies - Array of study objects
 * @param {string} splitNode - Treatment node to split
 * @param {Object} options - Analysis options
 * @returns {Object} Node-splitting results
 */
export function nodeSplitting(studies, splitNode, options = {}) {
  const {
    tauMethod = 'DL', // 'DL', 'REML', 'PM'
    hksj = true,
    alpha = 0.05
  } = options;

  const graph = buildNetworkGraph(studies);

  // Get studies that directly compare with splitNode
  const connectedTreatments = Array.from(graph.nodes.get(splitNode)?.connectedTo || []);

  const results = [];

  for (const comparator of connectedTreatments) {
    // Separate studies into direct and indirect evidence
    const directStudies = studies.filter(s => {
      const treatments = s.arms?.map(a => a.treatment) || [];
      return treatments.includes(splitNode) && treatments.includes(comparator) && treatments.length === 2;
    });

    if (directStudies.length === 0) continue;

    // Get indirect evidence (studies not comparing these directly)
    // These form a path through other treatments
    const indirectEstimate = calculateIndirectEffect(studies, splitNode, comparator, {
      tauMethod,
      hksj
    });

    // Direct effect estimate
    const directEstimate = calculateDirectEffect(directStudies, splitNode, comparator, {
      tauMethod,
      hksj
    });

    if (indirectEstimate.error || directEstimate.error) continue;

    // Compare direct vs indirect
    const difference = directEstimate.effect - indirectEstimate.effect;
    const seDiff = Math.sqrt(
      Math.pow(directEstimate.se, 2) + Math.pow(indirectEstimate.se, 2)
    );

    const z = difference / seDiff;
    const pValue = 2 * (1 - normalCDF(Math.abs(z)));

    const ciLower = difference - 1.96 * seDiff;
    const ciUpper = difference + 1.96 * seDiff;

    results.push({
      splitNode,
      comparator,
      direct: directEstimate,
      indirect: indirectEstimate,
      difference,
      seDiff,
      z,
      pValue,
      ciLower,
      ciUpper,
      inconsistent: pValue < alpha,
      interpretation: pValue < alpha
        ? `Significant inconsistency detected between ${splitNode} and ${comparator}`
        : `No significant inconsistency between ${splitNode} and ${comparator}`
    });
  }

  return {
    splitNode,
    comparisons: results,
    overallInconsistency: results.some(r => r.inconsistent),
    nComparisons: results.length
  };
}

/**
 * Side-splitting test for inconsistency in closed loops
 * @param {Array} studies - Array of study objects
 * @param {Array} loop - Array of treatments in the loop [A, B, C, ...]
 * @param {Object} options - Analysis options
 * @returns {Object} Side-splitting results
 */
export function sideSplitting(studies, loop, options = {}) {
  const {
    tauMethod = 'DL',
    alpha = 0.05
  } = options;

  if (loop.length < 3) {
    return { error: 'Loop must contain at least 3 treatments' };
  }

  // Get all pairwise comparisons in the loop
  const comparisons = [];

  for (let i = 0; i < loop.length; i++) {
    const t1 = loop[i];
    const t2 = loop[(i + 1) % loop.length];

    // Find studies comparing t1 and t2
    const edgeStudies = studies.filter(s => {
      const treatments = s.arms?.map(a => a.treatment) || [];
      return treatments.includes(t1) && treatments.includes(t2);
    });

    if (edgeStudies.length > 0) {
      const effect = calculateDirectEffect(edgeStudies, t1, t2, { tauMethod });
      if (!effect.error) {
        comparisons.push({
          t1,
          t2,
          effect: effect.effect,
          se: effect.se,
          studies: edgeStudies.length
        });
      }
    }
  }

  // Check if we have all edges in the loop
  if (comparisons.length !== loop.length) {
    return {
      error: `Loop incomplete: found ${comparisons.length} edges, expected ${loop.length}`
    };
  }

  // Calculate inconsistency: sum of effects around loop should be zero
  const sumEffects = comparisons.reduce((sum, comp) => sum + comp.effect, 0);
  const sumVariances = comparisons.reduce((sum, comp) => sum + comp.se * comp.se, 0);
  const seLoop = Math.sqrt(sumVariances);

  const z = sumEffects / seLoop;
  const pValue = 2 * (1 - normalCDF(Math.abs(z)));

  const ciLower = sumEffects - 1.96 * seLoop;
  const ciUpper = sumEffects + 1.96 * seLoop;

  return {
    loop,
    comparisons,
    sumEffects,
    seLoop,
    z,
    pValue,
    ciLower,
    ciUpper,
    inconsistent: pValue < alpha,
    interpretation: pValue < alpha
      ? `Significant inconsistency detected in loop ${loop.join(' → ')}`
      : `No significant inconsistency in loop ${loop.join(' → ')}`
  };
}

/**
 * Design-by-treatment interaction model
 * Global test for inconsistency across the network
 *
 * @param {Array} studies - Array of study objects
 * @param {Object} options - Analysis options
 * @returns {Object} Design interaction results
 */
export function designByTreatmentInteraction(studies, options = {}) {
  const {
    tauMethod = 'DL',
    alpha = 0.05
  } = options;

  // Build network to identify designs
  const graph = buildNetworkGraph(studies);

  // Group studies by design (set of treatments compared)
  const designGroups = new Map();

  for (const study of studies) {
    const treatments = study.arms?.map(a => a.treatment).sort() || [];
    const designKey = treatments.join('-');

    if (!designGroups.has(designKey)) {
      designGroups.set(designKey, []);
    }

    designGroups.get(designKey).push(study);
  }

  // For each design, fit a separate model
  const designEstimates = [];
  const degreesOfFreedom = [];

  for (const [designKey, designStudies] of designGroups) {
    if (designStudies.length < 2) continue;

    // Fit model for this design
    // This is simplified - full implementation would fit each comparison separately
    const effect = calculateDesignEffect(designStudies, designKey, { tauMethod });

    if (!effect.error) {
      designEstimates.push({
        design: designKey,
        effect: effect.effect,
        se: effect.se,
        nStudies: designStudies.length
      });
      degreesOfFreedom.push(designStudies.length - 1);
    }
  }

  if (designEstimates.length < 2) {
    return {
      error: 'Need at least 2 different designs to test inconsistency',
      nDesigns: designEstimates.length
    };
  }

  // Calculate Q for inconsistency
  // This is a simplified calculation
  const overallEffect = designEstimates.reduce((sum, d) =>
    sum + d.effect * d.nStudies, 0) /
    designEstimates.reduce((sum, d) => sum + d.nStudies, 0);

  const Q = designEstimates.reduce((sum, d) =>
    sum + d.nStudies * Math.pow(d.effect - overallEffect, 2), 0
  );

  const df = designEstimates.length - 1;
  const pValue = 1 - chiSquareCDF(Q, df);

  const ic2 = Math.max(0, (Q - df) / Q * 100); // Inconsistency I²

  return {
    nDesigns: designEstimates.length,
    designEstimates,
    overallEffect,
    Q,
    df,
    pValue,
    ic2,
    inconsistent: pValue < alpha,
    interpretation: pValue < alpha
      ? `Significant design-by-treatment interaction detected (Q=${Q.toFixed(2)}, p=${pValue.toFixed(4)})`
      : `No significant inconsistency detected across designs`
  };
}

/**
 * Separate direct effect estimate
 * @private
 */
function calculateDirectEffect(studies, t1, t2, options = {}) {
  const { tauMethod = 'DL', hksj = true } = options;

  // Calculate effect sizes for all studies
  const effects = studies.map(study => {
    const arm1 = study.arms?.find(a => a.treatment === t1);
    const arm2 = study.arms?.find(a => a.treatment === t2);

    if (!arm1 || !arm2) return null;

    // For binary outcomes (events/denominator)
    if (arm1.events !== undefined && arm2.events !== undefined) {
      const a = arm1.events;
      const c = arm2.events;
      const b = arm1.denominator - a;
      const d = arm2.denominator - c;

      const logOR = Math.log((a * d) / (b * c));
      const variance = 1/a + 1/b + 1/c + 1/d;

      return { yi: logOR, vi: variance };
    }

    // For continuous outcomes (mean, sd, n)
    if (arm1.mean !== undefined && arm2.mean !== undefined) {
      const m1 = arm1.mean;
      const m2 = arm2.mean;
      const sd1 = arm1.sd;
      const sd2 = arm2.sd;
      const n1 = arm1.n;
      const n2 = arm2.n;

      const pooledSD = Math.sqrt(((n1 - 1) * sd1 * sd1 + (n2 - 1) * sd2 * sd2) / (n1 + n2 - 2));
      const d = (m1 - m2) / pooledSD;
      const J = 1 - (3 / (4 * (n1 + n2) - 5));
      const g = J * d;

      const variance = J * J * ((n1 + n2) / (n1 * n2) + d * d / (2 * (n1 + n2)));

      return { yi: g, vi: variance };
    }

    return null;
  }).filter(e => e !== null && e.yi !== null && !isNaN(e.yi));

  if (effects.length === 0) {
    return { error: `Could not calculate effects for ${t1} vs ${t2}` };
  }

  // Meta-analysis of effects
  return metaAnalyzeEffects(effects, { tauMethod, hksj });
}

/**
 * Calculate indirect estimate through other treatments
 * @private
 */
function calculateIndirectEffect(studies, t1, t2, options = {}) {
  const { tauMethod = 'DL', hksj = true } = options;

  const graph = buildNetworkGraph(studies);

  // Find all paths from t1 to t2 through intermediate treatments
  const paths = findAllPaths(graph, t1, t2, 2); // Max length 2 for simplicity

  if (paths.length === 0) {
    return { error: `No indirect path found from ${t1} to ${t2}` };
  }

  // For each path, calculate indirect effect
  const pathEffects = [];

  for (const path of paths) {
    // Path is [t1, intermediate, t2] or longer
    // Calculate effect through each edge
    let pathEffect = 0;
    let pathVariance = 0;
    let validPath = true;

    for (let i = 0; i < path.length - 1; i++) {
      const edgeT1 = path[i];
      const edgeT2 = path[i + 1];

      const edgeStudies = studies.filter(s => {
        const treatments = s.arms?.map(a => a.treatment) || [];
        return treatments.includes(edgeT1) && treatments.includes(edgeT2);
      });

      const edgeEffect = calculateDirectEffect(edgeStudies, edgeT1, edgeT2, {
        tauMethod,
        hksj: false
      });

      if (edgeEffect.error) {
        validPath = false;
        break;
      }

      pathEffect += edgeEffect.effect;
      pathVariance += edgeEffect.se * edgeEffect.se;
    }

    if (validPath) {
      pathEffects.push({
        path: path.join(' → '),
        effect: pathEffect,
        se: Math.sqrt(pathVariance)
      });
    }
  }

  if (pathEffects.length === 0) {
    return { error: `Could not calculate any valid indirect paths from ${t1} to ${t2}` };
  }

  // Pool path effects using inverse variance weighting
  return metaAnalyzeEffects(pathEffects, { tauMethod, hksj });
}

/**
 * Find all paths between two treatments in the network
 * @private
 */
function findAllPaths(graph, start, end, maxLength) {
  const paths = [];
  const visited = new Set();

  function dfs(current, path, depth) {
    if (depth > maxLength) return;
    if (current === end) {
      paths.push([...path]);
      return;
    }

    const neighbors = graph.nodes.get(current)?.connectedTo || [];
    visited.add(current);

    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        path.push(neighbor);
        dfs(neighbor, path, depth + 1);
        path.pop();
      }
    }

    visited.delete(current);
  }

  dfs(start, [start], 0);
  return paths;
}

/**
 * Meta-analysis of effect estimates
 * @private
 */
function metaAnalyzeEffects(effects, options = {}) {
  const { tauMethod = 'DL', hksj = true } = options;

  const yi = effects.map(e => e.yi);
  const vi = effects.map(e => e.vi);
  const k = yi.length;

  // Fixed effects
  const w = vi.map(v => 1 / v);
  const sumW = w.reduce((a, b) => a + b, 0);
  const thetaFE = w.reduce((sum, wi, i) => sum + wi * yi[i], 0) / sumW;

  // Q statistic
  const Q = w.reduce((sum, wi, i) => sum + wi * Math.pow(yi[i] - thetaFE, 0), 0);
  const df = k - 1;

  // Tau² estimation
  let tau2 = 0;

  if (tauMethod === 'DL') {
    const sumW2 = w.reduce((a, b) => a + b * b, 0);
    const C = sumW - sumW2 / sumW;

    if (df > 0 && Q > df) {
      tau2 = (Q - df) / C;
    }
  }
  // Could add PM and REML here

  tau2 = Math.max(0, tau2);

  // Random effects estimate
  const wStar = vi.map(v => 1 / (v + tau2));
  const sumWStar = wStar.reduce((a, b) => a + b, 0);
  const theta = wStar.reduce((sum, wi, i) => sum + wi * yi[i], 0) / sumWStar;

  // Standard error
  let se = Math.sqrt(1 / sumWStar);

  // HKSJ adjustment
  let tStat, df_t, pValue, ciLower, ciUpper;

  if (hksj && k >= 2) {
    const qStar = wStar.reduce((sum, wi, i) =>
      sum + wi * Math.pow(yi[i] - theta, 2), 0
    );
    const multiplier = qStar / df;
    se = se * Math.sqrt(Math.max(1, multiplier));

    df_t = df;
    const tCrit = tQuantile(0.975, df_t);
    tStat = theta / se;
    pValue = 2 * (1 - tCDF(Math.abs(tStat), df_t));

    ciLower = theta - tCrit * se;
    ciUpper = theta + tCrit * se;
  } else {
    const zCrit = 1.96;
    tStat = theta / se;
    pValue = 2 * (1 - normalCDF(Math.abs(tStat)));

    ciLower = theta - zCrit * se;
    ciUpper = theta + zCrit * se;
  }

  return {
    effect: theta,
    se,
    tStat,
    pValue,
    ciLower,
    ciUpper,
    tau2,
    tau: Math.sqrt(tau2),
    nStudies: k
  };
}

/**
 * Calculate effect for a specific design
 * @private
 */
function calculateDesignEffect(studies, design, options = {}) {
  // This is a placeholder - full implementation would analyze
  // each comparison within the design separately
  return metaAnalyzeEffects(studies, options);
}

/**
 * Inconsistency heatmap data for visualization
 * @param {Array} studies - Array of study objects
 * @returns {Object} Heatmap data
 */
export function createInconsistencyHeatmap(studies) {
  const graph = buildNetworkGraph(studies);
  const treatments = graph.getTreatments();
  const n = treatments.length;

  // Create matrix of inconsistency values
  const matrix = Array(n).fill(null).map(() => Array(n).fill(null));
  const labels = treatments.map(t => t.id);

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const t1 = labels[i];
      const t2 = labels[j];

      // Run node-splitting for this comparison
      const result = nodeSplitting(studies, t1);

      const comparison = result.comparisons?.find(c => c.comparator === t2);
      if (comparison) {
        // Use z-score as inconsistency measure
        matrix[i][j] = Math.abs(comparison.z);
        matrix[j][i] = Math.abs(comparison.z);
      }
    }
  }

  return {
    labels,
    matrix,
    title: 'Inconsistency Heatmap (z-scores)',
    interpretation: 'Higher values indicate greater inconsistency'
  };
}

/**
 * Net heat plot for inconsistency visualization
 * @param {Array} studies - Array of study objects
 * @returns {Object} Net heat plot data
 */
export function createNetHeatPlot(studies) {
  const graph = buildNetworkGraph(studies);
  const summary = graph.getSummary();

  // Calculate contribution of each design to Q
  const designQ = new Map();

  for (const study of studies) {
    const treatments = study.arms?.map(a => a.treatment).sort() || [];
    const designKey = treatments.join('-');

    const studyQ = calculateStudyContribution(study, studies);
    const currentQ = designQ.get(designKey) || 0;
    designQ.set(designKey, currentQ + studyQ);
  }

  const designs = Array.from(designQ.keys());
  const qValues = Array.from(designQ.values());

  return {
    designs,
    qValues,
    summary,
    interpretation: 'Bar heights show contribution to overall heterogeneity'
  };
}

/**
 * Calculate a study's contribution to Q
 * @private
 */
function calculateStudyContribution(study, allStudies) {
  // Simplified - full implementation would calculate
  // the study's contribution to the overall Q statistic
  return 1; // Placeholder
}

/**
 * Summary of all inconsistency tests
 * @param {Array} studies - Array of study objects
 * @returns {Object} Combined inconsistency summary
 */
export function summaryInconsistency(studies, options = {}) {
  const graph = buildNetworkGraph(studies);
  const summary = graph.getSummary();

  if (!summary.isConnected) {
    return {
      summary,
      error: 'Network is not connected - cannot assess inconsistency',
      components: graph.getDisconnectedComponents()
    };
  }

  // Run all inconsistency tests
  const results = {
    networkSummary: summary,
    nodeSplitting: null,
    sideSplitting: [],
    designInteraction: null,
    overallAssessment: null
  };

  // Node-splitting for hub treatment
  const hub = graph.getHub();
  if (hub) {
    results.nodeSplitting = nodeSplitting(studies, hub.id, options);
  }

  // Side-splitting for all loops
  const loops = findAllLoops(graph, 5);
  for (const loop of loops) {
    const result = sideSplitting(studies, loop, options);
    if (!result.error) {
      results.sideSplitting.push(result);
    }
  }

  // Design-by-treatment interaction
  results.designInteraction = designByTreatmentInteraction(studies, options);

  // Overall assessment
  const hasInconsistency =
    (results.nodeSplitting?.overallInconsistency || false) ||
    results.sideSplitting.some(s => s.inconsistent) ||
    (results.designInteraction?.inconsistent || false);

  results.overallAssessment = {
    hasInconsistency,
    interpretation: hasInconsistency
      ? 'Evidence of inconsistency detected in the network'
      : 'No significant inconsistency detected in the network',
    recommendations: hasInconsistency
      ? ['Consider subgroup analysis', 'Check for effect modifiers', 'Investigate potential sources of heterogeneity']
      : ['Network appears consistent', 'Results can be trusted for decision-making']
  };

  return results;
}

/**
 * Find all loops in the network up to max length
 * @private
 */
function findAllLoops(graph, maxLength = 5) {
  const loops = [];
  const treatments = graph.getTreatments().map(t => t.id);
  const visited = new Set();

  function findLoops(start, path, length) {
    if (length > maxLength) return;

    const current = path[path.length - 1];

    for (const treatment of treatments) {
      if (treatment === current) continue;

      const hasConnection = graph.nodes.get(current)?.connectedTo.has(treatment);
      if (!hasConnection) continue;

      // Check if this would complete a loop
      if (path.includes(treatment)) {
        if (path.length >= 3 && treatment === path[0]) {
          // Found a loop
          const loop = [...path];
          const loopKey = loop.sort().join('-');
          if (!visited.has(loopKey)) {
            visited.add(loopKey);
            loops.push(loop);
          }
        }
        continue;
      }

      // Extend path
      path.push(treatment);
      findLoops(start, path, length + 1);
      path.pop();
    }
  }

  for (const treatment of treatments) {
    findLoops(treatment, [treatment], 1);
  }

  return loops;
}

export default {
  nodeSplitting,
  sideSplitting,
  designByTreatmentInteraction,
  createInconsistencyHeatmap,
  createNetHeatPlot,
  summaryInconsistency
};
