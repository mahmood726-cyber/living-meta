/**
 * Analysis Configuration and Execution Component
 * Full pairwise meta-analysis with all required outputs
 */

import { db } from '../../db/schema.js';
import { renderResultsPanel, getResultsSummary } from './results-panel.js';

// Analysis Worker instance
let analysisWorker = null;
let requestCounter = 0;
const pendingRequests = new Map();

// Component state
let analysisState = {
  projectId: null,
  extractions: [],
  config: {
    effectMeasure: 'OR',
    model: 'RE',
    tauMethod: 'REML',
    applyHKSJ: true,
    alpha: 0.05,
    // TSA settings
    tsaEnabled: true,
    tsaAlpha: 0.05,
    tsaBeta: 0.20,
    tsaAnticipatedEffect: null // Will be auto-calculated or user-specified
  },
  results: null,
  running: false,
  error: null
};

/**
 * Initialize analysis worker
 */
function initWorker() {
  if (analysisWorker) return;

  analysisWorker = new Worker(
    new URL('../../workers/analysis_worker.js', import.meta.url),
    { type: 'module' }
  );

  analysisWorker.onmessage = handleWorkerMessage;
  analysisWorker.onerror = (error) => {
    console.error('Analysis Worker error:', error);
    analysisState.error = error.message;
    analysisState.running = false;
    rerenderAnalysis();
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
    case 'ANALYSIS_STARTED':
      // Analysis started
      break;

    case 'ANALYSIS_PROGRESS':
      updateProgress(payload);
      break;

    case 'ANALYSIS_COMPLETE':
      analysisState.results = payload;
      analysisState.running = false;
      saveResults(payload);
      rerenderAnalysis();
      break;

    case 'ANALYSIS_ERROR':
      analysisState.error = payload.message;
      analysisState.running = false;
      rerenderAnalysis();
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
    analysisWorker.postMessage({ type, payload, requestId });
  });
}

/**
 * Main render function
 */
export async function render(params) {
  analysisState.projectId = params.id;

  return `
    <div id="analysis-container" class="space-y-6">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold text-gray-900">Meta-Analysis</h1>
        <div class="flex items-center gap-2">
          <a href="#/project/${params.id}/eim" class="btn-secondary text-sm">
            <svg class="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 17l-5-5m0 0l5-5m-5 5h12" />
            </svg>
            Back to EIM
          </a>
        </div>
      </div>

      <div id="analysis-content">
        <div class="flex items-center justify-center h-64">
          <div class="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full"></div>
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

  // Load extractions for this project
  const allExtractions = await db.extraction.where('projectId', params.id);
  const extractions = allExtractions.filter(e => e.verified);

  analysisState.extractions = extractions;

  // Load previous results if any
  const allResults = await db.analysisResults.where('projectId', params.id);
  const previousResults = allResults.length > 0 ? allResults[allResults.length - 1] : null;

  if (previousResults) {
    analysisState.results = previousResults.results;
    analysisState.config = { ...analysisState.config, ...previousResults.config };
  }

  rerenderAnalysis();
  bindEvents();
}

/**
 * Re-render analysis content
 */
function rerenderAnalysis() {
  const container = document.getElementById('analysis-content');
  if (!container) return;

  if (analysisState.running) {
    container.innerHTML = `
      <div class="card">
        <div class="text-center py-12">
          <div class="animate-spin w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p class="text-gray-600">Running analysis...</p>
          <p id="analysis-progress" class="text-sm text-gray-500 mt-2"></p>
        </div>
      </div>
    `;
    return;
  }

  if (analysisState.error) {
    container.innerHTML = `
      <div class="card bg-red-50 border-red-200">
        <h3 class="text-red-800 font-medium mb-2">Analysis Error</h3>
        <p class="text-red-700">${analysisState.error}</p>
        <button class="btn-secondary mt-4" onclick="window.clearAnalysisError()">Dismiss</button>
      </div>
    `;
    return;
  }

  if (analysisState.extractions.length < 2) {
    container.innerHTML = `
      <div class="card text-center py-12">
        <svg class="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <h3 class="text-lg font-medium text-gray-900 mb-2">Insufficient Data</h3>
        <p class="text-gray-600 mb-4">
          You need at least 2 verified extractions to run a meta-analysis.
          Currently have: ${analysisState.extractions.length}
        </p>
        <a href="#/project/${analysisState.projectId}/extraction" class="btn-primary">
          Complete Extractions
        </a>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    ${renderConfigPanel()}
    ${analysisState.results ? '' : renderDataPreview()}
    <div id="results-container"></div>
  `;

  if (analysisState.results) {
    const resultsContainer = document.getElementById('results-container');
    renderResultsPanel(resultsContainer, analysisState.results);
  }

  bindConfigEvents();
}

/**
 * Render configuration panel
 */
function renderConfigPanel() {
  const cfg = analysisState.config;

  return `
    <div class="card">
      <h2 class="text-lg font-semibold mb-4">Analysis Configuration</h2>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <!-- Effect Measure -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Effect Measure</label>
          <select id="effect-measure" class="w-full border rounded-md px-3 py-2">
            <option value="OR" ${cfg.effectMeasure === 'OR' ? 'selected' : ''}>Odds Ratio (OR)</option>
            <option value="RR" ${cfg.effectMeasure === 'RR' ? 'selected' : ''}>Risk Ratio (RR)</option>
            <option value="RD" ${cfg.effectMeasure === 'RD' ? 'selected' : ''}>Risk Difference (RD)</option>
            <option value="MD" ${cfg.effectMeasure === 'MD' ? 'selected' : ''}>Mean Difference (MD)</option>
            <option value="SMD" ${cfg.effectMeasure === 'SMD' ? 'selected' : ''}>Std Mean Difference (SMD)</option>
            <option value="HR" ${cfg.effectMeasure === 'HR' ? 'selected' : ''}>Hazard Ratio (HR)</option>
          </select>
        </div>

        <!-- Model -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Statistical Model</label>
          <select id="analysis-model" class="w-full border rounded-md px-3 py-2">
            <option value="RE" ${cfg.model === 'RE' ? 'selected' : ''}>Random Effects</option>
            <option value="FE" ${cfg.model === 'FE' ? 'selected' : ''}>Fixed Effect</option>
          </select>
        </div>

        <!-- Tau Estimation -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">τ² Estimation Method</label>
          <select id="tau-method" class="w-full border rounded-md px-3 py-2" ${cfg.model === 'FE' ? 'disabled' : ''}>
            <option value="REML" ${cfg.tauMethod === 'REML' ? 'selected' : ''}>REML (Restricted ML)</option>
            <option value="PM" ${cfg.tauMethod === 'PM' ? 'selected' : ''}>Paule-Mandel</option>
            <option value="DL" ${cfg.tauMethod === 'DL' ? 'selected' : ''}>DerSimonian-Laird</option>
          </select>
        </div>
      </div>

      <div class="mt-4 grid grid-cols-1 md:grid-cols-3 gap-6">
        <!-- HKSJ Adjustment -->
        <div>
          <label class="flex items-center">
            <input type="checkbox" id="apply-hksj" class="h-4 w-4 text-primary-600 rounded"
              ${cfg.applyHKSJ ? 'checked' : ''} ${cfg.model === 'FE' ? 'disabled' : ''}>
            <span class="ml-2 text-sm">Apply HKSJ adjustment</span>
          </label>
          <p class="text-xs text-gray-500 mt-1">Recommended for small number of studies</p>
        </div>

        <!-- TSA -->
        <div>
          <label class="flex items-center">
            <input type="checkbox" id="tsa-enabled" class="h-4 w-4 text-primary-600 rounded"
              ${cfg.tsaEnabled ? 'checked' : ''}>
            <span class="ml-2 text-sm">Include Trial Sequential Analysis</span>
          </label>
        </div>

        <!-- Significance Level -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Significance Level (α)</label>
          <select id="alpha-level" class="w-full border rounded-md px-3 py-2">
            <option value="0.05" ${cfg.alpha === 0.05 ? 'selected' : ''}>0.05</option>
            <option value="0.01" ${cfg.alpha === 0.01 ? 'selected' : ''}>0.01</option>
            <option value="0.10" ${cfg.alpha === 0.10 ? 'selected' : ''}>0.10</option>
          </select>
        </div>
      </div>

      <div class="mt-6 flex items-center justify-between">
        <div class="text-sm text-gray-500">
          ${analysisState.extractions.length} verified extractions ready for analysis
        </div>
        <div class="flex gap-2">
          ${analysisState.results ? `
            <button id="export-results-btn" class="btn-secondary">
              Export Results
            </button>
          ` : ''}
          <button id="run-analysis-btn" class="btn-primary">
            ${analysisState.results ? 'Re-run Analysis' : 'Run Analysis'}
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render data preview table
 */
function renderDataPreview() {
  const extractions = analysisState.extractions.slice(0, 5);

  return `
    <div class="card">
      <h3 class="text-lg font-semibold mb-4">Data Preview</h3>
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200 text-sm">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Study</th>
              <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Treatment</th>
              <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Control</th>
              <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Outcome Type</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            ${extractions.map(e => `
              <tr>
                <td class="px-3 py-2 font-medium">${e.nctId}</td>
                <td class="px-3 py-2">
                  ${e.outcomeType === 'binary' ?
                    `${e.treatment?.events || 0}/${e.treatment?.n || 0}` :
                    `${e.treatment?.mean?.toFixed(2) || '-'} ± ${e.treatment?.sd?.toFixed(2) || '-'} (n=${e.treatment?.n || 0})`
                  }
                </td>
                <td class="px-3 py-2">
                  ${e.outcomeType === 'binary' ?
                    `${e.control?.events || 0}/${e.control?.n || 0}` :
                    `${e.control?.mean?.toFixed(2) || '-'} ± ${e.control?.sd?.toFixed(2) || '-'} (n=${e.control?.n || 0})`
                  }
                </td>
                <td class="px-3 py-2 capitalize">${e.outcomeType}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ${analysisState.extractions.length > 5 ? `
        <p class="text-sm text-gray-500 mt-2">...and ${analysisState.extractions.length - 5} more studies</p>
      ` : ''}
    </div>
  `;
}

/**
 * Bind global events
 */
function bindEvents() {
  window.clearAnalysisError = () => {
    analysisState.error = null;
    rerenderAnalysis();
  };
}

/**
 * Bind configuration events
 */
function bindConfigEvents() {
  // Effect measure
  document.getElementById('effect-measure')?.addEventListener('change', (e) => {
    analysisState.config.effectMeasure = e.target.value;
  });

  // Model
  document.getElementById('analysis-model')?.addEventListener('change', (e) => {
    analysisState.config.model = e.target.value;
    const isFE = e.target.value === 'FE';
    document.getElementById('tau-method').disabled = isFE;
    document.getElementById('apply-hksj').disabled = isFE;
  });

  // Tau method
  document.getElementById('tau-method')?.addEventListener('change', (e) => {
    analysisState.config.tauMethod = e.target.value;
  });

  // HKSJ
  document.getElementById('apply-hksj')?.addEventListener('change', (e) => {
    analysisState.config.applyHKSJ = e.target.checked;
  });

  // TSA
  document.getElementById('tsa-enabled')?.addEventListener('change', (e) => {
    analysisState.config.tsaEnabled = e.target.checked;
  });

  // Alpha
  document.getElementById('alpha-level')?.addEventListener('change', (e) => {
    analysisState.config.alpha = parseFloat(e.target.value);
  });

  // Run analysis
  document.getElementById('run-analysis-btn')?.addEventListener('click', runAnalysis);

  // Export results
  document.getElementById('export-results-btn')?.addEventListener('click', exportResults);
}

/**
 * Run the analysis
 */
async function runAnalysis() {
  analysisState.running = true;
  analysisState.error = null;
  rerenderAnalysis();

  try {
    await sendToWorker('RUN_ANALYSIS', {
      extractions: analysisState.extractions,
      config: analysisState.config,
      projectId: analysisState.projectId
    });
  } catch (error) {
    analysisState.error = error.message;
    analysisState.running = false;
    rerenderAnalysis();
  }
}

/**
 * Update progress display
 */
function updateProgress(progress) {
  const el = document.getElementById('analysis-progress');
  if (el) {
    el.textContent = progress.message || `${progress.step}...`;
  }
}

/**
 * Save results to database
 */
async function saveResults(results) {
  await db.analysisResults.put({
    id: crypto.randomUUID(),
    projectId: analysisState.projectId,
    timestamp: new Date().toISOString(),
    config: analysisState.config,
    results: results,
    summary: getResultsSummary(results)
  });
}

/**
 * Export results
 */
function exportResults() {
  if (!analysisState.results) return;

  const exportData = {
    projectId: analysisState.projectId,
    exportedAt: new Date().toISOString(),
    config: analysisState.config,
    results: analysisState.results,
    summary: getResultsSummary(analysisState.results)
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `analysis_${analysisState.projectId}_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export default { render, init };
