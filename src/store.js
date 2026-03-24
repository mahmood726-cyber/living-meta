/**
 * Simple reducer-based state container
 * No external dependencies - pure JavaScript state management
 */

// Initial state
const initialState = {
  // Current project
  currentProject: null,

  // Projects list (metadata only, full data in IndexedDB)
  projects: [],

  // Current search run
  currentSearchRun: null,

  // Screening queue
  screeningQueue: [],
  screeningCurrent: null,

  // Extraction state
  extractionTable: [],

  // Analysis state
  analysisSpec: null,
  analysisResults: null,

  // EIM state
  eimTrialFlags: [],
  eimMetaSummary: null,

  // UI state
  ui: {
    loading: false,
    error: null,
    toast: null,
    modal: null,
    sidebarOpen: true
  },

  // Sync state
  sync: {
    lastSync: null,
    syncing: false,
    pendingChanges: 0
  }
};

// Action types
export const ActionTypes = {
  // Project actions
  SET_CURRENT_PROJECT: 'SET_CURRENT_PROJECT',
  SET_PROJECTS: 'SET_PROJECTS',
  ADD_PROJECT: 'ADD_PROJECT',
  UPDATE_PROJECT: 'UPDATE_PROJECT',
  DELETE_PROJECT: 'DELETE_PROJECT',

  // Search actions
  SET_SEARCH_RUN: 'SET_SEARCH_RUN',
  SET_SEARCH_RESULTS: 'SET_SEARCH_RESULTS',

  // Screening actions
  SET_SCREENING_QUEUE: 'SET_SCREENING_QUEUE',
  SET_SCREENING_CURRENT: 'SET_SCREENING_CURRENT',
  UPDATE_SCREENING_DECISION: 'UPDATE_SCREENING_DECISION',

  // Extraction actions
  SET_EXTRACTION_TABLE: 'SET_EXTRACTION_TABLE',
  UPDATE_EXTRACTION_ROW: 'UPDATE_EXTRACTION_ROW',

  // Analysis actions
  SET_ANALYSIS_SPEC: 'SET_ANALYSIS_SPEC',
  SET_ANALYSIS_RESULTS: 'SET_ANALYSIS_RESULTS',

  // EIM actions
  SET_EIM_TRIAL_FLAGS: 'SET_EIM_TRIAL_FLAGS',
  SET_EIM_META_SUMMARY: 'SET_EIM_META_SUMMARY',

  // UI actions
  SET_LOADING: 'SET_LOADING',
  SET_ERROR: 'SET_ERROR',
  SHOW_TOAST: 'SHOW_TOAST',
  HIDE_TOAST: 'HIDE_TOAST',
  SHOW_MODAL: 'SHOW_MODAL',
  HIDE_MODAL: 'HIDE_MODAL',
  TOGGLE_SIDEBAR: 'TOGGLE_SIDEBAR',

  // Sync actions
  SET_SYNCING: 'SET_SYNCING',
  SET_LAST_SYNC: 'SET_LAST_SYNC',
  SET_PENDING_CHANGES: 'SET_PENDING_CHANGES',

  // Reset
  RESET_STATE: 'RESET_STATE'
};

// Reducer
function reducer(state, action) {
  switch (action.type) {
    // Project reducers
    case ActionTypes.SET_CURRENT_PROJECT:
      return { ...state, currentProject: action.payload };

    case ActionTypes.SET_PROJECTS:
      return { ...state, projects: action.payload };

    case ActionTypes.ADD_PROJECT:
      return { ...state, projects: [...state.projects, action.payload] };

    case ActionTypes.UPDATE_PROJECT:
      return {
        ...state,
        projects: state.projects.map(p =>
          p.id === action.payload.id ? { ...p, ...action.payload } : p
        ),
        currentProject: state.currentProject?.id === action.payload.id
          ? { ...state.currentProject, ...action.payload }
          : state.currentProject
      };

    case ActionTypes.DELETE_PROJECT:
      return {
        ...state,
        projects: state.projects.filter(p => p.id !== action.payload),
        currentProject: state.currentProject?.id === action.payload ? null : state.currentProject
      };

    // Search reducers
    case ActionTypes.SET_SEARCH_RUN:
      return { ...state, currentSearchRun: action.payload };

    case ActionTypes.SET_SEARCH_RESULTS:
      return {
        ...state,
        currentSearchRun: state.currentSearchRun
          ? { ...state.currentSearchRun, results: action.payload }
          : null
      };

    // Screening reducers
    case ActionTypes.SET_SCREENING_QUEUE:
      return { ...state, screeningQueue: action.payload };

    case ActionTypes.SET_SCREENING_CURRENT:
      return { ...state, screeningCurrent: action.payload };

    case ActionTypes.UPDATE_SCREENING_DECISION:
      return {
        ...state,
        screeningQueue: state.screeningQueue.map(item =>
          item.nctId === action.payload.nctId
            ? { ...item, decision: action.payload.decision }
            : item
        )
      };

    // Extraction reducers
    case ActionTypes.SET_EXTRACTION_TABLE:
      return { ...state, extractionTable: action.payload };

    case ActionTypes.UPDATE_EXTRACTION_ROW:
      return {
        ...state,
        extractionTable: state.extractionTable.map(row =>
          row.id === action.payload.id ? { ...row, ...action.payload } : row
        )
      };

    // Analysis reducers
    case ActionTypes.SET_ANALYSIS_SPEC:
      return { ...state, analysisSpec: action.payload };

    case ActionTypes.SET_ANALYSIS_RESULTS:
      return { ...state, analysisResults: action.payload };

    // EIM reducers
    case ActionTypes.SET_EIM_TRIAL_FLAGS:
      return { ...state, eimTrialFlags: action.payload };

    case ActionTypes.SET_EIM_META_SUMMARY:
      return { ...state, eimMetaSummary: action.payload };

    // UI reducers
    case ActionTypes.SET_LOADING:
      return { ...state, ui: { ...state.ui, loading: action.payload } };

    case ActionTypes.SET_ERROR:
      return { ...state, ui: { ...state.ui, error: action.payload } };

    case ActionTypes.SHOW_TOAST:
      return { ...state, ui: { ...state.ui, toast: action.payload } };

    case ActionTypes.HIDE_TOAST:
      return { ...state, ui: { ...state.ui, toast: null } };

    case ActionTypes.SHOW_MODAL:
      return { ...state, ui: { ...state.ui, modal: action.payload } };

    case ActionTypes.HIDE_MODAL:
      return { ...state, ui: { ...state.ui, modal: null } };

    case ActionTypes.TOGGLE_SIDEBAR:
      return { ...state, ui: { ...state.ui, sidebarOpen: !state.ui.sidebarOpen } };

    // Sync reducers
    case ActionTypes.SET_SYNCING:
      return { ...state, sync: { ...state.sync, syncing: action.payload } };

    case ActionTypes.SET_LAST_SYNC:
      return { ...state, sync: { ...state.sync, lastSync: action.payload } };

    case ActionTypes.SET_PENDING_CHANGES:
      return { ...state, sync: { ...state.sync, pendingChanges: action.payload } };

    // Reset
    case ActionTypes.RESET_STATE:
      return { ...initialState };

    default:
      return state;
  }
}

// Store class
class Store {
  constructor() {
    this.state = { ...initialState };
    this.listeners = new Set();
    this.middlewares = [];
  }

  getState() {
    return this.state;
  }

  dispatch(action) {
    // Run middlewares
    for (const middleware of this.middlewares) {
      action = middleware(this.state, action);
      if (!action) return; // Middleware can cancel action
    }

    // Update state
    const prevState = this.state;
    this.state = reducer(this.state, action);

    // Notify listeners if state changed
    if (prevState !== this.state) {
      this.notify(action, prevState);
    }

    return action;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(action, prevState) {
    for (const listener of this.listeners) {
      try {
        listener(this.state, action, prevState);
      } catch (err) {
        console.error('Store listener error:', err);
      }
    }
  }

  use(middleware) {
    this.middlewares.push(middleware);
  }

  // Selector helpers
  select(selector) {
    return selector(this.state);
  }
}

// Create singleton store
export const store = new Store();

// Action creators
export const actions = {
  // Project actions
  setCurrentProject: (project) => ({ type: ActionTypes.SET_CURRENT_PROJECT, payload: project }),
  setProjects: (projects) => ({ type: ActionTypes.SET_PROJECTS, payload: projects }),
  addProject: (project) => ({ type: ActionTypes.ADD_PROJECT, payload: project }),
  updateProject: (project) => ({ type: ActionTypes.UPDATE_PROJECT, payload: project }),
  deleteProject: (id) => ({ type: ActionTypes.DELETE_PROJECT, payload: id }),

  // Search actions
  setSearchRun: (run) => ({ type: ActionTypes.SET_SEARCH_RUN, payload: run }),
  setSearchResults: (results) => ({ type: ActionTypes.SET_SEARCH_RESULTS, payload: results }),

  // Screening actions
  setScreeningQueue: (queue) => ({ type: ActionTypes.SET_SCREENING_QUEUE, payload: queue }),
  setScreeningCurrent: (item) => ({ type: ActionTypes.SET_SCREENING_CURRENT, payload: item }),
  updateScreeningDecision: (nctId, decision) => ({
    type: ActionTypes.UPDATE_SCREENING_DECISION,
    payload: { nctId, decision }
  }),

  // Extraction actions
  setExtractionTable: (table) => ({ type: ActionTypes.SET_EXTRACTION_TABLE, payload: table }),
  updateExtractionRow: (row) => ({ type: ActionTypes.UPDATE_EXTRACTION_ROW, payload: row }),

  // Analysis actions
  setAnalysisSpec: (spec) => ({ type: ActionTypes.SET_ANALYSIS_SPEC, payload: spec }),
  setAnalysisResults: (results) => ({ type: ActionTypes.SET_ANALYSIS_RESULTS, payload: results }),

  // EIM actions
  setEimTrialFlags: (flags) => ({ type: ActionTypes.SET_EIM_TRIAL_FLAGS, payload: flags }),
  setEimMetaSummary: (summary) => ({ type: ActionTypes.SET_EIM_META_SUMMARY, payload: summary }),

  // UI actions
  setLoading: (loading) => ({ type: ActionTypes.SET_LOADING, payload: loading }),
  setError: (error) => ({ type: ActionTypes.SET_ERROR, payload: error }),
  showToast: (toast) => ({ type: ActionTypes.SHOW_TOAST, payload: toast }),
  hideToast: () => ({ type: ActionTypes.HIDE_TOAST }),
  showModal: (modal) => ({ type: ActionTypes.SHOW_MODAL, payload: modal }),
  hideModal: () => ({ type: ActionTypes.HIDE_MODAL }),
  toggleSidebar: () => ({ type: ActionTypes.TOGGLE_SIDEBAR }),

  // Sync actions
  setSyncing: (syncing) => ({ type: ActionTypes.SET_SYNCING, payload: syncing }),
  setLastSync: (date) => ({ type: ActionTypes.SET_LAST_SYNC, payload: date }),
  setPendingChanges: (count) => ({ type: ActionTypes.SET_PENDING_CHANGES, payload: count }),

  // Reset
  resetState: () => ({ type: ActionTypes.RESET_STATE })
};

// Selectors
export const selectors = {
  getCurrentProject: (state) => state.currentProject,
  getProjects: (state) => state.projects,
  getCurrentSearchRun: (state) => state.currentSearchRun,
  getScreeningQueue: (state) => state.screeningQueue,
  getExtractionTable: (state) => state.extractionTable,
  getAnalysisResults: (state) => state.analysisResults,
  getEimMetaSummary: (state) => state.eimMetaSummary,
  isLoading: (state) => state.ui.loading,
  getError: (state) => state.ui.error,
  isSyncing: (state) => state.sync.syncing
};

// Logging middleware (development only - disabled in production)
export const loggingMiddleware = (state, action) => {
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') {
    return action;
  }
  // Disabled by default - uncomment for debugging:
  // console.group(`Action: ${action.type}`);
  // console.log('Payload:', action.payload);
  // console.log('Prev State:', state);
  // console.groupEnd();
  return action;
};

export default store;
