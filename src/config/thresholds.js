/**
 * Configuration Thresholds
 * From CT.gov-only Phase 1 Specification + Addendum
 */

// Results coverage thresholds (from addendum spec)
export const RESULTS_COVERAGE_THRESHOLDS = {
  adequate: 0.70,      // >=70% results posted among eligible
  marginal: 0.50,      // 50–70% results posted
  insufficient: 0.30   // <30% results posted
};

// Non-publication risk thresholds (months since completion)
export const NON_PUBLICATION_THRESHOLDS = {
  high: 24,      // >24 months, no results = high risk
  moderate: 18,  // 18-24 months, no results = moderate risk
  low: 12,       // 12-18 months, no results = low risk
  grace: 12      // <12 months = within grace period
};

// Sample size discrepancy thresholds
export const SAMPLE_SIZE_THRESHOLDS = {
  early_termination: 0.80,  // n_ratio < 0.8 = early termination flag
  over_enrollment: 1.20     // n_ratio > 1.2 = over-enrollment flag
};

// Evidence-at-risk composite weights
export const EVIDENCE_AT_RISK_WEIGHTS = {
  missing_results: 0.5,
  outcome_mismatch: 0.3,
  early_termination: 0.2
};

// Heterogeneity interpretation thresholds (log OR/RR scale)
export const TAU_INTERPRETATION_LOG = {
  low: 0.1,        // <0.1 = minimal heterogeneity
  moderate: 0.3,   // 0.1-0.3 = moderate
  substantial: 0.5 // 0.3-0.5 = substantial, >0.5 = considerable
};

// Heterogeneity interpretation thresholds (SMD scale)
export const TAU_INTERPRETATION_SMD = {
  low: 0.1,        // <0.1 = minimal
  moderate: 0.2,   // 0.1-0.2 = moderate
  substantial: 0.4 // 0.2-0.4 = substantial, >0.4 = considerable
};

// I² interpretation (Cochrane handbook)
export const I2_INTERPRETATION = {
  low: 0.25,       // 0-25% = low
  moderate: 0.50,  // 25-50% = moderate
  substantial: 0.75 // 50-75% = substantial, >75% = considerable
};

// E-value interpretation
export const E_VALUE_INTERPRETATION = {
  robust: 3.0,       // >=3.0 = robust to confounding
  moderate: 2.0,     // 2.0-3.0 = moderate robustness
  vulnerable: 1.5    // 1.5-2.0 = somewhat vulnerable, <1.5 = vulnerable
};

// TSA default parameters
export const TSA_DEFAULTS = {
  alpha: 0.05,
  beta: 0.20,              // 80% power
  boundary_type: 'OBF',    // O'Brien-Fleming
  spending_function: 'LD'  // Lan-DeMets
};

// Outcome matching thresholds
export const OUTCOME_MATCHING = {
  confidence_threshold: 0.6,  // Below this = manual selection required
  high_confidence: 0.8,       // Above this = auto-accept
  fuzzy_tolerance: 0.2        // Fuzzy string matching tolerance
};

// Analysis minimum requirements
export const ANALYSIS_REQUIREMENTS = {
  min_studies_fe: 2,          // Minimum studies for fixed effects
  min_studies_re: 2,          // Minimum studies for random effects
  min_studies_hksj: 2,        // Minimum studies for HKSJ
  min_studies_pi: 3,          // Minimum studies for prediction interval (k-2 df)
  min_studies_egger: 10,      // Recommended minimum for Egger test
  min_studies_nma_node: 2     // Minimum studies per NMA node
};

// Data quality flag severities
export const DATA_QUALITY_SEVERITIES = {
  sd_imputed: 'moderate',
  denominator_mismatch: 'high',
  aggregated_only: 'high',
  mixed_change_final: 'high',
  subgroup_only: 'moderate',
  unclear_timepoint: 'moderate',
  arm_mapping_uncertain: 'high'
};

// CT.gov API configuration
export const CTGOV_API_CONFIG = {
  base_url: 'https://clinicaltrials.gov/api/v2',

  rate_limit: {
    requests_per_minute: 10,
    burst_limit: 3
  },

  retry: {
    max_attempts: 3,
    initial_delay_ms: 1000,
    backoff_multiplier: 2,
    max_delay_ms: 30000
  },

  timeout_ms: 30000,

  pagination: {
    page_size: 100,
    max_pages: 100
  }
};

export default {
  RESULTS_COVERAGE_THRESHOLDS,
  NON_PUBLICATION_THRESHOLDS,
  SAMPLE_SIZE_THRESHOLDS,
  EVIDENCE_AT_RISK_WEIGHTS,
  TAU_INTERPRETATION_LOG,
  TAU_INTERPRETATION_SMD,
  I2_INTERPRETATION,
  E_VALUE_INTERPRETATION,
  TSA_DEFAULTS,
  OUTCOME_MATCHING,
  ANALYSIS_REQUIREMENTS,
  DATA_QUALITY_SEVERITIES,
  CTGOV_API_CONFIG
};
