/**
 * Store Persistence Middleware
 * Automatically sync state with IndexedDB
 *
 * @module PersistenceMiddleware
 */

import { openDB } from 'idb';

/**
 * Database configuration
 */
const DB_CONFIG = {
  name: 'living-meta-state',
  version: 1,
  stores: {
    state: 'state',
    projects: 'projects',
    cache: 'cache'
  }
};

/**
 * State persistence options
 */
const DEFAULT_OPTIONS = {
  key: 'app-state',
  whitelist: [
    'currentProject',
    'projects',
    'sync'
  ],
  blacklist: [
    'ui.loading',
    'ui.modal',
    'sync.syncing'
  ],
  debounceMs: 1000,
  hydrate: true,
  debug: false
};

/**
 * Create IndexedDB connection
 * @param {Object} config - Database configuration
 * @returns {Promise<IDBDatabase>} Database connection
 */
async function createDB(config = DB_CONFIG) {
  return openDB(config.name, config.version, {
    upgrade(db) {
      for (const storeName of Object.values(config.stores)) {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName);
        }
      }
    }
  });
}

/**
 * Filter state by whitelist/blacklist
 * @param {Object} state - State to filter
 * @param {Array} whitelist - Whitelisted paths
 * @param {Array} blacklist - Blacklisted paths
 * @returns {Object} Filtered state
 */
function filterState(state, whitelist, blacklist) {
  const result = {};

  if (whitelist && whitelist.length > 0) {
    for (const path of whitelist) {
      const value = getNestedValue(state, path);
      if (value !== undefined) {
        setNestedValue(result, path, value);
      }
    }
  } else {
    Object.assign(result, state);
  }

  if (blacklist && blacklist.length > 0) {
    for (const path of blacklist) {
      removeNestedValue(result, path);
    }
  }

  return result;
}

/**
 * Get nested value from object
 * @param {Object} obj - Object to get from
 * @param {string} path - Dot-notation path
 * @returns {*} Value at path
 */
function getNestedValue(obj, path) {
  const keys = path.split('.');
  let value = obj;

  for (const key of keys) {
    if (value && typeof value === 'object') {
      value = value[key];
    } else {
      return undefined;
    }
  }

  return value;
}

/**
 * Set nested value in object
 * @param {Object} obj - Object to set in
 * @param {string} path - Dot-notation path
 * @param {*} value - Value to set
 */
function setNestedValue(obj, path, value) {
  const keys = path.split('.');
  let current = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current) || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }

  current[keys[keys.length - 1]] = value;
}

/**
 * Remove nested value from object
 * @param {Object} obj - Object to remove from
 * @param {string} path - Dot-notation path
 */
function removeNestedValue(obj, path) {
  const keys = path.split('.');
  let current = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (current && typeof current === 'object') {
      current = current[key];
    } else {
      return;
    }
  }

  if (current && typeof current === 'object') {
    delete current[keys[keys.length - 1]];
  }
}

/**
 * Create persistence middleware
 * @param {Object} options - Middleware options
 * @returns {Function} Middleware function
 */
export function createPersistenceMiddleware(options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let db = null;
  let saveTimer = null;
  let isHydrated = false;

  // Initialize database
  async function initDB() {
    if (!db) {
      try {
        db = await createDB();
        if (opts.debug) {
          console.log('[Persistence] Database initialized');
        }
      } catch (error) {
        console.error('[Persistence] Failed to initialize database:', error);
      }
    }
    return db;
  }

  // Save state to database
  async function saveState(state) {
    const database = await initDB();
    if (!database) return;

    try {
      const filtered = filterState(
        state,
        opts.whitelist,
        opts.blacklist
      );

      await database.put(DB_CONFIG.stores.state, filtered, opts.key);

      if (opts.debug) {
        console.log('[Persistence] State saved', filtered);
      }
    } catch (error) {
      console.error('[Persistence] Failed to save state:', error);
    }
  }

  // Load state from database
  async function loadState() {
    const database = await initDB();
    if (!database) return null;

    try {
      const state = await database.get(DB_CONFIG.stores.state, opts.key);
      if (opts.debug) {
        console.log('[Persistence] State loaded', state);
      }
      return state;
    } catch (error) {
      console.error('[Persistence] Failed to load state:', error);
      return null;
    }
  }

  // Clear persisted state
  async function clearState() {
    const database = await initDB();
    if (!database) return;

    try {
      await database.delete(DB_CONFIG.stores.state, opts.key);
      if (opts.debug) {
        console.log('[Persistence] State cleared');
      }
    } catch (error) {
      console.error('[Persistence] Failed to clear state:', error);
    }
  }

  // Debounced save
  function scheduleSave(state) {
    if (saveTimer) {
      clearTimeout(saveTimer);
    }

    saveTimer = setTimeout(() => {
      saveState(state);
      saveTimer = null;
    }, opts.debounceMs);
  }

  // Middleware function
  const middleware = (state, action) => {
    // Return action unchanged (we only observe state changes)
    return action;
  };

  // Initialize persistence
  async function hydrate(store) {
    if (opts.hydrate && !isHydrated) {
      const savedState = await loadState();
      if (savedState) {
        // Merge with initial state
        for (const [key, value] of Object.entries(savedState)) {
          store.dispatch({
            type: 'PERSISTENCE_HYDRATE',
            payload: { key, value }
          });
        }
      }
      isHydrated = true;
    }
  }

  // Subscribe to state changes
  function subscribe(store) {
    store.subscribe((state, action, prevState) => {
      // Skip persistence actions to avoid loops
      if (action.type === 'PERSISTENCE_HYDRATE') {
        return;
      }

      scheduleSave(state);
    });
  }

  // Expose API
  middleware.init = initDB;
  middleware.save = saveState;
  middleware.load = loadState;
  middleware.clear = clearState;
  middleware.hydrate = hydrate;
  middleware.subscribe = subscribe;
  middleware.isHydrated = () => isHydrated;

  return middleware;
}

/**
 * Create project-specific persistence
 * @param {string} projectId - Project ID
 * @param {Object} options - Options
 * @returns {Object} Project persistence API
 */
export function createProjectPersistence(projectId, options = {}) {
  const key = `project-${projectId}`;
  const opts = {
    ...DEFAULT_OPTIONS,
    ...options,
    key,
    whitelist: [
      'screeningQueue',
      'screeningCurrent',
      'extractionTable',
      'analysisSpec',
      'analysisResults',
      'eimTrialFlags'
    ]
  };

  const middleware = createPersistenceMiddleware(opts);

  return {
    ...middleware,
    async saveProjectState(state) {
      return middleware.save(state);
    },
    async loadProjectState() {
      return middleware.load();
    }
  };
}

/**
 * Migration utilities for state changes
 */
export const Migrations = {
  /**
   * Register a migration
   * @param {string} version - Version number
   * @param {Function} migrate - Migration function
   */
  register(version, migrate) {
    Migrations.migrations[version] = migrate;
  },

  migrations: {},

  /**
   * Run migrations
   * @param {Object} state - State to migrate
   * @param {string} fromVersion - Source version
   * @param {string} toVersion - Target version
   * @returns {Promise<Object>} Migrated state
   */
  async run(state, fromVersion, toVersion) {
    let currentState = state;
    const versions = Object.keys(Migrations.migrations).sort();

    for (const version of versions) {
      if (version > fromVersion && version <= toVersion) {
        const migration = Migrations.migrations[version];
        if (migration) {
          currentState = await migration(currentState);
        }
      }
    }

    return currentState;
  }
};

/**
 * Persistence manager for coordinating multiple persistence layers
 */
export class PersistenceManager {
  constructor() {
    this.middlewares = new Map();
    this.db = null;
  }

  /**
   * Initialize the manager
   */
  async init() {
    this.db = await createDB();
  }

  /**
   * Register a persistence middleware
   * @param {string} key - Unique key
   * @param {Function} middleware - Middleware function
   */
  register(key, middleware) {
    this.middlewares.set(key, middleware);
  }

  /**
   * Get a persistence middleware
   * @param {string} key - Middleware key
   * @returns {Function} Middleware function
   */
  get(key) {
    return this.middlewares.get(key);
  }

  /**
   * Save all persisted states
   */
  async saveAll(states) {
    if (!this.db) {
      await this.init();
    }

    for (const [key, state] of Object.entries(states)) {
      const middleware = this.middlewares.get(key);
      if (middleware && middleware.save) {
        await middleware.save(state);
      }
    }
  }

  /**
   * Load all persisted states
   */
  async loadAll() {
    if (!this.db) {
      await this.init();
    }

    const states = {};

    for (const [key, middleware] of this.middlewares.entries()) {
      if (middleware.load) {
        const state = await middleware.load();
        if (state) {
          states[key] = state;
        }
      }
    }

    return states;
  }

  /**
   * Clear all persisted states
   */
  async clearAll() {
    if (!this.db) {
      await this.init();
    }

    for (const [key, middleware] of this.middlewares.entries()) {
      if (middleware.clear) {
        await middleware.clear();
      }
    }
  }

  /**
   * Destroy the manager
   */
  async destroy() {
    if (this.db) {
      await this.db.close();
      this.db = null;
    }
    this.middlewares.clear();
  }
}

/**
 * Initialize global persistence
 * @param {Object} store - Application store
 * @param {Object} options - Options
 * @returns {Object} Persistence API
 */
export function initPersistence(store, options = {}) {
  const middleware = createPersistenceMiddleware(options);

  // Hydrate state on init
  middleware.hydrate(store);

  // Subscribe to state changes
  middleware.subscribe(store);

  return {
    middleware,
    save: middleware.save,
    load: middleware.load,
    clear: middleware.clear,
    createProjectPersistence
  };
}

export default {
  createPersistenceMiddleware,
  createProjectPersistence,
  Migrations,
  PersistenceManager,
  initPersistence
};
