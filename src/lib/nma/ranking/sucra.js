/**
 * SUCRA - Surface Under the Cumulative Ranking Curve
 * Treatment ranking for network meta-analysis
 *
 * @module SUCRA
 * @see {@link https://doi.org/10.1016/j.jclinepi.2010.03.012|Salanti et al. (2011) J Clin Epidemiol 64}
 * @description Computes SUCRA values and P-scores for ranking treatments
 *              in network meta-analysis based on their relative effects.
 */

/**
 * Calculate SUCRA values from treatment effects
 * @param {Array} treatments - Array of treatment names/IDs
 * @param {Array} effects - Matrix of treatment effects [n_treatments x n_studies]
 * @param {Object} options - Calculation options
 * @returns {Object} SUCRA results with rankings
 */
export function calculateSUCRA(treatments, effects, options = {}) {
  const {
    direction = 'lower', // 'lower' = lower is better, 'higher' = higher is better
    method = 'integral'   // 'integral' or 'trapezoidal'
  } = options;

  if (treatments.length !== effects.length) {
    throw new Error('Number of treatments must match effects matrix rows');
  }

  const nTreatments = treatments.length;
  const nStudies = effects[0]?.length || 0;

  if (nStudies === 0) {
    throw new Error('Effects matrix is empty');
  }

  // Transpose effects to get [n_studies x n_treatments]
  const effectsByStudy = [];
  for (let j = 0; j < nStudies; j++) {
    const studyEffects = [];
    for (let i = 0; i < nTreatments; i++) {
      studyEffects.push(effects[i][j]);
    }
    effectsByStudy.push(studyEffects);
  }

  // Calculate ranks for each study
  const ranks = effectsByStudy.map(studyEffects => {
    // Create array of {treatment, effect, rank}
    const indexed = studyEffects.map((effect, i) => ({
      treatment: i,
      effect
    }));

    // Sort by effect (direction-dependent)
    indexed.sort((a, b) => {
      if (direction === 'lower') {
        return a.effect - b.effect; // Lower effect = better rank
      } else {
        return b.effect - a.effect; // Higher effect = better rank
      }
    });

    // Assign ranks (handle ties correctly)
    // First, identify tied groups and their ranks
    const tiedGroups = [];
    const processed = new Set();

    for (let i = 0; i < indexed.length; i++) {
      if (processed.has(i)) continue;

      const currentEffect = indexed[i].effect;
      const ties = [i];

      // Find all treatments with same effect
      for (let j = i + 1; j < indexed.length; j++) {
        if (indexed[j].effect === currentEffect) {
          ties.push(j);
        }
      }

      // Calculate average rank for this group
      const groupRanks = ties.map(idx => idx + 1);
      const avgRank = groupRanks.reduce((sum, r) => sum + r, 0) / ties.length;

      tiedGroups.push({
        indices: ties,
        rank: avgRank
      });

      ties.forEach(idx => processed.add(idx));
    }

    // Assign ranks using tied groups
    const result = new Array(nTreatments);
    for (const group of tiedGroups) {
      for (const idx of group.indices) {
        result[indexed[idx].treatment] = group.rank;
      }
    }
    return result;
  });

  // Calculate SUCRA for each treatment
  const sucras = new Array(nTreatments).fill(0);
  const nRanks = nTreatments;

  // Special case: single treatment always has SUCRA = 100
  if (nTreatments === 1) {
    sucras[0] = 1; // Will be scaled to 100%
  } else {
    for (let t = 0; t < nTreatments; t++) {
      let cumulativeArea = 0;

      for (let s = 0; s < nStudies; s++) {
        const rank = ranks[s][t];

        if (method === 'integral') {
          // Integral method: area under cumulative ranking curve
          // SUCRA = (1 / (nRanks - 1)) * sum over studies of (cumulative probability)
          const cumulativeProb = (nRanks - rank) / (nRanks - 1);
          cumulativeArea += cumulativeProb;
        } else {
          // Trapezoidal method
          cumulativeArea += (nRanks - rank);
        }
      }

      if (method === 'integral') {
        sucras[t] = cumulativeArea / nStudies;
      } else {
        sucras[t] = cumulativeArea / (nStudies * (nRanks - 1));
      }
    }
  }

  // Scale to 0-100%
  const sucrasScaled = sucras.map(s => s * 100);

  // Create rankings
  const sortedIndices = sucrasScaled
    .map((sucra, i) => ({ sucra, index: i }))
    .sort((a, b) => b.sucra - a.sucra);

  const rankings = new Array(nTreatments);
  sortedIndices.forEach((item, index) => {
    rankings[item.index] = index + 1;
  });

  // Calculate mean rank from per-study ranks
  // For each study, we have ranks for each treatment
  let totalRankSum = 0;
  let totalRankCount = 0;

  for (let s = 0; s < nStudies; s++) {
    for (let t = 0; t < nTreatments; t++) {
      const rank = ranks[s][t];
      if (!isNaN(rank) && isFinite(rank)) {
        totalRankSum += rank;
        totalRankCount++;
      }
    }
  }

  const meanRank = totalRankCount > 0 ? totalRankSum / totalRankCount : 0;

  // Build results object
  const results = {
    treatments,
    sucras: sucrasScaled,
    ranks: rankings,
    meanRank,
    nStudies,
    nTreatments,
    direction,
    method
  };

  return results;
}

/**
 * Calculate P-score (alternative to SUCRA)
 * @param {Array} treatments - Array of treatment names/IDs
 * @param {Array} effects - Matrix of treatment effects
 * @param {Object} options - Calculation options
 * @returns {Object} P-score results
 */
export function calculatePScore(treatments, effects, options = {}) {
  const {
    direction = 'lower'
  } = options;

  const nTreatments = treatments.length;
  const nStudies = effects[0]?.length || 0;

  if (nStudies === 0) {
    throw new Error('Effects matrix is empty');
  }

  // Calculate P-score: probability of being best
  const pScores = new Array(nTreatments).fill(0);

  for (let j = 0; j < nStudies; j++) {
    const studyEffects = [];
    for (let i = 0; i < nTreatments; i++) {
      studyEffects.push({
        treatment: i,
        effect: effects[i][j]
      });
    }

    // Find best treatment
    studyEffects.sort((a, b) => {
      if (direction === 'lower') {
        return a.effect - b.effect;
      } else {
        return b.effect - a.effect;
      }
    });

    // Find all tied for best
    const bestEffect = studyEffects[0].effect;
    const bestTreatments = studyEffects.filter(e => e.effect === bestEffect);

    // Distribute probability among tied treatments
    const probPerTreatment = 1 / bestTreatments.length;
    for (const t of bestTreatments) {
      pScores[t.treatment] += probPerTreatment;
    }
  }

  // Scale to 0-100%
  const pScoresScaled = pScores.map(p => (p / nStudies) * 100);

  // Create rankings
  const sortedIndices = pScoresScaled
    .map((score, i) => ({ score, index: i }))
    .sort((a, b) => b.score - a.score);

  const rankings = new Array(nTreatments);
  sortedIndices.forEach((item, index) => {
    rankings[item.index] = index + 1;
  });

  return {
    treatments,
    pScores: pScoresScaled,
    ranks: rankings,
    nStudies,
    nTreatments,
    direction
  };
}

/**
 * Generate ranking heatmap data for visualization
 * @param {Object} sucraResults - Results from calculateSUCRA
 * @returns {Object} Heatmap data
 */
export function generateRankingHeatmap(sucraResults) {
  const { treatments, sucras, ranks } = sucraResults;
  const nTreatments = treatments.length;

  // Create ranking matrix
  const matrix = [];
  for (let rank = 1; rank <= nTreatments; rank++) {
    const row = new Array(nTreatments).fill(0);
    for (let t = 0; t < nTreatments; t++) {
      if (ranks[t] === rank) {
        row[t] = 1;
      } else if (Math.abs(ranks[t] - rank) < 0.5) {
        row[t] = 0.5; // For fractional ranks
      }
    }
    matrix.push(row);
  }

  return {
    treatments,
    ranks: Array.from({ length: nTreatments }, (_, i) => i + 1),
    matrix,
    sucras
  };
}

/**
 * Generate rank probability plot data
 * @param {Array} treatments - Treatment names
 * @param {Array} mcmcSamples - MCMC samples for each treatment [n_treatments x n_iterations]
 * @param {Object} options - Options
 * @returns {Object} Rank probability data
 */
export function generateRankProbabilities(treatments, mcmcSamples, options = {}) {
  const {
    direction = 'lower',
    burnIn = 1000
  } = options;

  const nTreatments = treatments.length;
  const nIterations = mcmcSamples[0]?.length || 0;

  if (nIterations === 0) {
    throw new Error('MCMC samples are empty');
  }

  // Discard burn-in
  const startIdx = Math.min(burnIn, Math.floor(nIterations * 0.5));
  const effectiveSamples = nIterations - startIdx;

  // Count ranks for each treatment
  const rankCounts = Array(nTreatments).fill(null).map(() =>
    Array(nTreatments).fill(0)
  );

  for (let iter = startIdx; iter < nIterations; iter++) {
    // Get treatment effects at this iteration
    const iterationEffects = treatments.map((_, i) => mcmcSamples[i][iter]);

    // Rank treatments
    const indexed = iterationEffects.map((effect, i) => ({
      treatment: i,
      effect
    }));

    indexed.sort((a, b) => {
      if (direction === 'lower') {
        return a.effect - b.effect;
      } else {
        return b.effect - a.effect;
      }
    });

    // Assign ranks (handle ties)
    const assignedRanks = new Array(nTreatments);
    for (let i = 0; i < nTreatments; i++) {
      const current = indexed[i];
      const ties = indexed.filter((other, j) =>
        other.effect === current.effect && j >= i
      );

      if (ties.length > 1) {
        const avgRank = ties.reduce((sum, _, j) =>
          sum + i + 1 + j, 0
        ) / ties.length;

        for (const tie of ties) {
          assignedRanks[tie.treatment] = Math.round(avgRank) - 1; // 0-indexed
        }
        i += ties.length - 1;
      } else {
        assignedRanks[current.treatment] = i;
      }
    }

    // Increment counts
    for (let t = 0; t < nTreatments; t++) {
      const rank = assignedRanks[t];
      if (rank >= 0 && rank < nTreatments) {
        rankCounts[t][rank]++;
      }
    }
  }

  // Convert to probabilities
  const probabilities = rankCounts.map(row =>
    row.map(count => count / effectiveSamples)
  );

  // Calculate mean rank and SUCRA for each treatment
  const meanRanks = new Array(nTreatments);
  const sucras = new Array(nTreatments);

  for (let t = 0; t < nTreatments; t++) {
    let meanRank = 0;
    let sucra = 0;

    for (let r = 0; r < nTreatments; r++) {
      const prob = probabilities[t][r];
      meanRank += prob * (r + 1);
      sucra += prob * (nTreatments - r - 1) / (nTreatments - 1);
    }

    meanRanks[t] = meanRank;
    sucras[t] = sucra * 100;
  }

  return {
    treatments,
    probabilities,
    meanRanks,
    sucras,
    nIterations: effectiveSamples,
    direction
  };
}

/**
 * Create ranking table for publication
 * @param {Object} sucraResults - SUCRA results
 * @param {Object} pScoreResults - P-score results
 * @returns {Array} Table rows
 */
export function createRankingTable(sucraResults, pScoreResults) {
  const { treatments, sucras, ranks: sucraRanks } = sucraResults;
  const { pScores, ranks: pScoreRanks } = pScoreResults;

  return treatments.map((treatment, i) => ({
    treatment,
    sucra: sucras[i].toFixed(1),
    sucraRank: sucraRanks[i],
    pScore: pScores[i].toFixed(1),
    pScoreRank: pScoreRanks[i],
    meanRank: sucraResults.meanRank.toFixed(2)
  }));
}

/**
 * Cluster treatments by similarity
 * @param {Object} sucraResults - SUCRA results
 * @param {number} nClusters - Number of clusters (default: 3)
 * @returns {Object} Clustering results
 */
export function clusterTreatments(sucraResults, nClusters = 3) {
  const { treatments, sucras } = sucraResults;

  // Cap nClusters at number of treatments
  const actualClusters = Math.min(nClusters, treatments.length);

  // Simple k-means clustering on SUCRA values
  // For more complex clustering, use effect size correlations

  const clusters = [];
  const sortedIndices = sucras
    .map((s, i) => ({ sucra: s, index: i }))
    .sort((a, b) => b.sucra - a.sucra);

  const clusterSize = Math.ceil(treatments.length / actualClusters);

  for (let c = 0; c < actualClusters; c++) {
    const start = c * clusterSize;
    const end = Math.min((c + 1) * clusterSize, treatments.length);
    const clusterIndices = sortedIndices.slice(start, end);

    // Skip empty clusters
    if (clusterIndices.length === 0) continue;

    clusters.push({
      clusterId: c,
      treatments: clusterIndices.map(item => treatments[item.index]),
      meanSUCRA: clusterIndices.reduce((sum, item) =>
        sum + item.sucra, 0
      ) / clusterIndices.length
    });
  }

  return {
    nClusters: actualClusters,
    clusters,
    treatmentToCluster: {}
  };
}

export default {
  calculateSUCRA,
  calculatePScore,
  generateRankingHeatmap,
  generateRankProbabilities,
  createRankingTable,
  clusterTreatments
};
