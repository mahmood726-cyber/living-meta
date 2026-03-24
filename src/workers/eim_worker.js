/**
 * Evidence Integrity Module (EIM) Worker
 * Computes trial-level flags and meta-level summaries
 */

import { monthsSince } from '../lib/utils.js';

// Configuration thresholds (from spec)
const RESULTS_COVERAGE_THRESHOLDS = {
  adequate: 0.70,
  marginal: 0.50,
  insufficient: 0.30
};

const NON_PUBLICATION_THRESHOLDS = {
  high: 24,      // months
  moderate: 18,
  low: 12
};

const SAMPLE_SIZE_THRESHOLDS = {
  early_termination: 0.80,  // n_ratio < 0.8
  over_enrollment: 1.20     // n_ratio > 1.2
};

const DATA_QUALITY_FLAGS = {
  sd_imputed: { severity: 'moderate' },
  denominator_mismatch: { severity: 'high' },
  aggregated_only: { severity: 'high' },
  mixed_change_final: { severity: 'high' },
  subgroup_only: { severity: 'moderate' },
  unclear_timepoint: { severity: 'moderate' },
  arm_mapping_uncertain: { severity: 'high' }
};

const EVIDENCE_AT_RISK_WEIGHTS = {
  missing_results: 0.5,
  outcome_mismatch: 0.3,
  early_termination: 0.2
};

/**
 * Handle incoming messages
 */
self.onmessage = async function(event) {
  const { type, payload, requestId } = event.data;

  try {
    switch (type) {
      case 'COMPUTE_TRIAL_FLAGS':
        await handleComputeTrialFlags(payload, requestId);
        break;

      case 'COMPUTE_META_SUMMARY':
        await handleComputeMetaSummary(payload, requestId);
        break;

      case 'ASSESS_COVERAGE':
        await handleAssessCoverage(payload, requestId);
        break;

      case 'ASSESS_DATA_QUALITY':
        await handleAssessDataQuality(payload, requestId);
        break;

      case 'FULL_EIM_ANALYSIS':
        await handleFullEIMAnalysis(payload, requestId);
        break;

      default:
        console.warn('Unknown message type:', type);
    }
  } catch (error) {
    self.postMessage({
      type: 'EIM_ERROR',
      error: error.message,
      stack: error.stack,
      requestId
    });
  }
};

/**
 * Compute trial-level EIM flags for all trials
 */
async function handleComputeTrialFlags(payload, requestId) {
  const { trials, referenceDate } = payload;
  const refDate = referenceDate ? new Date(referenceDate) : new Date();

  self.postMessage({
    type: 'EIM_STARTED',
    payload: { phase: 'trial_flags', total: trials.length },
    requestId
  });

  const flags = trials.map(trial => computeTrialFlags(trial, refDate));

  self.postMessage({
    type: 'EIM_TRIAL_FLAGS',
    payload: flags,
    requestId
  });
}

/**
 * Compute EIM flags for a single trial
 */
function computeTrialFlags(trial, referenceDate) {
  const flags = {
    nct_id: trial.nctId,
    computed_at: new Date().toISOString(),
    reference_date: referenceDate.toISOString()
  };

  // A) Non-publication risk
  const nonPubRisk = assessNonPublicationRisk(trial, referenceDate);
  Object.assign(flags, nonPubRisk);

  // B) Outcome reporting bias
  const outcomeRisk = assessOutcomeReportingBias(trial);
  Object.assign(flags, outcomeRisk);

  // C) Timepoint switching
  const timepointRisk = assessTimepointSwitching(trial);
  Object.assign(flags, timepointRisk);

  // D) Sample size discrepancy
  const sampleSizeRisk = assessSampleSizeDiscrepancy(trial);
  Object.assign(flags, sampleSizeRisk);

  // Compute composite risk score
  flags.composite_risk_score = calculateCompositeRisk(flags);
  flags.risk_level = getRiskLevel(flags.composite_risk_score);

  return flags;
}

/**
 * Assess non-publication risk
 */
function assessNonPublicationRisk(trial, referenceDate) {
  const completionDate = trial.completionDate || trial.primaryCompletionDate;

  if (!completionDate) {
    return {
      completion_date: null,
      months_since_completion: null,
      results_posted: trial.hasResults || false,
      non_publication_risk: 'unknown'
    };
  }

  const monthsElapsed = monthsSince(completionDate, referenceDate);
  const hasResults = trial.hasResults || false;

  let riskLevel;
  if (hasResults) {
    riskLevel = 'none';
  } else if (monthsElapsed > NON_PUBLICATION_THRESHOLDS.high) {
    riskLevel = 'high';
  } else if (monthsElapsed > NON_PUBLICATION_THRESHOLDS.moderate) {
    riskLevel = 'moderate';
  } else if (monthsElapsed > NON_PUBLICATION_THRESHOLDS.low) {
    riskLevel = 'low';
  } else {
    riskLevel = 'none'; // Within grace period
  }

  return {
    completion_date: completionDate,
    months_since_completion: monthsElapsed,
    results_posted: hasResults,
    non_publication_risk: riskLevel
  };
}

/**
 * Assess outcome reporting bias (registered vs posted outcomes)
 */
function assessOutcomeReportingBias(trial) {
  const registeredPrimary = trial.primaryOutcomes || [];
  const registeredSecondary = trial.secondaryOutcomes || [];
  const registeredTotal = registeredPrimary.length + registeredSecondary.length;

  // If no results, cannot assess
  if (!trial.hasResults || !trial.resultsData) {
    return {
      registered_primary: registeredPrimary.map(o => o.measure).join('; ') || null,
      reported_primary: null,
      outcome_match: null,
      registered_outcomes_count: registeredTotal,
      reported_outcomes_count: 0,
      selective_reporting_ratio: null,
      outcome_reporting_risk: 'not_assessable'
    };
  }

  const reportedOutcomes = trial.resultsData.outcomeMeasures || [];
  const reportedPrimary = reportedOutcomes.filter(o => o.type === 'PRIMARY');
  const reportedTotal = reportedOutcomes.length;

  // Compare registered vs reported primary outcomes
  let primaryMatch = null;
  if (registeredPrimary.length > 0 && reportedPrimary.length > 0) {
    primaryMatch = assessOutcomeMatch(registeredPrimary, reportedPrimary);
  }

  // Calculate selective reporting ratio
  const ratio = registeredTotal > 0 ? reportedTotal / registeredTotal : null;

  // Determine risk level
  let riskLevel;
  if (registeredPrimary.length > 0 && reportedPrimary.length === 0) {
    riskLevel = 'high'; // Missing primary outcome
  } else if (primaryMatch && primaryMatch.score < 0.5) {
    riskLevel = 'high'; // Primary outcome mismatch
  } else if (ratio !== null && ratio < 0.5) {
    riskLevel = 'moderate'; // Less than half of registered outcomes reported
  } else if (primaryMatch && primaryMatch.score < 0.8) {
    riskLevel = 'moderate';
  } else {
    riskLevel = 'low';
  }

  return {
    registered_primary: registeredPrimary.map(o => o.measure).join('; ') || null,
    reported_primary: reportedPrimary.map(o => o.title).join('; ') || null,
    outcome_match: primaryMatch ? primaryMatch.score : null,
    registered_outcomes_count: registeredTotal,
    reported_outcomes_count: reportedTotal,
    selective_reporting_ratio: ratio,
    outcome_reporting_risk: riskLevel
  };
}

/**
 * Assess outcome match between registered and reported
 */
function assessOutcomeMatch(registered, reported) {
  // Simple fuzzy matching
  let bestMatch = 0;

  for (const reg of registered) {
    const regTokens = tokenize(reg.measure);

    for (const rep of reported) {
      const repTokens = tokenize(rep.title);
      const overlap = calculateTokenOverlap(regTokens, repTokens);
      bestMatch = Math.max(bestMatch, overlap);
    }
  }

  return {
    score: bestMatch,
    method: 'token_overlap'
  };
}

/**
 * Tokenize text for matching
 */
function tokenize(text) {
  if (!text) return [];
  return text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2);
}

/**
 * Calculate token overlap between two token sets
 */
function calculateTokenOverlap(tokens1, tokens2) {
  if (!tokens1.length || !tokens2.length) return 0;

  const set1 = new Set(tokens1);
  const set2 = new Set(tokens2);

  let overlap = 0;
  for (const token of set1) {
    if (set2.has(token)) overlap++;
  }

  // Jaccard-like similarity
  const union = new Set([...tokens1, ...tokens2]);
  return overlap / union.size;
}

/**
 * Assess timepoint switching
 */
function assessTimepointSwitching(trial) {
  const registeredPrimary = trial.primaryOutcomes || [];

  if (!trial.hasResults || !trial.resultsData) {
    return {
      registered_timepoint_months: extractTimeframe(registeredPrimary[0]?.timeFrame),
      reported_timepoint_months: null,
      timepoint_match: null,
      timepoint_switching_risk: 'not_assessable'
    };
  }

  const reportedOutcomes = trial.resultsData.outcomeMeasures || [];
  const reportedPrimary = reportedOutcomes.filter(o => o.type === 'PRIMARY');

  const registeredTimeframe = extractTimeframe(registeredPrimary[0]?.timeFrame);
  const reportedTimeframe = extractTimeframe(reportedPrimary[0]?.timeFrame);

  let match = null;
  let riskLevel = 'low';

  if (registeredTimeframe !== null && reportedTimeframe !== null) {
    const diff = Math.abs(registeredTimeframe - reportedTimeframe);
    match = diff <= 3; // Allow 3 month tolerance

    if (!match) {
      riskLevel = 'moderate';
      if (diff > 6) riskLevel = 'high';
    }
  }

  return {
    registered_timepoint_months: registeredTimeframe,
    reported_timepoint_months: reportedTimeframe,
    timepoint_match: match,
    timepoint_switching_risk: riskLevel
  };
}

/**
 * Extract timeframe in months from text
 */
function extractTimeframe(text) {
  if (!text) return null;

  const lower = text.toLowerCase();

  // Match patterns like "12 months", "6 weeks", "1 year"
  const monthMatch = lower.match(/(\d+)\s*(month|mo\b)/);
  if (monthMatch) return parseInt(monthMatch[1], 10);

  const weekMatch = lower.match(/(\d+)\s*week/);
  if (weekMatch) return Math.round(parseInt(weekMatch[1], 10) / 4.33);

  const yearMatch = lower.match(/(\d+)\s*year/);
  if (yearMatch) return parseInt(yearMatch[1], 10) * 12;

  const dayMatch = lower.match(/(\d+)\s*day/);
  if (dayMatch) return Math.round(parseInt(dayMatch[1], 10) / 30);

  return null;
}

/**
 * Assess sample size discrepancy
 */
function assessSampleSizeDiscrepancy(trial) {
  const planned = trial.enrollmentInfo?.count;
  const enrollmentType = trial.enrollmentInfo?.type;

  // Try to get actual enrollment from results
  let actual = null;
  if (trial.resultsData?.participantFlow) {
    // Sum up participants from flow
    const flow = trial.resultsData.participantFlow;
    if (flow.length > 0) {
      // This is a simplification - actual implementation would parse flow data
    }
  }

  // Fall back to enrollment count if it's "Actual"
  if (enrollmentType === 'Actual') {
    actual = planned;
  }

  if (planned === null || planned === undefined) {
    return {
      planned_n: null,
      actual_n: actual,
      n_ratio: null,
      early_termination_flag: null,
      over_enrollment_flag: null,
      sample_size_risk: 'not_assessable'
    };
  }

  const ratio = actual !== null ? actual / planned : null;

  let earlyTermination = null;
  let overEnrollment = null;
  let riskLevel = 'low';

  if (ratio !== null) {
    earlyTermination = ratio < SAMPLE_SIZE_THRESHOLDS.early_termination;
    overEnrollment = ratio > SAMPLE_SIZE_THRESHOLDS.over_enrollment;

    if (earlyTermination) {
      riskLevel = 'moderate';
      if (ratio < 0.5) riskLevel = 'high';
    }
  }

  // Check for explicitly terminated status
  if (trial.overallStatus === 'Terminated') {
    earlyTermination = true;
    if (riskLevel === 'low') riskLevel = 'moderate';
  }

  return {
    planned_n: planned,
    actual_n: actual,
    n_ratio: ratio,
    early_termination_flag: earlyTermination,
    over_enrollment_flag: overEnrollment,
    sample_size_risk: riskLevel
  };
}

/**
 * Calculate composite risk score
 */
function calculateCompositeRisk(flags) {
  let score = 0;

  // Non-publication risk contribution
  const nonPubRisk = flags.non_publication_risk;
  if (nonPubRisk === 'high') score += EVIDENCE_AT_RISK_WEIGHTS.missing_results;
  else if (nonPubRisk === 'moderate') score += EVIDENCE_AT_RISK_WEIGHTS.missing_results * 0.5;

  // Outcome reporting risk contribution
  const outcomeRisk = flags.outcome_reporting_risk;
  if (outcomeRisk === 'high') score += EVIDENCE_AT_RISK_WEIGHTS.outcome_mismatch;
  else if (outcomeRisk === 'moderate') score += EVIDENCE_AT_RISK_WEIGHTS.outcome_mismatch * 0.5;

  // Early termination contribution
  if (flags.early_termination_flag) {
    score += EVIDENCE_AT_RISK_WEIGHTS.early_termination;
  }

  return Math.min(1, score);
}

/**
 * Get risk level from composite score
 */
function getRiskLevel(score) {
  if (score >= 0.7) return 'high';
  if (score >= 0.4) return 'moderate';
  if (score >= 0.1) return 'low';
  return 'minimal';
}

/**
 * Compute meta-level EIM summary
 */
async function handleComputeMetaSummary(payload, requestId) {
  const { trialFlags, searchRun, projectId } = payload;

  self.postMessage({
    type: 'EIM_STARTED',
    payload: { phase: 'meta_summary' },
    requestId
  });

  const summary = computeMetaSummary(trialFlags, searchRun);
  summary.project_id = projectId;
  summary.run_id = searchRun?.id;

  self.postMessage({
    type: 'EIM_META_SUMMARY',
    payload: summary,
    requestId
  });
}

/**
 * Compute meta-level summary from trial flags
 */
function computeMetaSummary(trialFlags, searchRun) {
  const total = trialFlags.length;

  // Non-publication statistics
  const withResults = trialFlags.filter(f => f.results_posted).length;
  const nonPubHigh = trialFlags.filter(f => f.non_publication_risk === 'high').length;
  const nonPubModerate = trialFlags.filter(f => f.non_publication_risk === 'moderate').length;

  // Outcome reporting statistics
  const outcomeHigh = trialFlags.filter(f => f.outcome_reporting_risk === 'high').length;
  const outcomeModerate = trialFlags.filter(f => f.outcome_reporting_risk === 'moderate').length;

  // Early termination statistics
  const earlyTerm = trialFlags.filter(f => f.early_termination_flag === true).length;

  // Calculate missing participant-years (rough estimate)
  let missingParticipantYears = 0;
  for (const flag of trialFlags) {
    if (!flag.results_posted && flag.planned_n) {
      // Assume average 1-year follow-up
      missingParticipantYears += flag.planned_n;
    }
  }

  // Risk distribution
  const riskDistribution = {
    high: trialFlags.filter(f => f.risk_level === 'high').length,
    moderate: trialFlags.filter(f => f.risk_level === 'moderate').length,
    low: trialFlags.filter(f => f.risk_level === 'low').length,
    minimal: trialFlags.filter(f => f.risk_level === 'minimal').length
  };

  // Calculate overall evidence-at-risk score
  const avgCompositeRisk = trialFlags.reduce((sum, f) =>
    sum + (f.composite_risk_score || 0), 0
  ) / total;

  return {
    timestamp: new Date().toISOString(),

    // Counts
    total_trials: total,
    trials_with_results: withResults,
    trials_without_results: total - withResults,

    // Non-publication
    non_publication_rate: (total - withResults) / total,
    non_publication_high: nonPubHigh,
    non_publication_moderate: nonPubModerate,

    // Outcome reporting
    outcome_reporting_high: outcomeHigh,
    outcome_reporting_moderate: outcomeModerate,

    // Sample size
    early_termination_count: earlyTerm,

    // Missing evidence
    missing_participant_years: missingParticipantYears,

    // Risk distribution
    risk_distribution: riskDistribution,

    // Overall score
    evidence_at_risk_score: avgCompositeRisk,
    overall_assessment: getOverallAssessment(avgCompositeRisk, withResults / total)
  };
}

/**
 * Get overall EIM assessment
 */
function getOverallAssessment(riskScore, resultsRate) {
  if (resultsRate < RESULTS_COVERAGE_THRESHOLDS.insufficient) {
    return {
      level: 'critical',
      message: `Only ${(resultsRate * 100).toFixed(0)}% of trials have posted results. Analysis may be substantially biased.`
    };
  }

  if (resultsRate < RESULTS_COVERAGE_THRESHOLDS.marginal) {
    return {
      level: 'concerning',
      message: `Results coverage is marginal (${(resultsRate * 100).toFixed(0)}%). Interpret findings with caution.`
    };
  }

  if (riskScore >= 0.5) {
    return {
      level: 'elevated',
      message: 'Elevated evidence integrity risk detected. Review trial-level flags for details.'
    };
  }

  if (resultsRate >= RESULTS_COVERAGE_THRESHOLDS.adequate && riskScore < 0.3) {
    return {
      level: 'acceptable',
      message: 'Evidence integrity indicators are within acceptable ranges.'
    };
  }

  return {
    level: 'moderate',
    message: 'Moderate evidence integrity concerns. Some trial-level issues detected.'
  };
}

/**
 * Assess results coverage
 */
async function handleAssessCoverage(payload, requestId) {
  const { trials, referenceDate } = payload;
  const refDate = referenceDate ? new Date(referenceDate) : new Date();

  const coverage = assessResultsCoverage(trials, refDate);

  self.postMessage({
    type: 'COVERAGE_ASSESSMENT',
    payload: coverage,
    requestId
  });
}

/**
 * Assess results coverage (from addendum spec)
 */
function assessResultsCoverage(trials, referenceDate) {
  // Filter to eligible trials
  const eligible = trials.filter(t => {
    const status = t.overallStatus;
    if (!['Completed', 'Terminated'].includes(status)) return false;

    const completionDate = t.completionDate || t.primaryCompletionDate;
    if (!completionDate) return false;

    const months = monthsSince(completionDate, referenceDate);
    return months >= 12; // Grace period
  });

  const withResults = eligible.filter(t => t.hasResults);
  const coverage = eligible.length ? withResults.length / eligible.length : null;

  let assessment;
  if (coverage === null) {
    assessment = 'no_eligible_trials';
  } else if (coverage >= RESULTS_COVERAGE_THRESHOLDS.adequate) {
    assessment = 'adequate';
  } else if (coverage >= RESULTS_COVERAGE_THRESHOLDS.marginal) {
    assessment = 'marginal';
  } else {
    assessment = 'insufficient';
  }

  const canAnalyze = coverage !== null && coverage >= RESULTS_COVERAGE_THRESHOLDS.insufficient;

  let warning = null;
  if (coverage !== null && coverage < RESULTS_COVERAGE_THRESHOLDS.adequate) {
    warning = `Only ${(coverage * 100).toFixed(0)}% of eligible completed trials have posted results on ClinicalTrials.gov. Conclusions may be substantially biased by missing results.`;
  }

  return {
    coverage,
    eligible_count: eligible.length,
    with_results_count: withResults.length,
    without_results_nctids: eligible.filter(t => !t.hasResults).map(t => t.nctId),
    assessment,
    can_analyze: canAnalyze,
    warning
  };
}

/**
 * Assess data quality for extractions
 */
async function handleAssessDataQuality(payload, requestId) {
  const { extractions } = payload;

  const assessments = extractions.map(extraction => {
    const flags = [];

    if (extraction.sd_source?.startsWith('imputed')) {
      flags.push({ type: 'sd_imputed', severity: 'moderate' });
    }

    if (extraction.denominators_inconsistent) {
      flags.push({ type: 'denominator_mismatch', severity: 'high' });
    }

    if (extraction.aggregated_only) {
      flags.push({ type: 'aggregated_only', severity: 'high' });
    }

    if (extraction.mixed_change_final) {
      flags.push({ type: 'mixed_change_final', severity: 'high' });
    }

    if (extraction.subgroup_only) {
      flags.push({ type: 'subgroup_only', severity: 'moderate' });
    }

    const highSeverityCount = flags.filter(f => f.severity === 'high').length;

    return {
      extraction_id: extraction.id,
      nct_id: extraction.nctId,
      flags,
      high_severity_count: highSeverityCount,
      override_required: highSeverityCount > 0
    };
  });

  self.postMessage({
    type: 'DATA_QUALITY_ASSESSMENT',
    payload: assessments,
    requestId
  });
}

/**
 * Run full EIM analysis
 */
async function handleFullEIMAnalysis(payload, requestId) {
  const { trials, extractions, referenceDate, projectId, searchRunId } = payload;
  const refDate = referenceDate ? new Date(referenceDate) : new Date();

  self.postMessage({
    type: 'EIM_STARTED',
    payload: { phase: 'full_analysis' },
    requestId
  });

  // 1. Compute trial-level flags
  const trialFlags = trials.map(trial => computeTrialFlags(trial, refDate));

  // 2. Assess coverage
  const coverage = assessResultsCoverage(trials, refDate);

  // 3. Compute meta summary
  const metaSummary = computeMetaSummary(trialFlags, { id: searchRunId });
  metaSummary.project_id = projectId;
  metaSummary.run_id = searchRunId;

  // 4. Assess data quality if extractions provided
  let dataQuality = null;
  if (extractions && extractions.length > 0) {
    dataQuality = extractions.map(extraction => {
      const flags = [];
      if (extraction.sd_source?.startsWith('imputed')) {
        flags.push({ type: 'sd_imputed', severity: 'moderate' });
      }
      if (extraction.denominators_inconsistent) {
        flags.push({ type: 'denominator_mismatch', severity: 'high' });
      }
      return {
        extraction_id: extraction.id,
        nct_id: extraction.nctId,
        flags,
        high_severity_count: flags.filter(f => f.severity === 'high').length
      };
    });
  }

  self.postMessage({
    type: 'EIM_FULL_COMPLETE',
    payload: {
      trial_flags: trialFlags,
      coverage,
      meta_summary: metaSummary,
      data_quality: dataQuality
    },
    requestId
  });
}

// Worker initialized
