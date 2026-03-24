/**
 * Extraction Rules Configuration
 * From CT.gov-only Phase 1 Addendum
 */

// Timepoint selection rules
export const CTGOV_TIMEPOINT_RULES = {
  preference: 'longest_reported',  // Prefer longest reported timeframe
  max_months: 60,                  // Maximum acceptable timeframe
  require_all_arms: true,          // Require same timepoint across arms
  tolerance_months: 3              // Allow ±3 months tolerance for matching
};

// Population (ITT/PP) selection rules
export const CTGOV_POPULATION_RULES = {
  preference: ['ITT', 'mITT'],            // Preferred population analyses
  exclude: ['per_protocol_only', 'completer_only'],  // Exclude these unless override
  require_population_label: false  // Don't require explicit label
};

// Outcome disambiguation rules
export const OUTCOME_DISAMBIGUATION_RULES = {
  prefer_primary_over_secondary: true,
  prefer_exact_timepoint: false,
  prefer_closest_timepoint: true,
  tie_breaker: 'manual'  // 'manual' | 'first' | 'largest_n'
};

// Subgroup handling rules
export const SUBGROUP_RULES = {
  prefer_overall: true,
  aggregate_if_overall_missing: false,  // Don't auto-aggregate subgroups
  flag_subgroup_only: true
};

// Change score vs final value rules
export const CHANGE_SCORE_RULES = {
  prefer: 'final_value',  // 'final_value' | 'change_from_baseline'
  allow_mixed: false,      // Don't mix change and final scores
  if_only_change_available: 'use_change_scores'
};

// SD imputation rules
export const SD_IMPUTATION_RULES = {
  // Impute from SE: SD = SE × √n
  from_se: true,

  // Impute from CI: SE = (upper - lower) / (2 × z), then SD = SE × √n
  from_ci: true,
  ci_alpha: 0.05,  // Assume 95% CI unless stated

  // Mark source for transparency
  track_source: true
};

// Arm mapping rules
export const ARM_MAPPING_RULES = {
  // Treatment arm keywords (case-insensitive)
  treatment_keywords: [
    'treatment', 'intervention', 'experimental', 'active', 'drug',
    'investigational', 'study drug', 'test'
  ],

  // Control arm keywords (case-insensitive)
  control_keywords: [
    'control', 'placebo', 'comparator', 'standard', 'usual care',
    'standard of care', 'soc', 'no treatment', 'waitlist'
  ],

  // Require confidence > this to auto-map
  confidence_threshold: 0.7
};

// Binary outcome extraction patterns
export const BINARY_OUTCOME_PATTERNS = {
  event_keywords: [
    'events', 'participants with', 'number with', 'incidence',
    'occurrence', 'count', 'n with'
  ],
  total_keywords: [
    'total', 'n', 'participants', 'analyzed', 'at risk',
    'enrolled', 'randomized'
  ]
};

// Continuous outcome extraction patterns
export const CONTINUOUS_OUTCOME_PATTERNS = {
  mean_keywords: ['mean', 'average', 'median'],
  sd_keywords: ['sd', 'standard deviation', 'std dev', 's.d.'],
  se_keywords: ['se', 'standard error', 'sem', 's.e.'],
  ci_keywords: ['ci', 'confidence interval', '95%']
};

// Hazard ratio extraction patterns
export const HR_EXTRACTION_PATTERNS = {
  hr_keywords: ['hr', 'hazard ratio', 'hazard'],
  ci_pattern: /(\d+\.?\d*)\s*[-–]\s*(\d+\.?\d*)/,  // Matches "0.75 - 0.95"
  log_scale: true  // Store on log scale
};

// Outcome type classification
export const OUTCOME_TYPE_CLASSIFICATION = {
  binary_keywords: [
    'death', 'mortality', 'event', 'response', 'remission',
    'progression', 'recurrence', 'adverse', 'infection',
    'hospitalization', 'cure', 'failure'
  ],
  continuous_keywords: [
    'score', 'scale', 'index', 'level', 'concentration',
    'change', 'improvement', 'reduction', 'increase',
    'quality of life', 'qol', 'pain', 'function'
  ],
  survival_keywords: [
    'survival', 'time to', 'duration', 'progression-free',
    'overall survival', 'os', 'pfs', 'dfs', 'efs'
  ]
};

// Medical outcome synonyms for matching
export const OUTCOME_SYNONYMS = {
  mortality: ['death', 'mortality', 'fatal', 'lethal', 'died'],
  response: ['response', 'responder', 'responding', 'remission'],
  adverse: ['adverse', 'ae', 'side effect', 'toxicity', 'safety'],
  pain: ['pain', 'vas', 'nrs', 'analgesic', 'analgesia'],
  quality_of_life: ['qol', 'quality of life', 'hrqol', 'sf-36', 'eq-5d'],
  hospitalization: ['hospital', 'admission', 'readmission', 'inpatient']
};

// Default effect size preferences by outcome type
export const EFFECT_SIZE_DEFAULTS = {
  binary: 'OR',      // Odds ratio for binary outcomes
  continuous: 'MD',  // Mean difference for continuous
  survival: 'HR'     // Hazard ratio for survival
};

// Validate extraction completeness
export function validateExtraction(extraction) {
  const errors = [];
  const warnings = [];

  // Check required fields based on type
  if (extraction.outcomeType === 'binary') {
    if (extraction.events1 == null) errors.push('Missing events for arm 1');
    if (extraction.n1 == null) errors.push('Missing N for arm 1');
    if (extraction.events2 == null) errors.push('Missing events for arm 2');
    if (extraction.n2 == null) errors.push('Missing N for arm 2');
  } else if (extraction.outcomeType === 'continuous') {
    if (extraction.mean1 == null) errors.push('Missing mean for arm 1');
    if (extraction.mean2 == null) errors.push('Missing mean for arm 2');
    if (extraction.n1 == null) errors.push('Missing N for arm 1');
    if (extraction.n2 == null) errors.push('Missing N for arm 2');
    if (extraction.sd1 == null && extraction.se1 == null) {
      warnings.push('Missing SD/SE for arm 1 - will attempt imputation');
    }
    if (extraction.sd2 == null && extraction.se2 == null) {
      warnings.push('Missing SD/SE for arm 2 - will attempt imputation');
    }
  }

  // Check timepoint
  if (!extraction.timepoint) {
    warnings.push('Timepoint not specified');
  }

  // Check population
  if (!extraction.population) {
    warnings.push('Analysis population not specified (assuming ITT)');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

export default {
  CTGOV_TIMEPOINT_RULES,
  CTGOV_POPULATION_RULES,
  OUTCOME_DISAMBIGUATION_RULES,
  SUBGROUP_RULES,
  CHANGE_SCORE_RULES,
  SD_IMPUTATION_RULES,
  ARM_MAPPING_RULES,
  BINARY_OUTCOME_PATTERNS,
  CONTINUOUS_OUTCOME_PATTERNS,
  HR_EXTRACTION_PATTERNS,
  OUTCOME_TYPE_CLASSIFICATION,
  OUTCOME_SYNONYMS,
  EFFECT_SIZE_DEFAULTS,
  validateExtraction
};
