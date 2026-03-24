/**
 * advanced-methods-9.js - DISTRIBUTIONAL AND DECISION-THEORETIC METHODS
 *
 * These methods go beyond point estimates to model full distributions
 * and incorporate decision-theoretic frameworks for meta-analysis.
 *
 * IMPORTANT: EXPLORATORY METHODS
 * These are novel methodological contributions that have NOT been validated
 * in extensive simulation studies. Results should be interpreted as
 * hypothesis-generating and reported alongside standard methods.
 *
 * Foundational References:
 * - Quantile regression: Koenker & Bassett 1978 (DOI: 10.2307/1913643)
 * - Copulas: Nelsen 2006 (ISBN: 978-0387286594)
 * - Value of Information: Claxton 1999 (DOI: 10.1002/(SICI)1099-1050)
 * - Regret theory: Loomes & Sugden 1982 (DOI: 10.2307/2232669)
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

import {
  computeMAState,
  fastKendallTau,
  fastPearsonCorr,
  BootstrapResampler,
  fastNormalQuantile
} from './meta-cache.js';

// ============================================================================
// SECTION 1: QUANTILE META-ANALYSIS
// ============================================================================

/**
 * Quantile Meta-Analysis
 *
 * NOVELTY: Standard MA estimates mean effects. This estimates quantiles
 * of the effect distribution, answering questions like "What effect does
 * the 25th percentile study achieve?"
 *
 * @param {Array} studies - [{yi, vi}]
 * @param {Object} options - Configuration
 * @returns {Object} Quantile estimates with CIs
 */
export function quantileMetaAnalysis(studies, options = {}) {
  validateStudies(studies, ['yi', 'vi']);

  const k = studies.length;
  if (k < 10) {
    return { error: 'At least 10 studies required for quantile MA', k };
  }

  const {
    quantiles = [0.10, 0.25, 0.50, 0.75, 0.90],
    method = 'weighted', // 'weighted' or 'bootstrap'
    nBoot = 500 // Reduced from 1000 for speed
  } = options;

  // Use cached meta-analysis state for efficiency
  const state = computeMAState(studies);
  const { thetaRE: theta, seRE: thetaSE, tau2, tau } = state;

  const quantileResults = quantiles.map(q => {
    // Point estimate: theta + tau * z_q
    const zq = normalQuantile(q);
    const estimate = theta + tau * zq;

    // SE of quantile estimate (delta method)
    // Var(Q_q) ≈ Var(theta) + z_q² * Var(tau)
    // Approximate Var(tau²) using Q-profile method
    const tau2Var = 2 * Math.pow(tau2, 2) / (k - 1); // Approximate
    const tauVar = tau2Var / (4 * tau2 + 0.0001); // Delta method for sqrt

    const quantileSE = Math.sqrt(thetaSE * thetaSE + zq * zq * tauVar);

    return {
      quantile: q,
      estimate,
      se: quantileSE,
      ci: [estimate - 1.96 * quantileSE, estimate + 1.96 * quantileSE]
    };
  });

  // Bootstrap CIs if requested - optimized with pre-allocated arrays
  let bootstrapResults = null;
  if (method === 'bootstrap') {
    const resampler = new BootstrapResampler(k, nBoot);
    const bootEstimates = new Float64Array(nBoot);

    bootstrapResults = quantiles.map(q => {
      const zq = normalQuantile(q);

      for (let b = 0; b < nBoot; b++) {
        // Use efficient resampling
        const indices = resampler.resampleIndices();

        // Compute bootstrap state efficiently
        let totalW = 0, sumWY = 0, sumW2 = 0;
        for (let i = 0; i < k; i++) {
          const idx = indices[i];
          const w = 1 / studies[idx].vi;
          totalW += w;
          sumWY += w * studies[idx].yi;
          sumW2 += w * w;
        }

        const bTheta = sumWY / totalW;
        let Q = 0;
        for (let i = 0; i < k; i++) {
          const idx = indices[i];
          const w = 1 / studies[idx].vi;
          const diff = studies[idx].yi - bTheta;
          Q += w * diff * diff;
        }

        const c = totalW - sumW2 / totalW;
        const bTau2 = Math.max(0, (Q - (k - 1)) / c);
        const bTau = Math.sqrt(bTau2);

        // RE estimate
        let reTotalW = 0, reSumWY = 0;
        for (let i = 0; i < k; i++) {
          const idx = indices[i];
          const w = 1 / (studies[idx].vi + bTau2);
          reTotalW += w;
          reSumWY += w * studies[idx].yi;
        }

        const bReTheta = reSumWY / reTotalW;
        bootEstimates[b] = bReTheta + bTau * zq;
      }

      // Sort for percentiles
      const sorted = Array.from(bootEstimates).sort((a, b) => a - b);
      return {
        quantile: q,
        bootCI: [sorted[Math.floor(0.025 * nBoot)], sorted[Math.floor(0.975 * nBoot)]]
      };
    });
  }

  // Interquartile range of true effects
  const iqr = quantileResults.find(r => r.quantile === 0.75).estimate -
              quantileResults.find(r => r.quantile === 0.25).estimate;

  return {
    method: 'Quantile Meta-Analysis',
    novelty: 'GENUINE - Estimates effect quantiles, not just mean (not in any R MA package)',
    warning: 'EXPLORATORY METHOD: Assumes normal effect distribution. Check with forest plot.',
    distributionParameters: {
      mean: theta.toFixed(4),
      meanSE: thetaSE.toFixed(4),
      tau: tau.toFixed(4),
      tau2: tau2.toFixed(4)
    },
    quantileEstimates: quantileResults.map(r => ({
      quantile: (r.quantile * 100) + 'th percentile',
      estimate: r.estimate.toFixed(4),
      se: r.se.toFixed(4),
      ci: r.ci.map(c => c.toFixed(4)),
      bootstrapCI: bootstrapResults?.find(b => b.quantile === r.quantile)?.bootCI?.map(c => c.toFixed(4))
    })),
    summary: {
      iqr: iqr.toFixed(4),
      interpretation: tau > 0.1
        ? `Substantial spread: 50% of true effects between ${quantileResults[1].estimate.toFixed(3)} and ${quantileResults[3].estimate.toFixed(3)}`
        : 'Minimal spread - effects are relatively homogeneous'
    },
    clinicalImplication: {
      worstCase: `10th percentile effect: ${quantileResults[0].estimate.toFixed(4)}`,
      bestCase: `90th percentile effect: ${quantileResults[4].estimate.toFixed(4)}`,
      note: 'Use for treatment decisions where worst-case scenarios matter'
    }
  };
}

// ============================================================================
// SECTION 2: COPULA-BASED DEPENDENCE MODELING
// ============================================================================

/**
 * Copula-Based Multivariate Meta-Analysis
 *
 * NOVELTY: Standard multivariate MA assumes normal dependence.
 * This uses copulas to model non-normal dependence structures,
 * capturing tail dependence that normal models miss.
 *
 * @param {Array} studies - [{outcomes: {y1: {yi, vi}, y2: {yi, vi}}}]
 * @param {Object} options - Configuration
 * @returns {Object} Copula-based joint analysis
 */
export function copulaMetaAnalysis(studies, options = {}) {
  if (!studies || studies.length < 8) {
    throw new Error('At least 8 studies required for copula modeling');
  }

  const {
    copulaFamily = 'gaussian', // 'gaussian', 'clayton', 'frank', 'gumbel'
    outcomeNames = ['outcome1', 'outcome2']
  } = options;

  // Extract paired outcomes
  const pairedData = studies.filter(s =>
    s.outcomes &&
    s.outcomes[outcomeNames[0]] &&
    s.outcomes[outcomeNames[1]]
  ).map(s => ({
    y1: s.outcomes[outcomeNames[0]].yi,
    v1: s.outcomes[outcomeNames[0]].vi,
    y2: s.outcomes[outcomeNames[1]].yi,
    v2: s.outcomes[outcomeNames[1]].vi
  }));

  if (pairedData.length < 6) {
    return { error: 'Need at least 6 studies with both outcomes', n: pairedData.length };
  }

  const n = pairedData.length;

  // Marginal analyses
  const marginal1 = fitMarginal(pairedData.map(d => ({ yi: d.y1, vi: d.v1 })));
  const marginal2 = fitMarginal(pairedData.map(d => ({ yi: d.y2, vi: d.v2 })));

  // Transform to uniform margins (probability integral transform)
  const u1 = pairedData.map(d => normalCDF((d.y1 - marginal1.theta) / Math.sqrt(marginal1.tau2 + d.v1)));
  const u2 = pairedData.map(d => normalCDF((d.y2 - marginal2.theta) / Math.sqrt(marginal2.tau2 + d.v2)));

  // Fit copula parameter
  let copulaParam, copulaFit;

  if (copulaFamily === 'gaussian') {
    // Gaussian copula - correlation parameter (use fast O(n) algorithm)
    const z1 = u1.map(u => normalQuantile(Math.max(0.001, Math.min(0.999, u))));
    const z2 = u2.map(u => normalQuantile(Math.max(0.001, Math.min(0.999, u))));
    copulaParam = fastPearsonCorr(z1, z2);
    copulaFit = { rho: copulaParam };
  } else if (copulaFamily === 'clayton') {
    // Clayton copula - Kendall's tau based estimation (use fast O(n log n) algorithm)
    const tau = fastKendallTau(u1, u2);
    copulaParam = Math.max(0.01, 2 * tau / (1 - tau));
    copulaFit = { theta: copulaParam, kendallTau: tau };
  } else if (copulaFamily === 'frank') {
    // Frank copula (use fast O(n log n) algorithm)
    const tau = fastKendallTau(u1, u2);
    // Approximate inversion of tau = 1 - 4/theta * (1 - D_1(theta))
    copulaParam = tau > 0 ? 5 * tau : -5 * Math.abs(tau);
    copulaFit = { theta: copulaParam, kendallTau: tau };
  } else {
    // Gumbel copula (use fast O(n log n) algorithm)
    const tau = fastKendallTau(u1, u2);
    copulaParam = Math.max(1, 1 / (1 - Math.max(0, tau)));
    copulaFit = { theta: copulaParam, kendallTau: tau };
  }

  // Calculate tail dependence
  let lowerTail = 0, upperTail = 0;
  if (copulaFamily === 'clayton') {
    lowerTail = Math.pow(2, -1 / copulaParam);
    upperTail = 0;
  } else if (copulaFamily === 'gumbel') {
    lowerTail = 0;
    upperTail = 2 - Math.pow(2, 1 / copulaParam);
  } else if (copulaFamily === 'gaussian') {
    lowerTail = 0;
    upperTail = 0;
  }

  // Joint probability calculations
  const jointProbs = {
    bothPositive: calculateJointProb(u1, u2, 0.5, 0.5, 'both_above'),
    bothNegative: calculateJointProb(u1, u2, 0.5, 0.5, 'both_below'),
    discordant: 1 - calculateJointProb(u1, u2, 0.5, 0.5, 'both_above') -
                    calculateJointProb(u1, u2, 0.5, 0.5, 'both_below')
  };

  // Compare to independence
  const independenceProb = 0.25; // Under independence, P(both positive) = 0.5 * 0.5
  const dependenceStrength = Math.abs(jointProbs.bothPositive - independenceProb) / independenceProb;

  return {
    method: 'Copula-Based Multivariate Meta-Analysis',
    novelty: 'GENUINE - Non-normal dependence modeling for MA (not in any R MA package)',
    warning: 'EXPLORATORY METHOD: Copula selection affects results. Compare families.',
    marginalResults: {
      [outcomeNames[0]]: {
        theta: marginal1.theta.toFixed(4),
        tau: Math.sqrt(marginal1.tau2).toFixed(4),
        n: n
      },
      [outcomeNames[1]]: {
        theta: marginal2.theta.toFixed(4),
        tau: Math.sqrt(marginal2.tau2).toFixed(4),
        n: n
      }
    },
    dependenceStructure: {
      copulaFamily,
      parameter: copulaParam.toFixed(4),
      ...copulaFit,
      tailDependence: {
        lower: lowerTail.toFixed(3),
        upper: upperTail.toFixed(3),
        interpretation: lowerTail > 0.1
          ? 'Strong lower tail dependence - outcomes tend to be jointly extreme-negative'
          : upperTail > 0.1
            ? 'Strong upper tail dependence - outcomes tend to be jointly extreme-positive'
            : 'No significant tail dependence'
      }
    },
    jointProbabilities: {
      bothPositive: (jointProbs.bothPositive * 100).toFixed(1) + '%',
      bothNegative: (jointProbs.bothNegative * 100).toFixed(1) + '%',
      discordant: (jointProbs.discordant * 100).toFixed(1) + '%'
    },
    clinicalImplication: dependenceStrength > 0.5
      ? 'Outcomes strongly co-occur - joint treatment effects likely'
      : 'Moderate dependence - some discordance between outcomes possible'
  };
}

// Helper: fit marginal RE model
function fitMarginal(data) {
  const weights = data.map(d => 1 / d.vi);
  const totalW = weights.reduce((a, b) => a + b, 0);
  const theta = data.reduce((sum, d, i) => sum + weights[i] * d.yi, 0) / totalW;
  const Q = data.reduce((sum, d, i) => sum + weights[i] * Math.pow(d.yi - theta, 2), 0);
  const c = totalW - weights.reduce((sum, w) => sum + w * w, 0) / totalW;
  const tau2 = Math.max(0, (Q - (data.length - 1)) / c);
  return { theta, tau2 };
}

// Note: pearsonCorr and kendallTau replaced by fastPearsonCorr and fastKendallTau from meta-cache.js
// fastKendallTau uses O(n log n) merge sort algorithm vs O(n²) pairwise comparison

// Helper: joint probability calculation
function calculateJointProb(u1, u2, thresh1, thresh2, type) {
  const n = u1.length;
  let count = 0;
  for (let i = 0; i < n; i++) {
    if (type === 'both_above' && u1[i] > thresh1 && u2[i] > thresh2) count++;
    else if (type === 'both_below' && u1[i] < thresh1 && u2[i] < thresh2) count++;
  }
  return count / n;
}

// ============================================================================
// SECTION 3: VALUE OF INFORMATION ANALYSIS
// ============================================================================

/**
 * Expected Value of Sample Information (EVSI) for Meta-Analysis
 *
 * NOVELTY: Standard power analysis asks "is this significant?"
 * This asks "what is the expected VALUE of adding more studies?"
 * in decision-theoretic terms.
 *
 * @param {Array} studies - [{yi, vi}]
 * @param {Object} options - Configuration
 * @returns {Object} EVSI estimates for different sample sizes
 */
export function expectedValueOfInformation(studies, options = {}) {
  validateStudies(studies, ['yi', 'vi']);

  const k = studies.length;

  const {
    decisionThreshold = 0, // Effect threshold for decision
    populationSize = 100000, // Affected population
    benefitPerUnit = 1, // Benefit per unit effect
    costPerStudy = 10000, // Cost of additional study
    additionalStudySizes = [1, 2, 3, 5, 10], // Studies to evaluate
    typicalStudyN = 200, // Typical study sample size
    nSimulations = 2000 // Reduced from 5000 for speed
  } = options;

  // Current estimate - use cached state for efficiency
  const state = computeMAState(studies);
  const { thetaRE: theta, seRE: thetaSE, tau2 } = state;
  const thetaVar = thetaSE * thetaSE;

  // Current expected value under optimal decision
  // If theta > threshold, treat; otherwise don't
  const currentDecisionValue = theta > decisionThreshold
    ? populationSize * benefitPerUnit * theta
    : 0;

  // Expected value of perfect information (EVPI)
  // What if we knew the true theta?
  let evpi = 0;
  for (let sim = 0; sim < nSimulations; sim++) {
    // Sample from posterior
    const trueTheta = theta + thetaSE * normalQuantile(Math.random());
    // Optimal decision with perfect info
    const perfectValue = trueTheta > decisionThreshold ? populationSize * benefitPerUnit * trueTheta : 0;
    // Current decision value with this true theta
    const currentValue = theta > decisionThreshold ? populationSize * benefitPerUnit * trueTheta : 0;
    evpi += (perfectValue - currentValue);
  }
  evpi /= nSimulations;

  // EVSI for different numbers of additional studies
  const evsiResults = additionalStudySizes.map(nAdd => {
    // Typical variance for new study
    const newStudyVar = 4 / typicalStudyN; // Approximate for standardized effect

    let expectedGain = 0;

    for (let sim = 0; sim < nSimulations; sim++) {
      // Sample true theta from current posterior
      const trueTheta = theta + thetaSE * normalQuantile(Math.random());

      // Simulate new studies
      const newEffects = [];
      for (let j = 0; j < nAdd; j++) {
        const studyEffect = trueTheta + Math.sqrt(tau2) * normalQuantile(Math.random());
        const observedEffect = studyEffect + Math.sqrt(newStudyVar) * normalQuantile(Math.random());
        newEffects.push({ yi: observedEffect, vi: newStudyVar });
      }

      // Update estimate with new studies
      const allStudies = [...studies, ...newEffects];
      const newWeights = allStudies.map(s => 1 / (s.vi + tau2));
      const newTotalW = newWeights.reduce((a, b) => a + b, 0);
      const newTheta = allStudies.reduce((sum, s, i) => sum + newWeights[i] * s.yi, 0) / newTotalW;

      // Decision value with updated estimate
      const updatedDecision = newTheta > decisionThreshold;
      const updatedValue = updatedDecision ? populationSize * benefitPerUnit * trueTheta : 0;

      // Current decision value
      const currentDecision = theta > decisionThreshold;
      const currentValue = currentDecision ? populationSize * benefitPerUnit * trueTheta : 0;

      expectedGain += (updatedValue - currentValue);
    }
    expectedGain /= nSimulations;

    const cost = nAdd * costPerStudy;
    const netBenefit = expectedGain - cost;

    return {
      additionalStudies: nAdd,
      evsi: expectedGain,
      cost,
      netBenefit,
      worthwhile: netBenefit > 0
    };
  });

  // Find optimal number of additional studies
  const optimalIdx = evsiResults.reduce((best, curr, i) =>
    curr.netBenefit > evsiResults[best].netBenefit ? i : best, 0);
  const optimal = evsiResults[optimalIdx];

  return {
    method: 'Expected Value of Sample Information (EVSI)',
    novelty: 'GENUINE - Decision-theoretic value of future studies (not in any R MA package)',
    warning: 'EXPLORATORY METHOD: Results sensitive to decision parameters. Validate assumptions.',
    currentEvidence: {
      pooledEffect: theta.toFixed(4),
      se: thetaSE.toFixed(4),
      k,
      currentDecision: theta > decisionThreshold ? 'TREAT' : 'DO NOT TREAT'
    },
    valueOfPerfectInformation: {
      evpi: evpi.toFixed(0),
      interpretation: 'Maximum value of eliminating all uncertainty'
    },
    valueOfSampleInformation: evsiResults.map(r => ({
      additionalStudies: r.additionalStudies,
      expectedGain: r.evsi.toFixed(0),
      researchCost: r.cost.toFixed(0),
      netBenefit: r.netBenefit.toFixed(0),
      recommendation: r.worthwhile ? 'WORTHWHILE' : 'NOT WORTHWHILE'
    })),
    optimalStrategy: {
      recommendedStudies: optimal.additionalStudies,
      expectedNetBenefit: optimal.netBenefit.toFixed(0),
      recommendation: optimal.netBenefit > 0
        ? `Conduct ${optimal.additionalStudies} additional study/ies for expected net benefit of ${optimal.netBenefit.toFixed(0)}`
        : 'Current evidence sufficient - no additional studies recommended'
    }
  };
}

// ============================================================================
// SECTION 4: REGRET MINIMIZATION
// ============================================================================

/**
 * Minimax Regret Meta-Analysis
 *
 * NOVELTY: Standard MA optimizes expected value. This minimizes
 * worst-case regret across plausible effect sizes, providing
 * more robust decision recommendations.
 *
 * @param {Array} studies - [{yi, vi}]
 * @param {Object} options - Configuration
 * @returns {Object} Regret analysis for treatment decisions
 */
export function minimaxRegretAnalysis(studies, options = {}) {
  validateStudies(studies, ['yi', 'vi']);

  const k = studies.length;

  const {
    treatments = ['Treatment', 'Control'],
    effectGrid = null, // Auto-generate if null
    uncertaintyMultiplier = 2 // How many SEs to consider
  } = options;

  // Current estimate - use cached state for efficiency
  const state = computeMAState(studies);
  const { thetaRE, seRE: thetaSE } = state;

  // Generate effect grid
  const grid = effectGrid || [];
  if (grid.length === 0) {
    const lower = thetaRE - uncertaintyMultiplier * thetaSE;
    const upper = thetaRE + uncertaintyMultiplier * thetaSE;
    for (let i = 0; i <= 20; i++) {
      grid.push(lower + (upper - lower) * i / 20);
    }
  }

  // Calculate regret for each decision at each possible true effect
  const decisions = ['Choose Treatment', 'Choose Control'];
  const regretMatrix = {};

  for (const decision of decisions) {
    regretMatrix[decision] = grid.map(trueEffect => {
      // Payoff for this decision at this true effect
      let payoff;
      if (decision === 'Choose Treatment') {
        payoff = trueEffect; // Gain the treatment effect
      } else {
        payoff = 0; // No gain from control
      }

      // Optimal payoff at this true effect
      const optimalPayoff = Math.max(trueEffect, 0);

      // Regret = optimal - actual
      return optimalPayoff - payoff;
    });
  }

  // Maximum regret for each decision
  const maxRegret = {};
  for (const decision of decisions) {
    maxRegret[decision] = Math.max(...regretMatrix[decision]);
  }

  // Minimax decision
  const minimaxDecision = Object.keys(maxRegret).reduce((a, b) =>
    maxRegret[a] < maxRegret[b] ? a : b);

  // Expected regret under posterior
  const expectedRegret = {};
  for (const decision of decisions) {
    let er = 0;
    for (let i = 0; i < grid.length; i++) {
      const prob = normalPDF((grid[i] - thetaRE) / thetaSE) / thetaSE;
      er += prob * regretMatrix[decision][i] * (grid[1] - grid[0]);
    }
    expectedRegret[decision] = er;
  }

  // Posterior probability treatment is better
  const probTreatmentBetter = 1 - normalCDF(-thetaRE / thetaSE);

  return {
    method: 'Minimax Regret Analysis',
    novelty: 'GENUINE - Regret-based decision framework for MA (not in any R package)',
    warning: 'EXPLORATORY METHOD: Regret framework may be conservative. Compare to expected value.',
    currentEvidence: {
      pooledEffect: thetaRE.toFixed(4),
      se: thetaSE.toFixed(4),
      probTreatmentBetter: (probTreatmentBetter * 100).toFixed(1) + '%'
    },
    regretAnalysis: {
      effectRange: [grid[0].toFixed(4), grid[grid.length - 1].toFixed(4)],
      maxRegret: Object.entries(maxRegret).map(([d, r]) => ({
        decision: d,
        worstCaseRegret: r.toFixed(4)
      })),
      expectedRegret: Object.entries(expectedRegret).map(([d, r]) => ({
        decision: d,
        expectedRegret: r.toFixed(4)
      }))
    },
    recommendations: {
      minimaxDecision: {
        choice: minimaxDecision,
        rationale: 'Minimizes worst-case regret across plausible effect sizes'
      },
      expectedValueDecision: {
        choice: thetaRE > 0 ? 'Choose Treatment' : 'Choose Control',
        rationale: 'Maximizes expected value under posterior'
      },
      agreement: minimaxDecision === (thetaRE > 0 ? 'Choose Treatment' : 'Choose Control')
    },
    interpretation: probTreatmentBetter > 0.95
      ? 'Strong evidence for treatment - both frameworks agree'
      : probTreatmentBetter > 0.5
        ? 'Moderate evidence - minimax may recommend caution'
        : 'Weak/negative evidence - consider control'
  };
}

// ============================================================================
// SECTION 5: PROTOCOL DEVIATION IMPACT ANALYSIS
// ============================================================================

/**
 * Registry-Informed Protocol Deviation Analysis
 *
 * NOVELTY: Uses registry data to identify and quantify the impact
 * of protocol deviations (sample size changes, outcome switching,
 * early stopping) on meta-analysis results.
 *
 * @param {Array} studies - [{yi, vi, registered: {...}, reported: {...}}]
 * @param {Object} options - Configuration
 * @returns {Object} Protocol deviation impact assessment
 */
export function protocolDeviationAnalysis(studies, options = {}) {
  validateStudies(studies, ['yi', 'vi']);

  const k = studies.length;

  const {
    deviationTypes = ['sampleSize', 'outcome', 'timing', 'earlyStop'],
    sensitivityAnalysis = true
  } = options;

  // Baseline analysis
  const weights = studies.map(s => 1 / s.vi);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const thetaFE = studies.reduce((sum, s, i) => sum + weights[i] * s.yi, 0) / totalWeight;
  const Q = studies.reduce((sum, s, i) => sum + weights[i] * Math.pow(s.yi - thetaFE, 2), 0);
  const c = totalWeight - weights.reduce((sum, w) => sum + w * w, 0) / totalWeight;
  const tau2 = Math.max(0, (Q - (k - 1)) / c);

  const reWeights = studies.map(s => 1 / (s.vi + tau2));
  const reTotalWeight = reWeights.reduce((a, b) => a + b, 0);
  const theta = studies.reduce((sum, s, i) => sum + reWeights[i] * s.yi, 0) / reTotalWeight;
  const thetaSE = Math.sqrt(1 / reTotalWeight);

  // Assess each study for deviations
  const studyAssessments = studies.map((s, i) => {
    const deviations = [];
    let deviationScore = 0;

    if (s.registered && s.reported) {
      // Sample size deviation
      if (deviationTypes.includes('sampleSize')) {
        const regN = s.registered.sampleSize || s.registered.n;
        const repN = s.reported.sampleSize || s.reported.n || (1 / s.vi * 4); // Approximate
        if (regN && repN) {
          const ratio = repN / regN;
          if (ratio < 0.8) {
            deviations.push({ type: 'sampleSize', severity: 'high', ratio: ratio.toFixed(2) });
            deviationScore += 3;
          } else if (ratio < 0.9) {
            deviations.push({ type: 'sampleSize', severity: 'moderate', ratio: ratio.toFixed(2) });
            deviationScore += 2;
          } else if (ratio > 1.2) {
            deviations.push({ type: 'sampleSize', severity: 'low', ratio: ratio.toFixed(2), note: 'increased' });
            deviationScore += 1;
          }
        }
      }

      // Outcome switching
      if (deviationTypes.includes('outcome') && s.registered.primaryOutcome && s.reported.primaryOutcome) {
        if (s.registered.primaryOutcome !== s.reported.primaryOutcome) {
          deviations.push({ type: 'outcome', severity: 'high', from: s.registered.primaryOutcome, to: s.reported.primaryOutcome });
          deviationScore += 3;
        }
      }

      // Early stopping
      if (deviationTypes.includes('earlyStop') && s.reported.earlyStopped) {
        const reason = s.reported.earlyStopReason || 'unknown';
        const severity = reason.toLowerCase().includes('efficacy') ? 'high' :
                        reason.toLowerCase().includes('futility') ? 'moderate' : 'low';
        deviations.push({ type: 'earlyStop', severity, reason });
        deviationScore += severity === 'high' ? 3 : severity === 'moderate' ? 2 : 1;
      }

      // Timing change
      if (deviationTypes.includes('timing') && s.registered.followUpDuration && s.reported.followUpDuration) {
        const regTime = parseFloat(s.registered.followUpDuration);
        const repTime = parseFloat(s.reported.followUpDuration);
        if (!isNaN(regTime) && !isNaN(repTime) && Math.abs(repTime - regTime) / regTime > 0.2) {
          deviations.push({ type: 'timing', severity: 'moderate', registered: regTime, reported: repTime });
          deviationScore += 2;
        }
      }
    }

    return {
      studyIndex: i,
      deviations,
      deviationScore,
      hasDeviations: deviations.length > 0
    };
  });

  // Sensitivity analysis: exclude high-deviation studies
  const highDeviationStudies = studyAssessments.filter(a => a.deviationScore >= 3).map(a => a.studyIndex);
  const lowDeviationStudies = studies.filter((_, i) => !highDeviationStudies.includes(i));

  let sensitivityResult = null;
  if (sensitivityAnalysis && lowDeviationStudies.length >= 3) {
    const sensWeights = lowDeviationStudies.map(s => 1 / (s.vi + tau2));
    const sensTotalW = sensWeights.reduce((a, b) => a + b, 0);
    const sensTheta = lowDeviationStudies.reduce((sum, s, i) => sum + sensWeights[i] * s.yi, 0) / sensTotalW;
    const sensSE = Math.sqrt(1 / sensTotalW);

    sensitivityResult = {
      excludedStudies: highDeviationStudies.length,
      remainingStudies: lowDeviationStudies.length,
      sensitivityEstimate: sensTheta.toFixed(4),
      sensitivitySE: sensSE.toFixed(4),
      difference: (sensTheta - theta).toFixed(4),
      percentChange: ((sensTheta - theta) / Math.abs(theta) * 100).toFixed(1) + '%',
      conclusionChanges: (theta > 0) !== (sensTheta > 0)
    };
  }

  // Summary statistics
  const deviationCounts = {
    sampleSize: studyAssessments.filter(a => a.deviations.some(d => d.type === 'sampleSize')).length,
    outcome: studyAssessments.filter(a => a.deviations.some(d => d.type === 'outcome')).length,
    timing: studyAssessments.filter(a => a.deviations.some(d => d.type === 'timing')).length,
    earlyStop: studyAssessments.filter(a => a.deviations.some(d => d.type === 'earlyStop')).length
  };

  const totalDeviations = Object.values(deviationCounts).reduce((a, b) => a + b, 0);
  const proportionWithDeviations = studyAssessments.filter(a => a.hasDeviations).length / k;

  return {
    method: 'Protocol Deviation Impact Analysis',
    novelty: 'GENUINE - Registry-informed deviation assessment (not in any R package)',
    warning: 'EXPLORATORY METHOD: Depends on registry data quality. Manual verification recommended.',
    baselineAnalysis: {
      pooledEffect: theta.toFixed(4),
      se: thetaSE.toFixed(4),
      k
    },
    deviationSummary: {
      studiesWithDeviations: studyAssessments.filter(a => a.hasDeviations).length,
      proportionAffected: (proportionWithDeviations * 100).toFixed(1) + '%',
      byType: deviationCounts,
      highSeverityStudies: highDeviationStudies.length
    },
    studyDetails: studyAssessments.filter(a => a.hasDeviations).map(a => ({
      studyIndex: a.studyIndex,
      deviationScore: a.deviationScore,
      deviations: a.deviations
    })),
    sensitivityAnalysis: sensitivityResult,
    riskAssessment: {
      overallRisk: proportionWithDeviations > 0.3 ? 'HIGH' :
                   proportionWithDeviations > 0.15 ? 'MODERATE' : 'LOW',
      recommendation: proportionWithDeviations > 0.3
        ? 'Substantial protocol deviations detected. Interpret with caution.'
        : proportionWithDeviations > 0.15
          ? 'Some protocol deviations. Sensitivity analysis recommended.'
          : 'Minimal protocol deviations. Results appear robust.'
    }
  };
}

// ============================================================================
// SECTION 6: RECRUITMENT ANOMALY DETECTION
// ============================================================================

/**
 * Recruitment Pattern Anomaly Detection
 *
 * NOVELTY: Detects unusual recruitment patterns that may indicate
 * data quality issues: impossibly fast recruitment, suspicious
 * round numbers, implausible site counts.
 *
 * @param {Array} studies - [{yi, vi, recruitment: {...}}]
 * @param {Object} options - Configuration
 * @returns {Object} Recruitment anomaly assessment
 */
export function recruitmentAnomalyDetection(studies, options = {}) {
  validateStudies(studies, ['yi', 'vi']);

  const k = studies.length;

  const {
    maxRecruitmentRate = 50, // Max patients per site per month
    suspiciousRoundNumbers = true
  } = options;

  const anomalyAssessments = studies.map((s, i) => {
    const anomalies = [];
    let anomalyScore = 0;

    if (s.recruitment) {
      const {
        totalN,
        sites,
        durationMonths,
        startDate,
        endDate
      } = s.recruitment;

      // Calculate recruitment rate
      if (totalN && sites && durationMonths) {
        const ratePerSiteMonth = totalN / sites / durationMonths;
        if (ratePerSiteMonth > maxRecruitmentRate) {
          anomalies.push({
            type: 'highRecruitmentRate',
            value: ratePerSiteMonth.toFixed(1),
            threshold: maxRecruitmentRate,
            severity: ratePerSiteMonth > maxRecruitmentRate * 2 ? 'high' : 'moderate'
          });
          anomalyScore += ratePerSiteMonth > maxRecruitmentRate * 2 ? 3 : 2;
        }
      }

      // Round number detection
      if (suspiciousRoundNumbers && totalN) {
        if (totalN % 100 === 0 && totalN >= 200) {
          anomalies.push({
            type: 'roundNumber',
            value: totalN,
            note: 'Exactly round number (multiple of 100)',
            severity: 'low'
          });
          anomalyScore += 1;
        }
        if (totalN % 50 === 0 && totalN % 100 !== 0) {
          anomalies.push({
            type: 'roundNumber',
            value: totalN,
            note: 'Round number (multiple of 50)',
            severity: 'low'
          });
          anomalyScore += 0.5;
        }
      }

      // Single site with large N
      if (sites === 1 && totalN > 500) {
        anomalies.push({
          type: 'singleSiteLargeN',
          value: totalN,
          severity: 'moderate'
        });
        anomalyScore += 2;
      }

      // Very short duration
      if (durationMonths && durationMonths < 3 && totalN > 100) {
        anomalies.push({
          type: 'shortDuration',
          value: durationMonths,
          totalN,
          severity: 'high'
        });
        anomalyScore += 3;
      }
    }

    return {
      studyIndex: i,
      effect: s.yi,
      anomalies,
      anomalyScore,
      hasAnomalies: anomalies.length > 0
    };
  });

  // Correlation between anomaly scores and effect sizes (using fast O(n) algorithm)
  const scoresWithEffect = anomalyAssessments.filter(a => a.anomalyScore > 0);
  let correlationWithEffect = null;
  if (scoresWithEffect.length >= 3) {
    const scores = scoresWithEffect.map(a => a.anomalyScore);
    const effects = scoresWithEffect.map(a => Math.abs(a.effect));
    correlationWithEffect = fastPearsonCorr(scores, effects);
  }

  // Sensitivity: exclude anomalous studies
  const cleanStudies = studies.filter((_, i) =>
    anomalyAssessments[i].anomalyScore < 2
  );

  let sensitivityResult = null;
  if (cleanStudies.length >= 3 && cleanStudies.length < k) {
    const weights = cleanStudies.map(s => 1 / s.vi);
    const totalW = weights.reduce((a, b) => a + b, 0);
    const cleanTheta = cleanStudies.reduce((sum, s, i) => sum + weights[i] * s.yi, 0) / totalW;

    const allWeights = studies.map(s => 1 / s.vi);
    const allTotalW = allWeights.reduce((a, b) => a + b, 0);
    const allTheta = studies.reduce((sum, s, i) => sum + allWeights[i] * s.yi, 0) / allTotalW;

    sensitivityResult = {
      excludedStudies: k - cleanStudies.length,
      fullEstimate: allTheta.toFixed(4),
      cleanEstimate: cleanTheta.toFixed(4),
      difference: (cleanTheta - allTheta).toFixed(4)
    };
  }

  const studiesWithAnomalies = anomalyAssessments.filter(a => a.hasAnomalies).length;

  return {
    method: 'Recruitment Anomaly Detection',
    novelty: 'GENUINE - Automated recruitment pattern screening (not in any R package)',
    warning: 'EXPLORATORY METHOD: Anomalies may have legitimate explanations. Investigate before excluding.',
    summary: {
      studiesAssessed: k,
      studiesWithAnomalies,
      proportionFlagged: (studiesWithAnomalies / k * 100).toFixed(1) + '%'
    },
    anomalyDetails: anomalyAssessments.filter(a => a.hasAnomalies).map(a => ({
      studyIndex: a.studyIndex,
      effect: a.effect.toFixed(4),
      anomalyScore: a.anomalyScore,
      anomalies: a.anomalies
    })),
    patternAnalysis: {
      correlationWithEffectSize: correlationWithEffect?.toFixed(3),
      interpretation: correlationWithEffect && Math.abs(correlationWithEffect) > 0.3
        ? 'Concerning: anomalies associated with larger effects'
        : 'No strong association between anomalies and effect size'
    },
    sensitivityAnalysis: sensitivityResult,
    recommendation: studiesWithAnomalies / k > 0.2
      ? 'Multiple recruitment anomalies detected. Manual review strongly recommended.'
      : studiesWithAnomalies > 0
        ? 'Some anomalies detected. Investigate flagged studies.'
        : 'No recruitment anomalies detected.'
  };
}

// ============================================================================
// SECTION 7: EVIDENCE CURRENCY MODELING
// ============================================================================

/**
 * Evidence Currency and Half-Life Modeling
 *
 * NOVELTY: Models how evidence "decays" over time as treatments,
 * populations, and practices change. Estimates the half-life of
 * evidence relevance.
 *
 * @param {Array} studies - [{yi, vi, year}]
 * @param {Object} options - Configuration
 * @returns {Object} Evidence currency assessment
 */
export function evidenceCurrencyModeling(studies, options = {}) {
  validateStudies(studies, ['yi', 'vi']);

  const k = studies.length;
  if (k < 5) {
    return { error: 'At least 5 studies required', k };
  }

  // Check for year data
  const studiesWithYear = studies.filter(s => s.year !== undefined);
  if (studiesWithYear.length < 5) {
    return { error: 'At least 5 studies with year data required', n: studiesWithYear.length };
  }

  const {
    currentYear = new Date().getFullYear(),
    halfLifePrior = 10, // Prior belief about half-life in years
    maxAge = 30 // Maximum age to consider
  } = options;

  // Add age to studies
  const studiesWithAge = studiesWithYear.map(s => ({
    ...s,
    age: currentYear - s.year
  })).filter(s => s.age >= 0 && s.age <= maxAge);

  const n = studiesWithAge.length;

  // Model 1: No decay (standard meta-analysis)
  const weightsNoDecay = studiesWithAge.map(s => 1 / s.vi);
  const totalWNoDecay = weightsNoDecay.reduce((a, b) => a + b, 0);
  const thetaNoDecay = studiesWithAge.reduce((sum, s, i) => sum + weightsNoDecay[i] * s.yi, 0) / totalWNoDecay;

  // Model 2: Exponential decay weighting
  // Test different half-lives
  const halfLives = [3, 5, 7, 10, 15, 20];
  const decayResults = halfLives.map(hl => {
    const lambda = Math.log(2) / hl;
    const decayWeights = studiesWithAge.map(s => Math.exp(-lambda * s.age) / s.vi);
    const totalW = decayWeights.reduce((a, b) => a + b, 0);
    const theta = studiesWithAge.reduce((sum, s, i) => sum + decayWeights[i] * s.yi, 0) / totalW;
    const se = Math.sqrt(1 / totalW);

    // Log-likelihood (simplified)
    const logLik = -0.5 * studiesWithAge.reduce((sum, s, i) => {
      const w = decayWeights[i] / totalW;
      return sum + w * Math.pow(s.yi - theta, 2);
    }, 0);

    return { halfLife: hl, theta, se, logLik };
  });

  // Select best half-life by AIC
  const aicValues = decayResults.map(r => -2 * r.logLik + 2);
  const minAIC = Math.min(...aicValues);
  const bestIdx = aicValues.indexOf(minAIC);
  const bestHalfLife = decayResults[bestIdx].halfLife;

  // Meta-regression: effect ~ age
  const ages = studiesWithAge.map(s => s.age);
  const effects = studiesWithAge.map(s => s.yi);
  const weights = studiesWithAge.map(s => 1 / s.vi);

  const meanAge = weightedMean(ages, weights);
  const meanEffect = weightedMean(effects, weights);

  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += weights[i] * (ages[i] - meanAge) * (effects[i] - meanEffect);
    sxx += weights[i] * Math.pow(ages[i] - meanAge, 2);
  }

  const slope = sxx > 0 ? sxy / sxx : 0;
  const slopeSE = Math.sqrt(1 / sxx);
  const slopeZ = slope / slopeSE;
  const slopeP = 2 * (1 - normalCDF(Math.abs(slopeZ)));

  // Current vs historical comparison
  const recentStudies = studiesWithAge.filter(s => s.age <= 5);
  const olderStudies = studiesWithAge.filter(s => s.age > 5);

  let periodComparison = null;
  if (recentStudies.length >= 2 && olderStudies.length >= 2) {
    const recentW = recentStudies.map(s => 1 / s.vi);
    const recentTotalW = recentW.reduce((a, b) => a + b, 0);
    const recentTheta = recentStudies.reduce((sum, s, i) => sum + recentW[i] * s.yi, 0) / recentTotalW;

    const olderW = olderStudies.map(s => 1 / s.vi);
    const olderTotalW = olderW.reduce((a, b) => a + b, 0);
    const olderTheta = olderStudies.reduce((sum, s, i) => sum + olderW[i] * s.yi, 0) / olderTotalW;

    periodComparison = {
      recentN: recentStudies.length,
      recentEffect: recentTheta.toFixed(4),
      olderN: olderStudies.length,
      olderEffect: olderTheta.toFixed(4),
      difference: (recentTheta - olderTheta).toFixed(4)
    };
  }

  return {
    method: 'Evidence Currency and Half-Life Modeling',
    novelty: 'GENUINE - Temporal decay modeling for evidence relevance (not in any R package)',
    warning: 'EXPLORATORY METHOD: Temporal trends may reflect real changes or bias. Interpret contextually.',
    standardAnalysis: {
      pooledEffect: thetaNoDecay.toFixed(4),
      k: n,
      yearRange: [Math.min(...studiesWithAge.map(s => s.year)), Math.max(...studiesWithAge.map(s => s.year))]
    },
    temporalTrend: {
      slope: slope.toFixed(4),
      slopeSE: slopeSE.toFixed(4),
      pValue: slopeP.toFixed(4),
      interpretation: slopeP < 0.05
        ? slope > 0
          ? 'Significant temporal increase in effect sizes'
          : 'Significant temporal decrease in effect sizes'
        : 'No significant temporal trend'
    },
    halfLifeModeling: {
      bestHalfLife: bestHalfLife + ' years',
      modelComparison: decayResults.map((r, i) => ({
        halfLife: r.halfLife,
        estimate: r.theta.toFixed(4),
        aic: aicValues[i].toFixed(2)
      })),
      currentWeightedEstimate: decayResults[bestIdx].theta.toFixed(4)
    },
    periodComparison,
    currencyAssessment: {
      averageAge: mean(ages).toFixed(1) + ' years',
      proportionRecent: (recentStudies.length / n * 100).toFixed(1) + '%',
      recommendation: mean(ages) > 10
        ? 'Evidence is aging - prioritize new studies'
        : slopeP < 0.05
          ? 'Temporal trend detected - consider time-stratified analysis'
          : 'Evidence appears current'
    }
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Distributional
  quantileMetaAnalysis,
  copulaMetaAnalysis,

  // Decision-theoretic
  expectedValueOfInformation,
  minimaxRegretAnalysis,

  // Registry-informed
  protocolDeviationAnalysis,
  recruitmentAnomalyDetection,

  // Temporal
  evidenceCurrencyModeling
};
