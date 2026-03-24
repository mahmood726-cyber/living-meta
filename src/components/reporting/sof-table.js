/**
 * Summary of Findings (SoF) Table Component
 * GRADE-style certainty assessment with EIM integration
 */

/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
  showAbsoluteEffects: true,
  showQualityDomains: true,
  assumedRiskControl: null, // If null, use control group event rate
  populationSize: 1000,
  significanceLevel: 0.05
};

/**
 * GRADE certainty levels
 */
const CERTAINTY_LEVELS = {
  high: { label: 'High', symbol: '⊕⊕⊕⊕', color: '#22c55e', description: 'We are very confident the true effect lies close to the estimate' },
  moderate: { label: 'Moderate', symbol: '⊕⊕⊕◯', color: '#84cc16', description: 'The true effect is likely close to the estimate, but may be substantially different' },
  low: { label: 'Low', symbol: '⊕⊕◯◯', color: '#eab308', description: 'The true effect may be substantially different from the estimate' },
  very_low: { label: 'Very Low', symbol: '⊕◯◯◯', color: '#ef4444', description: 'The estimate is very uncertain' }
};

/**
 * GRADE domains and rating criteria
 */
const GRADE_DOMAINS = {
  risk_of_bias: {
    label: 'Risk of Bias',
    description: 'Limitations in study design or execution',
    ratings: ['no_concern', 'some_concerns', 'serious', 'very_serious']
  },
  inconsistency: {
    label: 'Inconsistency',
    description: 'Heterogeneity in results across studies',
    ratings: ['no_concern', 'some_concerns', 'serious', 'very_serious']
  },
  indirectness: {
    label: 'Indirectness',
    description: 'Differences between question and evidence',
    ratings: ['no_concern', 'some_concerns', 'serious', 'very_serious']
  },
  imprecision: {
    label: 'Imprecision',
    description: 'Wide confidence intervals',
    ratings: ['no_concern', 'some_concerns', 'serious', 'very_serious']
  },
  publication_bias: {
    label: 'Publication Bias',
    description: 'Evidence of selective reporting',
    ratings: ['undetected', 'suspected', 'strongly_suspected']
  }
};

/**
 * Render the SoF table
 * @param {HTMLElement} container - Container element
 * @param {object} data - Analysis results and EIM data
 * @param {object} config - Display configuration
 */
export function renderSoFTable(container, data, config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const { outcomes, comparison, population, eim } = data;

  container.innerHTML = `
    <div class="sof-table-wrapper">
      ${renderHeader(comparison, population)}
      ${renderWarningBanner(eim)}

      <div class="overflow-x-auto">
        <table class="sof-table min-w-full border-collapse">
          <thead>
            ${renderTableHeader(cfg)}
          </thead>
          <tbody>
            ${outcomes.map(outcome => renderOutcomeRow(outcome, cfg, eim)).join('')}
          </tbody>
        </table>
      </div>

      ${renderFootnotes(outcomes, eim)}
      ${renderLegend()}
    </div>
  `;

  addStyles();
}

/**
 * Render SoF header
 */
function renderHeader(comparison, population) {
  return `
    <div class="mb-4">
      <h2 class="text-xl font-bold text-gray-900">Summary of Findings</h2>
      <div class="mt-2 text-sm text-gray-600">
        <p><strong>Comparison:</strong> ${comparison || 'Treatment vs Control'}</p>
        <p><strong>Population:</strong> ${population || 'As defined by inclusion criteria'}</p>
      </div>
    </div>
  `;
}

/**
 * Render warning banner based on EIM
 */
function renderWarningBanner(eim) {
  if (!eim) return '';

  const warnings = [];

  // Coverage warning
  if (eim.coverage && eim.coverage.coverage < 0.7) {
    warnings.push({
      type: eim.coverage.coverage < 0.5 ? 'critical' : 'moderate',
      message: `Results coverage: ${(eim.coverage.coverage * 100).toFixed(0)}% of eligible trials have posted results. ${eim.coverage.coverage < 0.5 ? 'Conclusions may be substantially biased.' : 'Interpret with caution.'}`
    });
  }

  // Evidence-at-risk
  if (eim.metaSummary && eim.metaSummary.evidence_at_risk_score > 0.3) {
    warnings.push({
      type: eim.metaSummary.evidence_at_risk_score > 0.5 ? 'critical' : 'moderate',
      message: `Evidence-at-risk score: ${(eim.metaSummary.evidence_at_risk_score * 100).toFixed(0)}%. ${eim.metaSummary.missing_participant_years > 0 ? `Missing ~${formatNumber(eim.metaSummary.missing_participant_years)} participant-years of data.` : ''}`
    });
  }

  if (warnings.length === 0) return '';

  const hasCritical = warnings.some(w => w.type === 'critical');

  return `
    <div class="mb-4 p-4 rounded-lg ${hasCritical ? 'bg-red-50 border border-red-200' : 'bg-yellow-50 border border-yellow-200'}">
      <div class="flex items-start">
        <svg class="w-5 h-5 ${hasCritical ? 'text-red-500' : 'text-yellow-500'} mt-0.5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
        </svg>
        <div class="${hasCritical ? 'text-red-800' : 'text-yellow-800'}">
          <p class="font-medium mb-1">Evidence Integrity Concerns</p>
          <ul class="text-sm space-y-1">
            ${warnings.map(w => `<li>${w.message}</li>`).join('')}
          </ul>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render table header
 */
function renderTableHeader(cfg) {
  return `
    <tr class="bg-gray-100">
      <th class="sof-th" rowspan="2">Outcome</th>
      <th class="sof-th" colspan="2">Anticipated absolute effects* (95% CI)</th>
      <th class="sof-th" rowspan="2">Relative effect<br>(95% CI)</th>
      <th class="sof-th" rowspan="2">No. of<br>participants<br>(studies)</th>
      <th class="sof-th" rowspan="2">Certainty of<br>the evidence<br>(GRADE)</th>
      <th class="sof-th" rowspan="2">Comments</th>
    </tr>
    <tr class="bg-gray-50">
      <th class="sof-th-sub">Risk with control</th>
      <th class="sof-th-sub">Risk with intervention</th>
    </tr>
  `;
}

/**
 * Render a single outcome row
 */
function renderOutcomeRow(outcome, cfg, eim) {
  const {
    name,
    measure,
    effect,
    ci_lower,
    ci_upper,
    control_risk,
    n_participants,
    n_studies,
    certainty,
    domains,
    comments,
    follow_up,
    footnotes
  } = outcome;

  // Calculate absolute effects
  const absoluteControl = calculateAbsoluteRisk(control_risk, cfg.populationSize);
  const absoluteIntervention = calculateInterventionRisk(control_risk, effect, measure, cfg.populationSize);
  const absoluteDifference = calculateAbsoluteDifference(control_risk, effect, measure, cfg.populationSize, ci_lower, ci_upper);

  // Get certainty info
  const certaintyInfo = CERTAINTY_LEVELS[certainty] || CERTAINTY_LEVELS.very_low;

  // Build footnote references
  const footnoteRefs = footnotes?.length > 0 ? `<sup>${footnotes.join(',')}</sup>` : '';

  return `
    <tr class="sof-row">
      <td class="sof-td font-medium">
        ${name}${footnoteRefs}
        ${follow_up ? `<div class="text-xs text-gray-500">Follow-up: ${follow_up}</div>` : ''}
      </td>
      <td class="sof-td text-center">
        ${absoluteControl}
      </td>
      <td class="sof-td text-center">
        ${absoluteIntervention}
        <div class="text-xs text-gray-500">${absoluteDifference}</div>
      </td>
      <td class="sof-td text-center">
        <strong>${formatEffect(effect, measure)}</strong>
        <div class="text-xs text-gray-500">(${formatEffect(ci_lower, measure)} to ${formatEffect(ci_upper, measure)})</div>
      </td>
      <td class="sof-td text-center">
        ${n_participants.toLocaleString()}
        <div class="text-xs text-gray-500">(${n_studies} ${n_studies === 1 ? 'study' : 'studies'})</div>
      </td>
      <td class="sof-td text-center">
        ${renderCertaintyCell(certainty, certaintyInfo, domains)}
      </td>
      <td class="sof-td text-sm">
        ${comments || '-'}
      </td>
    </tr>
  `;
}

/**
 * Render certainty cell with quality domains
 */
function renderCertaintyCell(certainty, certaintyInfo, domains) {
  const downgradeReasons = [];

  if (domains) {
    Object.entries(domains).forEach(([domain, rating]) => {
      if (rating === 'serious' || rating === 'very_serious' || rating === 'strongly_suspected') {
        const label = GRADE_DOMAINS[domain]?.label || domain;
        const severity = rating === 'very_serious' ? '⬇⬇' : '⬇';
        downgradeReasons.push(`${severity} ${label}`);
      } else if (rating === 'some_concerns' || rating === 'suspected') {
        const label = GRADE_DOMAINS[domain]?.label || domain;
        downgradeReasons.push(`⬇ ${label}`);
      }
    });
  }

  return `
    <div class="flex flex-col items-center">
      <span class="text-lg" style="color: ${certaintyInfo.color}">
        ${certaintyInfo.symbol}
      </span>
      <span class="font-medium text-sm">${certaintyInfo.label}</span>
      ${downgradeReasons.length > 0 ? `
        <div class="text-xs text-gray-500 mt-1">
          ${downgradeReasons.join('<br>')}
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Calculate absolute risk for control
 */
function calculateAbsoluteRisk(risk, per) {
  if (risk === null || risk === undefined) return '-';
  const count = Math.round(risk * per);
  return `<strong>${count}</strong> per ${per.toLocaleString()}`;
}

/**
 * Calculate intervention risk
 */
function calculateInterventionRisk(controlRisk, effect, measure, per) {
  if (controlRisk === null || controlRisk === undefined || effect === null) return '-';

  let interventionRisk;
  if (measure === 'OR') {
    const odds = controlRisk / (1 - controlRisk);
    const newOdds = odds * effect;
    interventionRisk = newOdds / (1 + newOdds);
  } else if (measure === 'RR') {
    interventionRisk = controlRisk * effect;
  } else if (measure === 'RD') {
    interventionRisk = controlRisk + effect;
  } else {
    return '-';
  }

  interventionRisk = Math.max(0, Math.min(1, interventionRisk));
  const count = Math.round(interventionRisk * per);
  return `<strong>${count}</strong> per ${per.toLocaleString()}`;
}

/**
 * Calculate absolute difference with CI
 */
function calculateAbsoluteDifference(controlRisk, effect, measure, per, ciLower, ciUpper) {
  if (controlRisk === null || effect === null) return '';

  const calcDiff = (eff) => {
    if (measure === 'OR') {
      const odds = controlRisk / (1 - controlRisk);
      const newOdds = odds * eff;
      const newRisk = newOdds / (1 + newOdds);
      return newRisk - controlRisk;
    } else if (measure === 'RR') {
      return controlRisk * eff - controlRisk;
    } else if (measure === 'RD') {
      return eff;
    }
    return 0;
  };

  const diffLower = Math.round(calcDiff(ciLower) * per);
  const diffUpper = Math.round(calcDiff(ciUpper) * per);

  return `(${diffLower} ${diffLower >= 0 ? 'more' : 'fewer'} to ${diffUpper} ${diffUpper >= 0 ? 'more' : 'fewer'})`;
}

/**
 * Format effect size for display
 */
function formatEffect(value, measure) {
  if (value === null || value === undefined) return '-';

  if (['OR', 'RR', 'HR'].includes(measure)) {
    return value.toFixed(2);
  }
  return value.toFixed(2);
}

/**
 * Render footnotes section
 */
function renderFootnotes(outcomes, eim) {
  const allFootnotes = new Map();
  let counter = 1;

  // Collect all footnotes from outcomes
  outcomes.forEach(outcome => {
    if (outcome.footnoteTexts) {
      outcome.footnoteTexts.forEach((text, idx) => {
        const key = outcome.footnotes?.[idx];
        if (key && !allFootnotes.has(key)) {
          allFootnotes.set(key, text);
        }
      });
    }
  });

  // Add EIM-related footnotes
  if (eim?.coverage && eim.coverage.coverage < 0.7) {
    allFootnotes.set('eim1', `Only ${(eim.coverage.coverage * 100).toFixed(0)}% of eligible completed trials have posted results. This may introduce substantial publication bias.`);
  }

  if (allFootnotes.size === 0) return '';

  return `
    <div class="mt-4 text-xs text-gray-600 border-t pt-4">
      <p class="font-medium mb-2">Footnotes</p>
      ${Array.from(allFootnotes.entries()).map(([key, text]) => `
        <p><sup>${key}</sup> ${text}</p>
      `).join('')}
      <p class="mt-2">* The risk in the intervention group (and its 95% confidence interval) is based on the assumed risk in the comparison group and the relative effect of the intervention.</p>
    </div>
  `;
}

/**
 * Render legend
 */
function renderLegend() {
  return `
    <div class="mt-4 p-3 bg-gray-50 rounded-lg text-xs">
      <p class="font-medium mb-2">GRADE Certainty Ratings</p>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
        ${Object.entries(CERTAINTY_LEVELS).map(([key, info]) => `
          <div class="flex items-center">
            <span style="color: ${info.color}" class="mr-1">${info.symbol}</span>
            <span class="font-medium">${info.label}:</span>
            <span class="ml-1 text-gray-600">${info.description.split('.')[0]}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

/**
 * Add component styles
 */
function addStyles() {
  if (document.getElementById('sof-table-styles')) return;

  const style = document.createElement('style');
  style.id = 'sof-table-styles';
  style.textContent = `
    .sof-table {
      font-size: 0.875rem;
      border: 1px solid #e5e7eb;
    }
    .sof-th {
      padding: 0.75rem;
      text-align: center;
      font-weight: 600;
      border: 1px solid #e5e7eb;
      vertical-align: bottom;
    }
    .sof-th-sub {
      padding: 0.5rem;
      text-align: center;
      font-weight: 500;
      font-size: 0.75rem;
      border: 1px solid #e5e7eb;
    }
    .sof-td {
      padding: 0.75rem;
      border: 1px solid #e5e7eb;
      vertical-align: top;
    }
    .sof-row:nth-child(even) {
      background-color: #f9fafb;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Format large numbers
 */
function formatNumber(n) {
  if (n === null || n === undefined) return '-';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toLocaleString();
}

/**
 * Auto-assess GRADE certainty based on analysis results
 */
export function assessCertainty(outcome, analysisResults, eim) {
  let level = 4; // Start at high

  const domains = {};

  // Assess risk of bias (from EIM)
  if (eim?.metaSummary) {
    const riskScore = eim.metaSummary.evidence_at_risk_score;
    if (riskScore > 0.5) {
      level -= 2;
      domains.risk_of_bias = 'very_serious';
    } else if (riskScore > 0.3) {
      level -= 1;
      domains.risk_of_bias = 'serious';
    } else if (riskScore > 0.1) {
      domains.risk_of_bias = 'some_concerns';
    } else {
      domains.risk_of_bias = 'no_concern';
    }
  }

  // Assess inconsistency (from I²)
  if (analysisResults?.meta_analysis?.heterogeneity) {
    const i2 = analysisResults.meta_analysis.heterogeneity.I2;
    if (i2 > 0.75) {
      level -= 2;
      domains.inconsistency = 'very_serious';
    } else if (i2 > 0.50) {
      level -= 1;
      domains.inconsistency = 'serious';
    } else if (i2 > 0.25) {
      domains.inconsistency = 'some_concerns';
    } else {
      domains.inconsistency = 'no_concern';
    }
  }

  // Assess imprecision
  if (analysisResults?.meta_analysis?.random_effects) {
    const re = analysisResults.meta_analysis.random_effects;
    const ciWidth = Math.abs(re.ci_upper - re.ci_lower);
    const estimate = Math.abs(re.estimate);

    // Check if CI crosses clinical decision threshold
    const crossesNull = (re.ci_lower <= 1 && re.ci_upper >= 1) ||
                        (re.ci_lower <= 0 && re.ci_upper >= 0);

    if (crossesNull && ciWidth > estimate) {
      level -= 2;
      domains.imprecision = 'very_serious';
    } else if (crossesNull || ciWidth > estimate * 0.5) {
      level -= 1;
      domains.imprecision = 'serious';
    } else {
      domains.imprecision = 'no_concern';
    }
  }

  // Assess publication bias
  if (analysisResults?.small_study_tests?.egger) {
    const eggerP = analysisResults.small_study_tests.egger.p_value;
    if (eggerP < 0.05) {
      level -= 1;
      domains.publication_bias = 'strongly_suspected';
    } else if (eggerP < 0.1) {
      domains.publication_bias = 'suspected';
    } else {
      domains.publication_bias = 'undetected';
    }
  }

  // Coverage-based downgrade
  if (eim?.coverage && eim.coverage.coverage < 0.5) {
    level -= 1;
  }

  // Map level to certainty
  level = Math.max(1, Math.min(4, level));
  const certaintyMap = { 4: 'high', 3: 'moderate', 2: 'low', 1: 'very_low' };

  return {
    certainty: certaintyMap[level],
    domains
  };
}

/**
 * Generate SoF data from analysis results
 */
export function generateSoFData(analysisResults, eim, projectName) {
  const re = analysisResults.meta_analysis.random_effects;
  const measure = analysisResults.meta_analysis.effect_measure;

  // Estimate control risk from included studies
  const studies = analysisResults.studies || [];
  let totalControlEvents = 0;
  let totalControlN = 0;

  studies.forEach(s => {
    if (s.control_events !== undefined && s.control_n !== undefined) {
      totalControlEvents += s.control_events;
      totalControlN += s.control_n;
    }
  });

  const controlRisk = totalControlN > 0 ? totalControlEvents / totalControlN : 0.1;

  // Assess certainty
  const { certainty, domains } = assessCertainty({}, analysisResults, eim);

  // Generate outcome
  const outcome = {
    name: analysisResults.outcome_name || 'Primary Outcome',
    measure: measure,
    effect: re.estimate,
    ci_lower: re.ci_lower,
    ci_upper: re.ci_upper,
    control_risk: controlRisk,
    n_participants: analysisResults.meta_analysis.total_n || 0,
    n_studies: analysisResults.meta_analysis.k || 0,
    certainty: certainty,
    domains: domains,
    comments: generateComments(analysisResults, eim),
    follow_up: analysisResults.follow_up || null,
    footnotes: [],
    footnoteTexts: []
  };

  // Add footnotes based on concerns
  if (eim?.coverage && eim.coverage.coverage < 0.7) {
    outcome.footnotes.push('a');
    outcome.footnoteTexts.push(`Only ${(eim.coverage.coverage * 100).toFixed(0)}% of eligible trials posted results.`);
  }

  if (analysisResults.meta_analysis.random_effects.hksj_applied) {
    outcome.footnotes.push('b');
    outcome.footnoteTexts.push('HKSJ adjustment applied to confidence interval.');
  }

  return {
    outcomes: [outcome],
    comparison: projectName || 'Intervention vs Control',
    population: 'Adults (per inclusion criteria)',
    eim: eim
  };
}

/**
 * Generate comments based on analysis
 */
function generateComments(analysisResults, eim) {
  const comments = [];

  const re = analysisResults.meta_analysis.random_effects;

  // Significance comment
  if (re.p_value < 0.05) {
    comments.push('Statistically significant difference detected.');
  } else {
    comments.push('No statistically significant difference.');
  }

  // TSA comment
  if (analysisResults.tsa) {
    if (analysisResults.tsa.conclusion === 'firm_evidence') {
      comments.push('TSA: Firm evidence reached.');
    } else {
      comments.push(`TSA: ${(analysisResults.tsa.information_fraction * 100).toFixed(0)}% of required information accrued.`);
    }
  }

  // EIM comment
  if (eim?.metaSummary?.evidence_at_risk_score > 0.3) {
    comments.push('Elevated evidence integrity concerns.');
  }

  return comments.join(' ');
}

/**
 * Export SoF table as HTML
 */
export function exportSoFHTML(data) {
  const container = document.createElement('div');
  renderSoFTable(container, data);

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Summary of Findings</title>
      <style>
        body { font-family: system-ui, sans-serif; padding: 20px; max-width: 1200px; margin: 0 auto; }
        .sof-table { width: 100%; border-collapse: collapse; font-size: 14px; }
        .sof-th, .sof-td { padding: 12px; border: 1px solid #e5e7eb; }
        .sof-th { background: #f3f4f6; font-weight: 600; text-align: center; }
        .sof-th-sub { background: #f9fafb; font-weight: 500; font-size: 12px; }
        .sof-row:nth-child(even) { background: #f9fafb; }
      </style>
    </head>
    <body>
      ${container.innerHTML}
    </body>
    </html>
  `;
}

export default {
  renderSoFTable,
  assessCertainty,
  generateSoFData,
  exportSoFHTML,
  CERTAINTY_LEVELS,
  GRADE_DOMAINS
};
