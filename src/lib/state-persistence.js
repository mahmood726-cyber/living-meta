/**
 * State Persistence Module
 * Hydrates state from IndexedDB on load and persists changes
 *
 * @module state-persistence
 * @version 1.0.0
 */

import { db } from '../db/schema.js';
import { store, actions, ActionTypes } from '../store.js';

/**
 * Keys to persist in IndexedDB
 */
const PERSIST_KEYS = [
  'currentProject',
  'currentSearchRun',
  'screeningQueue',
  'screeningCurrent',
  'extractionTable',
  'analysisSpec',
  'analysisResults',
  'eimTrialFlags',
  'eimMetaSummary'
];

/**
 * Actions that trigger persistence
 */
const PERSIST_ACTIONS = new Set([
  ActionTypes.SET_CURRENT_PROJECT,
  ActionTypes.SET_SEARCH_RUN,
  ActionTypes.SET_SCREENING_QUEUE,
  ActionTypes.SET_SCREENING_CURRENT,
  ActionTypes.UPDATE_SCREENING_DECISION,
  ActionTypes.SET_EXTRACTION_TABLE,
  ActionTypes.UPDATE_EXTRACTION_ROW,
  ActionTypes.SET_ANALYSIS_SPEC,
  ActionTypes.SET_ANALYSIS_RESULTS,
  ActionTypes.SET_EIM_TRIAL_FLAGS,
  ActionTypes.SET_EIM_META_SUMMARY
]);

/**
 * Debounce timer for batching saves
 */
let saveTimer = null;
const SAVE_DEBOUNCE_MS = 1000;

/**
 * Pending state to save
 */
let pendingState = null;

/**
 * Initialize state persistence
 * - Hydrates state from IndexedDB
 * - Sets up middleware to persist changes
 */
export async function initStatePersistence() {
  // Hydrate state from IndexedDB
  await hydrateState();

  // Add persistence middleware
  store.use(persistenceMiddleware);

  // Save state before unload
  window.addEventListener('beforeunload', () => {
    if (pendingState) {
      saveStateSync(pendingState);
    }
  });
}

/**
 * Hydrate state from IndexedDB
 */
async function hydrateState() {
  try {
    // Load persisted state
    const persistedState = await db.table('app_state').get('current');

    if (persistedState && persistedState.data) {
      const savedState = persistedState.data;

      // Restore each persisted key
      for (const key of PERSIST_KEYS) {
        if (savedState[key] !== undefined) {
          dispatchRestoreAction(key, savedState[key]);
        }
      }

      // Load projects list separately (authoritative source is projects table)
      const projects = await db.projects.toArray();
      store.dispatch(actions.setProjects(projects));
    }
  } catch (err) {
    console.warn('Failed to hydrate state from IndexedDB:', err);
    // Continue with default state - not a critical error
  }
}

/**
 * Dispatch restore action for a state key
 * @param {string} key - State key
 * @param {any} value - Value to restore
 */
function dispatchRestoreAction(key, value) {
  switch (key) {
    case 'currentProject':
      store.dispatch(actions.setCurrentProject(value));
      break;
    case 'currentSearchRun':
      store.dispatch(actions.setSearchRun(value));
      break;
    case 'screeningQueue':
      store.dispatch(actions.setScreeningQueue(value));
      break;
    case 'screeningCurrent':
      store.dispatch(actions.setScreeningCurrent(value));
      break;
    case 'extractionTable':
      store.dispatch(actions.setExtractionTable(value));
      break;
    case 'analysisSpec':
      store.dispatch(actions.setAnalysisSpec(value));
      break;
    case 'analysisResults':
      store.dispatch(actions.setAnalysisResults(value));
      break;
    case 'eimTrialFlags':
      store.dispatch(actions.setEimTrialFlags(value));
      break;
    case 'eimMetaSummary':
      store.dispatch(actions.setEimMetaSummary(value));
      break;
  }
}

/**
 * Persistence middleware
 * Batches state saves with debouncing
 */
function persistenceMiddleware(state, action) {
  // Check if this action should trigger persistence
  if (PERSIST_ACTIONS.has(action.type)) {
    scheduleSave();
  }

  // Always return action to continue dispatch
  return action;
}

/**
 * Schedule a debounced save
 */
function scheduleSave() {
  if (saveTimer) {
    clearTimeout(saveTimer);
  }

  pendingState = store.getState();

  saveTimer = setTimeout(() => {
    if (pendingState) {
      saveState(pendingState);
      pendingState = null;
    }
    saveTimer = null;
  }, SAVE_DEBOUNCE_MS);
}

/**
 * Save state to IndexedDB (async)
 * @param {Object} state - State to save
 */
async function saveState(state) {
  try {
    // Extract only persistable keys
    const persistableState = {};
    for (const key of PERSIST_KEYS) {
      if (state[key] !== undefined) {
        persistableState[key] = state[key];
      }
    }

    // Save to IndexedDB
    await db.table('app_state').put({
      id: 'current',
      data: persistableState,
      savedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('Failed to persist state:', err);
  }
}

/**
 * Save state synchronously (for beforeunload)
 * Uses synchronous IndexedDB transaction
 * @param {Object} state - State to save
 */
function saveStateSync(state) {
  try {
    const persistableState = {};
    for (const key of PERSIST_KEYS) {
      if (state[key] !== undefined) {
        persistableState[key] = state[key];
      }
    }

    // Use localStorage as fallback for sync save
    localStorage.setItem('lma_pending_state', JSON.stringify({
      data: persistableState,
      savedAt: new Date().toISOString()
    }));
  } catch (err) {
    console.error('Failed to save state synchronously:', err);
  }
}

/**
 * Recover state from localStorage (if crashed before IndexedDB save)
 */
export async function recoverPendingState() {
  try {
    const pendingJson = localStorage.getItem('lma_pending_state');
    if (pendingJson) {
      const pending = JSON.parse(pendingJson);

      // Save to IndexedDB
      await db.table('app_state').put({
        id: 'current',
        data: pending.data,
        savedAt: pending.savedAt
      });

      // Clear localStorage
      localStorage.removeItem('lma_pending_state');
    }
  } catch (err) {
    console.warn('Failed to recover pending state:', err);
  }
}

/**
 * Clear persisted state
 */
export async function clearPersistedState() {
  try {
    await db.table('app_state').delete('current');
    localStorage.removeItem('lma_pending_state');
  } catch (err) {
    console.error('Failed to clear persisted state:', err);
  }
}

/**
 * Force save current state immediately
 */
export async function forceSaveState() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }

  await saveState(store.getState());
  pendingState = null;
}

export default {
  initStatePersistence,
  recoverPendingState,
  clearPersistedState,
  forceSaveState
};
