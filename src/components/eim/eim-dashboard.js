/**
 * Evidence Integrity Module Dashboard
 * Full EIM UI with trial-level flags and meta-level summaries
 */

import { db } from '../../db/schema.js';

// EIM Worker instance
let eimWorker = null;
let requestCounter = 0;
const pendingRequests = new Map();

// State
let eimState = {
  projectId: null,
  trials: [],
  trialFlags: [],
  coverage: null,
  metaSummary: null,
  dataQuality: [],
  loading: false,
  error: null,
  selectedTrial: null,
  sortBy: 'risk_score',
  sortDir: 'desc',
  filterRisk: 'all'
};

/**
 * Initialize EIM worker
 */
function initWorker() {
  if (eimWorker) return;

  eimWorker = new Worker(
    new URL('../../workers/eim_worker.js', import.meta.url),
    { type: 'module' }
  );

  eimWorker.onmessage = handleWorkerMessage;
  eimWorker.onerror = (error) => {
    console.error('EIM Worker error:', error);
    eimState.error = error.message;
    eimState.loading = false;
    rerenderDashboard();
  };
}

/**
 * Handle worker messages
 */
function handleWorkerMessage(event) {
  const { type, payload, requestId, error } = event.data;

  if (error) {
    const reject = pendingRequests.get(requestId)?.reject;
    if (reject) reject(new Error(error));
    pendingRequests.delete(requestId);
    return;
  }

  switch (type) {
    case 'EIM_STARTED':
      // EIM analysis started
      break;

    case 'EIM_TRIAL_FLAGS':
      eimState.trialFlags = payload;
      break;

    case 'COVERAGE_ASSESSMENT':
      eimState.coverage = payload;
      break;

    case 'EIM_META_SUMMARY':
      eimState.metaSummary = payload;
      break;

    case 'DATA_QUALITY_ASSESSMENT':
      eimState.dataQuality = payload;
      break;

    case 'EIM_FULL_COMPLETE':
      eimState.trialFlags = payload.trial_flags;
      eimState.coverage = payload.coverage;
      eimState.metaSummary = payload.meta_summary;
      eimState.dataQuality = payload.data_quality || [];
      eimState.loading = false;
      rerenderDashboard();
      break;
  }

  const resolve = pendingRequests.get(requestId)?.resolve;
  if (resolve) resolve(payload);
  pendingRequests.delete(requestId);
}

/**
 * Send message to worker
 */
function sendToWorker(type, payload) {
  const requestId = ++requestCounter;

  return new Promise((resolve, reject) => {
    pendingRequests.set(requestId, { resolve, reject });
    eimWorker.postMessage({ type, payload, requestId });
  });
}

/**
 * Main render function
 */
export async function render(params) {
  eimState.projectId = params.id;

  return `
    <div id="eim-dashboard" class="space-y-6">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold text-gray-900">Evidence Integrity Module</h1>
        <button id="eim-refresh" class="btn-secondary">
          <svg class="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh Analysis
        </button>
      </div>

      <div id="eim-content">
        <div class="flex items-center justify-center h-64">
          <div class="text-center">
            <div class="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p class="text-gray-500">Loading EIM analysis...</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Initialize component
 */
export async function init(params) {
  initWorker();

  // Get trials for this project
  const screening = await db.screening.where('projectId', params.id);
  const includedNctIds = screening
    .filter(s => s.decision === 'include')
    .map(s => s.nctId)
    .filter(Boolean);

  // Get trial records
  const records = await Promise.all(
    includedNctIds.map(id => db.records.get(id))
  );
  eimState.trials = records.filter(Boolean);

  // Get extractions
  const extractions = await db.extraction.where('projectId', params.id);

  // Run full EIM analysis
  eimState.loading = true;

  await sendToWorker('FULL_EIM_ANALYSIS', {
    trials: eimState.trials,
    extractions: extractions,
    projectId: params.id
  });

  // Bind events
  bindEvents();
}

/**
 * Bind event handlers
 */
function bindEvents() {
  document.getElementById('eim-refresh')?.addEventListener('click', async () => {
    eimState.loading = true;
    rerenderDashboard();

    const extractions = await db.extraction.where('projectId', eimState.projectId);

    await sendToWorker('FULL_EIM_ANALYSIS', {
      trials: eimState.trials,
      extractions: extractions,
      projectId: eimState.projectId
    });
  });
}

/**
 * Re-render dashboard content
 */
function rerenderDashboard() {
  const container = document.getElementById('eim-content');
  if (!container) return;

  if (eimState.loading) {
    container.innerHTML = `
      <div class="flex items-center justify-center h-64">
        <div class="text-center">
          <div class="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p class="text-gray-500">Computing evidence integrity flags...</p>
        </div>
      </div>
    `;
    return;
  }

  if (eimState.error) {
    container.innerHTML = `
      <div class="bg-red-50 text-red-700 p-4 rounded-lg">
        <p class="font-medium">Error computing EIM analysis</p>
        <p class="text-sm mt-1">${eimState.error}</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    ${renderCoverageBanner()}
    ${renderOverallAssessment()}
    ${renderRiskDistribution()}
    ${renderTrialFlagsTable()}
    ${renderNavigationButtons()}
  `;

  bindTableEvents();
}

/**
 * Render coverage banner
 */
function renderCoverageBanner() {
  const coverage = eimState.coverage;
  if (!coverage) return '';

  const percent = coverage.coverage !== null ? (coverage.coverage * 100).toFixed(1) : 'N/A';

  let bannerClass, icon, title;
  switch (coverage.assessment) {
    case 'adequate':
      bannerClass = 'bg-green-50 border-green-500 text-green-800';
      icon = '<svg class="h-6 w-6 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" /></svg>';
      title = 'Adequate Results Coverage';
      break;
    case 'marginal':
      bannerClass = 'bg-yellow-50 border-yellow-500 text-yellow-800';
      icon = '<svg class="h-6 w-6 text-yellow-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" /></svg>';
      title = 'Marginal Results Coverage';
      break;
    case 'insufficient':
      bannerClass = 'bg-red-50 border-red-500 text-red-800';
      icon = '<svg class="h-6 w-6 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" /></svg>';
      title = 'Insufficient Results Coverage';
      break;
    default:
      bannerClass = 'bg-gray-50 border-gray-500 text-gray-800';
      icon = '<svg class="h-6 w-6 text-gray-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" /></svg>';
      title = 'Coverage Not Assessable';
  }

  return `
    <div class="card ${bannerClass} border-l-4 mb-6">
      <div class="flex items-start">
        <div class="flex-shrink-0">${icon}</div>
        <div class="ml-3 flex-1">
          <h3 class="text-lg font-semibold">${title}: ${percent}%</h3>
          <p class="mt-1 text-sm">
            ${coverage.with_results_count} of ${coverage.eligible_count} eligible completed trials have posted results.
          </p>
          ${coverage.warning ? `<p class="mt-2 text-sm font-medium">${coverage.warning}</p>` : ''}
          ${!coverage.can_analyze ? `
            <div class="mt-3 p-3 bg-white/50 rounded">
              <p class="font-medium">Analysis blocked: Override required</p>
              <p class="text-sm mt-1">Results coverage is below minimum threshold. You can override this restriction with acknowledgment of limitations.</p>
              <button class="btn-secondary mt-2" onclick="window.overrideCoverage && window.overrideCoverage()">
                Override and Continue
              </button>
            </div>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

/**
 * Render overall EIM assessment
 */
function renderOverallAssessment() {
  const summary = eimState.metaSummary;
  if (!summary) return '';

  const assessment = summary.overall_assessment;

  let levelClass;
  switch (assessment.level) {
    case 'acceptable': levelClass = 'bg-green-100 text-green-800'; break;
    case 'moderate': levelClass = 'bg-yellow-100 text-yellow-800'; break;
    case 'elevated': levelClass = 'bg-orange-100 text-orange-800'; break;
    case 'concerning': levelClass = 'bg-red-100 text-red-800'; break;
    case 'critical': levelClass = 'bg-red-200 text-red-900'; break;
    default: levelClass = 'bg-gray-100 text-gray-800';
  }

  return `
    <div class="card mb-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold">Overall Evidence Integrity Assessment</h2>
        <span class="px-3 py-1 rounded-full text-sm font-medium ${levelClass}">
          ${assessment.level.toUpperCase()}
        </span>
      </div>
      <p class="text-gray-700 mb-4">${assessment.message}</p>

      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="p-4 bg-gray-50 rounded-lg text-center">
          <p class="text-2xl font-bold text-gray-900">${summary.total_trials}</p>
          <p class="text-sm text-gray-500">Total Trials</p>
        </div>
        <div class="p-4 bg-green-50 rounded-lg text-center">
          <p class="text-2xl font-bold text-green-700">${summary.trials_with_results}</p>
          <p class="text-sm text-green-600">With Results</p>
        </div>
        <div class="p-4 bg-orange-50 rounded-lg text-center">
          <p class="text-2xl font-bold text-orange-700">${summary.early_termination_count}</p>
          <p class="text-sm text-orange-600">Early Terminated</p>
        </div>
        <div class="p-4 bg-blue-50 rounded-lg text-center">
          <p class="text-2xl font-bold text-blue-700">${formatNumber(summary.missing_participant_years)}</p>
          <p class="text-sm text-blue-600">Missing Participant-Years</p>
        </div>
      </div>

      <div class="mt-4 p-4 bg-primary-50 rounded-lg">
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium text-primary-900">Evidence-at-Risk Score</span>
          <span class="text-lg font-bold text-primary-900">${(summary.evidence_at_risk_score * 100).toFixed(1)}%</span>
        </div>
        <div class="mt-2 h-3 bg-primary-200 rounded-full overflow-hidden">
          <div class="h-full bg-primary-600 rounded-full" style="width: ${summary.evidence_at_risk_score * 100}%"></div>
        </div>
        <p class="text-xs text-primary-700 mt-2">
          Composite of: Missing results (50%), Outcome mismatch (30%), Early termination (20%)
        </p>
      </div>
    </div>
  `;
}

/**
 * Render risk distribution chart
 */
function renderRiskDistribution() {
  const summary = eimState.metaSummary;
  if (!summary || !summary.risk_distribution) return '';

  const dist = summary.risk_distribution;
  const total = dist.high + dist.moderate + dist.low + dist.minimal;

  if (total === 0) return '';

  const pctHigh = (dist.high / total * 100).toFixed(1);
  const pctMod = (dist.moderate / total * 100).toFixed(1);
  const pctLow = (dist.low / total * 100).toFixed(1);
  const pctMin = (dist.minimal / total * 100).toFixed(1);

  return `
    <div class="card mb-6">
      <h2 class="text-lg font-semibold mb-4">Risk Distribution</h2>

      <div class="grid grid-cols-4 gap-4 mb-4">
        <div class="text-center cursor-pointer hover:bg-red-50 p-2 rounded" onclick="filterByRisk('high')">
          <div class="text-3xl font-bold text-red-600">${dist.high}</div>
          <div class="text-sm text-red-700">High Risk</div>
        </div>
        <div class="text-center cursor-pointer hover:bg-orange-50 p-2 rounded" onclick="filterByRisk('moderate')">
          <div class="text-3xl font-bold text-orange-500">${dist.moderate}</div>
          <div class="text-sm text-orange-600">Moderate</div>
        </div>
        <div class="text-center cursor-pointer hover:bg-yellow-50 p-2 rounded" onclick="filterByRisk('low')">
          <div class="text-3xl font-bold text-yellow-500">${dist.low}</div>
          <div class="text-sm text-yellow-600">Low</div>
        </div>
        <div class="text-center cursor-pointer hover:bg-green-50 p-2 rounded" onclick="filterByRisk('minimal')">
          <div class="text-3xl font-bold text-green-500">${dist.minimal}</div>
          <div class="text-sm text-green-600">Minimal</div>
        </div>
      </div>

      <div class="h-6 flex rounded-full overflow-hidden">
        <div class="bg-red-500" style="width: ${pctHigh}%" title="High: ${pctHigh}%"></div>
        <div class="bg-orange-400" style="width: ${pctMod}%" title="Moderate: ${pctMod}%"></div>
        <div class="bg-yellow-400" style="width: ${pctLow}%" title="Low: ${pctLow}%"></div>
        <div class="bg-green-400" style="width: ${pctMin}%" title="Minimal: ${pctMin}%"></div>
      </div>

      <div class="flex justify-between text-xs text-gray-500 mt-2">
        <span>High ({${pctHigh}%)</span>
        <span>Moderate (${pctMod}%)</span>
        <span>Low (${pctLow}%)</span>
        <span>Minimal (${pctMin}%)</span>
      </div>
    </div>
  `;
}

/**
 * Render trial flags table
 */
function renderTrialFlagsTable() {
  let flags = [...eimState.trialFlags];

  // Filter
  if (eimState.filterRisk !== 'all') {
    flags = flags.filter(f => f.risk_level === eimState.filterRisk);
  }

  // Sort
  flags.sort((a, b) => {
    let aVal, bVal;
    switch (eimState.sortBy) {
      case 'risk_score':
        aVal = a.composite_risk_score || 0;
        bVal = b.composite_risk_score || 0;
        break;
      case 'nct_id':
        aVal = a.nct_id;
        bVal = b.nct_id;
        break;
      case 'non_publication':
        aVal = riskToNumber(a.non_publication_risk);
        bVal = riskToNumber(b.non_publication_risk);
        break;
      case 'outcome':
        aVal = riskToNumber(a.outcome_reporting_risk);
        bVal = riskToNumber(b.outcome_reporting_risk);
        break;
      default:
        aVal = a.composite_risk_score || 0;
        bVal = b.composite_risk_score || 0;
    }

    if (eimState.sortDir === 'desc') {
      return typeof aVal === 'string' ? bVal.localeCompare(aVal) : bVal - aVal;
    }
    return typeof aVal === 'string' ? aVal.localeCompare(bVal) : aVal - bVal;
  });

  return `
    <div class="card">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold">Trial-Level Flags</h2>
        <div class="flex items-center gap-2">
          <select id="eim-risk-filter" class="text-sm border rounded px-2 py-1">
            <option value="all" ${eimState.filterRisk === 'all' ? 'selected' : ''}>All Risks</option>
            <option value="high" ${eimState.filterRisk === 'high' ? 'selected' : ''}>High Only</option>
            <option value="moderate" ${eimState.filterRisk === 'moderate' ? 'selected' : ''}>Moderate Only</option>
            <option value="low" ${eimState.filterRisk === 'low' ? 'selected' : ''}>Low Only</option>
            <option value="minimal" ${eimState.filterRisk === 'minimal' ? 'selected' : ''}>Minimal Only</option>
          </select>
          <button id="eim-export-csv" class="btn-secondary text-sm">Export CSV</button>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100" data-sort="nct_id">
                NCT ID
              </th>
              <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100" data-sort="risk_score">
                Risk Score
              </th>
              <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100" data-sort="non_publication">
                Non-Publication
              </th>
              <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100" data-sort="outcome">
                Outcome Reporting
              </th>
              <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                Timepoint
              </th>
              <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                Sample Size
              </th>
              <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            ${flags.map(f => renderTrialRow(f)).join('')}
          </tbody>
        </table>
      </div>

      ${flags.length === 0 ? `
        <div class="text-center py-8 text-gray-500">
          No trials match the current filter.
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Render a single trial row
 */
function renderTrialRow(flag) {
  return `
    <tr class="hover:bg-gray-50" data-nct="${flag.nct_id}">
      <td class="px-3 py-2 text-sm font-medium text-primary-600">
        <a href="https://clinicaltrials.gov/study/${flag.nct_id}" target="_blank" class="hover:underline">
          ${flag.nct_id}
        </a>
      </td>
      <td class="px-3 py-2">
        ${renderRiskBadge(flag.risk_level, (flag.composite_risk_score * 100).toFixed(0) + '%')}
      </td>
      <td class="px-3 py-2">
        ${renderRiskIndicator(flag.non_publication_risk, flag.months_since_completion ? `${flag.months_since_completion}mo` : null)}
      </td>
      <td class="px-3 py-2">
        ${renderRiskIndicator(flag.outcome_reporting_risk, flag.outcome_match ? `Match: ${(flag.outcome_match * 100).toFixed(0)}%` : null)}
      </td>
      <td class="px-3 py-2">
        ${renderRiskIndicator(flag.timepoint_switching_risk)}
      </td>
      <td class="px-3 py-2">
        ${renderSampleSizeCell(flag)}
      </td>
      <td class="px-3 py-2">
        <button class="text-primary-600 hover:text-primary-800 text-sm" onclick="showTrialDetails('${flag.nct_id}')">
          Details
        </button>
      </td>
    </tr>
  `;
}

/**
 * Render risk badge
 */
function renderRiskBadge(level, value) {
  let classes;
  switch (level) {
    case 'high': classes = 'bg-red-100 text-red-800'; break;
    case 'moderate': classes = 'bg-orange-100 text-orange-800'; break;
    case 'low': classes = 'bg-yellow-100 text-yellow-800'; break;
    case 'minimal': classes = 'bg-green-100 text-green-800'; break;
    default: classes = 'bg-gray-100 text-gray-800';
  }

  return `<span class="px-2 py-1 rounded text-xs font-medium ${classes}">${value || level}</span>`;
}

/**
 * Render risk indicator
 */
function renderRiskIndicator(level, detail = null) {
  if (!level || level === 'not_assessable') {
    return '<span class="text-gray-400 text-sm">N/A</span>';
  }

  let dot;
  switch (level) {
    case 'high': dot = 'bg-red-500'; break;
    case 'moderate': dot = 'bg-orange-400'; break;
    case 'low': dot = 'bg-yellow-400'; break;
    case 'none':
    case 'minimal': dot = 'bg-green-400'; break;
    default: dot = 'bg-gray-300';
  }

  return `
    <div class="flex items-center gap-2">
      <span class="w-2 h-2 rounded-full ${dot}"></span>
      <span class="text-sm capitalize">${level}</span>
      ${detail ? `<span class="text-xs text-gray-500">(${detail})</span>` : ''}
    </div>
  `;
}

/**
 * Render sample size cell
 */
function renderSampleSizeCell(flag) {
  if (flag.planned_n === null) {
    return '<span class="text-gray-400 text-sm">N/A</span>';
  }

  const indicators = [];

  if (flag.early_termination_flag) {
    indicators.push('<span class="text-red-600 text-xs">Early term</span>');
  }
  if (flag.over_enrollment_flag) {
    indicators.push('<span class="text-yellow-600 text-xs">Over-enrolled</span>');
  }

  if (indicators.length === 0) {
    return `<span class="text-gray-600 text-sm">n=${flag.planned_n}</span>`;
  }

  return `
    <div>
      <span class="text-gray-600 text-sm">n=${flag.planned_n}</span>
      <div class="flex gap-1 mt-1">${indicators.join('')}</div>
    </div>
  `;
}

/**
 * Render navigation buttons
 */
function renderNavigationButtons() {
  const canContinue = eimState.coverage?.can_analyze !== false;

  return `
    <div class="flex justify-between items-center mt-6">
      <a href="#/project/${eimState.projectId}/extraction" class="btn-secondary">
        <svg class="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 17l-5-5m0 0l5-5m-5 5h12" />
        </svg>
        Back to Extraction
      </a>
      ${canContinue ? `
        <a href="#/project/${eimState.projectId}/analysis" class="btn-primary">
          Continue to Analysis
          <svg class="w-4 h-4 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </a>
      ` : `
        <button class="btn-primary opacity-50 cursor-not-allowed" disabled title="Coverage override required">
          Analysis Blocked
        </button>
      `}
    </div>
  `;
}

/**
 * Bind table events
 */
function bindTableEvents() {
  // Sort headers
  document.querySelectorAll('[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const sortBy = th.dataset.sort;
      if (eimState.sortBy === sortBy) {
        eimState.sortDir = eimState.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        eimState.sortBy = sortBy;
        eimState.sortDir = 'desc';
      }
      rerenderDashboard();
    });
  });

  // Risk filter
  document.getElementById('eim-risk-filter')?.addEventListener('change', (e) => {
    eimState.filterRisk = e.target.value;
    rerenderDashboard();
  });

  // Export CSV
  document.getElementById('eim-export-csv')?.addEventListener('click', exportFlagsCSV);

  // Global functions for onclick handlers
  window.filterByRisk = (risk) => {
    eimState.filterRisk = risk;
    rerenderDashboard();
  };

  window.showTrialDetails = (nctId) => {
    const flag = eimState.trialFlags.find(f => f.nct_id === nctId);
    if (flag) showTrialDetailsModal(flag);
  };

  window.overrideCoverage = async () => {
    if (confirm('You are overriding the coverage requirement. Results may be substantially biased by missing data. Continue?')) {
      eimState.coverage.can_analyze = true;
      rerenderDashboard();
    }
  };
}

/**
 * Show trial details modal
 */
function showTrialDetailsModal(flag) {
  const trial = eimState.trials.find(t => t.nctId === flag.nct_id);

  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50';
  modal.onclick = (e) => {
    if (e.target === modal) modal.remove();
  };

  modal.innerHTML = `
    <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
      <div class="p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold">
            <a href="https://clinicaltrials.gov/study/${flag.nct_id}" target="_blank" class="text-primary-600 hover:underline">
              ${flag.nct_id}
            </a>
          </h3>
          <button onclick="this.closest('.fixed').remove()" class="text-gray-400 hover:text-gray-600">
            <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        ${trial ? `<p class="text-gray-600 mb-4">${trial.briefTitle || 'No title'}</p>` : ''}

        <div class="space-y-4">
          <div class="p-4 bg-gray-50 rounded-lg">
            <h4 class="font-medium mb-2">Composite Risk</h4>
            <div class="flex items-center gap-4">
              ${renderRiskBadge(flag.risk_level, flag.risk_level.toUpperCase())}
              <span class="text-2xl font-bold">${(flag.composite_risk_score * 100).toFixed(1)}%</span>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div class="p-4 border rounded-lg">
              <h4 class="font-medium mb-2">Non-Publication Risk</h4>
              ${renderRiskIndicator(flag.non_publication_risk)}
              ${flag.completion_date ? `<p class="text-sm text-gray-500 mt-2">Completed: ${new Date(flag.completion_date).toLocaleDateString()}</p>` : ''}
              ${flag.months_since_completion ? `<p class="text-sm text-gray-500">Months since: ${flag.months_since_completion}</p>` : ''}
              <p class="text-sm mt-2">Results posted: ${flag.results_posted ? 'Yes' : 'No'}</p>
            </div>

            <div class="p-4 border rounded-lg">
              <h4 class="font-medium mb-2">Outcome Reporting</h4>
              ${renderRiskIndicator(flag.outcome_reporting_risk)}
              ${flag.registered_primary ? `<p class="text-sm text-gray-500 mt-2">Registered: ${flag.registered_primary}</p>` : ''}
              ${flag.reported_primary ? `<p class="text-sm text-gray-500">Reported: ${flag.reported_primary}</p>` : ''}
              ${flag.outcome_match !== null ? `<p class="text-sm mt-2">Match score: ${(flag.outcome_match * 100).toFixed(0)}%</p>` : ''}
            </div>

            <div class="p-4 border rounded-lg">
              <h4 class="font-medium mb-2">Timepoint Switching</h4>
              ${renderRiskIndicator(flag.timepoint_switching_risk)}
              ${flag.registered_timepoint_months !== null ? `<p class="text-sm text-gray-500 mt-2">Registered: ${flag.registered_timepoint_months} months</p>` : ''}
              ${flag.reported_timepoint_months !== null ? `<p class="text-sm text-gray-500">Reported: ${flag.reported_timepoint_months} months</p>` : ''}
            </div>

            <div class="p-4 border rounded-lg">
              <h4 class="font-medium mb-2">Sample Size</h4>
              ${renderRiskIndicator(flag.sample_size_risk)}
              ${flag.planned_n !== null ? `<p class="text-sm text-gray-500 mt-2">Planned N: ${flag.planned_n}</p>` : ''}
              ${flag.actual_n !== null ? `<p class="text-sm text-gray-500">Actual N: ${flag.actual_n}</p>` : ''}
              ${flag.n_ratio !== null ? `<p class="text-sm text-gray-500">Ratio: ${(flag.n_ratio * 100).toFixed(0)}%</p>` : ''}
              ${flag.early_termination_flag ? `<p class="text-sm text-red-600 mt-2">Early termination flagged</p>` : ''}
            </div>
          </div>
        </div>

        <div class="mt-6 flex justify-end">
          <button onclick="this.closest('.fixed').remove()" class="btn-secondary">Close</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
}

/**
 * Export flags to CSV
 */
function exportFlagsCSV() {
  const headers = [
    'NCT ID',
    'Risk Level',
    'Composite Score',
    'Non-Publication Risk',
    'Months Since Completion',
    'Results Posted',
    'Outcome Reporting Risk',
    'Outcome Match Score',
    'Timepoint Risk',
    'Sample Size Risk',
    'Planned N',
    'Actual N',
    'Early Termination'
  ];

  const rows = eimState.trialFlags.map(f => [
    f.nct_id,
    f.risk_level,
    f.composite_risk_score,
    f.non_publication_risk,
    f.months_since_completion,
    f.results_posted,
    f.outcome_reporting_risk,
    f.outcome_match,
    f.timepoint_switching_risk,
    f.sample_size_risk,
    f.planned_n,
    f.actual_n,
    f.early_termination_flag
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `eim_flags_${eimState.projectId}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Convert risk level to number for sorting
 */
function riskToNumber(level) {
  switch (level) {
    case 'high': return 4;
    case 'moderate': return 3;
    case 'low': return 2;
    case 'minimal':
    case 'none': return 1;
    default: return 0;
  }
}

/**
 * Format large numbers
 */
function formatNumber(n) {
  if (n === null || n === undefined) return 'N/A';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
}

export default { render, init };
