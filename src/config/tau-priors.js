/**
 * Informative Priors for τ² (Between-Study Variance)
 * Based on empirical distributions from meta-epidemiological studies
 * Reference: Turner et al. (2012, 2015), Rhodes et al. (2015)
 */

// Outcome type categories
export const OUTCOME_TYPES = {
  MORTALITY: 'mortality',
  SEMI_OBJECTIVE: 'semi_objective',
  SUBJECTIVE: 'subjective',
  BIOMARKER: 'biomarker',
  COMPOSITE: 'composite',
  SAFETY: 'safety'
};

// Comparison type categories
export const COMPARISON_TYPES = {
  PHARMA_VS_PLACEBO: 'pharma_placebo',
  PHARMA_VS_PHARMA: 'pharma_pharma',
  NON_PHARMA_VS_USUAL: 'non_pharma_usual',
  NON_PHARMA_VS_NON_PHARMA: 'non_pharma_non_pharma'
};

// Effect measure types
export const EFFECT_MEASURES = {
  OR: 'OR',
  RR: 'RR',
  HR: 'HR',
  MD: 'MD',
  SMD: 'SMD'
};

/**
 * Informative priors for log-scale effect measures (OR, RR, HR)
 * Values are for τ² (variance), not τ (SD)
 * Distribution: Half-normal or Log-normal
 *
 * Based on Turner et al. (2012) - "Predicting the extent of heterogeneity in meta-analysis"
 * and Rhodes et al. (2015) - "Predictive distributions were developed for heterogeneity"
 */
export const LOG_SCALE_PRIORS = {
  // Pharmacological vs Placebo/Control
  [COMPARISON_TYPES.PHARMA_VS_PLACEBO]: {
    [OUTCOME_TYPES.MORTALITY]: {
      distribution: 'log_normal',
      median_tau: 0.14,
      tau_95_upper: 0.51,
      tau2_median: 0.0196,
      tau2_95_upper: 0.2601,
      source: 'Turner 2012'
    },
    [OUTCOME_TYPES.SEMI_OBJECTIVE]: {
      distribution: 'log_normal',
      median_tau: 0.18,
      tau_95_upper: 0.67,
      tau2_median: 0.0324,
      tau2_95_upper: 0.4489,
      source: 'Turner 2012'
    },
    [OUTCOME_TYPES.SUBJECTIVE]: {
      distribution: 'log_normal',
      median_tau: 0.26,
      tau_95_upper: 0.87,
      tau2_median: 0.0676,
      tau2_95_upper: 0.7569,
      source: 'Turner 2012'
    }
  },

  // Pharmacological vs Pharmacological
  [COMPARISON_TYPES.PHARMA_VS_PHARMA]: {
    [OUTCOME_TYPES.MORTALITY]: {
      distribution: 'log_normal',
      median_tau: 0.12,
      tau_95_upper: 0.42,
      tau2_median: 0.0144,
      tau2_95_upper: 0.1764,
      source: 'Turner 2012'
    },
    [OUTCOME_TYPES.SEMI_OBJECTIVE]: {
      distribution: 'log_normal',
      median_tau: 0.15,
      tau_95_upper: 0.55,
      tau2_median: 0.0225,
      tau2_95_upper: 0.3025,
      source: 'Turner 2012'
    },
    [OUTCOME_TYPES.SUBJECTIVE]: {
      distribution: 'log_normal',
      median_tau: 0.22,
      tau_95_upper: 0.74,
      tau2_median: 0.0484,
      tau2_95_upper: 0.5476,
      source: 'Turner 2012'
    }
  },

  // Non-pharmacological vs Usual Care
  [COMPARISON_TYPES.NON_PHARMA_VS_USUAL]: {
    [OUTCOME_TYPES.MORTALITY]: {
      distribution: 'log_normal',
      median_tau: 0.18,
      tau_95_upper: 0.70,
      tau2_median: 0.0324,
      tau2_95_upper: 0.4900,
      source: 'Rhodes 2015'
    },
    [OUTCOME_TYPES.SEMI_OBJECTIVE]: {
      distribution: 'log_normal',
      median_tau: 0.24,
      tau_95_upper: 0.88,
      tau2_median: 0.0576,
      tau2_95_upper: 0.7744,
      source: 'Rhodes 2015'
    },
    [OUTCOME_TYPES.SUBJECTIVE]: {
      distribution: 'log_normal',
      median_tau: 0.32,
      tau_95_upper: 1.05,
      tau2_median: 0.1024,
      tau2_95_upper: 1.1025,
      source: 'Rhodes 2015'
    }
  }
};

/**
 * Informative priors for SMD (Standardized Mean Difference)
 * Based on Rhodes et al. (2015)
 */
export const SMD_PRIORS = {
  [COMPARISON_TYPES.PHARMA_VS_PLACEBO]: {
    [OUTCOME_TYPES.SUBJECTIVE]: {
      distribution: 'log_normal',
      median_tau: 0.17,
      tau_95_upper: 0.60,
      tau2_median: 0.0289,
      tau2_95_upper: 0.3600,
      source: 'Rhodes 2015'
    },
    [OUTCOME_TYPES.BIOMARKER]: {
      distribution: 'log_normal',
      median_tau: 0.14,
      tau_95_upper: 0.51,
      tau2_median: 0.0196,
      tau2_95_upper: 0.2601,
      source: 'Rhodes 2015'
    }
  },

  [COMPARISON_TYPES.NON_PHARMA_VS_USUAL]: {
    [OUTCOME_TYPES.SUBJECTIVE]: {
      distribution: 'log_normal',
      median_tau: 0.24,
      tau_95_upper: 0.84,
      tau2_median: 0.0576,
      tau2_95_upper: 0.7056,
      source: 'Rhodes 2015'
    },
    [OUTCOME_TYPES.BIOMARKER]: {
      distribution: 'log_normal',
      median_tau: 0.20,
      tau_95_upper: 0.72,
      tau2_median: 0.0400,
      tau2_95_upper: 0.5184,
      source: 'Rhodes 2015'
    }
  }
};

/**
 * Default/fallback priors when specific category not available
 */
export const DEFAULT_PRIORS = {
  log_scale: {
    distribution: 'half_normal',
    scale: 0.5,  // τ ~ HalfNormal(0, 0.5)
    tau2_expected: 0.25,
    description: 'Weakly informative prior for log-scale effects'
  },
  smd: {
    distribution: 'half_normal',
    scale: 0.3,  // τ ~ HalfNormal(0, 0.3)
    tau2_expected: 0.09,
    description: 'Weakly informative prior for SMD'
  },
  md: {
    distribution: 'half_cauchy',
    scale: 'outcome_specific',  // Requires outcome SD
    description: 'Scale relative to outcome variability'
  }
};

/**
 * Clinical interpretation of τ values
 * Based on Spence & Stanley (2016) and empirical benchmarks
 */
export const TAU_INTERPRETATION = {
  log_scale: {
    small: { max: 0.1, label: 'Small', description: 'Minimal heterogeneity' },
    moderate: { max: 0.3, label: 'Moderate', description: 'Some heterogeneity' },
    large: { max: 0.5, label: 'Large', description: 'Substantial heterogeneity' },
    very_large: { max: Infinity, label: 'Very Large', description: 'Considerable heterogeneity' }
  },
  smd: {
    small: { max: 0.1, label: 'Small', description: 'Minimal heterogeneity' },
    moderate: { max: 0.2, label: 'Moderate', description: 'Some heterogeneity' },
    large: { max: 0.3, label: 'Large', description: 'Substantial heterogeneity' },
    very_large: { max: Infinity, label: 'Very Large', description: 'Considerable heterogeneity' }
  }
};

/**
 * Get informative prior for given combination
 */
export function getPrior(effectMeasure, comparisonType, outcomeType) {
  // Log-scale effects (OR, RR, HR)
  if ([EFFECT_MEASURES.OR, EFFECT_MEASURES.RR, EFFECT_MEASURES.HR].includes(effectMeasure)) {
    const comparisonPriors = LOG_SCALE_PRIORS[comparisonType];
    if (comparisonPriors && comparisonPriors[outcomeType]) {
      return {
        ...comparisonPriors[outcomeType],
        effectMeasure,
        comparisonType,
        outcomeType
      };
    }
    return { ...DEFAULT_PRIORS.log_scale, effectMeasure, comparisonType, outcomeType };
  }

  // SMD
  if (effectMeasure === EFFECT_MEASURES.SMD) {
    const comparisonPriors = SMD_PRIORS[comparisonType];
    if (comparisonPriors && comparisonPriors[outcomeType]) {
      return {
        ...comparisonPriors[outcomeType],
        effectMeasure,
        comparisonType,
        outcomeType
      };
    }
    return { ...DEFAULT_PRIORS.smd, effectMeasure, comparisonType, outcomeType };
  }

  // MD - requires outcome-specific scaling
  if (effectMeasure === EFFECT_MEASURES.MD) {
    return { ...DEFAULT_PRIORS.md, effectMeasure, comparisonType, outcomeType };
  }

  return DEFAULT_PRIORS.log_scale;
}

/**
 * Interpret τ value clinically
 */
export function interpretTau(tau, effectMeasure) {
  const scale = [EFFECT_MEASURES.OR, EFFECT_MEASURES.RR, EFFECT_MEASURES.HR].includes(effectMeasure)
    ? TAU_INTERPRETATION.log_scale
    : TAU_INTERPRETATION.smd;

  for (const [level, config] of Object.entries(scale)) {
    if (tau <= config.max) {
      return {
        level,
        label: config.label,
        description: config.description,
        tau
      };
    }
  }

  return { level: 'very_large', label: 'Very Large', description: 'Considerable heterogeneity', tau };
}

/**
 * Calculate prediction interval multiplier based on τ
 * For k studies, PI uses t-distribution with df = k - 2
 */
export function predictionIntervalMultiplier(k, alpha = 0.05) {
  if (k < 3) return null;

  const df = k - 2;
  // Approximate t critical value using normal for large df
  // For small df, use lookup or more precise calculation
  const tCriticalApprox = {
    1: 12.706,
    2: 4.303,
    3: 3.182,
    4: 2.776,
    5: 2.571,
    6: 2.447,
    7: 2.365,
    8: 2.306,
    9: 2.262,
    10: 2.228,
    20: 2.086,
    30: 2.042,
    50: 2.009,
    100: 1.984
  };

  // Find closest df or use normal approximation
  if (df >= 100) return 1.96;

  const keys = Object.keys(tCriticalApprox).map(Number).sort((a, b) => a - b);
  for (let i = 0; i < keys.length; i++) {
    if (keys[i] >= df) {
      return tCriticalApprox[keys[i]];
    }
  }

  return 1.96;
}

/**
 * Calculate τ² from I² and typical SE
 * τ² = I² × typical_variance / (100 - I²)
 */
export function tau2FromI2(i2, typicalVariance) {
  if (i2 >= 100 || i2 < 0) return null;
  return (i2 * typicalVariance) / (100 - i2);
}

/**
 * Calculate I² from τ² and typical SE
 * I² = τ² / (τ² + typical_variance) × 100
 */
export function i2FromTau2(tau2, typicalVariance) {
  if (tau2 < 0 || typicalVariance <= 0) return null;
  return (tau2 / (tau2 + typicalVariance)) * 100;
}

export default {
  OUTCOME_TYPES,
  COMPARISON_TYPES,
  EFFECT_MEASURES,
  LOG_SCALE_PRIORS,
  SMD_PRIORS,
  DEFAULT_PRIORS,
  TAU_INTERPRETATION,
  getPrior,
  interpretTau,
  predictionIntervalMultiplier,
  tau2FromI2,
  i2FromTau2
};
