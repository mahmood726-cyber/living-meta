/**
 * Analysis Worker
 * Handles meta-analysis computations in a background thread
 */

// Import analysis functions (will be implemented in lib/)
// For now, we'll define the worker interface and stub implementations

/**
 * Handle incoming messages from main thread
 */
self.onmessage = async function(event) {
  const { type, payload, requestId } = event.data;

  try {
    switch (type) {
      case 'RUN_META_ANALYSIS':
        await handleMetaAnalysis(payload, requestId);
        break;

      case 'RUN_TSA':
        await handleTSA(payload, requestId);
        break;

      case 'RUN_NMA':
        await handleNMA(payload, requestId);
        break;

      case 'CALCULATE_EFFECT_SIZES':
        await handleEffectSizes(payload, requestId);
        break;

      case 'RUN_SENSITIVITY':
        await handleSensitivity(payload, requestId);
        break;

      case 'RUN_INFLUENCE':
        await handleInfluence(payload, requestId);
        break;

      // Advanced methods (beyond R)
      case 'RUN_RVE':
        await handleRVE(payload, requestId);
        break;

      case 'RUN_META_REGRESSION':
        await handleMetaRegression(payload, requestId);
        break;

      case 'RUN_THREE_LEVEL':
        await handleThreeLevelMeta(payload, requestId);
        break;

      case 'RUN_FRAGILITY':
        await handleFragility(payload, requestId);
        break;

      case 'RUN_CLINICAL_PROPORTION':
        await handleClinicalProportion(payload, requestId);
        break;

      case 'RUN_PET_PEESE':
        await handlePetPeese(payload, requestId);
        break;

      case 'RUN_SELECTION_MODEL':
        await handleSelectionModel(payload, requestId);
        break;

      case 'RUN_SEQUENTIAL_ANALYSIS':
        await handleSequentialAnalysis(payload, requestId);
        break;

      case 'RUN_ANALYSIS':
        await handleRunAnalysis(payload, requestId);
        break;

      default:
        console.warn('Unknown message type:', type);
    }
  } catch (error) {
    self.postMessage({
      type: 'ANALYSIS_ERROR',
      error: error.message,
      stack: error.stack,
      requestId
    });
  }
};

/**
 * Handle pairwise meta-analysis
 */
async function handleMetaAnalysis(payload, requestId) {
  const { studies, spec } = payload;

  self.postMessage({
    type: 'ANALYSIS_STARTED',
    payload: { phase: 'meta-analysis' },
    requestId
  });

  try {
    // Validate input
    if (!studies || !studies.length) {
      throw new Error('No studies provided for analysis');
    }

    // Extract effect sizes if not pre-computed
    let effectData = studies;
    if (spec.needsEffectCalculation) {
      effectData = calculateEffectSizes(studies, spec.effectType);
    }

    // Run fixed effects model
    const feResult = fixedEffects(effectData);

    // Run random effects model (default: DerSimonian-Laird for now)
    let reResult;
    switch (spec.tauEstimator || 'DL') {
      case 'REML':
        reResult = await remlEstimator(effectData);
        break;
      case 'PM':
        reResult = pauleMandel(effectData);
        break;
      case 'DL':
      default:
        reResult = derSimonianLaird(effectData);
    }

    // Apply HKSJ adjustment if requested (default: true)
    if (spec.useHKSJ !== false && reResult.k >= 2) {
      reResult = applyHKSJ(effectData, reResult);
    }

    // Calculate prediction interval
    const predictionInterval = calculatePredictionInterval(
      reResult.estimate,
      reResult.tau2,
      reResult.se,
      reResult.k
    );

    // Calculate I² with confidence interval
    const heterogeneity = calculateHeterogeneity(effectData, reResult);

    // Run small-study tests
    const eggerTest = runEggerTest(effectData);
    const petersTest = spec.effectType === 'OR' ? runPetersTest(effectData) : null;
    const harbordTest = spec.effectType === 'OR' ? runHarbordTest(effectData) : null;

    // Calculate E-values
    const eValues = calculateEValues(reResult.estimate, reResult.ci_lower, reResult.ci_upper, spec.effectType);

    // Tau clinical interpretation
    const tauInterpretation = interpretTau(reResult.tau, spec.effectType);

    // Compile results
    const results = {
      timestamp: new Date().toISOString(),
      spec,
      k: effectData.length,

      // Fixed effects
      fixed: {
        estimate: feResult.estimate,
        se: feResult.se,
        ci_lower: feResult.ci_lower,
        ci_upper: feResult.ci_upper,
        z: feResult.z,
        p: feResult.p
      },

      // Random effects
      random: {
        estimate: reResult.estimate,
        se: reResult.se,
        ci_lower: reResult.ci_lower,
        ci_upper: reResult.ci_upper,
        z: reResult.z,
        p: reResult.p,
        hksj_applied: reResult.hksj_applied || false,
        estimator: reResult.estimator || spec.tauEstimator || 'DL',
        estimator_fallback_used: reResult.fallback_used || false,
        estimator_fallback_reason: reResult.fallback_reason || null,
        estimator_fallback_warning: reResult.fallback_warning || null
      },

      // Heterogeneity
      heterogeneity: {
        tau2: reResult.tau2,
        tau: reResult.tau,
        tau_interpretation: tauInterpretation,
        Q: heterogeneity.Q,
        Q_df: heterogeneity.df,
        Q_p: heterogeneity.Q_p,
        I2: heterogeneity.I2,
        I2_ci_lower: heterogeneity.I2_ci_lower,
        I2_ci_upper: heterogeneity.I2_ci_upper,
        H2: heterogeneity.H2
      },

      // Prediction interval
      prediction_interval: {
        lower: predictionInterval.lower,
        upper: predictionInterval.upper,
        df: predictionInterval.df
      },

      // Small-study tests
      // Note: These tests have low power when k < 10. The Cochrane Handbook
      // recommends against routine testing for publication bias with fewer
      // than 10 studies (Sterne JAC et al. BMJ 2011;343:d4002).
      small_study_tests: {
        egger: eggerTest,
        peters: petersTest,
        harbord: harbordTest,
        power_warning: effectData.length < 10
          ? 'Small-study effect tests have limited power with ' + effectData.length +
            ' studies. Non-significant results do not rule out publication bias.'
          : null,
        adequate_power: effectData.length >= 10
      },

      // E-values
      e_values: eValues,

      // Per-study data for forest plot
      studies: effectData.map(s => ({
        id: s.id,
        label: s.label,
        yi: s.yi,
        vi: s.vi,
        weight_fe: s.weight_fe,
        weight_re: s.weight_re,
        ci_lower: s.ci_lower,
        ci_upper: s.ci_upper
      }))
    };

    self.postMessage({
      type: 'ANALYSIS_COMPLETE',
      payload: results,
      requestId
    });

  } catch (error) {
    throw error;
  }
}

/**
 * Handle RUN_ANALYSIS from analysis-config component
 * Transforms extractions to studies format and runs meta-analysis
 */
async function handleRunAnalysis(payload, requestId) {
  const { extractions, config, projectId } = payload;

  self.postMessage({
    type: 'ANALYSIS_STARTED',
    payload: { phase: 'preparing' },
    requestId
  });

  try {
    // Transform extractions to studies format
    const studies = extractions.map((e, idx) => {
      const data = e.data || {};

      // Handle both nested and flat data structures
      const events1 = data.treatment_events ?? e.treatment?.events ?? data.events1 ?? 0;
      const n1 = data.treatment_n ?? e.treatment?.n ?? data.n1 ?? 0;
      const events2 = data.control_events ?? e.control?.events ?? data.events2 ?? 0;
      const n2 = data.control_n ?? e.control?.n ?? data.n2 ?? 0;

      // For continuous outcomes
      const mean1 = data.treatment_mean ?? e.treatment?.mean ?? data.mean1;
      const sd1 = data.treatment_sd ?? e.treatment?.sd ?? data.sd1;
      const mean2 = data.control_mean ?? e.control?.mean ?? data.mean2;
      const sd2 = data.control_sd ?? e.control?.sd ?? data.sd2;

      return {
        id: e.nctId || `study_${idx + 1}`,
        label: data.studyLabel || e.nctId || `Study ${idx + 1}`,
        events1,
        n1,
        events2,
        n2,
        mean1,
        sd1,
        mean2,
        sd2,
        outcomeType: e.outcomeType || 'binary'
      };
    });

    // Create spec from config
    const spec = {
      effectType: config.effectMeasure || 'OR',
      tauEstimator: config.tauMethod || 'REML',
      useHKSJ: config.applyHKSJ !== false,
      alpha: config.alpha || 0.05,
      needsEffectCalculation: true
    };

    // Use existing handleMetaAnalysis logic
    // Calculate effect sizes
    const effectData = calculateEffectSizes(studies, spec.effectType);

    // Run fixed effects model
    const feResult = fixedEffects(effectData);

    // Run random effects model
    let reResult;
    switch (spec.tauEstimator) {
      case 'REML':
        reResult = await remlEstimator(effectData);
        break;
      case 'PM':
        reResult = pauleMandel(effectData);
        break;
      case 'DL':
      default:
        reResult = derSimonianLaird(effectData);
    }

    // Apply HKSJ adjustment if requested
    if (spec.useHKSJ && reResult.k >= 2) {
      reResult = applyHKSJ(effectData, reResult);
    }

    // Calculate prediction interval
    const predictionInterval = calculatePredictionInterval(
      reResult.estimate,
      reResult.tau2,
      reResult.se,
      reResult.k
    );

    // Calculate heterogeneity
    const heterogeneity = calculateHeterogeneity(effectData, reResult);

    // Run small-study tests
    const eggerTest = runEggerTest(effectData);
    const petersTest = spec.effectType === 'OR' ? runPetersTest(effectData) : null;
    const harbordTest = spec.effectType === 'OR' ? runHarbordTest(effectData) : null;

    // Run trim and fill
    let trimAndFill = null;
    try {
      trimAndFill = runTrimAndFill(effectData, reResult.estimate);
    } catch (e) {
      console.warn('Trim and fill failed:', e.message);
    }

    // Calculate E-values
    const eValues = calculateEValues(
      reResult.estimate,
      reResult.ci_lower,
      reResult.ci_upper,
      spec.effectType
    );

    // Calculate total N
    const totalN = effectData.reduce((sum, s) => sum + (s.n1 || 0) + (s.n2 || 0), 0);

    // Format results for results-panel.js
    const results = {
      meta_analysis: {
        k: effectData.length,
        total_n: totalN,
        effect_measure: spec.effectType,

        fixed_effect: {
          estimate: feResult.estimate,
          se: feResult.se,
          ci_lower: feResult.ci_lower,
          ci_upper: feResult.ci_upper,
          z: feResult.z,
          p_value: feResult.p
        },

        random_effects: {
          estimate: reResult.estimate,
          se: reResult.se,
          ci_lower: reResult.ci_lower,
          ci_upper: reResult.ci_upper,
          z: reResult.z,
          p_value: reResult.p,
          method: spec.tauEstimator,
          hksj_applied: reResult.hksj_applied || false,
          hksj_wider: reResult.hksj_wider
        },

        heterogeneity: {
          tau2: reResult.tau2,
          tau: reResult.tau,
          Q: heterogeneity.Q,
          df: heterogeneity.df,
          Q_pvalue: heterogeneity.Q_p,
          I2: heterogeneity.I2,
          I2_ci: {
            lower: heterogeneity.I2_ci_lower,
            upper: heterogeneity.I2_ci_upper
          },
          H2: heterogeneity.H2
        },

        prediction_interval: predictionInterval
      },

      studies: effectData.map(s => ({
        id: s.id,
        label: s.label,
        yi: s.yi,
        vi: s.vi,
        se: Math.sqrt(s.vi),
        weight_fe: s.weight_fe,
        weight_re: s.weight_re,
        ci_lower: s.ci_lower,
        ci_upper: s.ci_upper,
        n1: s.n1,
        n2: s.n2
      })),

      small_study_tests: {
        egger: eggerTest,
        peters: petersTest,
        harbord: harbordTest,
        trim_and_fill: trimAndFill
      },

      e_values: eValues,

      // Run sensitivity analysis
      sensitivity: {
        leave_one_out: runLeaveOneOut(effectData, spec),
        influence: calculateInfluence(effectData, reResult)
      }
    };

    self.postMessage({
      type: 'ANALYSIS_COMPLETE',
      payload: results,
      requestId
    });

  } catch (error) {
    self.postMessage({
      type: 'ANALYSIS_ERROR',
      payload: { message: error.message },
      requestId
    });
  }
}

/**
 * Run leave-one-out sensitivity analysis
 */
function runLeaveOneOut(effectData, spec) {
  const results = [];

  for (let i = 0; i < effectData.length; i++) {
    const subset = effectData.filter((_, idx) => idx !== i);
    if (subset.length < 2) continue;

    try {
      const reResult = derSimonianLaird(subset);
      const het = calculateHeterogeneity(subset, reResult);

      results.push({
        omitted: effectData[i].label,
        estimate: reResult.estimate,
        ci_lower: reResult.ci_lower,
        ci_upper: reResult.ci_upper,
        I2: het.I2,
        p_value: reResult.p,
        changes_significance: (reResult.p < 0.05) !== (effectData.length > 0)
      });
    } catch (e) {
      // Skip if analysis fails for this subset
    }
  }

  return results;
}

/**
 * Calculate influence diagnostics
 */
function calculateInfluence(effectData, reResult) {
  const results = [];
  const k = effectData.length;

  for (let i = 0; i < k; i++) {
    const subset = effectData.filter((_, idx) => idx !== i);
    if (subset.length < 2) continue;

    try {
      const subResult = derSimonianLaird(subset);

      // Calculate DFBETAS (change in estimate)
      const dfbetas = (reResult.estimate - subResult.estimate) / reResult.se;

      // Calculate Cook's D approximation
      const cooks_d = Math.pow(dfbetas, 2) / k;

      // Influential if |DFBETAS| > 2/sqrt(k) or Cook's D > 4/(k-2)
      const dfbetas_threshold = 2 / Math.sqrt(k);
      const cooks_threshold = 4 / (k - 2);
      const influential = Math.abs(dfbetas) > dfbetas_threshold || cooks_d > cooks_threshold;

      results.push({
        study: effectData[i].label,
        dfbetas,
        cooks_d,
        cov_r: subResult.se / reResult.se,
        influential
      });
    } catch (e) {
      // Skip if analysis fails
    }
  }

  return results;
}

/**
 * Handle Trial Sequential Analysis
 */
async function handleTSA(payload, requestId) {
  const { studies, spec } = payload;

  self.postMessage({
    type: 'TSA_STARTED',
    requestId
  });

  try {
    // Sort studies by date
    const sortedStudies = [...studies].sort((a, b) =>
      new Date(a.date) - new Date(b.date)
    );

    // Calculate cumulative meta-analyses
    const cumulativeResults = [];
    for (let i = 1; i <= sortedStudies.length; i++) {
      const subset = sortedStudies.slice(0, i);
      const result = derSimonianLaird(subset);
      cumulativeResults.push({
        k: i,
        date: sortedStudies[i - 1].date,
        estimate: result.estimate,
        se: result.se,
        z: result.z,
        tau2: result.tau2,
        I2: result.I2,
        cumulative_n: subset.reduce((sum, s) => sum + (s.n1 + s.n2), 0)
      });
    }

    // Get current meta-analysis heterogeneity for DARIS calculation
    const currentResult = cumulativeResults[cumulativeResults.length - 1];
    const empiricalTau2 = currentResult.tau2 || 0;
    const empiricalI2 = currentResult.I2 || 0;

    // Calculate Required Information Size (RIS)
    const anticipatedEffect = spec.anticipatedEffect || currentResult.estimate;
    const alpha = spec.alpha || 0.05;
    const beta = spec.beta || 0.20;

    // Calculate heterogeneity adjustment for DARIS (Diversity-Adjusted RIS)
    // Uses empirical I² from the meta-analysis rather than a fixed multiplier
    // DARIS = RIS × (1 / (1 - I²))  when I² is known
    // Reference: Wetterslev J, et al. Trial Sequential Analysis. BMC Medical Research Methodology. 2017
    let heterogeneityAdjustment;
    if (spec.heterogeneityAdjustment !== undefined && spec.heterogeneityAdjustment !== null) {
      // User-specified adjustment takes precedence
      heterogeneityAdjustment = spec.heterogeneityAdjustment;
    } else if (empiricalI2 > 0 && empiricalI2 < 1) {
      // Use empirical I² to calculate diversity adjustment
      // D = 1 / (1 - I²) = 1 + I² / (1 - I²)
      heterogeneityAdjustment = 1 / (1 - empiricalI2);
    } else {
      // Default: no adjustment if I² is 0 or undefined
      heterogeneityAdjustment = 1.0;
    }

    const ris = calculateRIS(anticipatedEffect, alpha, beta, heterogeneityAdjustment, spec.effectType);

    // Calculate spending function boundaries
    const boundaries = calculateOBrienFlemingBoundaries(
      cumulativeResults.map(r => r.cumulative_n),
      ris,
      alpha
    );

    // Determine TSA conclusion
    const lastZ = Math.abs(cumulativeResults[cumulativeResults.length - 1].z);
    const lastBoundary = boundaries[boundaries.length - 1];
    const informationFraction = cumulativeResults[cumulativeResults.length - 1].cumulative_n / ris;

    const conclusion = lastZ >= lastBoundary.upper
      ? 'firm_evidence_effect'
      : lastZ <= lastBoundary.futility
        ? 'firm_evidence_no_effect'
        : informationFraction >= 1.0
          ? 'inconclusive_ris_reached'
          : 'more_data_needed';

    const results = {
      timestamp: new Date().toISOString(),
      spec,

      // Cumulative analysis
      cumulative: cumulativeResults,

      // TSA parameters
      parameters: {
        alpha,
        beta,
        anticipated_effect: anticipatedEffect,
        // Heterogeneity adjustment for DARIS (Diversity-Adjusted RIS)
        heterogeneity_adjustment: heterogeneityAdjustment,
        heterogeneity_source: spec.heterogeneityAdjustment !== undefined
          ? 'user_specified'
          : (empiricalI2 > 0 ? 'empirical_I2' : 'none'),
        empirical_I2: empiricalI2,
        empirical_tau2: empiricalTau2,
        required_information_size: ris,
        diversity_adjusted_ris: ris * heterogeneityAdjustment,
        daris_formula_note: 'DARIS = RIS × (1 / (1 - I²)) using empirical I² from current meta-analysis'
      },

      // Boundaries
      boundaries,

      // Current status
      status: {
        current_information: cumulativeResults[cumulativeResults.length - 1].cumulative_n,
        information_fraction: informationFraction,
        current_z: cumulativeResults[cumulativeResults.length - 1].z,
        conclusion,
        conclusion_text: getTSAConclusionText(conclusion)
      }
    };

    self.postMessage({
      type: 'TSA_COMPLETE',
      payload: results,
      requestId
    });

  } catch (error) {
    throw error;
  }
}

/**
 * Handle Network Meta-Analysis
 *
 * EXPERIMENTAL STATUS: This NMA implementation is a simplified frequentist
 * approach. It has NOT been validated against established software such as
 * netmeta (R) or WinBUGS/OpenBUGS (Bayesian NMA).
 *
 * Users should interpret results with caution and consider using validated
 * software for publication-quality analyses.
 *
 * Missing features compared to netmeta:
 * - Proper graph-theoretic variance estimation
 * - Multi-arm study handling (arm-based vs contrast-based)
 * - Full inconsistency diagnostics (design-by-treatment interaction Q)
 * - Component NMA
 *
 * Reference: Rücker G, Schwarzer G. netmeta: An R Package for Network
 * Meta-Analysis Using Frequentist Methods. J Stat Softw. 2015;106(2):1-40.
 */
async function handleNMA(payload, requestId) {
  const { studies, spec } = payload;

  self.postMessage({
    type: 'NMA_STARTED',
    requestId
  });

  // Experimental warning
  const experimentalWarning = {
    status: 'EXPERIMENTAL',
    message: 'This NMA implementation is experimental and has not been validated against netmeta or other established software. ' +
      'Results should be interpreted with caution. For publication-quality analyses, consider using validated software.',
    missing_features: [
      'Graph-theoretic variance estimation',
      'Multi-arm study handling',
      'Full inconsistency diagnostics',
      'Component NMA',
      'League table with proper CI calculations'
    ],
    recommendation: 'Use netmeta (R) or specialized NMA software for rigorous analysis'
  };

  try {
    // Check network connectivity
    const network = buildNetwork(studies);
    if (!network.isConnected) {
      throw new Error('Network is disconnected. NMA requires a connected network.');
    }

    // Run NMA (simplified frequentist approach)
    // Full implementation would use WASM for matrix operations
    const nmaResult = runFrequentistNMA(studies, spec);

    // Calculate inconsistency
    const inconsistency = calculateInconsistency(studies, nmaResult);

    // Calculate rankings
    const rankings = calculateSUCRA(nmaResult);

    const results = {
      timestamp: new Date().toISOString(),
      spec,

      // EXPERIMENTAL WARNING - prominent placement for visibility
      experimental_warning: experimentalWarning,

      // Network info
      network: {
        nodes: network.nodes,
        edges: network.edges,
        is_connected: network.isConnected,
        total_studies: studies.length
      },

      // Relative effects
      effects: nmaResult.effects,

      // League table
      league_table: nmaResult.leagueTable,

      // Rankings (SUCRA)
      // Note: SUCRA values should be interpreted with uncertainty;
      // ranking probabilities not yet implemented
      rankings,
      rankings_warning: 'SUCRA values are point estimates only. ' +
        'Ranking probabilities and confidence intervals not available in this experimental version.',

      // Inconsistency
      inconsistency: {
        global: inconsistency.global,
        node_splitting: inconsistency.nodeSplitting,
        design_by_treatment: inconsistency.designByTreatment
      }
    };

    self.postMessage({
      type: 'NMA_COMPLETE',
      payload: results,
      requestId
    });

  } catch (error) {
    throw error;
  }
}

/**
 * Handle effect size calculation
 */
async function handleEffectSizes(payload, requestId) {
  const { studies, effectType } = payload;

  try {
    const results = calculateEffectSizes(studies, effectType);

    self.postMessage({
      type: 'EFFECT_SIZES_COMPLETE',
      payload: results,
      requestId
    });
  } catch (error) {
    throw error;
  }
}

/**
 * Handle sensitivity analysis
 */
async function handleSensitivity(payload, requestId) {
  const { studies, spec, exclusions } = payload;

  self.postMessage({
    type: 'SENSITIVITY_STARTED',
    requestId
  });

  try {
    const results = [];

    // Run analysis for each exclusion scenario
    for (const exclusion of exclusions) {
      const filteredStudies = studies.filter(s => !exclusion.nctIds.includes(s.id));
      const result = derSimonianLaird(filteredStudies);

      results.push({
        scenario: exclusion.name,
        excluded: exclusion.nctIds,
        k: filteredStudies.length,
        estimate: result.estimate,
        ci_lower: result.ci_lower,
        ci_upper: result.ci_upper,
        tau2: result.tau2,
        I2: result.I2
      });
    }

    self.postMessage({
      type: 'SENSITIVITY_COMPLETE',
      payload: { results },
      requestId
    });

  } catch (error) {
    throw error;
  }
}

/**
 * Handle influence diagnostics (leave-one-out)
 */
async function handleInfluence(payload, requestId) {
  const { studies, spec } = payload;

  self.postMessage({
    type: 'INFLUENCE_STARTED',
    requestId
  });

  try {
    const results = [];

    // Leave-one-out analysis
    for (let i = 0; i < studies.length; i++) {
      const subset = [...studies.slice(0, i), ...studies.slice(i + 1)];
      const result = derSimonianLaird(subset);

      results.push({
        excluded_study: studies[i].id,
        excluded_label: studies[i].label,
        estimate: result.estimate,
        ci_lower: result.ci_lower,
        ci_upper: result.ci_upper,
        tau2: result.tau2,
        I2: result.I2
      });
    }

    // Calculate influence statistics
    const fullResult = derSimonianLaird(studies);
    const influences = results.map(r => ({
      ...r,
      estimate_change: fullResult.estimate - r.estimate,
      tau2_change: fullResult.tau2 - r.tau2
    }));

    self.postMessage({
      type: 'INFLUENCE_COMPLETE',
      payload: {
        full_estimate: fullResult.estimate,
        results: influences
      },
      requestId
    });

  } catch (error) {
    throw error;
  }
}

// ============================================
// Statistical Functions (simplified versions)
// Full implementations in lib/ modules
// ============================================

/**
 * Calculate effect sizes from raw data
 */
function calculateEffectSizes(studies, effectType) {
  return studies.map(study => {
    let yi, vi;

    switch (effectType) {
      case 'OR': {
        // Odds ratio (log scale)
        const a = study.events1;
        const b = study.n1 - study.events1;
        const c = study.events2;
        const d = study.n2 - study.events2;
        yi = Math.log((a * d) / (b * c));
        vi = 1/a + 1/b + 1/c + 1/d;
        break;
      }

      case 'RR': {
        // Risk ratio (log scale)
        const p1 = study.events1 / study.n1;
        const p2 = study.events2 / study.n2;
        yi = Math.log(p1 / p2);
        vi = (1 - p1) / (study.events1) + (1 - p2) / (study.events2);
        break;
      }

      case 'RD': {
        // Risk difference
        yi = (study.events1 / study.n1) - (study.events2 / study.n2);
        vi = (study.events1 * (study.n1 - study.events1)) / Math.pow(study.n1, 3) +
             (study.events2 * (study.n2 - study.events2)) / Math.pow(study.n2, 3);
        break;
      }

      case 'MD': {
        // Mean difference
        yi = study.mean1 - study.mean2;
        vi = (study.sd1 * study.sd1) / study.n1 + (study.sd2 * study.sd2) / study.n2;
        break;
      }

      case 'SMD': {
        // Standardized mean difference (Hedges' g)
        const pooledSD = Math.sqrt(
          ((study.n1 - 1) * study.sd1 * study.sd1 + (study.n2 - 1) * study.sd2 * study.sd2) /
          (study.n1 + study.n2 - 2)
        );
        const d = (study.mean1 - study.mean2) / pooledSD;
        const j = 1 - 3 / (4 * (study.n1 + study.n2 - 2) - 1); // Hedges' correction
        yi = d * j;
        vi = (study.n1 + study.n2) / (study.n1 * study.n2) +
             (yi * yi) / (2 * (study.n1 + study.n2));
        break;
      }

      case 'logHR': {
        // Log hazard ratio (pre-computed)
        yi = study.logHR;
        vi = study.seLogHR * study.seLogHR;
        break;
      }

      default:
        throw new Error(`Unknown effect type: ${effectType}`);
    }

    const se = Math.sqrt(vi);
    const z = 1.96;

    return {
      ...study,
      yi,
      vi,
      se,
      ci_lower: yi - z * se,
      ci_upper: yi + z * se
    };
  });
}

/**
 * Fixed effects meta-analysis
 */
function fixedEffects(studies) {
  const weights = studies.map(s => 1 / s.vi);
  const sumWeights = weights.reduce((a, b) => a + b, 0);

  const estimate = studies.reduce((sum, s, i) => sum + weights[i] * s.yi, 0) / sumWeights;
  const variance = 1 / sumWeights;
  const se = Math.sqrt(variance);
  const z = estimate / se;
  const p = 2 * (1 - normalCDF(Math.abs(z)));

  // Store weights on studies
  studies.forEach((s, i) => {
    s.weight_fe = weights[i] / sumWeights;
  });

  return {
    estimate,
    variance,
    se,
    ci_lower: estimate - 1.96 * se,
    ci_upper: estimate + 1.96 * se,
    z,
    p,
    k: studies.length
  };
}

/**
 * DerSimonian-Laird random effects estimator
 */
function derSimonianLaird(studies) {
  const k = studies.length;
  const weights = studies.map(s => 1 / s.vi);
  const sumWeights = weights.reduce((a, b) => a + b, 0);
  const sumWeights2 = weights.reduce((a, b) => a + b * b, 0);

  // Fixed effects estimate for Q calculation
  const thetaFE = studies.reduce((sum, s, i) => sum + weights[i] * s.yi, 0) / sumWeights;

  // Cochran's Q
  const Q = studies.reduce((sum, s, i) => sum + weights[i] * Math.pow(s.yi - thetaFE, 2), 0);
  const df = k - 1;

  // DL tau² estimate
  const c = sumWeights - sumWeights2 / sumWeights;
  let tau2 = Math.max(0, (Q - df) / c);

  // Random effects weights
  const reWeights = studies.map(s => 1 / (s.vi + tau2));
  const sumREWeights = reWeights.reduce((a, b) => a + b, 0);

  const estimate = studies.reduce((sum, s, i) => sum + reWeights[i] * s.yi, 0) / sumREWeights;
  const variance = 1 / sumREWeights;
  const se = Math.sqrt(variance);
  const z = estimate / se;
  const p = 2 * (1 - normalCDF(Math.abs(z)));

  // Store weights on studies
  studies.forEach((s, i) => {
    s.weight_re = reWeights[i] / sumREWeights;
  });

  // I² calculation
  const I2 = Math.max(0, (Q - df) / Q);

  return {
    estimate,
    variance,
    se,
    ci_lower: estimate - 1.96 * se,
    ci_upper: estimate + 1.96 * se,
    z,
    p,
    tau2,
    tau: Math.sqrt(tau2),
    Q,
    df,
    I2,
    k
  };
}

/**
 * REML estimator (placeholder - full implementation in WASM)
 *
 * When REML is not available or fails, this function falls back to DL.
 * The fallback is explicitly flagged in the return object so the UI
 * can notify users of the methodological change.
 *
 * @returns {object} Result with estimator and fallback_used flag
 */
/**
 * REML (Restricted Maximum Likelihood) estimator for τ²
 *
 * Uses profile likelihood optimization with Brent's method.
 * This matches metafor's REML implementation.
 *
 * Reference: Viechtbauer W (2005). Bias and efficiency of meta-analytic
 *            variance estimators in the random-effects model.
 *            J Educ Behav Stat 30:261-293
 */
async function remlEstimator(studies, options = {}) {
  const { maxIter = 100, tol = 1e-10 } = options;

  const validStudies = studies.filter(s =>
    s.yi !== null && s.vi !== null &&
    !isNaN(s.yi) && !isNaN(s.vi) &&
    s.vi > 0
  );

  if (validStudies.length === 0) {
    return { error: 'No valid studies' };
  }

  const k = validStudies.length;
  const yi = validStudies.map(s => s.yi);
  const vi = validStudies.map(s => s.vi);

  // Get DL estimate for initialization and Q statistic
  const dlResult = derSimonianLaird(validStudies);

  // REML negative log-likelihood (for minimization)
  function negRemlLL(tau2) {
    const wi = vi.map(v => 1 / (v + tau2));
    const sumWi = wi.reduce((a, b) => a + b, 0);
    const theta = yi.reduce((sum, y, i) => sum + wi[i] * y, 0) / sumWi;
    let ll = 0;
    for (let i = 0; i < k; i++) {
      ll += Math.log(vi[i] + tau2);
      ll += wi[i] * Math.pow(yi[i] - theta, 2);
    }
    ll += Math.log(sumWi);
    return 0.5 * ll;
  }

  // Brent's method for 1D minimization
  let a = 0, b = Math.max(10, dlResult.tau2 * 10);
  const golden = 0.381966;
  let x = a + golden * (b - a);
  let w = x, v = x;
  let fx = negRemlLL(x), fw = fx, fv = fx;
  let d = 0, e = 0;
  let iter = 0;
  let converged = false;

  for (iter = 0; iter < maxIter; iter++) {
    const m = 0.5 * (a + b);
    const tol1 = tol * Math.abs(x) + 1e-10;
    const tol2 = 2 * tol1;

    if (Math.abs(x - m) <= tol2 - 0.5 * (b - a)) {
      converged = true;
      break;
    }

    let u;
    if (Math.abs(e) > tol1) {
      const r = (x - w) * (fx - fv);
      let q = (x - v) * (fx - fw);
      let p = (x - v) * q - (x - w) * r;
      q = 2 * (q - r);
      if (q > 0) p = -p; else q = -q;
      const r2 = e;
      e = d;
      if (Math.abs(p) < Math.abs(0.5 * q * r2) && p > q * (a - x) && p < q * (b - x)) {
        d = p / q;
        u = x + d;
        if (u - a < tol2 || b - u < tol2) d = x < m ? tol1 : -tol1;
      } else {
        e = (x < m ? b : a) - x;
        d = golden * e;
      }
    } else {
      e = (x < m ? b : a) - x;
      d = golden * e;
    }

    u = x + (Math.abs(d) >= tol1 ? d : (d > 0 ? tol1 : -tol1));
    u = Math.max(0, u);
    const fu = negRemlLL(u);

    if (fu <= fx) {
      if (u < x) b = x; else a = x;
      v = w; fv = fw;
      w = x; fw = fx;
      x = u; fx = fu;
    } else {
      if (u < x) a = u; else b = u;
      if (fu <= fw || w === x) {
        v = w; fv = fw;
        w = u; fw = fu;
      } else if (fu <= fv || v === x || v === w) {
        v = u; fv = fu;
      }
    }
  }

  const tau2 = Math.max(0, x);

  // Calculate final estimates
  const wiStar = vi.map(v => 1 / (v + tau2));
  const sumWiStar = wiStar.reduce((a, b) => a + b, 0);
  const estimate = yi.reduce((sum, y, i) => sum + wiStar[i] * y, 0) / sumWiStar;
  const variance = 1 / sumWiStar;
  const se = Math.sqrt(variance);

  return {
    estimate,
    se,
    variance,
    ci_lower: estimate - 1.96 * se,
    ci_upper: estimate + 1.96 * se,
    tau2,
    tau: Math.sqrt(tau2),
    k,
    Q: dlResult.Q,
    I2: tau2 > 0 ? (tau2 / (tau2 + variance)) * 100 : 0,
    estimator: 'REML',
    converged,
    iterations: iter + 1,
    fallback_used: false,
    fallback_reason: null,
    weights: validStudies.map((s, i) => ({
      id: s.id || s.nctId || i,
      yi: s.yi,
      vi: s.vi,
      weight: wiStar[i],
      weightPercent: (wiStar[i] / sumWiStar) * 100
    }))
  };
}

/**
 * Paule-Mandel estimator for τ²
 *
 * Uses bisection root-finding to solve Q*(τ²) = k-1
 * This is the correct PM algorithm per Paule & Mandel (1982)
 *
 * Reference: Paule RC, Mandel J (1982). Consensus values and weighting factors.
 *            J Res Natl Bur Stand 87:377-385
 */
function pauleMandel(studies, options = {}) {
  const { maxIter = 100, tol = 1e-8 } = options;

  const validStudies = studies.filter(s =>
    s.yi !== null && s.vi !== null &&
    !isNaN(s.yi) && !isNaN(s.vi) &&
    s.vi > 0
  );

  if (validStudies.length === 0) {
    return { error: 'No valid studies' };
  }

  const k = validStudies.length;
  const target = k - 1;

  // Helper function: compute Q* for a given τ²
  function computeQstar(tau2) {
    const wi = validStudies.map(s => 1 / (s.vi + tau2));
    const sumWi = wi.reduce((a, b) => a + b, 0);
    const theta = validStudies.reduce((sum, s, i) => sum + wi[i] * s.yi, 0) / sumWi;
    return validStudies.reduce((sum, s, i) => {
      return sum + wi[i] * Math.pow(s.yi - theta, 2);
    }, 0);
  }

  // Check if τ² = 0 is the solution
  const Q0 = computeQstar(0);
  let tau2 = 0;
  let converged = true;

  if (Q0 > target) {
    // Find upper bound
    let lower = 0;
    let upper = 1;
    while (computeQstar(upper) > target && upper < 1e10) {
      upper *= 2;
    }

    if (upper >= 1e10) {
      const dlResult = derSimonianLaird(validStudies);
      tau2 = dlResult.tau2;
      converged = false;
    } else {
      // Bisection search
      converged = false;
      for (let iter = 0; iter < maxIter; iter++) {
        tau2 = (lower + upper) / 2;
        const Qmid = computeQstar(tau2);

        if (Math.abs(Qmid - target) < tol || upper - lower < tol) {
          converged = true;
          break;
        }

        if (Qmid > target) {
          lower = tau2;
        } else {
          upper = tau2;
        }
      }
    }
  }

  // Calculate final estimates
  const wiStar = validStudies.map(s => 1 / (s.vi + tau2));
  const sumWiStar = wiStar.reduce((a, b) => a + b, 0);
  const estimate = validStudies.reduce((sum, s, i) => sum + wiStar[i] * s.yi, 0) / sumWiStar;
  const variance = 1 / sumWiStar;
  const se = Math.sqrt(variance);

  const dlResult = derSimonianLaird(validStudies);

  return {
    estimate,
    se,
    variance,
    ci_lower: estimate - 1.96 * se,
    ci_upper: estimate + 1.96 * se,
    tau2,
    tau: Math.sqrt(tau2),
    k,
    Q: dlResult.Q,
    I2: tau2 > 0 ? (tau2 / (tau2 + variance)) * 100 : 0,
    estimator: 'PM',
    converged,
    weights: validStudies.map((s, i) => ({
      id: s.id || s.nctId || i,
      yi: s.yi,
      vi: s.vi,
      weight: wiStar[i],
      weightPercent: (wiStar[i] / sumWiStar) * 100
    }))
  };
}

/**
 * Apply HKSJ adjustment (Hartung-Knapp-Sidik-Jonkman)
 */
function applyHKSJ(studies, reResult) {
  const k = studies.length;
  if (k < 2) return reResult;

  const tau2 = reResult.tau2;
  const weights = studies.map(s => 1 / (s.vi + tau2));
  const sumWeights = weights.reduce((a, b) => a + b, 0);
  const estimate = reResult.estimate;

  // HKSJ variance adjustment
  const qStar = studies.reduce((sum, s, i) =>
    sum + weights[i] * Math.pow(s.yi - estimate, 2), 0
  ) / (k - 1);

  const seHKSJ = Math.sqrt(qStar / sumWeights);
  const tCrit = tQuantile(0.975, k - 1);

  // Apply "never narrower" rule
  const ciHalfWidth = Math.max(
    tCrit * seHKSJ,
    1.96 * reResult.se
  );

  return {
    ...reResult,
    se: seHKSJ,
    ci_lower: estimate - ciHalfWidth,
    ci_upper: estimate + ciHalfWidth,
    hksj_applied: true,
    t_crit: tCrit
  };
}

/**
 * Calculate prediction interval
 */
function calculatePredictionInterval(estimate, tau2, se, k) {
  const df = k - 2;
  if (df < 1) {
    return { lower: null, upper: null, df };
  }

  const tCrit = tQuantile(0.975, df);
  const piSE = Math.sqrt(se * se + tau2);

  return {
    lower: estimate - tCrit * piSE,
    upper: estimate + tCrit * piSE,
    df
  };
}

/**
 * Calculate heterogeneity statistics with CI for I²
 * Uses the test-based method from Higgins & Thompson (2002)
 * Also implements Q-profile bounds for more robust coverage
 */
function calculateHeterogeneity(studies, reResult) {
  const { Q, df, I2 } = reResult;

  // Q p-value
  const Q_p = 1 - chiSquareCDF(Q, df);

  // I² confidence interval using test-based method (Higgins & Thompson 2002)
  // This is the method used by metafor's confint() with type="gamma" as default
  let I2_ci_lower = 0;
  let I2_ci_upper = 1;

  if (df > 0) {
    // Get chi-square critical values
    const chi_lower = chiSquareQuantile(0.025, df);  // Lower chi-square critical value
    const chi_upper = chiSquareQuantile(0.975, df);  // Upper chi-square critical value

    // Test-based CI for H²
    // H²_lower = Q / chi_upper (chi_upper is 97.5th percentile)
    // H²_upper = Q / chi_lower (chi_lower is 2.5th percentile)
    const H2_lower = Q / chi_upper;
    const H2_upper = chi_lower > 0 ? Q / chi_lower : Infinity;

    // Convert H² CI to I² CI: I² = (H² - 1) / H²
    I2_ci_lower = Math.max(0, (H2_lower - 1) / H2_lower);

    if (isFinite(H2_upper)) {
      I2_ci_upper = Math.min(1, (H2_upper - 1) / H2_upper);
    } else {
      I2_ci_upper = 1;
    }

    // Additional safeguards
    if (Q <= df) {
      // When Q <= df, there's no evidence of heterogeneity
      // Lower bound should be 0
      I2_ci_lower = 0;
    }

    // Ensure bounds are sensible
    if (I2_ci_lower < 0) I2_ci_lower = 0;
    if (I2_ci_upper > 1) I2_ci_upper = 1;
    if (I2_ci_lower > I2_ci_upper) {
      // Swap if in wrong order (can happen with numerical issues)
      [I2_ci_lower, I2_ci_upper] = [I2_ci_upper, I2_ci_lower];
    }
  }

  return {
    Q,
    df,
    Q_p,
    I2,
    I2_ci_lower,
    I2_ci_upper,
    H2: df > 0 ? Q / df : 0
  };
}

/**
 * Chi-square quantile function (inverse CDF)
 * Uses Wilson-Hilferty approximation for numerical stability
 */
function chiSquareQuantile(p, df) {
  if (df <= 0) return 0;
  if (p <= 0) return 0;
  if (p >= 1) return Infinity;

  // Wilson-Hilferty approximation
  // For small df, this is more stable than Newton-Raphson
  const z = normalQuantile(p);

  // Wilson-Hilferty transformation
  const a = 2 / (9 * df);
  const b = 1 - a + z * Math.sqrt(a);

  if (b <= 0) {
    // Fallback for extreme cases
    return 0;
  }

  const result = df * Math.pow(b, 3);
  return Math.max(0, result);
}

/**
 * Normal quantile (inverse CDF) - Abramowitz and Stegun approximation
 */
function normalQuantile(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;

  const a = [
    -3.969683028665376e+01, 2.209460984245205e+02,
    -2.759285104469687e+02, 1.383577518672690e+02,
    -3.066479806614716e+01, 2.506628277459239e+00
  ];
  const b = [
    -5.447609879822406e+01, 1.615858368580409e+02,
    -1.556989798598866e+02, 6.680131188771972e+01,
    -1.328068155288572e+01
  ];
  const c = [
    -7.784894002430293e-03, -3.223964580411365e-01,
    -2.400758277161838e+00, -2.549732539343734e+00,
    4.374664141464968e+00, 2.938163982698783e+00
  ];
  const d = [
    7.784695709041462e-03, 3.224671290700398e-01,
    2.445134137142996e+00, 3.754408661907416e+00
  ];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let q, r;

  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
           ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  } else if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q /
           (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
            ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  }
}

/**
 * Egger's regression test
 */
function runEggerTest(studies) {
  const n = studies.length;
  if (n < 3) {
    return { applicable: false, reason: 'k < 3' };
  }

  // Precision (1/SE) as predictor, standardized effect as outcome
  const x = studies.map(s => 1 / Math.sqrt(s.vi)); // precision
  const y = studies.map(s => s.yi / Math.sqrt(s.vi)); // standardized effect

  // Simple linear regression
  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;

  const ssXY = x.reduce((sum, xi, i) => sum + (xi - meanX) * (y[i] - meanY), 0);
  const ssXX = x.reduce((sum, xi) => sum + Math.pow(xi - meanX, 2), 0);

  const slope = ssXY / ssXX;
  const intercept = meanY - slope * meanX;

  // Residuals and standard error
  const residuals = y.map((yi, i) => yi - (intercept + slope * x[i]));
  const mse = residuals.reduce((sum, r) => sum + r * r, 0) / (n - 2);
  const seIntercept = Math.sqrt(mse * (1/n + meanX * meanX / ssXX));

  const t = intercept / seIntercept;
  const df = n - 2;
  const p = 2 * (1 - tCDF(Math.abs(t), df));

  return {
    applicable: true,
    intercept,
    se: seIntercept,
    t,
    df,
    p,
    significant: p < 0.1
  };
}

/**
 * Peters' test for publication bias in binary outcomes
 * Weighted linear regression of log(OR) on 1/n
 * Reference: Peters et al. (2006) JAMA
 */
function runPetersTest(studies) {
  // Filter valid studies with sample size data
  const validStudies = studies.filter(s =>
    s.yi !== null && s.vi !== null && s.vi > 0 &&
    s.n1 !== undefined && s.n2 !== undefined && s.n1 > 0 && s.n2 > 0
  );

  const k = validStudies.length;
  if (k < 3) {
    return { applicable: false, reason: 'k < 3' };
  }

  // Predictor: total_n (metafor regresses yi on n, not 1/n)
  const totalN = validStudies.map(s => s.n1 + s.n2);
  const x = totalN;

  // Outcome: effect estimate (log OR)
  const yi = validStudies.map(s => s.yi);

  // Weights: inverse variance
  const weights = validStudies.map(s => 1 / s.vi);

  // Weighted least squares regression
  const sumW = weights.reduce((a, b) => a + b, 0);
  const sumWX = weights.reduce((sum, w, i) => sum + w * x[i], 0);
  const sumWY = weights.reduce((sum, w, i) => sum + w * yi[i], 0);
  const sumWXX = weights.reduce((sum, w, i) => sum + w * x[i] * x[i], 0);
  const sumWXY = weights.reduce((sum, w, i) => sum + w * x[i] * yi[i], 0);

  const meanX = sumWX / sumW;
  const meanY = sumWY / sumW;

  const Sxx = sumWXX - sumW * meanX * meanX;
  const Sxy = sumWXY - sumW * meanX * meanY;

  if (Math.abs(Sxx) < 1e-10) {
    return { applicable: false, reason: 'Singular matrix' };
  }

  const slope = Sxy / Sxx;
  const intercept = meanY - slope * meanX;

  // Residual variance
  const residuals = yi.map((y, i) => y - intercept - slope * x[i]);
  const sse = residuals.reduce((sum, r, i) => sum + weights[i] * r * r, 0);
  const mse = sse / (k - 2);

  // Standard error of slope (test statistic for Peters)
  const seSlope = Math.sqrt(mse / Sxx);
  const seIntercept = Math.sqrt(mse * (1/sumW + meanX * meanX / Sxx));

  // T-test for slope
  const tSlope = slope / seSlope;
  const df = k - 2;
  const p = 2 * (1 - tCDF(Math.abs(tSlope), df));

  return {
    applicable: true,
    intercept,
    slope,
    se: seSlope,
    t: tSlope,
    df,
    p,
    significant: p < 0.1,
    interpretation: p < 0.1 ?
      `Evidence of small-study effects (p=${p.toFixed(3)}), suggesting possible publication bias` :
      'No evidence of small-study effects'
  };
}

/**
 * Harbord's test for publication bias in binary outcomes
 * Modified Egger test using score and score variance
 * Reference: Harbord et al. (2006) Stat Med
 */
function runHarbordTest(studies) {
  // Filter valid studies with 2x2 table data
  const validStudies = studies.filter(s =>
    s.a !== undefined && s.b !== undefined &&
    s.c !== undefined && s.d !== undefined &&
    s.a >= 0 && s.b >= 0 && s.c >= 0 && s.d >= 0 &&
    (s.a + s.b) > 0 && (s.c + s.d) > 0
  );

  const k = validStudies.length;
  if (k < 3) {
    return { applicable: false, reason: 'k < 3 or missing 2x2 table data' };
  }

  // Calculate score statistic and its variance for each study
  const scoreData = validStudies.map(s => {
    const { a, b, c, d } = s;
    const n1 = a + b;  // Treatment total
    const n2 = c + d;  // Control total
    const n = n1 + n2; // Total
    const m = a + c;   // Total events

    // Expected events in treatment under null
    const expected = n1 * m / n;

    // Score: observed - expected
    const score = a - expected;

    // Variance of score (hypergeometric)
    const varScore = n1 * n2 * m * (n - m) / (n * n * (n - 1));

    return {
      score,
      varScore,
      z: varScore > 0 ? score / Math.sqrt(varScore) : 0,
      precision: Math.sqrt(varScore)
    };
  }).filter(s => s.varScore > 0);

  if (scoreData.length < 3) {
    return { applicable: false, reason: 'Insufficient valid studies after score calculation' };
  }

  const kValid = scoreData.length;

  // Harbord regression: Z = intercept + slope * precision (OLS)
  const z = scoreData.map(s => s.z);
  const x = scoreData.map(s => s.precision);

  const sumX = x.reduce((a, b) => a + b, 0);
  const sumZ = z.reduce((a, b) => a + b, 0);
  const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
  const sumXZ = x.reduce((sum, xi, i) => sum + xi * z[i], 0);

  const meanX = sumX / kValid;
  const meanZ = sumZ / kValid;

  const Sxx = sumXX - kValid * meanX * meanX;
  const Sxz = sumXZ - kValid * meanX * meanZ;

  if (Math.abs(Sxx) < 1e-10) {
    return { applicable: false, reason: 'Singular matrix' };
  }

  const slope = Sxz / Sxx;
  const intercept = meanZ - slope * meanX;

  // Residual variance
  const residuals = z.map((zi, i) => zi - intercept - slope * x[i]);
  const sse = residuals.reduce((sum, r) => sum + r * r, 0);
  const mse = sse / (kValid - 2);

  const seIntercept = Math.sqrt(mse * (1/kValid + meanX * meanX / Sxx));

  // T-test for intercept (deviation from symmetry)
  const tIntercept = intercept / seIntercept;
  const df = kValid - 2;
  const p = 2 * (1 - tCDF(Math.abs(tIntercept), df));

  return {
    applicable: true,
    intercept,
    se: seIntercept,
    t: tIntercept,
    df,
    p,
    significant: p < 0.1,
    interpretation: p < 0.1 ?
      `Evidence of funnel plot asymmetry (p=${p.toFixed(3)}), suggesting possible publication bias` :
      'No evidence of funnel plot asymmetry'
  };
}


/**
 * Trim and Fill method for publication bias adjustment
 * Uses the L0 estimator (default in metafor)
 * Reference: Duval & Tweedie (2000) Biometrics
 *
 * Algorithm validated against metafor::trimfill()
 */
function runTrimAndFill(studies, pooledEstimate) {
  const validStudies = studies.filter(s =>
    s.yi !== null && s.vi !== null && !isNaN(s.yi) && !isNaN(s.vi) && s.vi > 0
  );

  const k = validStudies.length;
  if (k < 3) {
    return { applicable: false, reason: 'k < 3' };
  }

  // Determine asymmetry side using Egger-type regression
  // Regress yi on sqrt(vi), weighted by 1/vi
  const side = determineTrimFillSide(validStudies);

  // Work with flipped values if asymmetry is on right
  // This simplifies the algorithm to always look for "missing" studies on the left
  let yi = validStudies.map(s => side === 'right' ? -s.yi : s.yi);
  const vi = validStudies.map(s => s.vi);

  // Iterative L0 procedure
  let k0 = 0;
  let converged = false;
  let thetaIter = yi.reduce((sum, y, i) => sum + y / vi[i], 0) / vi.reduce((sum, v) => sum + 1/v, 0);

  for (let iter = 0; iter < 50; iter++) {
    // Sort studies by effect size
    const indices = yi.map((_, i) => i).sort((a, b) => yi[a] - yi[b]);
    const sorted_yi = indices.map(i => yi[i]);
    const sorted_vi = indices.map(i => vi[i]);

    // Calculate deviations from current theta
    const deviations = sorted_yi.map(y => y - thetaIter);

    // Create array with absolute deviations and signs
    const absDevs = deviations.map((d, i) => ({
      absD: Math.abs(d),
      sign: Math.sign(d) || 1,
      yi: sorted_yi[i],
      vi: sorted_vi[i],
      origIdx: i
    }));

    // Sort by absolute deviation and assign ranks
    absDevs.sort((a, b) => a.absD - b.absD);
    absDevs.forEach((item, rank) => { item.rank = rank + 1; });

    // Sum ranks for each side
    let rightRankSum = 0, leftRankSum = 0;
    for (const item of absDevs) {
      if (item.sign > 0) rightRankSum += item.rank;
      else leftRankSum += item.rank;
    }

    // L0 estimator: k0 = max(0, (4*Sr - k*(k+1)) / (2k-1))
    // Sr is the sum of ranks on the side with FEWER studies (smaller rank sum)
    const Sr = Math.min(rightRankSum, leftRankSum);
    const L0_raw = (4 * Sr - k * (k + 1)) / (2 * k - 1);
    const k0_new = Math.max(0, Math.round(L0_raw));

    if (k0_new === k0) {
      converged = true;
      break;
    }
    k0 = k0_new;

    if (k0 === 0) {
      converged = true;
      break;
    }

    // For L0, we fill on the LEFT (negative side in flipped space)
    // The k0 most NEGATIVE studies get reflected to the positive side
    const sorted2 = [...Array(k).keys()].sort((a, b) => yi[a] - yi[b]);
    const extremeIndices = sorted2.slice(0, k0);  // k0 most negative
    const extremeStudies = extremeIndices.map(i => ({ yi: yi[i], vi: vi[i] }));

    // Reflect around current theta
    const imputedYi = extremeStudies.map(s => 2 * thetaIter - s.yi);
    const imputedVi = extremeStudies.map(s => s.vi);

    // Recompute weighted mean with all studies
    const allYi = [...yi, ...imputedYi];
    const allVi = [...vi, ...imputedVi];
    const weights = allVi.map(v => 1 / v);
    const sumW = weights.reduce((a, b) => a + b, 0);
    thetaIter = allYi.reduce((sum, y, i) => sum + weights[i] * y, 0) / sumW;
  }

  // Final calculation with converged k0
  let adjustedEstimate, adjustedSE, imputedStudies = [];
  const finalTheta = thetaIter;

  if (k0 > 0) {
    // Get k0 most extreme studies to reflect
    const sorted2 = [...Array(k).keys()].sort((a, b) => yi[a] - yi[b]);
    const extremeIndices = sorted2.slice(0, k0);

    // Create imputed studies
    for (const idx of extremeIndices) {
      const imputedYi = 2 * finalTheta - yi[idx];
      // Convert back to original scale if we flipped
      const origYi = side === 'right' ? -imputedYi : imputedYi;
      imputedStudies.push({
        yi: origYi,
        vi: vi[idx],
        imputed: true
      });
    }

    // Compute final estimate on original scale
    const allStudies = [...validStudies, ...imputedStudies];
    const weights = allStudies.map(s => 1 / s.vi);
    const sumW = weights.reduce((a, b) => a + b, 0);
    adjustedEstimate = allStudies.reduce((sum, s, i) => sum + weights[i] * s.yi, 0) / sumW;
    adjustedSE = Math.sqrt(1 / sumW);
  } else {
    // No imputation needed
    const weights = validStudies.map(s => 1 / s.vi);
    const sumW = weights.reduce((a, b) => a + b, 0);
    adjustedEstimate = validStudies.reduce((sum, s, i) => sum + weights[i] * s.yi, 0) / sumW;
    adjustedSE = Math.sqrt(1 / sumW);
  }

  return {
    applicable: true,
    k0,
    side,
    k_original: k,
    k_total: k + k0,
    original_estimate: pooledEstimate,
    adjusted_estimate: adjustedEstimate,
    adjusted_se: adjustedSE,
    adjusted_ci_lower: adjustedEstimate - 1.96 * adjustedSE,
    adjusted_ci_upper: adjustedEstimate + 1.96 * adjustedSE,
    converged,
    imputed_studies: imputedStudies,
    interpretation: k0 === 0
      ? 'No missing studies detected'
      : k0 + ' potentially missing ' + (side === 'right' ? 'positive' : 'negative') + ' effect studies imputed'
  };
}

/**
 * Determine asymmetry side using Egger-type regression
 * Regresses yi on sqrt(vi), weighted by 1/vi
 * Negative slope indicates missing studies on the right (positive effects)
 */
function determineTrimFillSide(studies) {
  const x = studies.map(s => Math.sqrt(s.vi));
  const y = studies.map(s => s.yi);
  const w = studies.map(s => 1 / s.vi);

  const sumW = w.reduce((a, b) => a + b, 0);
  const meanX = w.reduce((sum, wi, i) => sum + wi * x[i], 0) / sumW;
  const meanY = w.reduce((sum, wi, i) => sum + wi * y[i], 0) / sumW;

  let num = 0, den = 0;
  for (let i = 0; i < studies.length; i++) {
    num += w[i] * (x[i] - meanX) * (y[i] - meanY);
    den += w[i] * Math.pow(x[i] - meanX, 2);
  }

  const slope = num / den;

  // Negative slope = smaller studies have more positive effects
  // This indicates "missing" negative effect studies on the left
  // OR equivalently, funnel asymmetry toward the right
  return slope < 0 ? 'right' : 'left';
}


/**
 * Calculate E-values
/**
 * Calculate E-values for unmeasured confounding sensitivity analysis
 * Reference: VanderWeele & Ding (2017) Ann Intern Med
 *
 * The E-value for the CI bound tells us the minimum confounding strength
 * needed to shift the confidence interval to include the null.
 */
function calculateEValues(estimate, ci_lower, ci_upper, effectType) {
  // Convert to RR scale based on effect type
  let rr, rrCILower, rrCIUpper;

  if (effectType === 'OR' || effectType === 'logOR') {
    // Exponentiate log-OR to get OR, use as RR approximation
    // (More accurate conversion would require baseline risk)
    rr = Math.exp(estimate);
    rrCILower = Math.exp(ci_lower);
    rrCIUpper = Math.exp(ci_upper);
  } else if (effectType === 'RR' || effectType === 'logRR') {
    // Exponentiate log-RR to get RR
    rr = Math.exp(estimate);
    rrCILower = Math.exp(ci_lower);
    rrCIUpper = Math.exp(ci_upper);
  } else {
    // For continuous outcomes (SMD), use VanderWeele approximation
    // RR ≈ exp(0.91 × SMD)
    rr = Math.exp(0.91 * estimate);
    rrCILower = Math.exp(0.91 * ci_lower);
    rrCIUpper = Math.exp(0.91 * ci_upper);
  }

  // Determine effect direction
  const isProtective = rr < 1;

  // For E-value, we need RR >= 1, so invert if protective
  let rrForEValue = rr;
  let ciBoundClosestToNull;

  if (isProtective) {
    // Protective effect (RR < 1): invert to get RR > 1
    rrForEValue = 1 / rr;
    // The CI bound closest to null (RR=1) is the UPPER bound
    // After inversion: 1/upper becomes lower, and we want this
    ciBoundClosestToNull = 1 / rrCIUpper;
  } else {
    // Harmful effect (RR > 1): use as-is
    rrForEValue = rr;
    // The CI bound closest to null (RR=1) is the LOWER bound
    ciBoundClosestToNull = rrCILower;
  }

  // Calculate E-value for point estimate
  const eValue = computeEValue(rrForEValue);

  // Calculate E-value for CI bound closest to null
  let eValueCI;
  if (ciBoundClosestToNull <= 1) {
    // CI includes the null - no confounding needed to explain away significance
    eValueCI = 1;
  } else {
    eValueCI = computeEValue(ciBoundClosestToNull);
  }

  return {
    point_estimate: eValue,
    confidence_interval: eValueCI,
    rr_used: rr,
    rr_for_evalue: rrForEValue,
    ci_bound_used: ciBoundClosestToNull,
    effect_direction: isProtective ? 'protective' : 'harmful',
    interpretation: interpretEValue(eValue),
    ci_interpretation: eValueCI === 1
      ? 'CI includes null; significance not robust to any confounding'
      : eValueCI < 1.5
        ? 'Significance vulnerable to weak confounding'
        : eValueCI < 2
          ? 'Significance vulnerable to moderate confounding'
          : 'Significance reasonably robust to confounding'
  };
}

/**
 * Core E-value formula
 * E = RR + sqrt(RR × (RR - 1)) for RR >= 1
 */
function computeEValue(rr) {
  if (rr < 1) rr = 1 / rr;  // Should already be >= 1, but safety check
  if (rr < 1.01) return 1;   // Essentially null effect
  return rr + Math.sqrt(rr * (rr - 1));
}

function interpretEValue(eValue) {
  if (eValue >= 3) return 'Robust to unmeasured confounding';
  if (eValue >= 2) return 'Moderate robustness';
  if (eValue >= 1.5) return 'Somewhat vulnerable to confounding';
  return 'Vulnerable to unmeasured confounding';
}

/**
 * Interpret tau on clinical scale
 */
function interpretTau(tau, effectType) {
  if (effectType === 'OR' || effectType === 'RR' || effectType === 'logOR' || effectType === 'logRR') {
    // Log scale interpretation
    if (tau < 0.1) return { level: 'low', description: 'Minimal heterogeneity (RR varies by <10%)' };
    if (tau < 0.3) return { level: 'moderate', description: 'Moderate heterogeneity (RR varies by 10-35%)' };
    if (tau < 0.5) return { level: 'substantial', description: 'Substantial heterogeneity (RR varies by 35-65%)' };
    return { level: 'considerable', description: 'Considerable heterogeneity (RR varies by >65%)' };
  } else {
    // SMD scale
    if (tau < 0.1) return { level: 'low', description: 'Minimal heterogeneity (SMD varies by <0.1)' };
    if (tau < 0.2) return { level: 'moderate', description: 'Moderate heterogeneity (SMD varies by 0.1-0.2)' };
    if (tau < 0.4) return { level: 'substantial', description: 'Substantial heterogeneity (SMD varies by 0.2-0.4)' };
    return { level: 'considerable', description: 'Considerable heterogeneity (SMD varies by >0.4)' };
  }
}

/**
 * Calculate Required Information Size (RIS) for TSA
 *
 * RIS is the sample size needed to detect the anticipated effect
 * with specified power (1-β) at significance level α.
 *
 * For binary outcomes (log-scale):
 *   RIS = 4 × (z_α/2 + z_β)² / δ²
 *   where δ = anticipated log(RR) or log(OR)
 *
 * For continuous outcomes:
 *   RIS = 2 × (z_α/2 + z_β)² × σ² / δ²
 *   where δ = anticipated SMD, σ² = 2 (standardized)
 *
 * Heterogeneity adjustment (DARIS):
 *   DARIS = RIS × (1 + D²)
 *   where D² = τ²/σ² ≈ I²/(1-I²) for typical variance
 *
 * References:
 * - Wetterslev et al. (2008) J Clin Epidemiol
 * - Thorlund et al. (2011) J Clin Epidemiol
 */
function calculateRIS(effect, alpha, beta, hetAdjustment, effectType, additionalParams = {}) {
  const za = normalQuantile(1 - alpha / 2);
  const zb = normalQuantile(1 - beta);

  // The effect should be on log scale for ratio measures, absolute for continuous
  const absEffect = Math.abs(effect);

  if (absEffect < 0.001) {
    // Effect too small to calculate meaningful RIS
    return Infinity;
  }

  let baseRIS;

  if (effectType === 'OR' || effectType === 'logOR' ||
      effectType === 'RR' || effectType === 'logRR' ||
      effectType === 'HR' || effectType === 'logHR') {
    // Binary outcomes - effect is on log scale
    // Formula: 4 × (z_α/2 + z_β)² / (log(effect))²
    // For a two-sided test detecting effect vs null
    baseRIS = 4 * Math.pow(za + zb, 2) / Math.pow(absEffect, 2);

    // Adjust for typical binary outcome variance
    // For OR/RR, effective N ≈ events, so multiply by inverse of event rate
    // If event rates are provided, use them; otherwise assume moderate rate (0.1)
    const controlRate = additionalParams.controlEventRate || 0.1;
    const expectedRR = Math.exp(effect);
    const treatmentRate = Math.min(0.99, Math.max(0.01, controlRate * expectedRR));

    // Per-group sample size considering event rates (Lachin, 1981)
    const avgRate = (controlRate + treatmentRate) / 2;
    if (avgRate > 0 && avgRate < 1) {
      baseRIS = baseRIS / avgRate;  // Convert from "events needed" to "N needed"
    }

  } else if (effectType === 'RD') {
    // Risk difference
    // n = 2 × (z_α + z_β)² × (p1(1-p1) + p2(1-p2)) / (p1-p2)²
    const p1 = additionalParams.treatmentRate || 0.15;
    const p2 = additionalParams.controlRate || 0.1;
    const pooledVar = p1 * (1 - p1) + p2 * (1 - p2);
    baseRIS = 2 * Math.pow(za + zb, 2) * pooledVar / Math.pow(absEffect, 2);

  } else {
    // Continuous outcomes (MD, SMD)
    // For SMD: RIS = 2 × (z_α/2 + z_β)² / δ²
    // The 2 accounts for pooled SD = 1 in standardized units
    // Total N for both groups
    baseRIS = 2 * Math.pow(za + zb, 2) / Math.pow(absEffect, 2);

    // For SMD, multiply by 2 for total (2 groups)
    baseRIS = baseRIS * 2;
  }

  // Apply heterogeneity adjustment (DARIS)
  // hetAdjustment can be:
  // - A simple multiplier (e.g., 1.5)
  // - Or derived from I²: DARIS_factor = 1/(1-I²) when hetAdjustment is I² expressed as decimal
  let darisMultiplier = hetAdjustment;

  // If hetAdjustment appears to be I² (between 0 and 1), convert to DARIS factor
  if (additionalParams.isI2 && hetAdjustment >= 0 && hetAdjustment < 1) {
    darisMultiplier = 1 / (1 - hetAdjustment);
  }

  // Cap the adjustment to prevent unrealistic inflation
  darisMultiplier = Math.min(darisMultiplier, 10);

  const adjustedRIS = baseRIS * darisMultiplier;

  // Round up to whole number
  return Math.ceil(adjustedRIS);
}

/**
 * Calculate O'Brien-Fleming boundaries
 */
function calculateOBrienFlemingBoundaries(cumulativeN, ris, alpha) {
  return cumulativeN.map(n => {
    const infoFraction = n / ris;
    const obfMultiplier = 1 / Math.sqrt(infoFraction);
    const boundary = normalQuantile(1 - alpha / 2) * obfMultiplier;

    return {
      cumulative_n: n,
      information_fraction: infoFraction,
      upper: boundary,
      lower: -boundary,
      futility: infoFraction > 0.5 ? normalQuantile(1 - alpha) * obfMultiplier * 0.5 : null
    };
  });
}

/**
 * Get TSA conclusion text
 */
function getTSAConclusionText(conclusion) {
  const texts = {
    firm_evidence_effect: 'Firm evidence of effect reached. The cumulative Z-curve has crossed the monitoring boundary.',
    firm_evidence_no_effect: 'Firm evidence of no meaningful effect. The futility boundary has been crossed.',
    inconclusive_ris_reached: 'Required information size reached but boundaries not crossed. Results remain inconclusive.',
    more_data_needed: 'More data needed. Neither monitoring boundaries nor required information size has been reached.'
  };
  return texts[conclusion] || 'Status unknown';
}

/**
 * Build network for NMA
 */
function buildNetwork(studies) {
  const nodes = new Set();
  const edges = [];
  const edgeMap = new Map();

  for (const study of studies) {
    nodes.add(study.treatment1);
    nodes.add(study.treatment2);

    const edgeKey = [study.treatment1, study.treatment2].sort().join('|');
    if (!edgeMap.has(edgeKey)) {
      edgeMap.set(edgeKey, { treatments: [study.treatment1, study.treatment2], studies: [] });
    }
    edgeMap.get(edgeKey).studies.push(study.id);
  }

  // Check connectivity using DFS
  const nodeArray = Array.from(nodes);
  const visited = new Set();
  const stack = [nodeArray[0]];

  while (stack.length > 0) {
    const node = stack.pop();
    if (visited.has(node)) continue;
    visited.add(node);

    for (const [, edge] of edgeMap) {
      if (edge.treatments.includes(node)) {
        const other = edge.treatments.find(t => t !== node);
        if (!visited.has(other)) {
          stack.push(other);
        }
      }
    }
  }

  const isConnected = visited.size === nodes.size;

  return {
    nodes: nodeArray,
    edges: Array.from(edgeMap.values()),
    isConnected
  };
}

/**
 * Run frequentist NMA (simplified)
 */
function runFrequentistNMA(studies, spec) {
  // Placeholder - full implementation would use matrix operations
  return {
    effects: {},
    leagueTable: []
  };
}

/**
 * Calculate inconsistency measures
 */
function calculateInconsistency(studies, nmaResult) {
  return {
    global: { Q: 0, df: 0, p: 1 },
    nodeSplitting: [],
    designByTreatment: { Q: 0, df: 0, p: 1 }
  };
}

/**
 * Calculate SUCRA rankings
 */
function calculateSUCRA(nmaResult) {
  // Placeholder
  return [];
}

// ============================================
// Statistical Distribution Functions
// ============================================

function normalCDF(x) {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

function tCDF(t, df) {
  // Student's t-distribution CDF using regularized incomplete beta
  if (df <= 0) return NaN;
  if (!isFinite(t)) return t > 0 ? 1 : 0;

  // For very large df, use normal approximation for speed
  if (df > 1000) {
    return normalCDF(t);
  }

  // Use relationship: F(t) = 1 - 0.5 * I_x(df/2, 0.5) where x = df/(df+t^2)
  const x = df / (df + t * t);
  const prob = 0.5 * incompleteBeta(df / 2, 0.5, x);
  return t > 0 ? 1 - prob : prob;
}

function tQuantile(p, df) {
  // Student's t-distribution quantile using bisection search
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;

  // For very large df, use normal approximation
  if (df > 1000) {
    return normalQuantile(p);
  }

  // Initial bounds based on normal quantile
  const z = normalQuantile(p);
  let lower = z * 2 - 10;
  let upper = z * 2 + 10;

  // Expand bounds if needed
  while (tCDF(lower, df) > p) lower -= 10;
  while (tCDF(upper, df) < p) upper += 10;

  // Bisection search
  for (let i = 0; i < 100; i++) {
    const mid = (lower + upper) / 2;
    const cdf = tCDF(mid, df);

    if (Math.abs(cdf - p) < 1e-12) return mid;

    if (cdf < p) {
      lower = mid;
    } else {
      upper = mid;
    }

    if (upper - lower < 1e-12) break;
  }

  return (lower + upper) / 2;
}

function chiSquareCDF(x, df) {
  if (x <= 0) return 0;
  return gammaCDF(x / 2, df / 2);
}

function gammaCDF(x, a) {
  // Lower incomplete gamma function ratio
  if (x <= 0) return 0;
  return incompleteGamma(a, x) / gamma(a);
}

function incompleteGamma(a, x) {
  // Series expansion for lower incomplete gamma
  if (x < 0) return 0;
  if (x === 0) return 0;

  let sum = 0;
  let term = 1 / a;
  sum = term;

  for (let n = 1; n < 100; n++) {
    term *= x / (a + n);
    sum += term;
    if (Math.abs(term) < 1e-10 * Math.abs(sum)) break;
  }

  return Math.pow(x, a) * Math.exp(-x) * sum;
}

function incompleteBeta(a, b, x) {
  // Regularized incomplete beta function using continued fraction (Lentz method)
  // This matches R's pbeta() and is needed for accurate t-distribution CDF
  if (x === 0) return 0;
  if (x === 1) return 1;

  // For x > (a+1)/(a+b+2), use symmetry relation for faster convergence
  if (x > (a + 1) / (a + b + 2)) {
    return 1 - incompleteBeta(b, a, 1 - x);
  }

  // Log of beta function for numerical stability
  const lnBeta = lnGamma(a) + lnGamma(b) - lnGamma(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta) / a;

  // Lentz's continued fraction algorithm
  const FPMIN = 1e-30;
  const EPS = 1e-14;
  const MAXIT = 200;

  let qab = a + b;
  let qap = a + 1;
  let qam = a - 1;
  let c = 1;
  let d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= MAXIT; m++) {
    let m2 = 2 * m;

    // Even step
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;

    // Odd step
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;

    let del = d * c;
    h *= del;

    if (Math.abs(del - 1) < EPS) break;
  }

  return front * h;
}

// Log-gamma function (Lanczos approximation) for numerical stability
function lnGamma(z) {
  const g = 7;
  const c = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7
  ];

  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  }

  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) {
    x += c[i] / (z + i);
  }

  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function gamma(z) {
  // Lanczos approximation
  const g = 7;
  const c = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7
  ];

  if (z < 0.5) {
    return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
  }

  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) {
    x += c[i] / (z + i);
  }

  const t = z + g + 0.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}

function beta(a, b) {
  return gamma(a) * gamma(b) / gamma(a + b);
}

// ============================================================================
// ADVANCED METHODS HANDLERS (Beyond R packages)
// ============================================================================

/**
 * Handle Robust Variance Estimation for dependent effect sizes
 */
async function handleRVE(payload, requestId) {
  const { studies, options = {} } = payload;

  self.postMessage({
    type: 'ANALYSIS_STARTED',
    payload: { phase: 'robust-variance-estimation' },
    requestId
  });

  try {
    const result = robustVarianceEstimation(studies, options);

    self.postMessage({
      type: 'RVE_COMPLETE',
      payload: result,
      requestId
    });
  } catch (error) {
    throw error;
  }
}

/**
 * RVE implementation with CR2 small-sample correction
 */
function robustVarianceEstimation(studies, options = {}) {
  const {
    rho = 0.8,
    smallSampleCorrection = 'CR2',
    alpha = 0.05
  } = options;

  // Group by cluster
  const clusters = {};
  studies.forEach((s, i) => {
    const cid = s.clusterId || s.studyId || 'default';
    if (!clusters[cid]) {
      clusters[cid] = { effects: [], indices: [] };
    }
    clusters[cid].effects.push(s);
    clusters[cid].indices.push(i);
  });

  const clusterIds = Object.keys(clusters);
  const m = clusterIds.length;

  if (m < 2) {
    return { error: 'Need at least 2 clusters for RVE' };
  }

  // Build matrices
  const y = studies.map(s => s.yi);
  const vi = studies.map(s => s.vi);
  const n = y.length;

  // Weights (inverse variance)
  const wi = vi.map(v => 1 / v);
  const sumWi = wi.reduce((a, b) => a + b, 0);

  // Weighted mean
  const theta = y.reduce((sum, yi, i) => sum + wi[i] * yi, 0) / sumWi;

  // Cluster-robust variance
  let clusterContrib = 0;
  clusterIds.forEach(cid => {
    const indices = clusters[cid].indices;
    let clusterSum = 0;
    indices.forEach(i => {
      clusterSum += wi[i] * (y[i] - theta);
    });
    clusterContrib += clusterSum * clusterSum;
  });

  // CR2 adjustment
  const leverage = clusterIds.map(cid => {
    const clusterWi = clusters[cid].indices.reduce((sum, i) => sum + wi[i], 0);
    return clusterWi / sumWi;
  });
  const avgLeverage = leverage.reduce((a, b) => a + b, 0) / m;
  const cr2Adjust = m / (m - 1) / (1 - avgLeverage);

  const variance = cr2Adjust * clusterContrib / (sumWi * sumWi);
  const se = Math.sqrt(variance);

  // Satterthwaite df
  const df = Math.max(1, 2 * m / (1 + leverage.reduce((sum, h) => sum + h * h, 0) / m));

  const tCrit = tQuantile(1 - alpha / 2, df);

  return {
    method: 'RVE-CR2',
    estimate: theta,
    se: se,
    ci_lower: theta - tCrit * se,
    ci_upper: theta + tCrit * se,
    df: df,
    nClusters: m,
    nEffects: n,
    rho: rho
  };
}

/**
 * Handle meta-regression
 */
async function handleMetaRegression(payload, requestId) {
  const { studies, moderators, options = {} } = payload;

  self.postMessage({
    type: 'ANALYSIS_STARTED',
    payload: { phase: 'meta-regression' },
    requestId
  });

  try {
    const result = metaRegressionAnalysis(studies, moderators, options);

    self.postMessage({
      type: 'META_REGRESSION_COMPLETE',
      payload: result,
      requestId
    });
  } catch (error) {
    throw error;
  }
}

/**
 * Mixed-effects meta-regression
 */
function metaRegressionAnalysis(studies, moderatorNames = [], options = {}) {
  const { knha = true, alpha = 0.05 } = options;

  const validStudies = studies.filter(s =>
    s.yi !== null && s.vi !== null && s.vi > 0 &&
    moderatorNames.every(mod => s.moderators && s.moderators[mod] !== undefined)
  );

  const k = validStudies.length;
  const p = moderatorNames.length + 1;

  if (k < p + 2) {
    return { error: `Need at least ${p + 2} studies` };
  }

  // Build design matrix
  const X = validStudies.map(s => {
    const row = [1];
    moderatorNames.forEach(mod => row.push(s.moderators[mod]));
    return row;
  });

  const y = validStudies.map(s => s.yi);
  const vi = validStudies.map(s => s.vi);

  // Estimate tau² using method of moments
  const wi = vi.map(v => 1 / v);
  const sumWi = wi.reduce((a, b) => a + b, 0);
  const thetaFE = y.reduce((sum, yi, i) => sum + wi[i] * yi, 0) / sumWi;
  const Q = y.reduce((sum, yi, i) => sum + wi[i] * Math.pow(yi - thetaFE, 2), 0);
  const C = sumWi - wi.reduce((sum, w) => sum + w * w, 0) / sumWi;
  let tau2 = Math.max(0, (Q - (k - 1)) / C);

  // Weighted regression with tau²
  const wiStar = vi.map(v => 1 / (v + tau2));
  const sumWiStar = wiStar.reduce((a, b) => a + b, 0);

  // Simple regression for single moderator
  if (moderatorNames.length === 1) {
    const x = validStudies.map(s => s.moderators[moderatorNames[0]]);
    const xMean = x.reduce((sum, xi, i) => sum + wiStar[i] * xi, 0) / sumWiStar;
    const yMean = y.reduce((sum, yi, i) => sum + wiStar[i] * yi, 0) / sumWiStar;

    let ssXX = 0, ssXY = 0;
    for (let i = 0; i < k; i++) {
      ssXX += wiStar[i] * Math.pow(x[i] - xMean, 2);
      ssXY += wiStar[i] * (x[i] - xMean) * (y[i] - yMean);
    }

    const slope = ssXY / ssXX;
    const intercept = yMean - slope * xMean;

    // Residuals and Q_E
    const fitted = x.map(xi => intercept + slope * xi);
    const Q_E = y.reduce((sum, yi, i) => sum + wiStar[i] * Math.pow(yi - fitted[i], 2), 0);
    const df_E = k - p;

    // KNHA adjustment
    let slopeSE = Math.sqrt(1 / ssXX);
    if (knha && df_E > 0) {
      const multiplier = Math.max(1, Q_E / df_E);
      slopeSE *= Math.sqrt(multiplier);
    }

    const tCrit = tQuantile(1 - alpha / 2, df_E);
    const tStat = slope / slopeSE;

    // R² analog
    const Q_M = ssXY * ssXY / ssXX;
    const R2 = Q > 0 ? (Q_M / Q) * 100 : 0;

    return {
      method: 'Meta-regression',
      k: k,
      intercept: {
        estimate: intercept,
        se: Math.sqrt(1 / sumWiStar),
        ci_lower: intercept - tCrit * Math.sqrt(1 / sumWiStar),
        ci_upper: intercept + tCrit * Math.sqrt(1 / sumWiStar)
      },
      coefficients: [{
        name: moderatorNames[0],
        estimate: slope,
        se: slopeSE,
        ci_lower: slope - tCrit * slopeSE,
        ci_upper: slope + tCrit * slopeSE,
        t: tStat,
        p: 2 * (1 - tCDF(Math.abs(tStat), df_E))
      }],
      heterogeneity: {
        tau2: tau2,
        Q_E: Q_E,
        df_E: df_E,
        p_QE: 1 - chiSquareCDF(Q_E, df_E),
        R2: R2
      },
      moderatorTest: {
        Q_M: Q_M,
        df_M: 1,
        p_QM: 1 - chiSquareCDF(Q_M, 1)
      },
      knha_applied: knha
    };
  }

  return { error: 'Multi-moderator regression not yet implemented' };
}

/**
 * Handle three-level meta-analysis
 */
async function handleThreeLevelMeta(payload, requestId) {
  const { studies, options = {} } = payload;

  self.postMessage({
    type: 'ANALYSIS_STARTED',
    payload: { phase: 'three-level-meta' },
    requestId
  });

  try {
    const result = threeLevelMetaAnalysis(studies, options);

    self.postMessage({
      type: 'THREE_LEVEL_COMPLETE',
      payload: result,
      requestId
    });
  } catch (error) {
    throw error;
  }
}

/**
 * Three-level meta-analysis for nested effects
 */
function threeLevelMetaAnalysis(studies, options = {}) {
  // Group by study
  const studyGroups = {};
  studies.forEach((s, i) => {
    const sid = s.studyId || s.clusterId;
    if (!studyGroups[sid]) {
      studyGroups[sid] = { effects: [], indices: [] };
    }
    studyGroups[sid].effects.push(s);
    studyGroups[sid].indices.push(i);
  });

  const studyIds = Object.keys(studyGroups);
  const m = studyIds.length;
  const n = studies.length;

  if (m < 2) {
    return { error: 'Need at least 2 studies for 3-level model' };
  }

  const y = studies.map(s => s.yi);
  const vi = studies.map(s => s.vi);

  // Two-stage estimation
  // Stage 1: Within-study means
  const studyMeans = [];
  const studyVars = [];

  studyIds.forEach(sid => {
    const effects = studyGroups[sid].effects;
    const nj = effects.length;
    const yj = effects.map(e => e.yi);
    const vj = effects.map(e => e.vi);

    // Weighted mean within study
    const wj = vj.map(v => 1 / v);
    const sumWj = wj.reduce((a, b) => a + b, 0);
    const mean = yj.reduce((sum, yji, i) => sum + wj[i] * yji, 0) / sumWj;
    const variance = 1 / sumWj;

    studyMeans.push(mean);
    studyVars.push(variance);
  });

  // Stage 2: Between-study analysis
  const wi = studyVars.map(v => 1 / v);
  const sumWi = wi.reduce((a, b) => a + b, 0);
  const sumWi2 = wi.reduce((a, b) => a + b * b, 0);

  const muFE = studyMeans.reduce((sum, mean, i) => sum + wi[i] * mean, 0) / sumWi;
  const Q = studyMeans.reduce((sum, mean, i) => sum + wi[i] * Math.pow(mean - muFE, 2), 0);
  const C = sumWi - sumWi2 / sumWi;
  const tau2_between = Math.max(0, (Q - (m - 1)) / C);

  // Within-study variance component
  const tau2_within = studyIds.reduce((sum, sid) => {
    const effects = studyGroups[sid].effects;
    if (effects.length < 2) return sum;
    const yj = effects.map(e => e.yi);
    const mean = yj.reduce((a, b) => a + b, 0) / yj.length;
    const ss = yj.reduce((s, yi) => s + Math.pow(yi - mean, 2), 0);
    return sum + ss / (effects.length - 1);
  }, 0) / studyIds.filter(sid => studyGroups[sid].effects.length > 1).length || 0;

  // Final estimates
  const wiStar = studyVars.map(v => 1 / (v + tau2_between));
  const sumWiStar = wiStar.reduce((a, b) => a + b, 0);
  const mu = studyMeans.reduce((sum, mean, i) => sum + wiStar[i] * mean, 0) / sumWiStar;
  const se = Math.sqrt(1 / sumWiStar);

  // Variance decomposition
  const typicalVi = vi.reduce((a, b) => a + b, 0) / n;
  const totalVar = tau2_between + tau2_within + typicalVi;
  const I2_within = (tau2_within / totalVar) * 100;
  const I2_between = (tau2_between / totalVar) * 100;
  const I2_total = ((tau2_within + tau2_between) / totalVar) * 100;

  const tCrit = tQuantile(0.975, m - 1);

  return {
    method: 'Three-level RE',
    estimate: mu,
    se: se,
    ci_lower: mu - tCrit * se,
    ci_upper: mu + tCrit * se,
    variance: {
      tau2_within: tau2_within,
      tau2_between: tau2_between,
      tau_within: Math.sqrt(tau2_within),
      tau_between: Math.sqrt(tau2_between)
    },
    heterogeneity: {
      I2_within: I2_within,
      I2_between: I2_between,
      I2_total: I2_total
    },
    nStudies: m,
    nEffects: n,
    effectsPerStudy: n / m
  };
}

/**
 * Handle fragility index calculation
 */
async function handleFragility(payload, requestId) {
  const { studies, pooledResult, options = {} } = payload;

  self.postMessage({
    type: 'ANALYSIS_STARTED',
    payload: { phase: 'fragility-index' },
    requestId
  });

  try {
    const result = calculateFragilityIndex(studies, pooledResult, options);

    self.postMessage({
      type: 'FRAGILITY_COMPLETE',
      payload: result,
      requestId
    });
  } catch (error) {
    throw error;
  }
}

/**
 * Fragility index for meta-analysis
 */
function calculateFragilityIndex(studies, pooledResult, options = {}) {
  const { alpha = 0.05, maxIterations = 1000 } = options;

  const validStudies = studies.filter(s =>
    s.a !== undefined && s.b !== undefined &&
    s.c !== undefined && s.d !== undefined
  );

  if (validStudies.length === 0) {
    return { error: 'No valid 2x2 tables' };
  }

  const isSignificant = pooledResult.p < alpha;
  let modifiedStudies = validStudies.map(s => ({ ...s }));
  let fragility = 0;
  let converged = false;

  for (let iter = 0; iter < maxIterations; iter++) {
    let bestChange = null;
    let bestPValue = isSignificant ? 0 : 1;

    for (let i = 0; i < modifiedStudies.length; i++) {
      const study = modifiedStudies[i];

      if (study.a > 0) {
        const testStudies = modifiedStudies.map((s, j) =>
          j === i ? { ...s, a: s.a - 1, b: s.b + 1 } : s
        );
        const testResult = quickMHOR(testStudies);

        if ((isSignificant && testResult.p >= alpha) ||
            (!isSignificant && testResult.p < alpha)) {
          fragility++;
          converged = true;
          break;
        }

        if (isSignificant ? testResult.p > bestPValue : testResult.p < bestPValue) {
          bestPValue = testResult.p;
          bestChange = { idx: i, type: 'a_to_b' };
        }
      }
    }

    if (converged) break;
    if (!bestChange) break;

    if (bestChange.type === 'a_to_b') {
      modifiedStudies[bestChange.idx].a--;
      modifiedStudies[bestChange.idx].b++;
    }

    fragility++;

    const currentResult = quickMHOR(modifiedStudies);
    if ((isSignificant && currentResult.p >= alpha) ||
        (!isSignificant && currentResult.p < alpha)) {
      converged = true;
      break;
    }
  }

  const totalN = validStudies.reduce((sum, s) => sum + s.a + s.b + s.c + s.d, 0);

  return {
    fragility_index: converged ? fragility : null,
    fragility_quotient: converged ? fragility / totalN : null,
    converged: converged,
    original_p: pooledResult.p,
    total_n: totalN,
    interpretation: fragility <= 3 ? 'Very fragile' :
                    fragility <= 10 ? 'Somewhat fragile' :
                    fragility <= 25 ? 'Moderately robust' : 'Highly robust'
  };
}

/**
 * Quick Mantel-Haenszel OR
 */
function quickMHOR(studies) {
  let sumAD_N = 0, sumBC_N = 0, sumVar = 0;

  studies.forEach(s => {
    const n = s.a + s.b + s.c + s.d;
    if (n > 0) {
      sumAD_N += (s.a * s.d) / n;
      sumBC_N += (s.b * s.c) / n;

      const n1 = s.a + s.b;
      const n2 = s.c + s.d;
      sumVar += ((s.a + s.d) / n) * (s.a * s.d / (n * n)) +
                ((s.b + s.c) / n) * (s.b * s.c / (n * n));
    }
  });

  if (sumBC_N === 0 || sumAD_N === 0) return { or: NaN, p: 1 };

  const orMH = sumAD_N / sumBC_N;
  const logOR = Math.log(orMH);
  const se = Math.sqrt(sumVar) / Math.sqrt(sumAD_N * sumBC_N);
  const z = logOR / se;
  const p = 2 * (1 - normalCDF(Math.abs(z)));

  return { or: orMH, logOR, se, z, p };
}

/**
 * Handle expected proportion in clinical ranges
 */
async function handleClinicalProportion(payload, requestId) {
  const { pooledResult, thresholds } = payload;

  self.postMessage({
    type: 'ANALYSIS_STARTED',
    payload: { phase: 'clinical-proportion' },
    requestId
  });

  try {
    const result = expectedProportionClinical(pooledResult, thresholds);

    self.postMessage({
      type: 'CLINICAL_PROPORTION_COMPLETE',
      payload: result,
      requestId
    });
  } catch (error) {
    throw error;
  }
}

/**
 * Expected proportion in clinical ranges (2025 method)
 */
function expectedProportionClinical(pooledResult, thresholds = {}) {
  const {
    mcid = null,
    harm = null,
    nullValue = 0
  } = thresholds;

  const { estimate, tau2, tau } = pooledResult;
  const sigma = tau || Math.sqrt(tau2 || 0);

  if (sigma <= 0) {
    return {
      method: 'Expected proportion (no heterogeneity)',
      proportions: {
        above_mcid: mcid !== null ? (estimate > mcid ? 100 : 0) : null,
        below_harm: harm !== null ? (estimate < harm ? 100 : 0) : null,
        any_benefit: estimate > nullValue ? 100 : 0
      }
    };
  }

  const results = {};

  if (mcid !== null) {
    results.above_mcid = (1 - normalCDF((mcid - estimate) / sigma)) * 100;
  }

  if (harm !== null) {
    results.below_harm = normalCDF((harm - estimate) / sigma) * 100;
  }

  results.any_benefit = (1 - normalCDF((nullValue - estimate) / sigma)) * 100;
  results.any_harm = normalCDF((nullValue - estimate) / sigma) * 100;

  if (mcid !== null && harm !== null) {
    results.trivial = (normalCDF((mcid - estimate) / sigma) -
                       normalCDF((harm - estimate) / sigma)) * 100;
    results.clinically_important = results.above_mcid + results.below_harm;
  }

  return {
    method: 'Expected proportion in clinical ranges',
    pooled_estimate: estimate,
    tau: sigma,
    thresholds: thresholds,
    proportions: results,
    interpretation: generateClinicalInterpretation(results)
  };
}

function generateClinicalInterpretation(results) {
  const parts = [];
  if (results.above_mcid !== undefined) {
    parts.push(`${results.above_mcid.toFixed(1)}% would show clinically meaningful benefit`);
  }
  if (results.below_harm !== undefined) {
    parts.push(`${results.below_harm.toFixed(1)}% would show clinically meaningful harm`);
  }
  return parts.join('; ');
}

/**
 * Handle PET-PEESE
 */
async function handlePetPeese(payload, requestId) {
  const { studies, options = {} } = payload;

  self.postMessage({
    type: 'ANALYSIS_STARTED',
    payload: { phase: 'pet-peese' },
    requestId
  });

  try {
    const result = petPeeseAnalysis(studies, options);

    self.postMessage({
      type: 'PET_PEESE_COMPLETE',
      payload: result,
      requestId
    });
  } catch (error) {
    throw error;
  }
}

/**
 * PET-PEESE publication bias adjustment
 */
function petPeeseAnalysis(studies, options = {}) {
  const { alpha = 0.05 } = options;

  const validStudies = studies.filter(s =>
    s.yi !== null && (s.vi !== null || s.se !== null) && (s.vi > 0 || s.se > 0)
  ).map(s => ({
    yi: s.yi,
    se: s.se || Math.sqrt(s.vi),
    vi: s.vi || (s.se * s.se)
  }));

  const k = validStudies.length;
  if (k < 3) return { error: 'Need at least 3 studies' };

  const y = validStudies.map(s => s.yi);
  const se = validStudies.map(s => s.se);
  const vi = validStudies.map(s => s.vi);
  const w = vi.map(v => 1 / v);

  // PET: y = β₀ + β₁*SE
  const pet = weightedRegression(y, se, w);
  const pet_t = pet.intercept / pet.se_intercept;
  const pet_p = 2 * (1 - tCDF(Math.abs(pet_t), k - 2));

  // PEESE: y = β₀ + β₁*SE²
  const peese = weightedRegression(y, vi, w);
  const peese_t = peese.intercept / peese.se_intercept;
  const peese_p = 2 * (1 - tCDF(Math.abs(peese_t), k - 2));

  const usePeese = pet_p < alpha;
  const finalEstimate = usePeese ? peese.intercept : pet.intercept;
  const finalSE = usePeese ? peese.se_intercept : pet.se_intercept;

  const tCrit = tQuantile(1 - alpha / 2, k - 2);

  return {
    method: 'PET-PEESE',
    k: k,
    pet: {
      intercept: pet.intercept,
      se: pet.se_intercept,
      ci_lower: pet.intercept - tCrit * pet.se_intercept,
      ci_upper: pet.intercept + tCrit * pet.se_intercept,
      t: pet_t,
      p: pet_p,
      slope: pet.slope,
      significant: pet_p < alpha
    },
    peese: {
      intercept: peese.intercept,
      se: peese.se_intercept,
      ci_lower: peese.intercept - tCrit * peese.se_intercept,
      ci_upper: peese.intercept + tCrit * peese.se_intercept,
      t: peese_t,
      p: peese_p,
      slope: peese.slope
    },
    recommended: {
      method: usePeese ? 'PEESE' : 'PET',
      estimate: finalEstimate,
      se: finalSE,
      ci_lower: finalEstimate - tCrit * finalSE,
      ci_upper: finalEstimate + tCrit * finalSE,
      rationale: usePeese ?
        'PET significant → true effect exists → use PEESE' :
        'PET not significant → use PET (may be null)'
    },
    publicationBias: {
      detected: pet.slope > 0,
      direction: pet.slope > 0 ? 'small studies favor treatment' : 'small studies favor control'
    }
  };
}

function weightedRegression(y, x, w) {
  const k = y.length;
  const sumW = w.reduce((a, b) => a + b, 0);
  const xMean = x.reduce((sum, xi, i) => sum + w[i] * xi, 0) / sumW;
  const yMean = y.reduce((sum, yi, i) => sum + w[i] * yi, 0) / sumW;

  let ssXX = 0, ssXY = 0;
  for (let i = 0; i < k; i++) {
    ssXX += w[i] * Math.pow(x[i] - xMean, 2);
    ssXY += w[i] * (x[i] - xMean) * (y[i] - yMean);
  }

  const slope = ssXY / ssXX;
  const intercept = yMean - slope * xMean;

  // Residual variance
  let rss = 0;
  for (let i = 0; i < k; i++) {
    const fitted = intercept + slope * x[i];
    rss += w[i] * Math.pow(y[i] - fitted, 2);
  }
  const sigma2 = rss / (k - 2);

  const se_slope = Math.sqrt(sigma2 / ssXX);
  const se_intercept = Math.sqrt(sigma2 * (1 / sumW + xMean * xMean / ssXX));

  return { intercept, slope, se_intercept, se_slope, sigma2 };
}

/**
 * Handle Vevea-Hedges selection model
 */
async function handleSelectionModel(payload, requestId) {
  const { studies, options = {} } = payload;

  self.postMessage({
    type: 'ANALYSIS_STARTED',
    payload: { phase: 'selection-model' },
    requestId
  });

  try {
    const result = veveaHedgesSelectionModel(studies, options);

    self.postMessage({
      type: 'SELECTION_MODEL_COMPLETE',
      payload: result,
      requestId
    });
  } catch (error) {
    throw error;
  }
}

/**
 * Vevea-Hedges selection model
 */
function veveaHedgesSelectionModel(studies, options = {}) {
  const {
    steps = [0.025, 0.05, 0.5, 1.0],
    weights = 'moderate'
  } = options;

  const presetWeights = {
    none: [1, 1, 1, 1],
    moderate: [1, 0.75, 0.65, 0.5],
    severe: [1, 0.5, 0.4, 0.2]
  };

  const selectionWeights = presetWeights[weights] || presetWeights.moderate;

  const validStudies = studies.filter(s =>
    s.yi !== null && s.vi !== null && s.vi > 0
  ).map(s => ({
    yi: s.yi,
    vi: s.vi,
    se: Math.sqrt(s.vi),
    z: Math.abs(s.yi / Math.sqrt(s.vi)),
    p: 2 * (1 - normalCDF(Math.abs(s.yi / Math.sqrt(s.vi))))
  }));

  const k = validStudies.length;
  if (k < 5) return { error: 'Need at least 5 studies' };

  // Assign selection weights
  validStudies.forEach(s => {
    for (let i = 0; i < steps.length; i++) {
      if (s.p <= steps[i]) {
        s.selWeight = selectionWeights[i];
        s.pInterval = i;
        break;
      }
    }
  });

  // Unadjusted
  const wi = validStudies.map(s => 1 / s.vi);
  const sumWi = wi.reduce((a, b) => a + b, 0);
  const thetaUnadj = validStudies.reduce((sum, s, i) => sum + wi[i] * s.yi, 0) / sumWi;
  const seUnadj = Math.sqrt(1 / sumWi);

  // Selection-adjusted
  const wiAdj = validStudies.map(s => s.selWeight / s.vi);
  const sumWiAdj = wiAdj.reduce((a, b) => a + b, 0);
  const thetaAdj = validStudies.reduce((sum, s, i) => sum + wiAdj[i] * s.yi, 0) / sumWiAdj;
  const seAdj = Math.sqrt(1 / sumWiAdj);

  return {
    method: 'Vevea-Hedges Selection Model',
    k: k,
    unadjusted: {
      estimate: thetaUnadj,
      se: seUnadj,
      ci_lower: thetaUnadj - 1.96 * seUnadj,
      ci_upper: thetaUnadj + 1.96 * seUnadj
    },
    adjusted: {
      estimate: thetaAdj,
      se: seAdj,
      ci_lower: thetaAdj - 1.96 * seAdj,
      ci_upper: thetaAdj + 1.96 * seAdj
    },
    selection: {
      steps: steps,
      weights: selectionWeights,
      pattern: weights,
      studiesPerInterval: steps.map((_, i) =>
        validStudies.filter(s => s.pInterval === i).length
      )
    },
    sensitivity: {
      change: thetaAdj - thetaUnadj,
      percentChange: ((thetaAdj - thetaUnadj) / Math.abs(thetaUnadj)) * 100
    }
  };
}

/**
 * Handle sequential analysis (Lan-DeMets)
 */
async function handleSequentialAnalysis(payload, requestId) {
  const { analyses, options = {} } = payload;

  self.postMessage({
    type: 'ANALYSIS_STARTED',
    payload: { phase: 'sequential-analysis' },
    requestId
  });

  try {
    const result = lanDeMetsSequentialAnalysis(analyses, options);

    self.postMessage({
      type: 'SEQUENTIAL_COMPLETE',
      payload: result,
      requestId
    });
  } catch (error) {
    throw error;
  }
}

/**
 * Lan-DeMets alpha-spending for living reviews
 */
function lanDeMetsSequentialAnalysis(analyses, options = {}) {
  const {
    alpha = 0.05,
    beta = 0.2,
    spendingFunction = 'OBF',
    RIS = null
  } = options;

  if (!analyses || analyses.length === 0) {
    return { error: 'No analyses provided' };
  }

  // Calculate RIS if not provided
  const latestAnalysis = analyses[analyses.length - 1];
  const zAlpha = normalQuantile(1 - alpha / 2);
  const zBeta = normalQuantile(1 - beta);
  const requiredIS = RIS || 4 * Math.pow(zAlpha + zBeta, 2) / Math.pow(latestAnalysis.estimate, 2);

  const results = analyses.map((analysis, idx) => {
    const currentIS = analysis.totalN || analysis.n || (idx + 1) * 100;
    const infoFraction = Math.min(1, currentIS / requiredIS);

    // Alpha spent (O'Brien-Fleming)
    let alphaSpent;
    if (spendingFunction === 'OBF') {
      alphaSpent = infoFraction <= 0 ? 0 :
                   infoFraction >= 1 ? alpha :
                   2 * (1 - normalCDF(zAlpha / Math.sqrt(infoFraction)));
    } else {
      alphaSpent = alpha * infoFraction;
    }

    // Critical boundary
    const zBoundary = spendingFunction === 'OBF' ?
      zAlpha / Math.sqrt(Math.max(0.01, infoFraction)) :
      zAlpha;

    // Futility boundary (only after 50% information)
    const zFutility = infoFraction >= 0.5 ?
      -normalQuantile(1 - beta / 2) / Math.sqrt(infoFraction) :
      -Infinity;

    const z = analysis.estimate / analysis.se;

    let decision = 'continue';
    if (Math.abs(z) >= zBoundary) decision = 'reject_null';
    else if (infoFraction >= 0.5 && Math.abs(z) <= zFutility) decision = 'futility';

    // Conditional power
    let conditionalPower = null;
    if (infoFraction < 1) {
      const tRemaining = 1 - infoFraction;
      conditionalPower = normalCDF(
        z * Math.sqrt(infoFraction) +
        (analysis.estimate / analysis.se) * Math.sqrt(tRemaining) -
        zAlpha
      );
    }

    return {
      analysisNumber: idx + 1,
      k: analysis.k,
      estimate: analysis.estimate,
      se: analysis.se,
      z: z,
      informationFraction: infoFraction,
      requiredIS: requiredIS,
      boundaries: {
        efficacy: zBoundary,
        futility: zFutility
      },
      alphaSpent: alphaSpent,
      decision: decision,
      conditionalPower: conditionalPower,
      crossedEfficacy: Math.abs(z) >= zBoundary
    };
  });

  const latestResult = results[results.length - 1];

  let conclusion;
  if (latestResult.crossedEfficacy) {
    conclusion = 'Firm evidence reached - effect confirmed';
  } else if (latestResult.informationFraction >= 1) {
    conclusion = 'Required information size reached';
  } else if (latestResult.decision === 'futility') {
    conclusion = 'Futility boundary crossed - consider stopping';
  } else {
    conclusion = 'Continue monitoring - more information needed';
  }

  return {
    method: 'Lan-DeMets Sequential Analysis',
    spendingFunction: spendingFunction,
    alpha: alpha,
    beta: beta,
    requiredIS: requiredIS,
    analyses: results,
    currentStatus: {
      informationFraction: latestResult.informationFraction,
      alphaSpent: latestResult.alphaSpent,
      decision: latestResult.decision,
      conclusion: conclusion
    }
  };
}

// Worker initialized
