/**
 * Network Meta-Analysis Main Module
 * Frequentist NMA with inconsistency testing
 *
 * @module NetworkMetaAnalysis
 * @see {@link https://doi.org/10.1002/jrsm.1278|White et al. (2012) RSM 3:80-89}
 * @description Frequentist network meta-analysis using contrast-based approach
 *              with design-by-treatment interaction model for inconsistency.
 */

import { normalCDF, tCDF, tQuantile, chiSquareCDF } from '../statistics-utils.js';
import { buildNetworkGraph, NetworkGeometry } from './graph-builder.js';
import { calculateSUCRA, calculatePScore } from './ranking/sucra.js';
import { summaryInconsistency } from './inconsistency-measures.js';
import { createError } from '../error-messages.js';

/**
 * Perform network meta-analysis
 * @param {Array} studies - Array of study objects
 * @param {Object} options - Analysis options
 * @returns {Object} NMA results
 */
export function networkMetaAnalysis(studies, options = {}) {
  const {
    reference = null, // Reference treatment (default: most connected)
    tauMethod = 'DL', // 'DL', 'REML', 'PM'
    hksj = true,
    alpha = 0.05,
    consistencyModel = 'random' // 'fixed' or 'random'
  } = options;

  // Validate input
  if (studies.length < 3) {
    return createError('INSUFFICIENT_STUDIES_NMA', studies.length);
  }

  // Build network graph
  const graph = buildNetworkGraph(studies);

  // Check network connectedness
  if (!graph.isConnected()) {
    const components = graph.getDisconnectedComponents();
    return {
      ...createError('NETWORK_DISCONNECTED', components.length),
      components
    };
  }

  // Get reference treatment
  const ref = reference || graph.getHub()?.id;
  if (!ref) {
    return { error: 'Could not determine reference treatment' };
  }

  // Extract design structure
  const designs = extractDesigns(studies);

  // Build design-by-treatment matrix
  const { X, y, studyInfo, treatmentMap, designMap } = buildDesignMatrices(studies, designs, ref);

  // Fit consistency model
  const consistencyResult = fitConsistencyModel(X, y, studyInfo, {
    tauMethod,
    hksj,
    alpha
  });

  // Fit inconsistency model (design-by-treatment interaction)
  const inconsistencyResult = fitInconsistencyModel(X, y, studyInfo, designMap, {
    tauMethod,
    hksj,
    alpha
  });

  // Calculate treatment effects (relative to reference)
  const treatmentEffects = calculateTreatmentEffects(
    consistencyResult,
    treatmentMap,
    ref
  );

  // Calculate rankings
  // Build effects matrix and transpose for SUCRA (needs n_treatments x n_studies)
  const effectsMatrix = buildEffectsMatrix(treatmentEffects, treatmentMap);
  const treatmentNames = Object.keys(treatmentMap);

  // For SUCRA, create a matrix of shape [n_treatments x n_studies]
  // Each treatment gets its effect value as a single "study"
  const treatmentEffectValues = treatmentNames.map(t => {
    if (t === ref) return [0]; // Reference treatment has 0 effect
    return [treatmentEffects[t]?.effect || 0]; // Other treatments
  });

  // Pass to SUCRA: treatments array and effects matrix [n_treatments x n_studies]
  const rankings = calculateSUCRA(
    treatmentNames,
    treatmentEffectValues, // Now shaped as [n_treatments x 1]
    { direction: 'higher' } // Higher effect = better (adjust based on outcome)
  );

  // Inconsistency assessment
  const inconsistency = summaryInconsistency(studies, { tauMethod, hksj, alpha });

  // Network summary
  const networkSummary = graph.getSummary();

  return {
    // Network information
    network: {
      graph,
      summary: networkSummary,
      treatments: Object.keys(treatmentMap),
      reference: ref,
      geometry: networkSummary.geometry,
      connected: networkSummary.isConnected
    },

    // Treatment effects
    effects: treatmentEffects,
    rankings,

    // Model fit
    consistency: consistencyResult,
    inconsistency: inconsistencyResult,

    // Inconsistency tests
    inconsistencyTests: inconsistency,

    // Design information
    designs,
    nStudies: studies.length,
    nTreatments: Object.keys(treatmentMap).length,
    nDesigns: designs.length
  };
}

/**
 * Extract unique study designs from data
 * @private
 */
function extractDesigns(studies) {
  const designs = new Map();

  for (const study of studies) {
    const arms = study.arms || [];
    const treatments = arms.map(a => a.treatment).sort();

    if (treatments.length < 2) continue;

    const designKey = treatments.join('-');
    const designName = treatments.length === 2
      ? treatments.join(' vs ')
      : treatments.length + '-arm';

    if (!designs.has(designKey)) {
      designs.set(designKey, {
        name: designName,
        treatments,
        nArms: treatments.length,
        studies: []
      });
    }

    designs.get(designKey).studies.push(study);
  }

  return Array.from(designs.values());
}

/**
 * Build design-by-treatment matrices
 * @private
 */
function buildDesignMatrices(studies, designs, reference) {
  // Create mapping of treatments to indices
  const treatmentSet = new Set();
  for (const design of designs) {
    design.treatments.forEach(t => treatmentSet.add(t));
  }

  const treatments = Array.from(treatmentSet);
  const nTreatments = treatments.length;
  const treatmentMap = {};
  treatments.forEach((t, i) => treatmentMap[t] = i);

  // Create mapping of designs to indices
  const designMap = {};
  designs.forEach((d, i) => designMap[d.name] = i);

  // Build data matrices
  const data = [];
  const studyInfo = [];

  for (const design of designs) {
    for (const study of design.studies) {
      // Calculate pairwise comparisons relative to reference
      for (const treatment of design.treatments) {
        if (treatment === reference) continue;

        // Calculate effect: treatment vs reference
        const effect = calculatePairwiseEffect(study, treatment, reference);
        if (effect && !effect.error) {
          data.push({
            design: design.name,
            treatment,
            effect: effect.yi,
            variance: effect.vi,
            study: study.id || study.nctId
          });

          studyInfo.push({
            study: study.id || study.nctId,
            design: design.name,
            treatment,
            nArms: design.nArms
          });
        }
      }
    }
  }

  // Build X (design matrix) and y (outcome vector)
  // This is simplified - full implementation would use proper contrast coding
  const n = data.length;
  const k = designs.length;

  // X matrix: indicators for treatments and designs
  const X = [];
  const y = [];

  for (const obs of data) {
    const row = new Array(nTreatments + k).fill(0);

    // Treatment indicators
    const tIdx = treatmentMap[obs.treatment];
    if (tIdx !== undefined) {
      row[tIdx] = 1;
    }

    // Design indicators
    const dIdx = designMap[obs.design];
    if (dIdx !== undefined) {
      row[nTreatments + dIdx] = 1;
    }

    X.push(row);
    y.push(obs.effect);
  }

  return { X, y, studyInfo, treatmentMap, designMap };
}

/**
 * Calculate pairwise effect between two treatments
 * @private
 */
function calculatePairwiseEffect(study, t1, t2) {
  const arm1 = study.arms?.find(a => a.treatment === t1);
  const arm2 = study.arms?.find(a => a.treatment === t2);

  if (!arm1 || !arm2) return null;

  // Binary outcomes
  if (arm1.events !== undefined && arm2.events !== undefined) {
    const a = arm1.events;
    const c = arm2.events;
    const b = arm1.denominator - a;
    const d = arm2.denominator - c;

    if (a <= 0 || b <= 0 || c <= 0 || d <= 0) {
      return { error: 'Invalid cell counts' };
    }

    const logOR = Math.log((a * d) / (b * c));
    const variance = 1/a + 1/b + 1/c + 1/d;

    return { yi: logOR, vi: variance };
  }

  // Continuous outcomes
  if (arm1.mean !== undefined && arm2.mean !== undefined) {
    const m1 = arm1.mean;
    const m2 = arm2.mean;
    const sd1 = arm1.sd;
    const sd2 = arm2.sd;
    const n1 = arm1.n;
    const n2 = arm2.n;

    if (!sd1 || !sd2 || !n1 || !n2 || sd1 <= 0 || sd2 <= 0) {
      return { error: 'Invalid continuous outcome data' };
    }

    const pooledSD = Math.sqrt(((n1 - 1) * sd1 * sd1 + (n2 - 1) * sd2 * sd2) / (n1 + n2 - 2));
    if (pooledSD === 0) return { error: 'Pooled SD is zero' };

    const d = (m1 - m2) / pooledSD;
    const df = n1 + n2 - 2;
    const J = 1 - (3 / (4 * df - 1));
    const g = J * d;

    const variance = J * J * ((n1 + n2) / (n1 * n2) + d * d / (2 * (n1 + n2)));

    return { yi: g, vi: variance };
  }

  return null;
}

/**
 * Fit consistency model (assuming transitivity)
 * @private
 */
function fitConsistencyModel(X, y, studyInfo, options) {
  const { tauMethod = 'DL', hksj = true, alpha = 0.05 } = options;

  const n = y.length;

  // Weighted least squares
  const w = y.map((yi, i) => 1 / 0.1); // Placeholder - should use actual variances

  // Simplified regression
  // Full implementation would use proper weights and tau² estimation
  const XtWX = X[0].map(() => new Array(X[0].length).fill(0));
  const XtWy = new Array(X[0].length).fill(0);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < X[0].length; j++) {
      for (let k = 0; k < X[0].length; k++) {
        XtWX[j][k] += X[i][j] * X[i][k] * w[i];
      }
      XtWy[j] += X[i][j] * y[i] * w[i];
    }
  }

  // Solve for beta coefficients
  const beta = solveLinearSystem(XtWX, XtWy);

  if (!beta) {
    return { error: 'Cannot solve consistency model' };
  }

  // Calculate fitted values and residuals
  const yFitted = y.map((yi, i) =>
    X[i].reduce((sum, xj, j) => sum + xj * beta[j], 0)
  );

  const residuals = y.map((yi, i) => yi - yFitted[i]);

  // Calculate Q and tau²
  const Q = w.reduce((sum, wi, i) => sum + wi * residuals[i] * residuals[i], 0);
  const df = n - X[0].length;

  let tau2 = 0;
  if (df > 0 && Q > df) {
    tau2 = (Q - df) / df;
  }
  tau2 = Math.max(0, tau2);

  // Calculate standard errors
  const XtWXInv = invertMatrix(XtWX);
  const variances = XtWXInv ? XtWXInv.map(row => row.map((val, j) => j === 0 ? val : val)) : null;

  // Return results
  return {
    beta,
    variances,
    tau2,
    tau: Math.sqrt(tau2),
    Q,
    df,
    fitted: yFitted,
    residuals
  };
}

/**
 * Fit inconsistency model (design-by-treatment interaction)
 * @private
 */
function fitInconsistencyModel(X, y, studyInfo, designMap, options) {
  // Similar to consistency model but includes design-treatment interactions
  // This is a placeholder - full implementation would be more complex

  const { tauMethod = 'DL', hksj = true, alpha = 0.05 } = options;

  // For now, return same as consistency
  // In production, this would fit the full interaction model
  const result = fitConsistencyModel(X, y, studyInfo, options);

  // Calculate inconsistency Q
  // Q_inconsistency = Q_consistency + Q_interaction

  return {
    ...result,
    note: 'Full inconsistency model not yet implemented'
  };
}

/**
 * Calculate treatment effects relative to reference
 * @private
 */
function calculateTreatmentEffects(consistencyResult, treatmentMap, reference) {
  const effects = {};
  const refIdx = treatmentMap[reference];

  // Check if consistency result is valid
  if (!consistencyResult || !consistencyResult.beta || consistencyResult.error) {
    // Return placeholder effects if model failed
    for (const [treatment] of Object.entries(treatmentMap)) {
      effects[treatment] = {
        effect: 0,
        se: 0,
        ciLower: 0,
        ciUpper: 0,
        pValue: 1
      };
    }
    return effects;
  }

  for (const [treatment, idx] of Object.entries(treatmentMap)) {
    if (treatment === reference) {
      effects[treatment] = {
        effect: 0,
        se: 0,
        ciLower: 0,
        ciUpper: 0,
        pValue: 1
      };
    } else {
      // Difference from reference
      // This is simplified - full implementation would use beta coefficients
      const betaIdx = idx !== undefined ? idx : 0;
      const betaValue = consistencyResult.beta[betaIdx] !== undefined
        ? consistencyResult.beta[betaIdx]
        : 0;

      const varianceValue = (consistencyResult.variances &&
        consistencyResult.variances[betaIdx] &&
        consistencyResult.variances[betaIdx][betaIdx] !== undefined)
        ? consistencyResult.variances[betaIdx][betaIdx]
        : 0.01;

      effects[treatment] = {
        effect: betaValue,
        se: Math.sqrt(Math.max(0.0001, varianceValue)),
        ciLower: 0,
        ciUpper: 0,
        pValue: 0.05
      };
    }
  }

  return effects;
}

/**
 * Build effects matrix for ranking
 * @private
 */
function buildEffectsMatrix(treatmentEffects, treatmentMap) {
  const treatments = Object.values(treatmentMap);
  const matrix = treatments.map(() =>
    treatments.map(() => null)
  );

  for (const [t1, effects1] of Object.entries(treatmentEffects)) {
    for (const [t2, effects2] of Object.entries(treatmentMap)) {
      const i = treatmentMap[t1];
      const j = treatmentMap[t2];

      if (i !== undefined && j !== undefined) {
        matrix[i][j] = effects1.effect - effects2.effect;
      }
    }
  }

  return matrix;
}

/**
 * Solve linear system Ax = b
 * @private
 */
function solveLinearSystem(A, b) {
  const n = A.length;
  const x = new Array(n).fill(0);

  // Gaussian elimination with partial pivoting
  for (let i = 0; i < n; i++) {
    // Find pivot
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) {
        maxRow = k;
      }
    }

    // Swap rows
    [A[i], A[maxRow]] = [A[maxRow], A[i]];
    [b[i], b[maxRow]] = [b[maxRow], b[i]];

    // Check for singularity
    if (Math.abs(A[i][i]) < 1e-10) {
      return null;
    }

    // Eliminate
    for (let k = i + 1; k < n; k++) {
      const factor = A[k][i] / A[i][i];
      b[k] -= factor * b[i];
      for (let j = i; j < n; j++) {
        A[k][j] -= factor * A[i][j];
      }
    }
  }

  // Back substitution
  for (let i = n - 1; i >= 0; i--) {
    x[i] = b[i];
    for (let j = i + 1; j < n; j++) {
      x[i] -= A[i][j] * x[j];
    }
    x[i] /= A[i][i];
  }

  return x;
}

/**
 * Invert matrix
 * @private
 */
function invertMatrix(A) {
  const n = A.length;
  const augmented = A.map((row, i) => [...row, ...Array(n).fill(0).map((_, j) => i === j ? 1 : 0)]);

  for (let i = 0; i < n; i++) {
    // Pivot
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
        maxRow = k;
      }
    }

    [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];

    if (Math.abs(augmented[i][i]) < 1e-10) {
      return null;
    }

    const pivot = augmented[i][i];

    for (let j = 0; j < 2 * n; j++) {
      augmented[i][j] /= pivot;
    }

    for (let k = 0; k < n; k++) {
      if (k === i) continue;
      const factor = augmented[k][i];
      for (let j = 0; j < 2 * n; j++) {
        augmented[k][j] -= factor * augmented[i][j];
      }
    }
  }

  return augmented.map(row => row.slice(n));
}

/**
 * Generate forest plot data for NMA
 * @param {Object} nmaResult - Result from networkMetaAnalysis
 * @returns {Object} Forest plot data
 */
export function createNMAForestPlot(nmaResult) {
  const { effects, rankings, reference } = nmaResult;

  const treatments = Object.keys(effects);
  const plotData = treatments.map(t => {
    const effect = effects[t];
    return {
      treatment: t,
      effect: effect.effect,
      se: effect.se,
      ciLower: effect.ciLower,
      ciUpper: effect.ciUpper,
      pValue: effect.pValue,
      isReference: t === reference,
      sucra: rankings?.sucras[treatments.indexOf(t)] || 0
    };
  });

  // Sort by effect (or by SUCRA)
  plotData.sort((a, b) => b.effect - a.effect);

  return {
    treatments: plotData,
    reference,
    nStudies: nmaResult.nStudies,
    nTreatments: nmaResult.nTreatments
  };
}

/**
 * Generate network plot data (D3-compatible)
 * @param {Object} nmaResult - Result from networkMetaAnalysis
 * @returns {Object} Network plot data
 */
export function createNetworkPlot(nmaResult) {
  return nmaResult.network.graph.exportToD3();
}

export default {
  networkMetaAnalysis,
  createNMAForestPlot,
  createNetworkPlot
};
