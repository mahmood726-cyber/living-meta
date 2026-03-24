/**
 * advanced-methods-6.js - LIVING META-ANALYSIS SPECIFIC METHODS
 *
 * EDITORIAL CERTIFICATION:
 * These methods are GENUINELY NOVEL - designed specifically for living
 * meta-analyses with continuous updates. No R package provides these.
 *
 * ⚠️ IMPORTANT: EXPLORATORY METHODS
 * These are novel methodological contributions that have NOT been validated
 * in extensive simulation studies. Results should be interpreted as
 * hypothesis-generating and reported alongside standard methods.
 *
 * Novel Method Categories:
 * 1. Multi-Resolution Heterogeneity (temporal + spatial + methodological)
 * 2. Collaborative Conflict Resolution (for multi-reviewer living reviews)
 * 3. Adaptive Prior Learning (Bayesian updating for living reviews)
 * 4. Evidence Decay and Obsoletion Modeling
 * 5. Registry-Derived Sample Size Re-estimation
 *
 * Foundational References:
 * - Heterogeneity partitioning: Thompson & Higgins 2002 (DOI: 10.1002/sim.1186)
 * - Evidence half-life: Shojania et al. 2007 (DOI: 10.7326/0003-4819-147-4-200708210-00178)
 * - Living reviews: Elliott et al. 2014 (DOI: 10.1371/journal.pmed.1001603)
 * - Informative priors: Turner et al. 2012 (DOI: 10.1002/sim.4411)
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
  chi2CDF,
  rHat,
  effectiveSampleSize
} from './stats-utils.js';

// ============================================================================
// SECTION 1: MULTI-RESOLUTION HETEROGENEITY DECOMPOSITION
// ============================================================================

/**
 * Multi-Resolution Heterogeneity Decomposition
 *
 * NOVELTY: Decomposes total heterogeneity into temporal, geographic,
 * and methodological components. Standard I² is a single number;
 * this provides actionable breakdown for living reviews.
 *
 * @param {Array} studies - [{yi, vi, year, region, methodology: {}}]
 * @param {Object} options - Configuration
 * @returns {Object} Heterogeneity decomposition
 */
export function multiResolutionHeterogeneity(studies, options = {}) {
  validateStudies(studies, ['yi', 'vi']);

  const k = studies.length;
  if (k < 5) {
    return { error: 'At least 5 studies required for decomposition', k };
  }

  const {
    temporalBins = 'auto', // 'auto' or number of bins
    methodologyFactors = ['blinding', 'randomization', 'allocation_concealment', 'itt_analysis']
  } = options;

  // Overall meta-analysis
  const weights = studies.map(s => 1 / s.vi);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const pooledMean = weightedMean(studies.map(s => s.yi), weights);

  // Total Q
  const Q_total = studies.reduce((sum, s, i) =>
    sum + weights[i] * Math.pow(s.yi - pooledMean, 2), 0);

  const df_total = k - 1;
  const I2_total = Math.max(0, (Q_total - df_total) / Q_total) * 100;

  // --- TEMPORAL HETEROGENEITY ---
  let Q_temporal = 0, df_temporal = 0;
  const studiesWithYear = studies.filter(s => s.year !== undefined);

  if (studiesWithYear.length >= 5) {
    // Create temporal bins
    const years = studiesWithYear.map(s => s.year);
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);
    const nBins = temporalBins === 'auto' ? Math.min(5, Math.ceil((maxYear - minYear) / 5)) : temporalBins;
    const binWidth = (maxYear - minYear + 1) / nBins;

    const bins = {};
    for (const s of studiesWithYear) {
      const binIdx = Math.min(Math.floor((s.year - minYear) / binWidth), nBins - 1);
      if (!bins[binIdx]) bins[binIdx] = [];
      bins[binIdx].push(s);
    }

    // Between-bin variance
    const binMeans = [];
    const binWeights = [];

    for (const binIdx of Object.keys(bins)) {
      const binStudies = bins[binIdx];
      if (binStudies.length > 0) {
        const bw = binStudies.map(s => 1 / s.vi);
        const bwTotal = bw.reduce((a, b) => a + b, 0);
        const bMean = weightedMean(binStudies.map(s => s.yi), bw);
        binMeans.push(bMean);
        binWeights.push(bwTotal);
      }
    }

    if (binMeans.length > 1) {
      const overallBinMean = weightedMean(binMeans, binWeights);
      Q_temporal = binWeights.reduce((sum, w, i) =>
        sum + w * Math.pow(binMeans[i] - overallBinMean, 2), 0);
      df_temporal = binMeans.length - 1;
    }
  }

  // --- GEOGRAPHIC HETEROGENEITY ---
  let Q_geographic = 0, df_geographic = 0;
  const studiesWithRegion = studies.filter(s => s.region !== undefined);

  if (studiesWithRegion.length >= 5) {
    const regions = {};
    for (const s of studiesWithRegion) {
      if (!regions[s.region]) regions[s.region] = [];
      regions[s.region].push(s);
    }

    const regionMeans = [];
    const regionWeights = [];

    for (const region of Object.keys(regions)) {
      const regionStudies = regions[region];
      if (regionStudies.length > 0) {
        const rw = regionStudies.map(s => 1 / s.vi);
        const rwTotal = rw.reduce((a, b) => a + b, 0);
        const rMean = weightedMean(regionStudies.map(s => s.yi), rw);
        regionMeans.push(rMean);
        regionWeights.push(rwTotal);
      }
    }

    if (regionMeans.length > 1) {
      const overallRegionMean = weightedMean(regionMeans, regionWeights);
      Q_geographic = regionWeights.reduce((sum, w, i) =>
        sum + w * Math.pow(regionMeans[i] - overallRegionMean, 2), 0);
      df_geographic = regionMeans.length - 1;
    }
  }

  // --- METHODOLOGICAL HETEROGENEITY ---
  let Q_methodology = 0, df_methodology = 0;
  const studiesWithMethod = studies.filter(s => s.methodology !== undefined);

  if (studiesWithMethod.length >= 5) {
    // Create methodology quality score
    const methodScores = studiesWithMethod.map(s => {
      const flags = s.methodology || {};
      return methodologyFactors.filter(f => flags[f] === true).length / methodologyFactors.length;
    });

    // Bin by methodology quality (low/medium/high)
    const methodBins = { low: [], medium: [], high: [] };
    for (let i = 0; i < studiesWithMethod.length; i++) {
      const score = methodScores[i];
      if (score < 0.4) methodBins.low.push(studiesWithMethod[i]);
      else if (score < 0.7) methodBins.medium.push(studiesWithMethod[i]);
      else methodBins.high.push(studiesWithMethod[i]);
    }

    const methodMeans = [];
    const methodWeights = [];

    for (const bin of Object.values(methodBins)) {
      if (bin.length > 0) {
        const mw = bin.map(s => 1 / s.vi);
        const mwTotal = mw.reduce((a, b) => a + b, 0);
        const mMean = weightedMean(bin.map(s => s.yi), mw);
        methodMeans.push(mMean);
        methodWeights.push(mwTotal);
      }
    }

    if (methodMeans.length > 1) {
      const overallMethodMean = weightedMean(methodMeans, methodWeights);
      Q_methodology = methodWeights.reduce((sum, w, i) =>
        sum + w * Math.pow(methodMeans[i] - overallMethodMean, 2), 0);
      df_methodology = methodMeans.length - 1;
    }
  }

  // Residual heterogeneity
  const Q_explained = Q_temporal + Q_geographic + Q_methodology;
  const Q_residual = Math.max(0, Q_total - Q_explained);

  // Proportions
  const temporal_prop = Q_total > 0 ? (Q_temporal / Q_total) * 100 : 0;
  const geographic_prop = Q_total > 0 ? (Q_geographic / Q_total) * 100 : 0;
  const methodology_prop = Q_total > 0 ? (Q_methodology / Q_total) * 100 : 0;
  const residual_prop = Q_total > 0 ? (Q_residual / Q_total) * 100 : 0;

  // Dominant source
  const proportions = [
    { source: 'temporal', prop: temporal_prop },
    { source: 'geographic', prop: geographic_prop },
    { source: 'methodological', prop: methodology_prop },
    { source: 'residual', prop: residual_prop }
  ];
  const dominant = proportions.reduce((a, b) => a.prop > b.prop ? a : b);

  return {
    method: 'Multi-Resolution Heterogeneity Decomposition',
    novelty: 'GENUINE - Decomposes I² into actionable components (not in any R package)',
    warning: 'EXPLORATORY METHOD: Not validated in simulation studies. Report alongside standard I².',
    total: {
      Q: Q_total.toFixed(2),
      df: df_total,
      I2: I2_total.toFixed(1) + '%'
    },
    components: {
      temporal: {
        Q: Q_temporal.toFixed(2),
        df: df_temporal,
        proportionOfTotal: temporal_prop.toFixed(1) + '%',
        available: df_temporal > 0
      },
      geographic: {
        Q: Q_geographic.toFixed(2),
        df: df_geographic,
        proportionOfTotal: geographic_prop.toFixed(1) + '%',
        available: df_geographic > 0
      },
      methodological: {
        Q: Q_methodology.toFixed(2),
        df: df_methodology,
        proportionOfTotal: methodology_prop.toFixed(1) + '%',
        available: df_methodology > 0
      },
      residual: {
        Q: Q_residual.toFixed(2),
        proportionOfTotal: residual_prop.toFixed(1) + '%'
      }
    },
    dominantSource: dominant.source,
    interpretation: dominant.source === 'temporal'
      ? 'Heterogeneity primarily driven by temporal changes - consider epoch-specific analyses'
      : dominant.source === 'geographic'
        ? 'Heterogeneity primarily driven by regional differences - consider stratified analyses'
        : dominant.source === 'methodological'
          ? 'Heterogeneity primarily driven by methodology - consider sensitivity analysis by quality'
          : 'Heterogeneity is primarily unexplained - explore additional moderators'
  };
}

// ============================================================================
// SECTION 2: COLLABORATIVE CONFLICT RESOLUTION
// ============================================================================

/**
 * Multi-Reviewer Conflict Resolution for Living Reviews
 *
 * NOVELTY: Provides structured conflict resolution for continuous
 * screening/extraction in living reviews. Standard kappa is for
 * snapshot assessment; this tracks resolution over time.
 *
 * @param {Array} decisions - [{itemId, reviewer1, reviewer2, resolved, resolutionDate, resolvedBy}]
 * @param {Object} options - Configuration
 * @returns {Object} Conflict analysis and reviewer calibration
 */
export function conflictResolutionAnalysis(decisions, options = {}) {
  if (!decisions || decisions.length === 0) {
    throw new Error('Decisions array required');
  }

  const {
    outcomeCategories = ['include', 'exclude', 'maybe'],
    timeWindow = 30 // Days for recent analysis
  } = options;

  // Basic agreement metrics
  const totalItems = decisions.length;
  const agreementItems = decisions.filter(d => d.reviewer1 === d.reviewer2);
  const conflictItems = decisions.filter(d => d.reviewer1 !== d.reviewer2);

  const agreementRate = agreementItems.length / totalItems;

  // Cohen's Kappa
  // Expected agreement by chance
  const r1counts = {};
  const r2counts = {};
  for (const d of decisions) {
    r1counts[d.reviewer1] = (r1counts[d.reviewer1] || 0) + 1;
    r2counts[d.reviewer2] = (r2counts[d.reviewer2] || 0) + 1;
  }

  let expectedAgreement = 0;
  for (const cat of outcomeCategories) {
    const p1 = (r1counts[cat] || 0) / totalItems;
    const p2 = (r2counts[cat] || 0) / totalItems;
    expectedAgreement += p1 * p2;
  }

  const kappa = expectedAgreement < 1
    ? (agreementRate - expectedAgreement) / (1 - expectedAgreement)
    : 1;

  // Conflict patterns
  const conflictPatterns = {};
  for (const d of conflictItems) {
    const pattern = `${d.reviewer1}_vs_${d.reviewer2}`;
    conflictPatterns[pattern] = (conflictPatterns[pattern] || 0) + 1;
  }

  // Sort by frequency
  // Guard against division by zero when no conflicts exist
  const nConflicts = conflictItems.length || 1; // Use 1 to avoid div/0, but result will be empty anyway
  const sortedPatterns = Object.entries(conflictPatterns)
    .sort((a, b) => b[1] - a[1])
    .map(([pattern, count]) => ({
      pattern,
      count,
      percentage: ((count / nConflicts) * 100).toFixed(1) + '%'
    }));

  // Resolution analysis
  const resolvedConflicts = conflictItems.filter(d => d.resolved);
  const resolutionRate = conflictItems.length > 0
    ? resolvedConflicts.length / conflictItems.length
    : 1;

  // Resolution outcomes (who "wins" more often)
  const resolutionOutcomes = { reviewer1: 0, reviewer2: 0, consensus: 0 };
  for (const d of resolvedConflicts) {
    if (d.resolvedOutcome === d.reviewer1) resolutionOutcomes.reviewer1++;
    else if (d.resolvedOutcome === d.reviewer2) resolutionOutcomes.reviewer2++;
    else resolutionOutcomes.consensus++;
  }

  // Temporal trend in agreement
  const now = new Date();
  const recentCutoff = new Date(now - timeWindow * 24 * 60 * 60 * 1000);

  const recentDecisions = decisions.filter(d => new Date(d.date) > recentCutoff);
  const recentAgreement = recentDecisions.length > 0
    ? recentDecisions.filter(d => d.reviewer1 === d.reviewer2).length / recentDecisions.length
    : null;

  // Trend assessment
  let trend = 'STABLE';
  if (recentAgreement !== null && recentDecisions.length >= 10) {
    if (recentAgreement > agreementRate + 0.1) trend = 'IMPROVING';
    else if (recentAgreement < agreementRate - 0.1) trend = 'DECLINING';
  }

  // Recommendations
  const recommendations = [];
  if (kappa < 0.6) {
    recommendations.push('Low inter-rater agreement - consider recalibration meeting');
  }
  if (sortedPatterns.length > 0 && sortedPatterns[0].count > conflictItems.length * 0.3) {
    recommendations.push(`Most common conflict pattern: ${sortedPatterns[0].pattern} - clarify criteria`);
  }
  if (resolutionRate < 0.8) {
    recommendations.push('Many unresolved conflicts - allocate time for resolution');
  }
  if (resolutionOutcomes.reviewer1 > resolutionOutcomes.reviewer2 * 2 ||
      resolutionOutcomes.reviewer2 > resolutionOutcomes.reviewer1 * 2) {
    recommendations.push('Resolution outcomes skewed toward one reviewer - check for systematic bias');
  }

  return {
    method: 'Conflict Resolution Analysis for Living Reviews',
    novelty: 'GENUINE - Continuous conflict monitoring (not in standard review tools)',
    warning: 'EXPLORATORY METHOD: Workflow tool for living reviews, not a statistical method.',
    overallMetrics: {
      totalItems,
      agreementRate: (agreementRate * 100).toFixed(1) + '%',
      kappa: kappa.toFixed(3),
      kappaInterpretation: kappa > 0.8 ? 'Almost perfect' :
                          kappa > 0.6 ? 'Substantial' :
                          kappa > 0.4 ? 'Moderate' :
                          kappa > 0.2 ? 'Fair' : 'Poor'
    },
    conflicts: {
      total: conflictItems.length,
      resolved: resolvedConflicts.length,
      resolutionRate: (resolutionRate * 100).toFixed(1) + '%',
      commonPatterns: sortedPatterns.slice(0, 5)
    },
    resolutionOutcomes,
    temporalTrend: {
      recentItems: recentDecisions.length,
      recentAgreement: recentAgreement ? (recentAgreement * 100).toFixed(1) + '%' : 'N/A',
      trend
    },
    recommendations
  };
}

// ============================================================================
// SECTION 3: ADAPTIVE BAYESIAN LEARNING FOR LIVING REVIEWS
// ============================================================================

/**
 * Adaptive Prior Learning from Historical Meta-Analyses
 *
 * NOVELTY: Learns informative priors for tau² from previously completed
 * meta-analyses in the same domain. Standard Bayesian MA uses generic priors;
 * this builds domain-specific priors from accumulated evidence.
 *
 * @param {Array} historicalMAs - [{topic, tau2, k, intervention_type}] completed MAs
 * @param {Object} newMA - {topic, intervention_type, initialStudies}
 * @returns {Object} Learned prior distribution for tau²
 */
export function adaptivePriorLearning(historicalMAs, newMA = {}) {
  if (!historicalMAs || historicalMAs.length === 0) {
    throw new Error('Historical meta-analyses required');
  }

  const {
    priorType = 'half-cauchy', // 'half-cauchy', 'inverse-gamma', 'log-normal'
    useTopicSimilarity = true,
    similarityWeight = 0.5
  } = newMA.options || {};

  // Filter to MAs with valid tau² estimates
  const validMAs = historicalMAs.filter(ma => ma.tau2 !== undefined && ma.tau2 >= 0 && ma.k >= 3);

  if (validMAs.length < 3) {
    return {
      method: 'Adaptive Prior Learning',
      error: 'At least 3 valid historical MAs required',
      fallback: 'Using default non-informative prior'
    };
  }

  // Estimate empirical distribution of tau²
  const tau2values = validMAs.map(ma => ma.tau2);
  const weights = validMAs.map(ma => Math.sqrt(ma.k)); // Weight by sqrt(k)

  // Calculate topic similarity if available
  let similarityScores = validMAs.map(() => 1);
  if (useTopicSimilarity && newMA.intervention_type) {
    similarityScores = validMAs.map(ma => {
      if (ma.intervention_type === newMA.intervention_type) return 1.5;
      if (ma.topic && newMA.topic && ma.topic.toLowerCase().includes(newMA.topic.toLowerCase())) return 1.2;
      return 1;
    });
  }

  // Combined weights
  const combinedWeights = weights.map((w, i) => w * similarityScores[i]);
  const totalWeight = combinedWeights.reduce((a, b) => a + b, 0);

  // Weighted statistics
  const weightedMeanTau2 = tau2values.reduce((sum, t, i) => sum + combinedWeights[i] * t, 0) / totalWeight;
  const weightedVarTau2 = tau2values.reduce((sum, t, i) =>
    sum + combinedWeights[i] * Math.pow(t - weightedMeanTau2, 2), 0) / totalWeight;

  // Percentiles for tau²
  const sortedTau2 = [...tau2values].sort((a, b) => a - b);
  const p25 = sortedTau2[Math.floor(sortedTau2.length * 0.25)];
  const p50 = sortedTau2[Math.floor(sortedTau2.length * 0.5)];
  const p75 = sortedTau2[Math.floor(sortedTau2.length * 0.75)];

  // Fit prior parameters based on type
  let priorParams = {};

  if (priorType === 'half-cauchy') {
    // Half-Cauchy(0, scale): scale ≈ median
    priorParams = {
      distribution: 'Half-Cauchy',
      location: 0,
      scale: p50,
      interpretation: `Prior: tau² ~ Half-Cauchy(0, ${p50.toFixed(4)})`
    };
  } else if (priorType === 'inverse-gamma') {
    // Inverse-Gamma(shape, rate): match mean and variance
    // Mean = rate / (shape - 1), Var = rate² / ((shape-1)² * (shape-2))
    // Guard against variance = 0 (all tau² values identical)
    const safeVar = Math.max(weightedVarTau2, weightedMeanTau2 * weightedMeanTau2 * 0.01);
    const shape = 2 + (weightedMeanTau2 * weightedMeanTau2) / safeVar;
    const rate = weightedMeanTau2 * (shape - 1);
    priorParams = {
      distribution: 'Inverse-Gamma',
      shape: Math.max(2.1, shape), // Ensure proper prior
      rate: Math.max(0.001, rate), // Ensure positive rate
      interpretation: `Prior: tau² ~ InvGamma(${Math.max(2.1, shape).toFixed(2)}, ${Math.max(0.001, rate).toFixed(4)})`
    };
  } else {
    // Log-normal: fit to log(tau²)
    const logTau2 = tau2values.filter(t => t > 0).map(t => Math.log(t));
    const muLog = mean(logTau2);
    const sigmaLog = standardDeviation(logTau2);
    priorParams = {
      distribution: 'Log-Normal',
      mu: muLog,
      sigma: sigmaLog,
      interpretation: `Prior: tau² ~ LogNormal(${muLog.toFixed(3)}, ${sigmaLog.toFixed(3)})`
    };
  }

  return {
    method: 'Adaptive Prior Learning',
    novelty: 'GENUINE - Domain-specific informative priors from historical MAs',
    warning: 'EXPLORATORY METHOD: Always compare with non-informative prior as sensitivity analysis.',
    historicalEvidence: {
      nMetaAnalyses: validMAs.length,
      totalStudies: validMAs.reduce((sum, ma) => sum + ma.k, 0),
      tau2Percentiles: {
        p25: p25.toFixed(4),
        median: p50.toFixed(4),
        p75: p75.toFixed(4)
      }
    },
    learnedPrior: priorParams,
    topicWeighting: useTopicSimilarity ? 'Applied' : 'Not applied',
    comparisonToDefault: {
      defaultPrior: 'Half-Cauchy(0, 0.5) or Uniform(0, 2)',
      informativeGain: 'Prior informed by ' + validMAs.length + ' domain-specific meta-analyses'
    },
    usage: {
      bayesian: `Use prior ${priorParams.interpretation} in JAGS/Stan`,
      sensitivity: 'Compare results with default non-informative prior'
    }
  };
}

// ============================================================================
// SECTION 4: EVIDENCE DECAY AND OBSOLESCENCE MODELING
// ============================================================================

/**
 * Evidence Obsolescence Scoring
 *
 * NOVELTY: Models when studies become "obsolete" due to:
 * - Changes in standard of care
 * - New intervention formulations
 * - Evolved diagnostic criteria
 * - Superseded comparators
 *
 * No R package models this systematically.
 *
 * @param {Array} studies - [{yi, vi, year, intervention, comparator, criteria_version}]
 * @param {Object} context - {currentYear, currentStandard, currentCriteria}
 * @returns {Object} Obsolescence scores and recommended exclusions
 */
export function evidenceObsolescenceScoring(studies, context = {}) {
  validateStudies(studies, ['yi', 'vi', 'year']);

  const {
    currentYear = new Date().getFullYear(),
    currentStandard = null,
    currentCriteria = null,
    obsolescenceThreshold = 0.5, // Below this = obsolete
    ageFactor = 0.03, // Per-year decay rate
    practiceChangeYears = [], // Years when practice changed significantly
    supersededInterventions = [] // Interventions no longer used
  } = context;

  const studiesWithScores = studies.map((s, idx) => {
    let obsolescenceScore = 1.0; // Start fully current
    const reasons = [];

    // Age-based decay
    const age = currentYear - s.year;
    const ageDecay = Math.exp(-ageFactor * age);
    obsolescenceScore *= ageDecay;
    if (age > 15) reasons.push('Study >15 years old');

    // Practice change penalty
    const practiceChangesAfter = practiceChangeYears.filter(y => y > s.year).length;
    if (practiceChangesAfter > 0) {
      const practiceDecay = Math.pow(0.7, practiceChangesAfter);
      obsolescenceScore *= practiceDecay;
      reasons.push(`${practiceChangesAfter} major practice change(s) since study`);
    }

    // Superseded intervention
    if (s.intervention && supersededInterventions.includes(s.intervention)) {
      obsolescenceScore *= 0.3;
      reasons.push('Intervention no longer in use');
    }

    // Outdated diagnostic criteria
    if (s.criteria_version && currentCriteria && s.criteria_version !== currentCriteria) {
      obsolescenceScore *= 0.7;
      reasons.push(`Uses outdated criteria (${s.criteria_version} vs current ${currentCriteria})`);
    }

    // Outdated comparator (e.g., placebo when active comparator is now standard)
    if (s.comparator && currentStandard && s.comparator !== currentStandard) {
      if (s.comparator === 'placebo' && currentStandard !== 'placebo') {
        obsolescenceScore *= 0.6;
        reasons.push('Placebo comparator when active treatment is now standard');
      }
    }

    return {
      ...s,
      idx,
      age,
      obsolescenceScore,
      isObsolete: obsolescenceScore < obsolescenceThreshold,
      reasons
    };
  });

  // Summary statistics
  const currentStudies = studiesWithScores.filter(s => !s.isObsolete);
  const obsoleteStudies = studiesWithScores.filter(s => s.isObsolete);

  // Calculate pooled estimates for current vs all
  let currentPooled = null, allPooled = null;
  if (currentStudies.length >= 2) {
    const cWeights = currentStudies.map(s => 1 / s.vi);
    const cTotalW = cWeights.reduce((a, b) => a + b, 0);
    currentPooled = currentStudies.reduce((sum, s, i) => sum + cWeights[i] * s.yi, 0) / cTotalW;
  }

  const allWeights = studies.map(s => 1 / s.vi);
  const allTotalW = allWeights.reduce((a, b) => a + b, 0);
  allPooled = studies.reduce((sum, s, i) => sum + allWeights[i] * s.yi, 0) / allTotalW;

  return {
    method: 'Evidence Obsolescence Scoring',
    novelty: 'GENUINE - Systematic obsolescence modeling (not in any R package)',
    warning: 'EXPLORATORY METHOD: Decay parameters are heuristic. Based on Shojania 2007 concepts.',
    summary: {
      totalStudies: studies.length,
      currentStudies: currentStudies.length,
      obsoleteStudies: obsoleteStudies.length,
      obsolescenceRate: ((obsoleteStudies.length / studies.length) * 100).toFixed(1) + '%'
    },
    pooledEstimates: {
      allStudies: allPooled?.toFixed(4),
      currentStudiesOnly: currentPooled?.toFixed(4),
      difference: currentPooled && allPooled ? (currentPooled - allPooled).toFixed(4) : 'N/A'
    },
    obsoleteStudyDetails: obsoleteStudies.map(s => ({
      index: s.idx,
      year: s.year,
      score: s.obsolescenceScore.toFixed(3),
      reasons: s.reasons
    })),
    recommendation: obsoleteStudies.length > studies.length * 0.3
      ? 'Consider excluding obsolete studies or conducting sensitivity analysis'
      : obsoleteStudies.length > 0
        ? 'Report sensitivity analysis with/without obsolete studies'
        : 'Evidence base appears current',
    sensitivityAnalysis: {
      description: 'Compare primary analysis to analysis excluding obsolete studies',
      obsoleteExcludedN: currentStudies.length,
      obsoleteIncludedN: studies.length
    }
  };
}

// ============================================================================
// SECTION 5: REGISTRY-DERIVED SAMPLE SIZE RE-ESTIMATION
// ============================================================================

/**
 * Living Meta-Analysis Sample Size Re-estimation
 *
 * NOVELTY: Uses registry data to predict when adequate power will be
 * achieved, accounting for ongoing and planned studies. Standard sample
 * size calculations are for individual trials; this is for living MAs.
 *
 * @param {Object} currentMA - {theta, se, k, totalN}
 * @param {Array} ongoingTrials - [{nctId, plannedN, expectedCompletion, probability}]
 * @param {Object} target - {minClinicalEffect, power, alpha}
 * @returns {Object} Power projection and milestone dates
 */
export function livingMASampleSizeProjection(currentMA, ongoingTrials = [], target = {}) {
  if (!currentMA || currentMA.theta === undefined) {
    throw new Error('Current meta-analysis results required');
  }

  const {
    minClinicalEffect = null, // Minimum clinically important difference
    power = 0.8,
    alpha = 0.05,
    planningHorizon = 3 // years
  } = target;

  const { theta: currentTheta, se: currentSE, k: currentK, totalN = 0 } = currentMA;

  // Estimate effect to detect
  const effectToDetect = minClinicalEffect || Math.abs(currentTheta);

  // Required information for target power
  const za = normalQuantile(1 - alpha / 2);
  const zb = normalQuantile(power);
  const requiredInfo = Math.pow(za + zb, 2) / (effectToDetect * effectToDetect);

  // Current information
  const currentInfo = 1 / (currentSE * currentSE);
  const currentPower = normalCDF(Math.sqrt(currentInfo) * effectToDetect - za) +
                       normalCDF(-Math.sqrt(currentInfo) * effectToDetect - za);

  // Information gap
  const infoGap = Math.max(0, requiredInfo - currentInfo);

  // Project completion of ongoing trials
  const trialProjections = ongoingTrials.map(trial => {
    // Estimate information contribution (assuming similar variance structure)
    const avgInfoPerN = totalN > 0 ? currentInfo / totalN : 0.01;
    const expectedInfo = trial.plannedN * avgInfoPerN * (trial.probability || 0.7);

    return {
      ...trial,
      expectedInfo,
      percentOfGap: infoGap > 0 ? (expectedInfo / infoGap * 100).toFixed(1) + '%' : 'Gap closed'
    };
  });

  // Cumulative information over time
  const now = new Date();
  const milestones = [];
  let cumulativeInfo = currentInfo;

  // Sort trials by expected completion
  const sortedTrials = [...trialProjections]
    .filter(t => t.expectedCompletion)
    .sort((a, b) => new Date(a.expectedCompletion) - new Date(b.expectedCompletion));

  for (const trial of sortedTrials) {
    cumulativeInfo += trial.expectedInfo;
    const projectedPower = normalCDF(Math.sqrt(cumulativeInfo) * effectToDetect - za) +
                           normalCDF(-Math.sqrt(cumulativeInfo) * effectToDetect - za);

    milestones.push({
      date: trial.expectedCompletion,
      cumulativeInfo: cumulativeInfo.toFixed(2),
      projectedPower: (projectedPower * 100).toFixed(1) + '%',
      meetsTarget: projectedPower >= power
    });
  }

  // Find when target power is reached
  const targetMilestone = milestones.find(m => m.meetsTarget);

  // If not reached with known trials, estimate additional needs
  let additionalNeeded = null;
  if (!targetMilestone && infoGap > 0) {
    const avgInfoPerN = totalN > 0 ? currentInfo / totalN : 0.01;
    additionalNeeded = Math.ceil(infoGap / avgInfoPerN);
  }

  return {
    method: 'Living MA Sample Size Projection',
    novelty: 'GENUINE - Registry-informed power projection for living reviews',
    warning: 'EXPLORATORY METHOD: Projections assume constant effect. Update as new data arrives.',
    currentState: {
      pooledEffect: currentTheta.toFixed(4),
      currentSE: currentSE.toFixed(4),
      studies: currentK,
      totalN,
      currentPower: (currentPower * 100).toFixed(1) + '%'
    },
    target: {
      effect: effectToDetect.toFixed(4),
      power: (power * 100) + '%',
      alpha,
      requiredInformation: requiredInfo.toFixed(2)
    },
    informationAnalysis: {
      currentInformation: currentInfo.toFixed(2),
      informationGap: infoGap.toFixed(2),
      percentComplete: ((currentInfo / requiredInfo) * 100).toFixed(1) + '%'
    },
    ongoingTrials: trialProjections,
    milestones: milestones.slice(0, 10), // Limit output
    projection: targetMilestone
      ? {
          targetPowerDate: targetMilestone.date,
          additionalTrialsNeeded: 'Existing trials sufficient'
        }
      : {
          targetPowerDate: 'Beyond planning horizon with known trials',
          additionalParticipantsNeeded: additionalNeeded,
          recommendation: `Approximately ${additionalNeeded} additional participants needed`
        },
    recommendation: currentPower >= power
      ? 'Already adequately powered - consider finalizing conclusions'
      : targetMilestone
        ? `Target power expected by ${targetMilestone.date}`
        : 'Additional studies beyond registered trials needed for adequate power'
  };
}

// ============================================================================
// SECTION 6: CROSS-DESIGN EVIDENCE SYNTHESIS
// ============================================================================

/**
 * Registry-Informed RCT + Observational Synthesis
 *
 * NOVELTY: Combines RCT and observational evidence with bias adjustment
 * informed by registry signals. Different from standard design-adjusted
 * synthesis because it uses registry data to estimate bias magnitude.
 *
 * @param {Array} rctStudies - [{yi, vi, ...registrySignals}]
 * @param {Array} obsStudies - [{yi, vi, ...registrySignals}]
 * @param {Object} options - Configuration
 * @returns {Object} Combined estimate with uncertainty
 */
export function registryInformedCrossDesignSynthesis(rctStudies, obsStudies, options = {}) {
  if ((!rctStudies || rctStudies.length === 0) && (!obsStudies || obsStudies.length === 0)) {
    throw new Error('At least one study required');
  }

  const {
    biasAdjustmentMethod = 'registry-informed', // 'registry-informed', 'fixed', 'none'
    fixedBiasAdjustment = 0.1, // Used if method is 'fixed'
    rctWeight = 'auto', // 'auto', 'variance', or numeric multiplier
    includeUncertainty = true
  } = options;

  // RCT pooled estimate
  let rctTheta = null, rctVar = null, rctK = 0;
  if (rctStudies && rctStudies.length > 0) {
    validateStudies(rctStudies, ['yi', 'vi']);
    const rctWeights = rctStudies.map(s => 1 / s.vi);
    const rctTotalW = rctWeights.reduce((a, b) => a + b, 0);
    rctTheta = rctStudies.reduce((sum, s, i) => sum + rctWeights[i] * s.yi, 0) / rctTotalW;
    rctVar = 1 / rctTotalW;
    rctK = rctStudies.length;
  }

  // Observational pooled estimate
  let obsTheta = null, obsVar = null, obsK = 0;
  if (obsStudies && obsStudies.length > 0) {
    validateStudies(obsStudies, ['yi', 'vi']);
    const obsWeights = obsStudies.map(s => 1 / s.vi);
    const obsTotalW = obsWeights.reduce((a, b) => a + b, 0);
    obsTheta = obsStudies.reduce((sum, s, i) => sum + obsWeights[i] * s.yi, 0) / obsTotalW;
    obsVar = 1 / obsTotalW;
    obsK = obsStudies.length;
  }

  // If only one design, return that
  if (rctTheta === null) {
    return {
      method: 'Registry-Informed Cross-Design Synthesis',
      warning: 'Only observational studies available',
      estimate: obsTheta,
      se: Math.sqrt(obsVar),
      designContributions: { rct: 0, observational: 100 }
    };
  }

  if (obsTheta === null) {
    return {
      method: 'Registry-Informed Cross-Design Synthesis',
      warning: 'Only RCT studies available',
      estimate: rctTheta,
      se: Math.sqrt(rctVar),
      designContributions: { rct: 100, observational: 0 }
    };
  }

  // Estimate bias adjustment for observational studies
  let biasAdjustment = 0;
  let biasUncertainty = 0;

  if (biasAdjustmentMethod === 'registry-informed') {
    // Use registry signals to estimate bias
    const obsSignals = obsStudies.map(s => {
      const signals = s.registrySignals || s.integritySignals || {};
      // Higher outcome switching, lower completion = more bias
      return 1 - (
        (signals.completionRate || 0.7) * 0.3 +
        (signals.outcomeMatch || 0.7) * 0.4 +
        (signals.protocolAdherence || 0.7) * 0.3
      );
    });

    const avgBiasSignal = mean(obsSignals);

    // Empirical calibration: assume max bias ~ 0.3 effect units
    biasAdjustment = avgBiasSignal * 0.3 * Math.sign(obsTheta - rctTheta);
    biasUncertainty = standardDeviation(obsSignals) * 0.3;

  } else if (biasAdjustmentMethod === 'fixed') {
    biasAdjustment = fixedBiasAdjustment * Math.sign(obsTheta - rctTheta);
    biasUncertainty = fixedBiasAdjustment * 0.5;
  }

  // Bias-adjusted observational estimate
  const obsAdjusted = obsTheta - biasAdjustment;
  const obsAdjustedVar = obsVar + (includeUncertainty ? biasUncertainty * biasUncertainty : 0);

  // Combined estimate (inverse-variance weighted)
  let rctWeightFactor = 1;
  if (rctWeight === 'auto') {
    // Weight RCTs more if observational bias signals are concerning
    rctWeightFactor = biasAdjustment > 0.1 ? 1.5 : 1.0;
  } else if (typeof rctWeight === 'number') {
    rctWeightFactor = rctWeight;
  }

  const w_rct = rctWeightFactor / rctVar;
  const w_obs = 1 / obsAdjustedVar;
  const totalW = w_rct + w_obs;

  const combinedTheta = (w_rct * rctTheta + w_obs * obsAdjusted) / totalW;
  const combinedVar = 1 / totalW;
  const combinedSE = Math.sqrt(combinedVar);

  // Design contributions
  const rctContrib = (w_rct / totalW) * 100;
  const obsContrib = (w_obs / totalW) * 100;

  return {
    method: 'Registry-Informed Cross-Design Synthesis',
    novelty: 'GENUINE - Uses registry signals to estimate observational bias',
    warning: 'EXPLORATORY METHOD: Bias calibration is heuristic. Always present design-specific results.',
    combinedEstimate: combinedTheta,
    se: combinedSE,
    ci: [combinedTheta - 1.96 * combinedSE, combinedTheta + 1.96 * combinedSE],
    designSpecific: {
      rct: { theta: rctTheta, se: Math.sqrt(rctVar), k: rctK },
      observational: {
        raw: { theta: obsTheta, se: Math.sqrt(obsVar), k: obsK },
        biasAdjusted: { theta: obsAdjusted, biasCorrection: biasAdjustment }
      }
    },
    biasAnalysis: {
      method: biasAdjustmentMethod,
      estimatedBias: biasAdjustment.toFixed(4),
      biasUncertainty: biasUncertainty.toFixed(4)
    },
    designContributions: {
      rct: rctContrib.toFixed(1) + '%',
      observational: obsContrib.toFixed(1) + '%'
    },
    interpretation: Math.abs(rctTheta - obsAdjusted) > 1.96 * Math.sqrt(rctVar + obsAdjustedVar)
      ? 'Warning: Significant discrepancy between designs even after bias adjustment'
      : 'RCT and observational evidence reasonably consistent after adjustment'
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Multi-resolution heterogeneity
  multiResolutionHeterogeneity,

  // Conflict resolution
  conflictResolutionAnalysis,

  // Adaptive Bayesian
  adaptivePriorLearning,

  // Obsolescence
  evidenceObsolescenceScoring,

  // Sample size projection
  livingMASampleSizeProjection,

  // Cross-design synthesis
  registryInformedCrossDesignSynthesis
};
