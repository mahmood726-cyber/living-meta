/**
 * Living Meta-Analysis - Main Application Entry Point
 * CT.gov-only Phase 1
 */

import { store, actions } from './store.js';
import { router, setupRoutes } from './router.js';
import { initDB, db } from './db/schema.js';
import { showToast, hideToast } from './lib/utils.js';
import { setupGlobalErrorHandler, handleError, ErrorCategory, ErrorSeverity, AppError, escapeHtml } from './lib/error-handler.js';
import { initStatePersistence, recoverPendingState } from './lib/state-persistence.js';

// App configuration
const APP_CONFIG = {
  version: '1.0.0',
  dbVersion: 1,
  livingModeCheckInterval: 5 * 60 * 1000, // 5 minutes
  autoSaveInterval: 30 * 1000 // 30 seconds
};

// Workers
let searchWorker = null;
let analysisWorker = null;
let eimWorker = null;

/**
 * Initialize the application
 */
async function initApp() {
  // Setup global error handler first
  setupGlobalErrorHandler();

  try {
    // Initialize IndexedDB
    store.dispatch(actions.setLoading(true));
    await initDB();

    // Recover any pending state from localStorage (crash recovery)
    await recoverPendingState();

    // Initialize state persistence (hydrates from IndexedDB)
    await initStatePersistence();

    // Load projects from DB (authoritative source)
    const projects = await db.projects.toArray();
    store.dispatch(actions.setProjects(projects));

    // Initialize workers
    initWorkers();

    // Setup routes
    setupRoutes();

    // Setup event listeners
    setupEventListeners();

    // Check for living mode updates on startup
    await checkLivingModeUpdates();

    // Start periodic living mode check
    setInterval(checkLivingModeUpdates, APP_CONFIG.livingModeCheckInterval);

    store.dispatch(actions.setLoading(false));

  } catch (err) {
    handleError(new AppError('Application initialization failed', {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.CRITICAL,
      recoverable: false,
      cause: err,
      userMessage: 'Failed to initialize application. Please refresh the page.'
    }));
    store.dispatch(actions.setLoading(false));
  }
}

/**
 * Initialize Web Workers
 */
function initWorkers() {
  try {
    // CT.gov Search Worker
    searchWorker = new Worker(
      new URL('./workers/ctgov_search_worker.js', import.meta.url),
      { type: 'module' }
    );
    searchWorker.onmessage = handleSearchWorkerMessage;
    searchWorker.onerror = (e) => handleError(new AppError('Search worker error', {
      category: ErrorCategory.WORKER,
      severity: ErrorSeverity.ERROR,
      cause: e.error || e
    }));

    // Analysis Worker
    analysisWorker = new Worker(
      new URL('./workers/analysis_worker.js', import.meta.url),
      { type: 'module' }
    );
    analysisWorker.onmessage = handleAnalysisWorkerMessage;
    analysisWorker.onerror = (e) => handleError(new AppError('Analysis worker error', {
      category: ErrorCategory.WORKER,
      severity: ErrorSeverity.ERROR,
      cause: e.error || e
    }));

    // EIM Worker
    eimWorker = new Worker(
      new URL('./workers/eim_worker.js', import.meta.url),
      { type: 'module' }
    );
    eimWorker.onmessage = handleEimWorkerMessage;
    eimWorker.onerror = (e) => handleError(new AppError('EIM worker error', {
      category: ErrorCategory.WORKER,
      severity: ErrorSeverity.WARNING,
      cause: e.error || e
    }));
  } catch (err) {
    handleError(new AppError('Worker initialization failed', {
      category: ErrorCategory.WORKER,
      severity: ErrorSeverity.WARNING,
      cause: err,
      userMessage: 'Background workers failed to initialize. Some operations may be slower.'
    }));
  }
}

/**
 * Handle Search Worker messages
 */
function handleSearchWorkerMessage(event) {
  const { type, payload, error } = event.data;

  switch (type) {
    case 'SEARCH_STARTED':
      store.dispatch(actions.setSyncing(true));
      updateSyncStatus('Searching CT.gov...');
      break;

    case 'SEARCH_PROGRESS':
      updateSyncStatus(`Fetching page ${payload.page}/${payload.totalPages}...`);
      break;

    case 'SEARCH_COMPLETE':
      store.dispatch(actions.setSearchRun(payload.searchRun));
      store.dispatch(actions.setSyncing(false));
      store.dispatch(actions.setLastSync(new Date()));
      updateSyncStatus('');
      showToast({
        type: 'success',
        message: `Found ${payload.totalResults} trials`
      });
      break;

    case 'SEARCH_ERROR':
      store.dispatch(actions.setSyncing(false));
      store.dispatch(actions.setError(error));
      updateSyncStatus('');
      showToast({ type: 'error', message: error });
      break;

    case 'DIFF_COMPLETE':
      if (payload.newTrials > 0 || payload.updatedTrials > 0) {
        showToast({
          type: 'info',
          message: `Living update: ${payload.newTrials} new, ${payload.updatedTrials} updated trials`
        });
      }
      break;
  }
}

/**
 * Handle Analysis Worker messages
 */
function handleAnalysisWorkerMessage(event) {
  const { type, payload, error } = event.data;

  switch (type) {
    case 'ANALYSIS_STARTED':
      store.dispatch(actions.setLoading(true));
      break;

    case 'ANALYSIS_COMPLETE':
      store.dispatch(actions.setAnalysisResults(payload));
      store.dispatch(actions.setLoading(false));
      showToast({ type: 'success', message: 'Analysis complete' });
      break;

    case 'ANALYSIS_ERROR':
      store.dispatch(actions.setLoading(false));
      store.dispatch(actions.setError(error));
      showToast({ type: 'error', message: `Analysis failed: ${error}` });
      break;
  }
}

/**
 * Handle EIM Worker messages
 */
function handleEimWorkerMessage(event) {
  const { type, payload, error } = event.data;

  switch (type) {
    case 'EIM_STARTED':
      // Optional: show subtle loading indicator
      break;

    case 'EIM_TRIAL_FLAGS':
      store.dispatch(actions.setEimTrialFlags(payload));
      break;

    case 'EIM_META_SUMMARY':
      store.dispatch(actions.setEimMetaSummary(payload));
      break;

    case 'EIM_ERROR':
      handleError(new AppError(error, {
        category: ErrorCategory.ANALYSIS,
        severity: ErrorSeverity.WARNING
      }));
      break;
  }
}

/**
 * Setup global event listeners
 */
function setupEventListeners() {
  // New project button
  document.getElementById('new-project-btn')?.addEventListener('click', showNewProjectModal);

  // Global keyboard shortcuts
  document.addEventListener('keydown', handleKeyboardShortcuts);

  // Store subscription for UI updates
  store.subscribe((state, action) => {
    // Update sync status indicator
    const syncEl = document.getElementById('sync-status');
    if (syncEl) {
      if (state.sync.syncing) {
        syncEl.innerHTML = '<div class="spinner"></div>';
      } else if (state.sync.lastSync) {
        syncEl.textContent = `Last sync: ${formatRelativeTime(state.sync.lastSync)}`;
      }
    }

    // Handle toast notifications
    if (action.type === 'SHOW_TOAST' && state.ui.toast) {
      renderToast(state.ui.toast);
    }

    // Handle modals
    if (action.type === 'SHOW_MODAL' && state.ui.modal) {
      renderModal(state.ui.modal);
    } else if (action.type === 'HIDE_MODAL') {
      // Clear modal DOM directly (don't call closeModal to avoid infinite loop)
      const container = document.getElementById('modal-container');
      if (container) {
        container.innerHTML = '';
      }
    }
  });

  // Handle online/offline events
  window.addEventListener('online', () => {
    showToast({ type: 'success', message: 'Back online' });
    checkLivingModeUpdates();
  });

  window.addEventListener('offline', () => {
    showToast({ type: 'warning', message: 'You are offline. Data is cached locally.' });
  });
}

/**
 * Handle keyboard shortcuts
 */
function handleKeyboardShortcuts(event) {
  // Cmd/Ctrl + K - Quick search
  if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
    event.preventDefault();
    // TODO: Open quick search modal
  }

  // Escape - Close modal
  if (event.key === 'Escape') {
    store.dispatch(actions.hideModal());
  }
}

/**
 * Check for living mode updates
 */
async function checkLivingModeUpdates() {
  const projects = store.getState().projects.filter(p => p.living);

  for (const project of projects) {
    if (!navigator.onLine) continue;

    try {
      searchWorker?.postMessage({
        type: 'CHECK_UPDATES',
        payload: {
          projectId: project.id,
          query: project.query,
          lastRunId: project.lastSearchRunId
        }
      });
    } catch (err) {
      handleError(new AppError(`Living mode check failed for project ${project.id}`, {
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.WARNING,
        cause: err
      }));
    }
  }
}

/**
 * Show new project modal
 */
function showNewProjectModal() {
  store.dispatch(actions.showModal({
    title: 'Create New Project',
    content: `
      <form id="new-project-form" class="space-y-4">
        <div>
          <label class="label" for="project-name">Project Name</label>
          <input type="text" id="project-name" name="name" class="input" required placeholder="e.g., Diabetes Treatment Meta-Analysis">
        </div>
        <div>
          <label class="label" for="project-description">Description</label>
          <textarea id="project-description" name="description" class="input" rows="3" placeholder="Brief description of your research question..."></textarea>
        </div>
        <div class="flex items-center">
          <input type="checkbox" id="project-living" name="living" class="h-4 w-4 text-primary-600 rounded">
          <label for="project-living" class="ml-2 text-sm text-gray-700">Enable Living Mode (auto-update on open)</label>
        </div>
        <div class="flex justify-end space-x-3 pt-4">
          <button type="button" class="btn-secondary" onclick="window.closeModal()">Cancel</button>
          <button type="submit" class="btn-primary">Create Project</button>
        </div>
      </form>
    `,
    onMount: () => {
      document.getElementById('new-project-form')?.addEventListener('submit', handleCreateProject);
    }
  }));
}

/**
 * Handle project creation
 */
async function handleCreateProject(event) {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);

  const project = {
    id: crypto.randomUUID(),
    name: formData.get('name'),
    description: formData.get('description'),
    living: formData.get('living') === 'on',
    query: null,
    lastSearchRunId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  try {
    await db.projects.add(project);
    store.dispatch(actions.addProject(project));
    store.dispatch(actions.hideModal());
    showToast({ type: 'success', message: 'Project created' });
    router.navigate(`/project/${project.id}/search`);
  } catch (err) {
    handleError(new AppError('Failed to create project', {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.ERROR,
      cause: err
    }));
  }
}

/**
 * Update sync status text
 */
function updateSyncStatus(text) {
  const el = document.getElementById('sync-status');
  if (el) {
    el.textContent = text;
  }
}

/**
 * Render toast notification
 */
function renderToast(toast) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const colors = {
    success: 'bg-success-500',
    error: 'bg-danger-500',
    warning: 'bg-warning-500',
    info: 'bg-primary-500'
  };

  const toastEl = document.createElement('div');
  toastEl.className = `${colors[toast.type] || colors.info} text-white px-4 py-3 rounded-lg shadow-lg flex items-center space-x-2 animate-slide-in`;
  toastEl.innerHTML = `
    <span>${escapeHtml(toast.message)}</span>
    <button class="ml-2 hover:opacity-75" onclick="this.parentElement.remove()">
      <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  `;

  container.appendChild(toastEl);

  // Auto-remove after 5 seconds
  setTimeout(() => {
    toastEl.remove();
  }, toast.duration || 5000);
}

/**
 * Render modal
 */
function renderModal(modal) {
  const container = document.getElementById('modal-container');
  if (!container) return;

  container.innerHTML = `
    <div class="fixed inset-0 z-50 overflow-y-auto">
      <div class="flex min-h-full items-center justify-center p-4">
        <div class="fixed inset-0 bg-black/50 transition-opacity" onclick="window.closeModal()"></div>
        <div class="relative bg-white rounded-xl shadow-xl max-w-lg w-full p-6 transform transition-all">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-lg font-semibold text-gray-900">${escapeHtml(modal.title)}</h3>
            <button onclick="window.closeModal()" class="text-gray-400 hover:text-gray-500">
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div class="modal-content">
            ${modal.content}
          </div>
        </div>
      </div>
    </div>
  `;

  if (modal.onMount) {
    modal.onMount();
  }
}

/**
 * Close modal
 */
function closeModal() {
  const container = document.getElementById('modal-container');
  if (container) {
    container.innerHTML = '';
  }
  store.dispatch(actions.hideModal());
}

// Expose closeModal globally for onclick handlers
window.closeModal = closeModal;

/**
 * Format relative time
 */
function formatRelativeTime(date) {
  const now = new Date();
  const diff = now - new Date(date);
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return new Date(date).toLocaleDateString();
}

// Export for use in other modules
export {
  searchWorker,
  analysisWorker,
  eimWorker,
  APP_CONFIG
};

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
