/**
 * Data Quality Flags Configuration
 * Defines flags, severity levels, and handling rules for data quality issues
 */

// Severity levels for quality flags
export const SEVERITY_LEVELS = {
  LOW: 'low',
  MODERATE: 'moderate',
  HIGH: 'high',
  CRITICAL: 'critical'
};

// Data quality flag definitions
export const QUALITY_FLAGS = {
  // Extraction-related flags
  sd_imputed: {
    code: 'SD_IMPUTED',
    severity: SEVERITY_LEVELS.MODERATE,
    description: 'Standard deviation was imputed from SE or CI',
    action: 'sensitivity_analysis',
    display: 'SD Imputed'
  },

  denominator_mismatch: {
    code: 'DENOM_MISMATCH',
    severity: SEVERITY_LEVELS.HIGH,
    description: 'Denominator differs between registration and results',
    action: 'flag_for_review',
    display: 'Denominator Mismatch'
  },

  aggregated_only: {
    code: 'AGGREGATED',
    severity: SEVERITY_LEVELS.HIGH,
    description: 'Only aggregated data available, no arm-level data',
    action: 'exclude_or_override',
    display: 'Aggregated Only'
  },

  mixed_change_final: {
    code: 'MIXED_ENDPOINT',
    severity: SEVERITY_LEVELS.HIGH,
    description: 'Mixed change-from-baseline and final value reporting',
    action: 'flag_for_review',
    display: 'Mixed Endpoint Type'
  },

  subgroup_only: {
    code: 'SUBGROUP',
    severity: SEVERITY_LEVELS.MODERATE,
    description: 'Only subgroup data available, no ITT population',
    action: 'sensitivity_analysis',
    display: 'Subgroup Only'
  },

  // Outcome-related flags
  outcome_mismatch: {
    code: 'OUTCOME_MISMATCH',
    severity: SEVERITY_LEVELS.HIGH,
    description: 'Posted outcome differs from registered primary outcome',
    action: 'flag_for_eim',
    display: 'Outcome Mismatch'
  },

  missing_primary: {
    code: 'MISSING_PRIMARY',
    severity: SEVERITY_LEVELS.HIGH,
    description: 'Registered primary outcome not found in results',
    action: 'flag_for_eim',
    display: 'Missing Primary'
  },

  timepoint_mismatch: {
    code: 'TIMEPOINT_MISMATCH',
    severity: SEVERITY_LEVELS.MODERATE,
    description: 'Reported timepoint differs from registered timeframe',
    action: 'flag_for_review',
    display: 'Timepoint Mismatch'
  },

  // Sample size flags
  early_termination: {
    code: 'EARLY_TERM',
    severity: SEVERITY_LEVELS.HIGH,
    description: 'Trial terminated early (actual N < 80% planned)',
    action: 'flag_for_eim',
    display: 'Early Termination'
  },

  over_enrollment: {
    code: 'OVER_ENROLL',
    severity: SEVERITY_LEVELS.LOW,
    description: 'Trial enrolled more than planned (actual N > 120% planned)',
    action: 'note_only',
    display: 'Over-enrollment'
  },

  // Results availability flags
  results_overdue: {
    code: 'RESULTS_OVERDUE',
    severity: SEVERITY_LEVELS.HIGH,
    description: 'Trial completed >24 months ago without posted results',
    action: 'flag_for_eim',
    display: 'Results Overdue'
  },

  results_pending: {
    code: 'RESULTS_PENDING',
    severity: SEVERITY_LEVELS.MODERATE,
    description: 'Trial completed 18-24 months ago without results',
    action: 'flag_for_eim',
    display: 'Results Pending'
  },

  // Statistical flags
  zero_cell: {
    code: 'ZERO_CELL',
    severity: SEVERITY_LEVELS.MODERATE,
    description: 'Zero events in one or more cells',
    action: 'apply_correction',
    display: 'Zero Cell'
  },

  small_sample: {
    code: 'SMALL_SAMPLE',
    severity: SEVERITY_LEVELS.MODERATE,
    description: 'Very small sample size (N < 30 per arm)',
    action: 'sensitivity_analysis',
    display: 'Small Sample'
  },

  extreme_effect: {
    code: 'EXTREME_EFFECT',
    severity: SEVERITY_LEVELS.HIGH,
    description: 'Effect size appears implausibly large',
    action: 'flag_for_review',
    display: 'Extreme Effect'
  },

  high_heterogeneity: {
    code: 'HIGH_I2',
    severity: SEVERITY_LEVELS.HIGH,
    description: 'Substantial heterogeneity (I² > 75%)',
    action: 'investigate_sources',
    display: 'High Heterogeneity'
  }
};

// Flag actions and their descriptions
export const FLAG_ACTIONS = {
  sensitivity_analysis: {
    description: 'Include in primary analysis but perform sensitivity analysis excluding',
    automatic: false
  },
  flag_for_review: {
    description: 'Flag for manual review before including',
    automatic: false
  },
  exclude_or_override: {
    description: 'Exclude by default, require explicit override to include',
    automatic: true
  },
  flag_for_eim: {
    description: 'Flag for Evidence Integrity Module reporting',
    automatic: true
  },
  apply_correction: {
    description: 'Apply statistical correction (e.g., continuity correction)',
    automatic: true
  },
  investigate_sources: {
    description: 'Investigate potential sources and consider subgroup analysis',
    automatic: false
  },
  note_only: {
    description: 'Note for transparency, no action required',
    automatic: false
  }
};

// Severity thresholds for overall data quality assessment
export const QUALITY_ASSESSMENT = {
  // Maximum flags by severity before quality downgrade
  thresholds: {
    good: { critical: 0, high: 0, moderate: 2 },
    acceptable: { critical: 0, high: 2, moderate: 5 },
    concerning: { critical: 0, high: 5, moderate: 10 }
    // Beyond concerning = poor
  },

  // Labels for overall quality
  labels: {
    good: { text: 'Good', color: 'success' },
    acceptable: { text: 'Acceptable', color: 'info' },
    concerning: { text: 'Concerning', color: 'warning' },
    poor: { text: 'Poor', color: 'danger' }
  }
};

// Zero-cell handling options
export const ZERO_CELL_CORRECTIONS = {
  continuity_0_5: {
    name: 'Continuity Correction (0.5)',
    value: 0.5,
    description: 'Add 0.5 to all cells when zero events present'
  },
  treatment_arm: {
    name: 'Treatment Arm Correction',
    value: 'treatment',
    description: 'Add correction proportional to arm sizes'
  },
  empirical: {
    name: 'Empirical Correction',
    value: 'empirical',
    description: 'Add reciprocal of opposite arm size'
  },
  exclude: {
    name: 'Exclude Study',
    value: 'exclude',
    description: 'Exclude studies with zero cells'
  }
};

// Helper function to assess flag severity
export function getFlagSeverity(flagCode) {
  const flag = Object.values(QUALITY_FLAGS).find(f => f.code === flagCode);
  return flag ? flag.severity : null;
}

// Helper function to get flags by severity
export function getFlagsBySeverity(severity) {
  return Object.entries(QUALITY_FLAGS)
    .filter(([_, flag]) => flag.severity === severity)
    .map(([key, flag]) => ({ key, ...flag }));
}

// Helper function to assess overall data quality
export function assessDataQuality(flags) {
  const counts = {
    critical: 0,
    high: 0,
    moderate: 0,
    low: 0
  };

  flags.forEach(flag => {
    const severity = getFlagSeverity(flag);
    if (severity && counts[severity] !== undefined) {
      counts[severity]++;
    }
  });

  const { thresholds, labels } = QUALITY_ASSESSMENT;

  if (counts.critical <= thresholds.good.critical &&
      counts.high <= thresholds.good.high &&
      counts.moderate <= thresholds.good.moderate) {
    return { quality: 'good', ...labels.good, counts };
  }

  if (counts.critical <= thresholds.acceptable.critical &&
      counts.high <= thresholds.acceptable.high &&
      counts.moderate <= thresholds.acceptable.moderate) {
    return { quality: 'acceptable', ...labels.acceptable, counts };
  }

  if (counts.critical <= thresholds.concerning.critical &&
      counts.high <= thresholds.concerning.high &&
      counts.moderate <= thresholds.concerning.moderate) {
    return { quality: 'concerning', ...labels.concerning, counts };
  }

  return { quality: 'poor', ...labels.poor, counts };
}

// Export flag codes as constants for easy reference
export const FLAG_CODES = Object.fromEntries(
  Object.entries(QUALITY_FLAGS).map(([key, flag]) => [key.toUpperCase(), flag.code])
);

export default {
  SEVERITY_LEVELS,
  QUALITY_FLAGS,
  FLAG_ACTIONS,
  QUALITY_ASSESSMENT,
  ZERO_CELL_CORRECTIONS,
  getFlagSeverity,
  getFlagsBySeverity,
  assessDataQuality,
  FLAG_CODES
};
