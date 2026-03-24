/**
 * CT.gov Query Builder Component
 * Builds and executes searches against ClinicalTrials.gov API
 */

import { store, actions } from '../../store.js';
import { db } from '../../db/schema.js';
import { router } from '../../router.js';
import { showToast, formatDate, formatRelativeTime } from '../../lib/utils.js';
import { searchWorker } from '../../app.js';

// Study status options
const STATUS_OPTIONS = [
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'ACTIVE_NOT_RECRUITING', label: 'Active, not recruiting' },
  { value: 'RECRUITING', label: 'Recruiting' },
  { value: 'ENROLLING_BY_INVITATION', label: 'Enrolling by invitation' },
  { value: 'NOT_YET_RECRUITING', label: 'Not yet recruiting' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'TERMINATED', label: 'Terminated' },
  { value: 'WITHDRAWN', label: 'Withdrawn' }
];

// Phase options
const PHASE_OPTIONS = [
  { value: 'EARLY_PHASE1', label: 'Early Phase 1' },
  { value: 'PHASE1', label: 'Phase 1' },
  { value: 'PHASE2', label: 'Phase 2' },
  { value: 'PHASE3', label: 'Phase 3' },
  { value: 'PHASE4', label: 'Phase 4' },
  { value: 'NA', label: 'N/A' }
];

// Study type options
const STUDY_TYPE_OPTIONS = [
  { value: 'INTERVENTIONAL', label: 'Interventional' },
  { value: 'OBSERVATIONAL', label: 'Observational' },
  { value: 'EXPANDED_ACCESS', label: 'Expanded Access' }
];

/**
 * Render the query builder page
 */
export async function render(params) {
  const projectId = params?.id;

  if (!projectId) {
    return `
      <div class="card text-center py-12">
        <h2 class="text-xl font-semibold text-danger-700">No Project Selected</h2>
        <p class="text-gray-600 mt-2">Please select a project first.</p>
        <a href="#/" class="btn-primary mt-4">Go to Projects</a>
      </div>
    `;
  }

  const project = await db.projects.get(projectId);

  if (!project) {
    return `
      <div class="card text-center py-12">
        <h2 class="text-xl font-semibold text-danger-700">Project Not Found</h2>
        <p class="text-gray-600 mt-2">The project you're looking for doesn't exist.</p>
        <a href="#/" class="btn-primary mt-4">Go to Projects</a>
      </div>
    `;
  }

  store.dispatch(actions.setCurrentProject(project));

  // Get previous search run if exists
  let lastSearchRun = null;
  if (project.lastSearchRunId) {
    lastSearchRun = await db.searchRuns.get(project.lastSearchRunId);
  }

  const savedQuery = project.query || {};

  return `
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Query Builder Panel -->
      <div class="lg:col-span-2">
        <div class="card">
          <h2 class="text-lg font-semibold text-gray-900 mb-4">Search ClinicalTrials.gov</h2>

          <form id="search-form" class="space-y-6">
            <!-- Main Query -->
            <div>
              <label class="label" for="query-term">Search Terms</label>
              <input type="text" id="query-term" name="query" class="input"
                placeholder="e.g., diabetes type 2 treatment"
                value="${escapeHtml(savedQuery.query || '')}">
              <p class="text-xs text-gray-500 mt-1">Use AND, OR, NOT for complex queries</p>
            </div>

            <!-- Condition / Intervention Row -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="label" for="query-condition">Condition or Disease</label>
                <input type="text" id="query-condition" name="condition" class="input"
                  placeholder="e.g., Diabetes Mellitus"
                  value="${escapeHtml(savedQuery.condition || '')}">
              </div>
              <div>
                <label class="label" for="query-intervention">Intervention / Treatment</label>
                <input type="text" id="query-intervention" name="intervention" class="input"
                  placeholder="e.g., Metformin"
                  value="${escapeHtml(savedQuery.intervention || '')}">
              </div>
            </div>

            <!-- Filters Section -->
            <div class="border-t border-gray-200 pt-4">
              <button type="button" id="toggle-filters" class="flex items-center text-sm font-medium text-gray-700 hover:text-primary-600">
                <svg class="w-4 h-4 mr-2 transform transition-transform" id="filter-chevron" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
                Advanced Filters
              </button>

              <div id="filter-panel" class="mt-4 space-y-4 hidden">
                <!-- Study Status -->
                <div>
                  <label class="label">Study Status</label>
                  <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
                    ${STATUS_OPTIONS.map(opt => `
                      <label class="flex items-center text-sm">
                        <input type="checkbox" name="status" value="${opt.value}"
                          class="h-4 w-4 text-primary-600 rounded border-gray-300"
                          ${(savedQuery.status || []).includes(opt.value) ? 'checked' : ''}>
                        <span class="ml-2">${opt.label}</span>
                      </label>
                    `).join('')}
                  </div>
                </div>

                <!-- Phase -->
                <div>
                  <label class="label">Phase</label>
                  <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
                    ${PHASE_OPTIONS.map(opt => `
                      <label class="flex items-center text-sm">
                        <input type="checkbox" name="phase" value="${opt.value}"
                          class="h-4 w-4 text-primary-600 rounded border-gray-300"
                          ${(savedQuery.phase || []).includes(opt.value) ? 'checked' : ''}>
                        <span class="ml-2">${opt.label}</span>
                      </label>
                    `).join('')}
                  </div>
                </div>

                <!-- Study Type -->
                <div>
                  <label class="label">Study Type</label>
                  <div class="flex flex-wrap gap-4">
                    ${STUDY_TYPE_OPTIONS.map(opt => `
                      <label class="flex items-center text-sm">
                        <input type="checkbox" name="studyType" value="${opt.value}"
                          class="h-4 w-4 text-primary-600 rounded border-gray-300"
                          ${(savedQuery.studyType || []).includes(opt.value) ? 'checked' : ''}>
                        <span class="ml-2">${opt.label}</span>
                      </label>
                    `).join('')}
                  </div>
                </div>

                <!-- Has Results Filter -->
                <div>
                  <label class="flex items-center text-sm">
                    <input type="checkbox" id="has-results" name="hasResults"
                      class="h-4 w-4 text-primary-600 rounded border-gray-300"
                      ${savedQuery.hasResults ? 'checked' : ''}>
                    <span class="ml-2">Only trials with posted results</span>
                  </label>
                </div>

                <!-- Date Range -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label class="label">Completion Date From</label>
                    <input type="date" name="completionDateFrom" class="input"
                      value="${savedQuery.completionDateFrom || ''}">
                  </div>
                  <div>
                    <label class="label">Completion Date To</label>
                    <input type="date" name="completionDateTo" class="input"
                      value="${savedQuery.completionDateTo || ''}">
                  </div>
                </div>
              </div>
            </div>

            <!-- Actions -->
            <div class="flex justify-between items-center pt-4 border-t border-gray-200">
              <button type="button" id="clear-form" class="text-sm text-gray-500 hover:text-gray-700">
                Clear form
              </button>
              <div class="flex space-x-3">
                <button type="button" id="save-query-btn" class="btn-secondary">
                  Save Query
                </button>
                <button type="submit" class="btn-primary" id="search-btn">
                  <svg class="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  Search CT.gov
                </button>
              </div>
            </div>
          </form>
        </div>

        <!-- Search Progress -->
        <div id="search-progress" class="card mt-6 hidden">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-medium text-gray-900">Search in Progress</h3>
            <button id="cancel-search" class="text-sm text-danger-600 hover:text-danger-700">Cancel</button>
          </div>
          <div class="w-full bg-gray-200 rounded-full h-2">
            <div id="progress-bar" class="bg-primary-600 h-2 rounded-full transition-all duration-300" style="width: 0%"></div>
          </div>
          <p id="progress-text" class="text-sm text-gray-600 mt-2">Starting search...</p>
        </div>

        <!-- Results Preview -->
        <div id="results-preview" class="card mt-6 hidden">
          <div class="flex justify-between items-center mb-4">
            <h3 class="font-medium text-gray-900">Search Results</h3>
            <span id="results-count" class="badge-info"></span>
          </div>
          <div id="results-list" class="space-y-3 max-h-96 overflow-y-auto scrollbar-thin">
            <!-- Results loaded dynamically -->
          </div>
          <div class="flex justify-end mt-4 pt-4 border-t border-gray-200">
            <button id="proceed-screening" class="btn-primary">
              Proceed to Screening
              <svg class="w-4 h-4 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <!-- Sidebar -->
      <div class="lg:col-span-1 space-y-6">
        <!-- Project Info -->
        <div class="card">
          <h3 class="font-medium text-gray-900 mb-3">${escapeHtml(project.name)}</h3>
          ${project.living ? `
            <span class="badge-success mb-3">
              <svg class="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
              </svg>
              Living Mode
            </span>
          ` : ''}
          <p class="text-sm text-gray-600">${escapeHtml(project.description || 'No description')}</p>
        </div>

        <!-- Search History -->
        <div class="card">
          <h3 class="font-medium text-gray-900 mb-3">Search History</h3>
          <div id="search-history" class="space-y-2">
            ${lastSearchRun ? `
              <div class="p-3 bg-gray-50 rounded-lg text-sm">
                <div class="flex justify-between items-start">
                  <span class="font-medium text-gray-900">${lastSearchRun.totalCount} trials</span>
                  <span class="text-gray-500">${formatRelativeTime(lastSearchRun.timestamp)}</span>
                </div>
                ${lastSearchRun.diff ? `
                  <div class="mt-2 text-xs">
                    <span class="text-success-600">+${lastSearchRun.diff.newTrials} new</span>
                    ${lastSearchRun.diff.removedTrials > 0 ? `
                      <span class="text-danger-600 ml-2">-${lastSearchRun.diff.removedTrials} removed</span>
                    ` : ''}
                  </div>
                ` : ''}
              </div>
            ` : `
              <p class="text-sm text-gray-500">No previous searches</p>
            `}
          </div>
        </div>

        <!-- Quick Tips -->
        <div class="card bg-primary-50 border-primary-200">
          <h3 class="font-medium text-primary-900 mb-2">Search Tips</h3>
          <ul class="text-sm text-primary-700 space-y-2">
            <li>Use quotation marks for exact phrases: "heart failure"</li>
            <li>Use AND, OR, NOT for boolean logic</li>
            <li>Filter by completed trials with results for meta-analysis</li>
            <li>Enable Living Mode to auto-update on each session</li>
          </ul>
        </div>
      </div>
    </div>
  `;
}

/**
 * Initialize the query builder page
 */
export async function init(params) {
  const projectId = params.id;

  // Toggle filters
  document.getElementById('toggle-filters')?.addEventListener('click', () => {
    const panel = document.getElementById('filter-panel');
    const chevron = document.getElementById('filter-chevron');
    panel?.classList.toggle('hidden');
    chevron?.classList.toggle('rotate-180');
  });

  // Clear form
  document.getElementById('clear-form')?.addEventListener('click', () => {
    const form = document.getElementById('search-form');
    form?.reset();
  });

  // Save query
  document.getElementById('save-query-btn')?.addEventListener('click', async () => {
    await saveQuery(projectId);
  });

  // Search form submission
  document.getElementById('search-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await executeSearch(projectId);
  });

  // Cancel search
  document.getElementById('cancel-search')?.addEventListener('click', () => {
    searchWorker?.postMessage({ type: 'CANCEL' });
    document.getElementById('search-progress')?.classList.add('hidden');
  });

  // Proceed to screening
  document.getElementById('proceed-screening')?.addEventListener('click', () => {
    router.navigate(`/project/${projectId}/screening`);
  });

  // Listen for worker messages
  setupWorkerListener(projectId);
}

/**
 * Get query from form
 */
function getQueryFromForm() {
  const form = document.getElementById('search-form');
  if (!form) return null;

  const formData = new FormData(form);

  // Get multi-select values
  const status = formData.getAll('status');
  const phase = formData.getAll('phase');
  const studyType = formData.getAll('studyType');

  return {
    query: formData.get('query')?.trim() || '',
    condition: formData.get('condition')?.trim() || '',
    intervention: formData.get('intervention')?.trim() || '',
    status: status.length ? status : undefined,
    phase: phase.length ? phase : undefined,
    studyType: studyType.length ? studyType : undefined,
    hasResults: formData.get('hasResults') === 'on' || undefined,
    completionDateFrom: formData.get('completionDateFrom') || undefined,
    completionDateTo: formData.get('completionDateTo') || undefined
  };
}

/**
 * Save query to project
 */
async function saveQuery(projectId) {
  const query = getQueryFromForm();

  try {
    const project = await db.projects.get(projectId);
    const updated = {
      ...project,
      query,
      updatedAt: new Date().toISOString()
    };
    await db.projects.put(updated);
    store.dispatch(actions.updateProject(updated));
    showToast({ type: 'success', message: 'Query saved' });
  } catch (err) {
    console.error('Failed to save query:', err);
    showToast({ type: 'error', message: 'Failed to save query' });
  }
}

/**
 * Execute search
 */
async function executeSearch(projectId) {
  const query = getQueryFromForm();

  // Validate
  if (!query.query && !query.condition && !query.intervention) {
    showToast({ type: 'warning', message: 'Please enter at least one search term' });
    return;
  }

  // Get previous NCT IDs for diff
  const project = await db.projects.get(projectId);
  let previousNctIds = [];
  if (project.lastSearchRunId) {
    const lastRun = await db.searchRuns.get(project.lastSearchRunId);
    previousNctIds = lastRun?.nctIds || [];
  }

  // Show progress
  document.getElementById('search-progress')?.classList.remove('hidden');
  document.getElementById('results-preview')?.classList.add('hidden');
  document.getElementById('search-btn').disabled = true;

  // Send to worker
  searchWorker?.postMessage({
    type: 'SEARCH',
    payload: {
      projectId,
      query,
      previousNctIds
    },
    requestId: crypto.randomUUID()
  });

  // Save query
  await saveQuery(projectId);
}

/**
 * Setup worker message listener
 */
function setupWorkerListener(projectId) {
  if (!searchWorker) return;

  const originalOnMessage = searchWorker.onmessage;

  searchWorker.onmessage = async (event) => {
    // Call original handler first
    if (originalOnMessage) originalOnMessage(event);

    const { type, payload, error } = event.data;

    switch (type) {
      case 'SEARCH_PROGRESS':
        updateProgress(payload);
        break;

      case 'SEARCH_COMPLETE':
        await handleSearchComplete(projectId, payload);
        break;

      case 'SEARCH_ERROR':
        handleSearchError(error);
        break;
    }
  };
}

/**
 * Update progress bar
 */
function updateProgress(progress) {
  const percent = (progress.fetched / progress.total) * 100;
  document.getElementById('progress-bar').style.width = `${percent}%`;
  document.getElementById('progress-text').textContent =
    `Fetched ${progress.fetched} of ${progress.total} studies (page ${progress.page}/${progress.totalPages})`;
}

/**
 * Handle search completion
 */
async function handleSearchComplete(projectId, payload) {
  const { searchRun, studies, diff } = payload;

  // Hide progress, show results
  document.getElementById('search-progress')?.classList.add('hidden');
  document.getElementById('results-preview')?.classList.remove('hidden');
  document.getElementById('search-btn').disabled = false;

  // Update results count
  document.getElementById('results-count').textContent = `${studies.length} trials`;

  // Store search run
  await db.searchRuns.put(searchRun);

  // Store/update records
  await db.records.bulkPut(studies);

  // Update project
  const project = await db.projects.get(projectId);
  const updatedProject = {
    ...project,
    lastSearchRunId: searchRun.id,
    trialCount: studies.length,
    updatedAt: new Date().toISOString()
  };
  await db.projects.put(updatedProject);
  store.dispatch(actions.updateProject(updatedProject));
  store.dispatch(actions.setSearchRun(searchRun));

  // Create screening entries for new trials
  const existingScreening = await db.screening.where('projectId', projectId);
  const existingNctIds = new Set(existingScreening.map(s => s.nctId));

  const newScreeningEntries = studies
    .filter(s => !existingNctIds.has(s.nctId))
    .map(s => ({
      projectId,
      nctId: s.nctId,
      decision: null,
      stage: 'title_abstract',
      createdAt: new Date().toISOString()
    }));

  if (newScreeningEntries.length > 0) {
    await db.screening.bulkPut(newScreeningEntries);
  }

  // Render results preview
  renderResultsPreview(studies.slice(0, 20), diff);
}

/**
 * Handle search error
 */
function handleSearchError(error) {
  document.getElementById('search-progress')?.classList.add('hidden');
  document.getElementById('search-btn').disabled = false;
  showToast({ type: 'error', message: `Search failed: ${error}` });
}

/**
 * Render results preview
 */
function renderResultsPreview(studies, diff) {
  const container = document.getElementById('results-list');
  if (!container) return;

  const newNctIds = new Set(diff?.new?.map(s => s.nctId) || []);

  container.innerHTML = studies.map(study => `
    <div class="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
      <div class="flex justify-between items-start">
        <div class="flex-1 min-w-0">
          <div class="flex items-center space-x-2">
            <a href="https://clinicaltrials.gov/study/${study.nctId}" target="_blank"
              class="text-sm font-medium text-primary-600 hover:underline">${study.nctId}</a>
            ${newNctIds.has(study.nctId) ? '<span class="badge-success text-xs">New</span>' : ''}
            ${study.hasResults ? '<span class="badge-info text-xs">Has Results</span>' : ''}
          </div>
          <p class="text-sm text-gray-900 mt-1 line-clamp-2">${escapeHtml(study.briefTitle)}</p>
          <div class="flex items-center space-x-3 mt-2 text-xs text-gray-500">
            <span>${study.overallStatus}</span>
            <span>${study.phases?.join(', ') || 'N/A'}</span>
            ${study.enrollmentInfo?.count ? `<span>${study.enrollmentInfo.count} participants</span>` : ''}
          </div>
        </div>
      </div>
    </div>
  `).join('');

  if (studies.length === 0) {
    container.innerHTML = `
      <div class="text-center py-8 text-gray-500">
        <p>No trials found matching your criteria.</p>
        <p class="text-sm mt-1">Try broadening your search terms.</p>
      </div>
    `;
  }
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
