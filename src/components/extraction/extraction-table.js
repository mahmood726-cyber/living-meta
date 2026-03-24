/**
 * Extraction Table Component
 * Full-featured data extraction interface with outcome matching and quality flags
 */

import { db } from '../../db/schema.js';
import { router } from '../../router.js';
import { matchAllOutcomes, detectOutcomeReportingBias } from '../../lib/outcome-matching.js';
import { autoImputeSD } from '../../lib/sd-imputation.js';
import { assessDataQuality, QUALITY_FLAGS } from '../../config/quality-flags.js';

// Extraction state
let extractionState = {
  projectId: null,
  records: [],
  extractions: new Map(),
  currentNctId: null,
  outcomeType: 'binary', // binary, continuous, survival
  selectedTimepoint: null
};

/**
 * Main render function
 */
export async function render(params) {
  const projectId = params.id;
  extractionState.projectId = projectId;

  // Get included trials
  const screeningRecords = await db.screening.where('projectId', projectId);
  const includedNctIds = screeningRecords
    .filter(s => s.decision === 'include')
    .map(s => s.nctId);

  // Get records for included trials (fetch each by nctId)
  const recordPromises = includedNctIds.map(id => db.records.get(id));
  const recordsRaw = await Promise.all(recordPromises);
  const records = recordsRaw.filter(Boolean); // Remove any null/undefined entries
  extractionState.records = records;

  // Get existing extractions
  const extractions = await db.extraction.where('projectId', projectId);
  extractionState.extractions = new Map(extractions.map(e => [e.nctId, e]));

  // Statistics
  const stats = {
    total: records.length,
    withResults: records.filter(r => r.hasResults).length,
    extracted: extractions.length,
    verified: extractions.filter(e => e.verified).length,
    pending: records.length - extractions.length
  };

  // Current record for detailed view
  const currentRecord = extractionState.currentNctId
    ? records.find(r => r.nctId === extractionState.currentNctId)
    : null;

  return `
    <div class="extraction-container space-y-6">
      <!-- Header with stats -->
      <div class="card">
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-xl font-bold">Data Extraction</h2>
          <div class="flex space-x-2">
            <button id="auto-extract-btn" class="btn-secondary text-sm" ${stats.withResults === 0 ? 'disabled' : ''}>
              <svg class="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Auto-Extract All
            </button>
            <button id="export-data-btn" class="btn-secondary text-sm">
              <svg class="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export CSV
            </button>
          </div>
        </div>

        <!-- Stats grid -->
        <div class="grid grid-cols-5 gap-4 mb-4">
          <div class="text-center p-3 bg-gray-50 rounded-lg">
            <p class="text-2xl font-bold text-gray-900">${stats.total}</p>
            <p class="text-xs text-gray-500">Included</p>
          </div>
          <div class="text-center p-3 bg-blue-50 rounded-lg">
            <p class="text-2xl font-bold text-blue-600">${stats.withResults}</p>
            <p class="text-xs text-blue-500">With Results</p>
          </div>
          <div class="text-center p-3 bg-green-50 rounded-lg">
            <p class="text-2xl font-bold text-green-600">${stats.extracted}</p>
            <p class="text-xs text-green-500">Extracted</p>
          </div>
          <div class="text-center p-3 bg-purple-50 rounded-lg">
            <p class="text-2xl font-bold text-purple-600">${stats.verified}</p>
            <p class="text-xs text-purple-500">Verified</p>
          </div>
          <div class="text-center p-3 bg-yellow-50 rounded-lg">
            <p class="text-2xl font-bold text-yellow-600">${stats.pending}</p>
            <p class="text-xs text-yellow-500">Pending</p>
          </div>
        </div>

        <!-- Progress bar -->
        <div class="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div class="h-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-300"
               style="width: ${stats.total > 0 ? (stats.extracted / stats.total * 100) : 0}%"></div>
        </div>
      </div>

      <!-- Main content area -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Records list -->
        <div class="lg:col-span-1">
          <div class="card max-h-[600px] overflow-hidden flex flex-col">
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-semibold">Studies</h3>
              <select id="filter-records" class="text-sm rounded border-gray-300">
                <option value="all">All</option>
                <option value="pending">Pending</option>
                <option value="extracted">Extracted</option>
                <option value="with-results">With Results</option>
              </select>
            </div>
            <div class="overflow-y-auto flex-1 space-y-2">
              ${renderRecordsList(records)}
            </div>
          </div>
        </div>

        <!-- Extraction form -->
        <div class="lg:col-span-2">
          ${currentRecord ? renderExtractionForm(currentRecord) : renderNoSelection()}
        </div>
      </div>

      <!-- Proceed button -->
      ${stats.extracted > 0 ? `
        <div class="flex justify-end">
          <a href="#/project/${projectId}/eim" class="btn-primary">
            Continue to Evidence Integrity (${stats.extracted} studies)
            <svg class="w-4 h-4 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </a>
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Render the list of records
 */
function renderRecordsList(records) {
  return records.map(record => {
    const extraction = extractionState.extractions.get(record.nctId);
    const isSelected = extractionState.currentNctId === record.nctId;

    return `
      <div class="record-item p-3 rounded-lg cursor-pointer transition ${isSelected ? 'bg-primary-100 border-2 border-primary-500' : 'bg-gray-50 hover:bg-gray-100'}"
           data-nct="${record.nctId}">
        <div class="flex justify-between items-start">
          <span class="text-sm font-mono text-primary-600">${record.nctId}</span>
          <div class="flex space-x-1">
            ${record.hasResults ? '<span class="w-2 h-2 rounded-full bg-green-500" title="Has Results"></span>' : ''}
            ${extraction ? '<span class="w-2 h-2 rounded-full bg-blue-500" title="Extracted"></span>' : ''}
            ${extraction?.verified ? '<span class="w-2 h-2 rounded-full bg-purple-500" title="Verified"></span>' : ''}
          </div>
        </div>
        <p class="text-xs text-gray-600 mt-1 line-clamp-2">${escapeHtml(record.briefTitle)}</p>
        <div class="flex items-center space-x-2 mt-2 text-xs">
          <span class="px-1.5 py-0.5 rounded ${record.hasResults ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}">
            ${record.hasResults ? 'Results' : 'No results'}
          </span>
          ${extraction ? `
            <span class="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
              ${extraction.outcomeType}
            </span>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Render extraction form for a record
 */
function renderExtractionForm(record) {
  const extraction = extractionState.extractions.get(record.nctId);

  return `
    <div class="card">
      <div class="flex justify-between items-start mb-4">
        <div>
          <h3 class="font-semibold text-lg">${escapeHtml(record.briefTitle)}</h3>
          <a href="https://clinicaltrials.gov/study/${record.nctId}" target="_blank"
             class="text-sm text-primary-600 hover:underline">${record.nctId}</a>
        </div>
        ${extraction?.verified ? `
          <span class="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-medium">
            Verified
          </span>
        ` : ''}
      </div>

      <!-- Study info -->
      <div class="grid grid-cols-4 gap-3 mb-6 text-sm">
        <div class="p-2 bg-gray-50 rounded">
          <span class="text-xs text-gray-500 block">Phase</span>
          <span class="font-medium">${record.phase || 'N/A'}</span>
        </div>
        <div class="p-2 bg-gray-50 rounded">
          <span class="text-xs text-gray-500 block">Enrollment</span>
          <span class="font-medium">${record.enrollmentCount || 'N/A'}</span>
        </div>
        <div class="p-2 bg-gray-50 rounded">
          <span class="text-xs text-gray-500 block">Status</span>
          <span class="font-medium">${record.overallStatus || 'N/A'}</span>
        </div>
        <div class="p-2 bg-gray-50 rounded">
          <span class="text-xs text-gray-500 block">Has Results</span>
          <span class="font-medium ${record.hasResults ? 'text-green-600' : 'text-yellow-600'}">
            ${record.hasResults ? 'Yes' : 'No'}
          </span>
        </div>
      </div>

      <!-- Outcome type selector -->
      <div class="mb-6">
        <label class="block text-sm font-medium text-gray-700 mb-2">Outcome Type</label>
        <div class="flex space-x-4">
          <label class="inline-flex items-center">
            <input type="radio" name="outcomeType" value="binary"
                   ${extractionState.outcomeType === 'binary' ? 'checked' : ''}
                   class="form-radio text-primary-600">
            <span class="ml-2 text-sm">Binary (Events/N)</span>
          </label>
          <label class="inline-flex items-center">
            <input type="radio" name="outcomeType" value="continuous"
                   ${extractionState.outcomeType === 'continuous' ? 'checked' : ''}
                   class="form-radio text-primary-600">
            <span class="ml-2 text-sm">Continuous (Mean/SD)</span>
          </label>
          <label class="inline-flex items-center">
            <input type="radio" name="outcomeType" value="survival"
                   ${extractionState.outcomeType === 'survival' ? 'checked' : ''}
                   class="form-radio text-primary-600">
            <span class="ml-2 text-sm">Survival (HR)</span>
          </label>
        </div>
      </div>

      <!-- Extraction form based on outcome type -->
      ${renderOutcomeForm(record, extraction)}

      <!-- Quality flags -->
      ${extraction && extraction.qualityFlags?.length > 0 ? `
        <div class="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h4 class="font-medium text-yellow-800 mb-2">Data Quality Flags</h4>
          <ul class="text-sm text-yellow-700 space-y-1">
            ${extraction.qualityFlags.map(flag => `
              <li class="flex items-center space-x-2">
                <span class="w-2 h-2 rounded-full ${flag.severity === 'high' ? 'bg-red-500' : 'bg-yellow-500'}"></span>
                <span>${flag.description}</span>
              </li>
            `).join('')}
          </ul>
        </div>
      ` : ''}

      <!-- Action buttons -->
      <div class="flex justify-end space-x-3 mt-6 pt-4 border-t">
        ${extraction ? `
          <button id="clear-extraction-btn" class="btn-secondary text-red-600 hover:bg-red-50">
            Clear
          </button>
        ` : ''}
        <button id="save-extraction-btn" class="btn-primary">
          ${extraction ? 'Update' : 'Save'} Extraction
        </button>
        ${extraction && !extraction.verified ? `
          <button id="verify-extraction-btn" class="btn-success">
            Verify & Lock
          </button>
        ` : ''}
      </div>
    </div>
  `;
}

/**
 * Render outcome-specific form fields
 */
function renderOutcomeForm(record, extraction) {
  const data = extraction?.data || {};

  if (extractionState.outcomeType === 'binary') {
    return `
      <div class="space-y-4">
        <h4 class="font-medium text-gray-700">Binary Outcome Data</h4>

        <div class="grid grid-cols-2 gap-6">
          <!-- Treatment arm -->
          <div class="p-4 bg-blue-50 rounded-lg">
            <h5 class="font-medium text-blue-800 mb-3">Treatment Arm</h5>
            <div class="space-y-3">
              <div>
                <label class="block text-xs text-gray-600 mb-1">Arm Label</label>
                <input type="text" id="treatment_label" value="${escapeHtml(data.treatment_label || '')}"
                       class="form-input w-full text-sm" placeholder="e.g., Drug A">
              </div>
              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="block text-xs text-gray-600 mb-1">Events</label>
                  <input type="number" id="treatment_events" value="${data.treatment_events || ''}"
                         class="form-input w-full text-sm" min="0">
                </div>
                <div>
                  <label class="block text-xs text-gray-600 mb-1">Total N</label>
                  <input type="number" id="treatment_n" value="${data.treatment_n || ''}"
                         class="form-input w-full text-sm" min="1">
                </div>
              </div>
            </div>
          </div>

          <!-- Control arm -->
          <div class="p-4 bg-gray-100 rounded-lg">
            <h5 class="font-medium text-gray-700 mb-3">Control Arm</h5>
            <div class="space-y-3">
              <div>
                <label class="block text-xs text-gray-600 mb-1">Arm Label</label>
                <input type="text" id="control_label" value="${escapeHtml(data.control_label || '')}"
                       class="form-input w-full text-sm" placeholder="e.g., Placebo">
              </div>
              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="block text-xs text-gray-600 mb-1">Events</label>
                  <input type="number" id="control_events" value="${data.control_events || ''}"
                         class="form-input w-full text-sm" min="0">
                </div>
                <div>
                  <label class="block text-xs text-gray-600 mb-1">Total N</label>
                  <input type="number" id="control_n" value="${data.control_n || ''}"
                         class="form-input w-full text-sm" min="1">
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Outcome description -->
        <div>
          <label class="block text-xs text-gray-600 mb-1">Outcome Description</label>
          <input type="text" id="outcome_description" value="${escapeHtml(data.outcome_description || '')}"
                 class="form-input w-full text-sm" placeholder="e.g., All-cause mortality at 12 months">
        </div>

        <!-- Timepoint -->
        <div>
          <label class="block text-xs text-gray-600 mb-1">Timepoint</label>
          <input type="text" id="timepoint" value="${escapeHtml(data.timepoint || '')}"
                 class="form-input w-full text-sm" placeholder="e.g., 12 months, end of follow-up">
        </div>
      </div>
    `;
  } else if (extractionState.outcomeType === 'continuous') {
    return `
      <div class="space-y-4">
        <h4 class="font-medium text-gray-700">Continuous Outcome Data</h4>

        <div class="grid grid-cols-2 gap-6">
          <!-- Treatment arm -->
          <div class="p-4 bg-blue-50 rounded-lg">
            <h5 class="font-medium text-blue-800 mb-3">Treatment Arm</h5>
            <div class="space-y-3">
              <div>
                <label class="block text-xs text-gray-600 mb-1">Arm Label</label>
                <input type="text" id="treatment_label" value="${escapeHtml(data.treatment_label || '')}"
                       class="form-input w-full text-sm" placeholder="e.g., Drug A">
              </div>
              <div class="grid grid-cols-3 gap-2">
                <div>
                  <label class="block text-xs text-gray-600 mb-1">Mean</label>
                  <input type="number" step="any" id="treatment_mean" value="${data.treatment_mean || ''}"
                         class="form-input w-full text-sm">
                </div>
                <div>
                  <label class="block text-xs text-gray-600 mb-1">SD</label>
                  <input type="number" step="any" id="treatment_sd" value="${data.treatment_sd || ''}"
                         class="form-input w-full text-sm" min="0">
                </div>
                <div>
                  <label class="block text-xs text-gray-600 mb-1">N</label>
                  <input type="number" id="treatment_n" value="${data.treatment_n || ''}"
                         class="form-input w-full text-sm" min="1">
                </div>
              </div>
              <!-- SD imputation helpers -->
              <div class="text-xs text-gray-500">
                <span>SD not reported?</span>
                <button type="button" class="impute-sd-btn text-primary-600 hover:underline ml-1" data-arm="treatment">
                  Impute from SE/CI
                </button>
              </div>
            </div>
          </div>

          <!-- Control arm -->
          <div class="p-4 bg-gray-100 rounded-lg">
            <h5 class="font-medium text-gray-700 mb-3">Control Arm</h5>
            <div class="space-y-3">
              <div>
                <label class="block text-xs text-gray-600 mb-1">Arm Label</label>
                <input type="text" id="control_label" value="${escapeHtml(data.control_label || '')}"
                       class="form-input w-full text-sm" placeholder="e.g., Placebo">
              </div>
              <div class="grid grid-cols-3 gap-2">
                <div>
                  <label class="block text-xs text-gray-600 mb-1">Mean</label>
                  <input type="number" step="any" id="control_mean" value="${data.control_mean || ''}"
                         class="form-input w-full text-sm">
                </div>
                <div>
                  <label class="block text-xs text-gray-600 mb-1">SD</label>
                  <input type="number" step="any" id="control_sd" value="${data.control_sd || ''}"
                         class="form-input w-full text-sm" min="0">
                </div>
                <div>
                  <label class="block text-xs text-gray-600 mb-1">N</label>
                  <input type="number" id="control_n" value="${data.control_n || ''}"
                         class="form-input w-full text-sm" min="1">
                </div>
              </div>
              <div class="text-xs text-gray-500">
                <span>SD not reported?</span>
                <button type="button" class="impute-sd-btn text-primary-600 hover:underline ml-1" data-arm="control">
                  Impute from SE/CI
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Outcome and timepoint -->
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-xs text-gray-600 mb-1">Outcome Description</label>
            <input type="text" id="outcome_description" value="${escapeHtml(data.outcome_description || '')}"
                   class="form-input w-full text-sm" placeholder="e.g., Change in HbA1c">
          </div>
          <div>
            <label class="block text-xs text-gray-600 mb-1">Timepoint</label>
            <input type="text" id="timepoint" value="${escapeHtml(data.timepoint || '')}"
                   class="form-input w-full text-sm" placeholder="e.g., 12 weeks">
          </div>
        </div>
      </div>
    `;
  } else {
    // Survival / HR
    return `
      <div class="space-y-4">
        <h4 class="font-medium text-gray-700">Survival / Hazard Ratio Data</h4>

        <div class="p-4 bg-gray-50 rounded-lg">
          <div class="grid grid-cols-3 gap-4">
            <div>
              <label class="block text-xs text-gray-600 mb-1">Hazard Ratio</label>
              <input type="number" step="any" id="hr" value="${data.hr || ''}"
                     class="form-input w-full text-sm" min="0">
            </div>
            <div>
              <label class="block text-xs text-gray-600 mb-1">95% CI Lower</label>
              <input type="number" step="any" id="hr_ci_lower" value="${data.hr_ci_lower || ''}"
                     class="form-input w-full text-sm" min="0">
            </div>
            <div>
              <label class="block text-xs text-gray-600 mb-1">95% CI Upper</label>
              <input type="number" step="any" id="hr_ci_upper" value="${data.hr_ci_upper || ''}"
                     class="form-input w-full text-sm" min="0">
            </div>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-xs text-gray-600 mb-1">Treatment Arm Label</label>
            <input type="text" id="treatment_label" value="${escapeHtml(data.treatment_label || '')}"
                   class="form-input w-full text-sm" placeholder="e.g., Drug A">
          </div>
          <div>
            <label class="block text-xs text-gray-600 mb-1">Control Arm Label</label>
            <input type="text" id="control_label" value="${escapeHtml(data.control_label || '')}"
                   class="form-input w-full text-sm" placeholder="e.g., Placebo">
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-xs text-gray-600 mb-1">Outcome Description</label>
            <input type="text" id="outcome_description" value="${escapeHtml(data.outcome_description || '')}"
                   class="form-input w-full text-sm" placeholder="e.g., Overall survival">
          </div>
          <div>
            <label class="block text-xs text-gray-600 mb-1">Follow-up Duration</label>
            <input type="text" id="timepoint" value="${escapeHtml(data.timepoint || '')}"
                   class="form-input w-full text-sm" placeholder="e.g., Median 24 months">
          </div>
        </div>
      </div>
    `;
  }
}

/**
 * Render no selection state
 */
function renderNoSelection() {
  return `
    <div class="card text-center py-12">
      <svg class="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
      <h3 class="text-lg font-medium text-gray-900 mb-2">Select a Study</h3>
      <p class="text-gray-500">Click on a study from the list to begin extraction.</p>
    </div>
  `;
}

/**
 * Initialize event listeners
 */
export async function init(params) {
  // Record selection
  document.querySelectorAll('.record-item').forEach(item => {
    item.addEventListener('click', () => {
      extractionState.currentNctId = item.dataset.nct;
      router.navigate(`/project/${extractionState.projectId}/extraction`);
    });
  });

  // Outcome type selection
  document.querySelectorAll('input[name="outcomeType"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      extractionState.outcomeType = e.target.value;
      router.navigate(`/project/${extractionState.projectId}/extraction`);
    });
  });

  // Save extraction
  document.getElementById('save-extraction-btn')?.addEventListener('click', saveExtraction);

  // Verify extraction
  document.getElementById('verify-extraction-btn')?.addEventListener('click', verifyExtraction);

  // Clear extraction
  document.getElementById('clear-extraction-btn')?.addEventListener('click', clearExtraction);

  // Auto-extract all
  document.getElementById('auto-extract-btn')?.addEventListener('click', autoExtractAll);

  // Export data
  document.getElementById('export-data-btn')?.addEventListener('click', exportData);

  // SD imputation buttons
  document.querySelectorAll('.impute-sd-btn').forEach(btn => {
    btn.addEventListener('click', () => showSDImputationModal(btn.dataset.arm));
  });
}

/**
 * Save extraction data
 */
async function saveExtraction() {
  const nctId = extractionState.currentNctId;
  if (!nctId) return;

  // Gather form data
  const data = {};
  const outcomeType = extractionState.outcomeType;

  if (outcomeType === 'binary') {
    data.treatment_label = document.getElementById('treatment_label')?.value || '';
    data.treatment_events = parseInt(document.getElementById('treatment_events')?.value) || 0;
    data.treatment_n = parseInt(document.getElementById('treatment_n')?.value) || 0;
    data.control_label = document.getElementById('control_label')?.value || '';
    data.control_events = parseInt(document.getElementById('control_events')?.value) || 0;
    data.control_n = parseInt(document.getElementById('control_n')?.value) || 0;
  } else if (outcomeType === 'continuous') {
    data.treatment_label = document.getElementById('treatment_label')?.value || '';
    data.treatment_mean = parseFloat(document.getElementById('treatment_mean')?.value) || 0;
    data.treatment_sd = parseFloat(document.getElementById('treatment_sd')?.value) || 0;
    data.treatment_n = parseInt(document.getElementById('treatment_n')?.value) || 0;
    data.control_label = document.getElementById('control_label')?.value || '';
    data.control_mean = parseFloat(document.getElementById('control_mean')?.value) || 0;
    data.control_sd = parseFloat(document.getElementById('control_sd')?.value) || 0;
    data.control_n = parseInt(document.getElementById('control_n')?.value) || 0;
  } else {
    data.treatment_label = document.getElementById('treatment_label')?.value || '';
    data.control_label = document.getElementById('control_label')?.value || '';
    data.hr = parseFloat(document.getElementById('hr')?.value) || 0;
    data.hr_ci_lower = parseFloat(document.getElementById('hr_ci_lower')?.value) || 0;
    data.hr_ci_upper = parseFloat(document.getElementById('hr_ci_upper')?.value) || 0;
  }

  data.outcome_description = document.getElementById('outcome_description')?.value || '';
  data.timepoint = document.getElementById('timepoint')?.value || '';

  // Assess quality flags
  const qualityFlags = assessExtractionQuality(data, outcomeType);

  const extraction = {
    projectId: extractionState.projectId,
    nctId,
    outcomeType,
    data,
    qualityFlags,
    verified: false,
    extractedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await db.extraction.put(extraction);
  extractionState.extractions.set(nctId, extraction);

  // Refresh
  router.navigate(`/project/${extractionState.projectId}/extraction`);
}

/**
 * Assess extraction quality
 */
function assessExtractionQuality(data, outcomeType) {
  const flags = [];

  if (outcomeType === 'continuous') {
    // Check for SD imputation
    if (data.sd_imputed_treatment || data.sd_imputed_control) {
      flags.push({
        code: 'SD_IMPUTED',
        severity: 'moderate',
        description: 'SD imputed from SE or CI'
      });
    }
  }

  if (outcomeType === 'binary') {
    // Check for zero cells
    if (data.treatment_events === 0 || data.control_events === 0) {
      flags.push({
        code: 'ZERO_CELLS',
        severity: 'moderate',
        description: 'Zero events in one or more arms'
      });
    }

    // Check for small sample
    if (data.treatment_n < 10 || data.control_n < 10) {
      flags.push({
        code: 'SMALL_SAMPLE',
        severity: 'moderate',
        description: 'Small sample size (n < 10)'
      });
    }
  }

  return flags;
}

/**
 * Verify and lock extraction
 */
async function verifyExtraction() {
  const nctId = extractionState.currentNctId;
  const extraction = extractionState.extractions.get(nctId);
  if (!extraction) return;

  extraction.verified = true;
  extraction.verifiedAt = new Date().toISOString();

  await db.extraction.put(extraction);

  router.navigate(`/project/${extractionState.projectId}/extraction`);
}

/**
 * Clear extraction
 */
async function clearExtraction() {
  const nctId = extractionState.currentNctId;
  if (!confirm(`Clear extraction data for ${nctId}?`)) return;

  await db.extraction.delete([extractionState.projectId, nctId]);
  extractionState.extractions.delete(nctId);

  router.navigate(`/project/${extractionState.projectId}/extraction`);
}

/**
 * Auto-extract all studies with results
 */
async function autoExtractAll() {
  alert('Auto-extraction from CT.gov results coming soon. This will parse results tables automatically.');
}

/**
 * Export extracted data as CSV
 */
function exportData() {
  let csv = 'NCT ID,Outcome Type,Treatment Label,Control Label,Outcome,Timepoint,';

  // Add type-specific columns
  csv += 'Treatment Events,Treatment N,Control Events,Control N,';
  csv += 'Treatment Mean,Treatment SD,Control Mean,Control SD,';
  csv += 'HR,HR CI Lower,HR CI Upper,';
  csv += 'Quality Flags,Verified\n';

  extractionState.extractions.forEach((extraction, nctId) => {
    const d = extraction.data || {};
    csv += `${nctId},${extraction.outcomeType},"${d.treatment_label || ''}","${d.control_label || ''}",`;
    csv += `"${d.outcome_description || ''}","${d.timepoint || ''}",`;
    csv += `${d.treatment_events || ''},${d.treatment_n || ''},${d.control_events || ''},${d.control_n || ''},`;
    csv += `${d.treatment_mean || ''},${d.treatment_sd || ''},${d.control_mean || ''},${d.control_sd || ''},`;
    csv += `${d.hr || ''},${d.hr_ci_lower || ''},${d.hr_ci_upper || ''},`;
    csv += `"${extraction.qualityFlags?.map(f => f.code).join('; ') || ''}",${extraction.verified}\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `extraction-data-${extractionState.projectId}.csv`;
  link.click();
}

/**
 * Show SD imputation modal
 */
function showSDImputationModal(arm) {
  alert(`SD Imputation helper for ${arm} arm.\n\nEnter SE or CI bounds to calculate SD.\nFormula: SD = SE × √n or SD = (CI_upper - CI_lower) × √n / (2 × 1.96)`);
}

/**
 * Escape HTML
 */
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export default { render, init };
