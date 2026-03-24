/**
 * Screening Queue Component
 * Full-featured screening interface with rules engine integration
 */

import { store, actions } from '../../store.js';
import { db } from '../../db/schema.js';
import { router } from '../../router.js';
import { createRulesEngine, RULE_TYPES, OPERATORS } from '../../lib/rules-engine.js';

// Global state for the screening queue
let currentQueue = {
  records: [],
  currentIndex: 0,
  decisions: new Map(),
  rulesEngine: null,
  projectId: null,
  filters: {
    decision: 'pending' // all, pending, include, exclude, maybe
  }
};

/**
 * Main render function
 */
export async function render(params) {
  const projectId = params.id;
  currentQueue.projectId = projectId;

  const project = await db.projects.get(projectId);
  if (!project) {
    return `<div class="card"><p>Project not found</p></div>`;
  }

  // Load records and screening decisions
  // Screening entries link projects to nctIds, so get those first
  const screeningDecisions = await db.screening.where('projectId', projectId);
  const projectNctIds = [...new Set(screeningDecisions.map(s => s.nctId).filter(Boolean))];

  // Fetch actual records for these nctIds
  const recordPromises = projectNctIds.map(id => db.records.get(id));
  const recordsRaw = await Promise.all(recordPromises);
  const records = recordsRaw.filter(Boolean); // Remove any null/undefined entries

  currentQueue.records = records;
  currentQueue.decisions = new Map(screeningDecisions.map(s => [s.nctId, s]));

  // Initialize rules engine
  if (!currentQueue.rulesEngine) {
    currentQueue.rulesEngine = createRulesEngine();
  }

  // Auto-screen with rules engine for records without decisions
  records.forEach(record => {
    if (!currentQueue.decisions.has(record.nctId)) {
      const result = currentQueue.rulesEngine.evaluate(record);
      if (result.autoScreened && result.decision !== 'maybe') {
        // Store auto-screening result for display, but don't persist yet
        record._autoResult = result;
      }
    }
  });

  const stats = getStats();
  const filteredRecords = getFilteredRecords();
  const currentRecord = filteredRecords[currentQueue.currentIndex];

  return `
    <div class="screening-container max-w-5xl mx-auto space-y-6">
      <!-- Header with stats -->
      <div class="card">
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-xl font-bold">Screening Queue</h2>
          <div class="flex space-x-2">
            <button id="rules-config-btn" class="btn-secondary text-sm">
              <svg class="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Rules
            </button>
            <button id="export-btn" class="btn-secondary text-sm">
              <svg class="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export
            </button>
          </div>
        </div>

        <!-- Stats grid -->
        <div class="grid grid-cols-5 gap-4 mb-4">
          <div class="text-center p-3 bg-gray-50 rounded-lg">
            <p class="text-2xl font-bold text-gray-900">${stats.total}</p>
            <p class="text-xs text-gray-500">Total</p>
          </div>
          <div class="text-center p-3 bg-blue-50 rounded-lg">
            <p class="text-2xl font-bold text-blue-600">${stats.pending}</p>
            <p class="text-xs text-blue-500">Pending</p>
          </div>
          <div class="text-center p-3 bg-green-50 rounded-lg">
            <p class="text-2xl font-bold text-green-600">${stats.included}</p>
            <p class="text-xs text-green-500">Included</p>
          </div>
          <div class="text-center p-3 bg-red-50 rounded-lg">
            <p class="text-2xl font-bold text-red-600">${stats.excluded}</p>
            <p class="text-xs text-red-500">Excluded</p>
          </div>
          <div class="text-center p-3 bg-yellow-50 rounded-lg">
            <p class="text-2xl font-bold text-yellow-600">${stats.maybe}</p>
            <p class="text-xs text-yellow-500">Maybe</p>
          </div>
        </div>

        <!-- Progress bar -->
        <div class="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div class="h-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-300"
               style="width: ${stats.total > 0 ? ((stats.total - stats.pending) / stats.total * 100) : 0}%"></div>
        </div>
        <p class="text-xs text-gray-500 mt-1 text-right">
          ${stats.total - stats.pending} of ${stats.total} screened (${stats.total > 0 ? Math.round((stats.total - stats.pending) / stats.total * 100) : 0}%)
        </p>
      </div>

      <!-- Filters -->
      <div class="flex items-center space-x-4">
        <select id="decision-filter" class="form-select text-sm rounded-md border-gray-300">
          <option value="pending" ${currentQueue.filters.decision === 'pending' ? 'selected' : ''}>Pending Review</option>
          <option value="all" ${currentQueue.filters.decision === 'all' ? 'selected' : ''}>All Records</option>
          <option value="include" ${currentQueue.filters.decision === 'include' ? 'selected' : ''}>Included</option>
          <option value="exclude" ${currentQueue.filters.decision === 'exclude' ? 'selected' : ''}>Excluded</option>
          <option value="maybe" ${currentQueue.filters.decision === 'maybe' ? 'selected' : ''}>Maybe</option>
        </select>
        <span class="text-sm text-gray-500">
          Showing ${filteredRecords.length} records
        </span>
      </div>

      <!-- Main screening card -->
      ${filteredRecords.length > 0 ? `
        <div class="card">
          ${renderRecordCard(currentRecord)}
        </div>

        <!-- Navigation -->
        <div class="flex justify-center items-center space-x-6">
          <button id="prev-btn" class="btn-secondary ${currentQueue.currentIndex === 0 ? 'opacity-50 cursor-not-allowed' : ''}"
                  ${currentQueue.currentIndex === 0 ? 'disabled' : ''}>
            <svg class="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
            Previous
          </button>
          <span class="text-sm text-gray-600">
            ${currentQueue.currentIndex + 1} of ${filteredRecords.length}
          </span>
          <button id="next-btn" class="btn-secondary ${currentQueue.currentIndex >= filteredRecords.length - 1 ? 'opacity-50 cursor-not-allowed' : ''}"
                  ${currentQueue.currentIndex >= filteredRecords.length - 1 ? 'disabled' : ''}>
            Next
            <svg class="w-4 h-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        <!-- Decision buttons -->
        <div class="flex justify-center space-x-4">
          <button id="exclude-btn" class="btn-lg bg-red-100 text-red-700 border-2 border-red-200 hover:bg-red-200 rounded-xl px-8 py-3 font-semibold transition">
            ✕ Exclude
          </button>
          <button id="maybe-btn" class="btn-lg bg-yellow-100 text-yellow-700 border-2 border-yellow-200 hover:bg-yellow-200 rounded-xl px-8 py-3 font-semibold transition">
            ? Maybe
          </button>
          <button id="include-btn" class="btn-lg bg-green-100 text-green-700 border-2 border-green-200 hover:bg-green-200 rounded-xl px-8 py-3 font-semibold transition">
            ✓ Include
          </button>
        </div>

        <!-- Exclude reasons modal (hidden by default) -->
        <div id="exclude-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div class="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 class="text-lg font-bold mb-4">Select Exclusion Reason</h3>
            <div class="grid grid-cols-2 gap-2">
              <button class="reason-btn p-3 text-left bg-gray-50 hover:bg-red-50 rounded-lg text-sm" data-reason="wrong-population">Wrong Population</button>
              <button class="reason-btn p-3 text-left bg-gray-50 hover:bg-red-50 rounded-lg text-sm" data-reason="wrong-intervention">Wrong Intervention</button>
              <button class="reason-btn p-3 text-left bg-gray-50 hover:bg-red-50 rounded-lg text-sm" data-reason="wrong-comparator">Wrong Comparator</button>
              <button class="reason-btn p-3 text-left bg-gray-50 hover:bg-red-50 rounded-lg text-sm" data-reason="wrong-outcome">Wrong Outcome</button>
              <button class="reason-btn p-3 text-left bg-gray-50 hover:bg-red-50 rounded-lg text-sm" data-reason="wrong-study-design">Wrong Study Design</button>
              <button class="reason-btn p-3 text-left bg-gray-50 hover:bg-red-50 rounded-lg text-sm" data-reason="duplicate">Duplicate</button>
              <button class="reason-btn p-3 text-left bg-gray-50 hover:bg-red-50 rounded-lg text-sm" data-reason="no-results">No Results Available</button>
              <button class="reason-btn p-3 text-left bg-gray-50 hover:bg-red-50 rounded-lg text-sm" data-reason="other">Other</button>
            </div>
            <button id="cancel-exclude" class="mt-4 w-full btn-secondary">Cancel</button>
          </div>
        </div>

        <!-- Keyboard shortcuts -->
        <div class="text-center text-xs text-gray-400 space-x-4">
          <span><kbd class="px-1 py-0.5 bg-gray-100 rounded">←</kbd> Previous</span>
          <span><kbd class="px-1 py-0.5 bg-gray-100 rounded">→</kbd> Next</span>
          <span><kbd class="px-1 py-0.5 bg-gray-100 rounded">I</kbd> Include</span>
          <span><kbd class="px-1 py-0.5 bg-gray-100 rounded">E</kbd> Exclude</span>
          <span><kbd class="px-1 py-0.5 bg-gray-100 rounded">M</kbd> Maybe</span>
        </div>
      ` : `
        <div class="card text-center py-12">
          <svg class="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 class="text-lg font-medium text-gray-900 mb-2">
            ${stats.total === 0 ? 'No Records to Screen' : 'All Done!'}
          </h3>
          <p class="text-gray-500 mb-4">
            ${stats.total === 0
              ? 'Run a search first to populate the screening queue.'
              : `All ${stats.total} records have been screened. ${stats.included} included for extraction.`}
          </p>
          ${stats.total === 0 ? `
            <a href="#/project/${projectId}/search" class="btn-primary">Go to Search</a>
          ` : `
            <a href="#/project/${projectId}/extraction" class="btn-primary">
              Proceed to Extraction (${stats.included} studies)
            </a>
          `}
        </div>
      `}

      <!-- Proceed to extraction button -->
      ${stats.included > 0 && filteredRecords.length > 0 ? `
        <div class="flex justify-end">
          <a href="#/project/${projectId}/extraction" class="btn-primary">
            Proceed to Extraction (${stats.included} included)
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
 * Render a single record card
 */
function renderRecordCard(record) {
  if (!record) return '<p>No record</p>';

  const decision = currentQueue.decisions.get(record.nctId);
  const autoResult = record._autoResult || currentQueue.rulesEngine?.evaluate(record);
  const statusClass = getStatusClass(record.overallStatus);

  return `
    <div class="space-y-4">
      <!-- Header -->
      <div class="flex justify-between items-start">
        <div>
          <a href="https://clinicaltrials.gov/study/${record.nctId}" target="_blank"
             class="text-sm font-mono text-primary-600 hover:underline">${record.nctId}</a>
          <span class="ml-2 px-2 py-0.5 text-xs rounded-full ${statusClass}">${record.overallStatus || 'Unknown'}</span>
          ${record.hasResults ? '<span class="ml-2 px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full">Has Results</span>' : ''}
        </div>
        ${decision ? `
          <span class="px-3 py-1 rounded-full text-sm font-medium ${getDecisionClass(decision.decision)}">
            ${decision.decision}
          </span>
        ` : ''}
      </div>

      <!-- Title -->
      <h3 class="text-lg font-semibold text-gray-900 leading-tight">${escapeHtml(record.briefTitle || 'Untitled')}</h3>

      <!-- Metadata grid -->
      <div class="grid grid-cols-3 md:grid-cols-6 gap-3 text-sm">
        <div class="p-2 bg-gray-50 rounded">
          <p class="text-xs text-gray-500">Phase</p>
          <p class="font-medium">${record.phase || 'N/A'}</p>
        </div>
        <div class="p-2 bg-gray-50 rounded">
          <p class="text-xs text-gray-500">Enrollment</p>
          <p class="font-medium">${record.enrollmentCount || 'N/A'}</p>
        </div>
        <div class="p-2 bg-gray-50 rounded">
          <p class="text-xs text-gray-500">Study Type</p>
          <p class="font-medium">${record.studyType || 'N/A'}</p>
        </div>
        <div class="p-2 bg-gray-50 rounded">
          <p class="text-xs text-gray-500">Start Date</p>
          <p class="font-medium">${record.startDate || 'N/A'}</p>
        </div>
        <div class="p-2 bg-gray-50 rounded">
          <p class="text-xs text-gray-500">Completion</p>
          <p class="font-medium">${record.completionDate || 'N/A'}</p>
        </div>
        <div class="p-2 bg-gray-50 rounded">
          <p class="text-xs text-gray-500">Sponsor</p>
          <p class="font-medium truncate" title="${escapeHtml(record.sponsor || '')}">${record.sponsor || 'N/A'}</p>
        </div>
      </div>

      <!-- Summary -->
      <div class="prose prose-sm max-w-none">
        <p class="text-gray-600 line-clamp-4">${escapeHtml(record.briefSummary || 'No summary available.')}</p>
        <button id="toggle-summary" class="text-primary-600 text-sm hover:underline">Show more</button>
      </div>

      <!-- Interventions -->
      ${record.interventions ? `
        <div>
          <h4 class="text-sm font-medium text-gray-700 mb-1">Interventions</h4>
          <p class="text-sm text-gray-600">${escapeHtml(record.interventions)}</p>
        </div>
      ` : ''}

      <!-- Conditions -->
      ${record.conditions ? `
        <div>
          <h4 class="text-sm font-medium text-gray-700 mb-1">Conditions</h4>
          <p class="text-sm text-gray-600">${escapeHtml(record.conditions)}</p>
        </div>
      ` : ''}

      <!-- Auto-screening result -->
      ${autoResult && autoResult.matchedRules.length > 0 ? `
        <div class="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div class="flex items-center space-x-2">
            <svg class="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span class="text-sm font-medium text-blue-800">Auto-screening suggestion: ${autoResult.decision}</span>
          </div>
          <ul class="mt-2 text-xs text-blue-700 list-disc list-inside">
            ${autoResult.reasons.map(r => `<li>${escapeHtml(r)}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Get statistics
 */
function getStats() {
  const total = currentQueue.records.length;
  let included = 0, excluded = 0, maybe = 0, pending = 0;

  currentQueue.records.forEach(record => {
    const decision = currentQueue.decisions.get(record.nctId);
    if (!decision) pending++;
    else if (decision.decision === 'include') included++;
    else if (decision.decision === 'exclude') excluded++;
    else if (decision.decision === 'maybe') maybe++;
    else pending++;
  });

  return { total, included, excluded, maybe, pending };
}

/**
 * Get filtered records
 */
function getFilteredRecords() {
  return currentQueue.records.filter(record => {
    const decision = currentQueue.decisions.get(record.nctId);

    if (currentQueue.filters.decision === 'pending') {
      return !decision;
    }
    if (currentQueue.filters.decision === 'include') {
      return decision?.decision === 'include';
    }
    if (currentQueue.filters.decision === 'exclude') {
      return decision?.decision === 'exclude';
    }
    if (currentQueue.filters.decision === 'maybe') {
      return decision?.decision === 'maybe';
    }

    return true; // 'all'
  });
}

/**
 * Get CSS class for status
 */
function getStatusClass(status) {
  const s = (status || '').toLowerCase();
  if (s.includes('completed')) return 'bg-green-100 text-green-700';
  if (s.includes('recruiting')) return 'bg-blue-100 text-blue-700';
  if (s.includes('active')) return 'bg-yellow-100 text-yellow-700';
  if (s.includes('withdrawn') || s.includes('terminated')) return 'bg-red-100 text-red-700';
  return 'bg-gray-100 text-gray-700';
}

/**
 * Get CSS class for decision
 */
function getDecisionClass(decision) {
  if (decision === 'include') return 'bg-green-100 text-green-700';
  if (decision === 'exclude') return 'bg-red-100 text-red-700';
  return 'bg-yellow-100 text-yellow-700';
}

/**
 * Make a decision
 */
async function makeDecision(decision, reason = null) {
  const filtered = getFilteredRecords();
  const record = filtered[currentQueue.currentIndex];
  if (!record) return;

  const decisionData = {
    projectId: currentQueue.projectId,
    nctId: record.nctId,
    decision,
    reason,
    decidedAt: new Date().toISOString(),
    autoScreened: false
  };

  // Save to database
  await db.screening.put(decisionData);

  // Update local state
  currentQueue.decisions.set(record.nctId, decisionData);

  // Navigate to next pending if in pending filter
  if (currentQueue.filters.decision === 'pending') {
    // Stay at same index since the list will shrink
    const newFiltered = getFilteredRecords();
    if (currentQueue.currentIndex >= newFiltered.length) {
      currentQueue.currentIndex = Math.max(0, newFiltered.length - 1);
    }
  } else {
    // Move to next record
    if (currentQueue.currentIndex < filtered.length - 1) {
      currentQueue.currentIndex++;
    }
  }

  // Re-render
  router.navigate(`/project/${currentQueue.projectId}/screening`);
}

/**
 * Initialize event listeners
 */
export async function init(params) {
  // Navigation
  document.getElementById('prev-btn')?.addEventListener('click', () => {
    if (currentQueue.currentIndex > 0) {
      currentQueue.currentIndex--;
      router.navigate(`/project/${currentQueue.projectId}/screening`);
    }
  });

  document.getElementById('next-btn')?.addEventListener('click', () => {
    const filtered = getFilteredRecords();
    if (currentQueue.currentIndex < filtered.length - 1) {
      currentQueue.currentIndex++;
      router.navigate(`/project/${currentQueue.projectId}/screening`);
    }
  });

  // Decisions
  document.getElementById('include-btn')?.addEventListener('click', () => {
    makeDecision('include');
  });

  document.getElementById('maybe-btn')?.addEventListener('click', () => {
    makeDecision('maybe');
  });

  document.getElementById('exclude-btn')?.addEventListener('click', () => {
    document.getElementById('exclude-modal')?.classList.remove('hidden');
  });

  // Exclude reasons
  document.querySelectorAll('.reason-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      makeDecision('exclude', btn.dataset.reason);
      document.getElementById('exclude-modal')?.classList.add('hidden');
    });
  });

  document.getElementById('cancel-exclude')?.addEventListener('click', () => {
    document.getElementById('exclude-modal')?.classList.add('hidden');
  });

  // Filter change
  document.getElementById('decision-filter')?.addEventListener('change', (e) => {
    currentQueue.filters.decision = e.target.value;
    currentQueue.currentIndex = 0;
    router.navigate(`/project/${currentQueue.projectId}/screening`);
  });

  // Export
  document.getElementById('export-btn')?.addEventListener('click', exportDecisions);

  // Keyboard shortcuts
  const handleKeydown = (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

    const filtered = getFilteredRecords();
    switch (e.key.toLowerCase()) {
      case 'arrowleft':
        if (currentQueue.currentIndex > 0) {
          currentQueue.currentIndex--;
          router.navigate(`/project/${currentQueue.projectId}/screening`);
        }
        break;
      case 'arrowright':
        if (currentQueue.currentIndex < filtered.length - 1) {
          currentQueue.currentIndex++;
          router.navigate(`/project/${currentQueue.projectId}/screening`);
        }
        break;
      case 'i':
        makeDecision('include');
        break;
      case 'e':
        document.getElementById('exclude-modal')?.classList.remove('hidden');
        break;
      case 'm':
        makeDecision('maybe');
        break;
      case 'escape':
        document.getElementById('exclude-modal')?.classList.add('hidden');
        break;
    }
  };

  document.addEventListener('keydown', handleKeydown);

  // Cleanup
  return () => {
    document.removeEventListener('keydown', handleKeydown);
  };
}

/**
 * Export decisions as CSV
 */
function exportDecisions() {
  let csv = 'NCT ID,Decision,Reason,Decided At\n';

  currentQueue.decisions.forEach((decision, nctId) => {
    csv += `${nctId},${decision.decision},"${decision.reason || ''}",${decision.decidedAt}\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `screening-decisions-${currentQueue.projectId}.csv`;
  link.click();
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
