/**
 * IndexedDB Schema and Database Operations
 * Using Dexie.js-style wrapper for cleaner API
 */

const DB_NAME = 'living-meta-analysis';
const DB_VERSION = 4;

// Database instance
let dbInstance = null;

/**
 * Database schema definition
 */
const SCHEMA = {
  // Projects table
  projects: {
    keyPath: 'id',
    indexes: [
      { name: 'name', keyPath: 'name', unique: false },
      { name: 'createdAt', keyPath: 'createdAt', unique: false },
      { name: 'living', keyPath: 'living', unique: false }
    ]
  },

  // Search runs (snapshots)
  search_runs: {
    keyPath: 'id',
    indexes: [
      { name: 'projectId', keyPath: 'projectId', unique: false },
      { name: 'timestamp', keyPath: 'timestamp', unique: false },
      { name: 'project_timestamp', keyPath: ['projectId', 'timestamp'], unique: false }
    ]
  },

  // Trial records (raw CT.gov JSON + parsed summary)
  records: {
    keyPath: 'nctId',
    indexes: [
      { name: 'lastUpdatePostDate', keyPath: 'lastUpdatePostDate', unique: false },
      { name: 'hasResults', keyPath: 'hasResults', unique: false },
      { name: 'overallStatus', keyPath: 'overallStatus', unique: false }
    ]
  },

  // Screening decisions
  screening: {
    keyPath: ['projectId', 'nctId'],
    indexes: [
      { name: 'projectId', keyPath: 'projectId', unique: false },
      { name: 'decision', keyPath: 'decision', unique: false },
      { name: 'stage', keyPath: 'stage', unique: false },
      { name: 'project_decision', keyPath: ['projectId', 'decision'], unique: false }
    ]
  },

  // Extraction data
  extraction: {
    keyPath: ['projectId', 'nctId', 'outcomeId'],
    indexes: [
      { name: 'projectId', keyPath: 'projectId', unique: false },
      { name: 'nctId', keyPath: 'nctId', unique: false },
      { name: 'locked', keyPath: 'locked', unique: false },
      { name: 'project_nct', keyPath: ['projectId', 'nctId'], unique: false }
    ]
  },

  // Analysis specifications
  analysis_specs: {
    keyPath: 'id',
    indexes: [
      { name: 'projectId', keyPath: 'projectId', unique: false },
      { name: 'outcomeId', keyPath: 'outcomeId', unique: false }
    ]
  },

  // Analysis results
  analysis_results: {
    keyPath: 'id',
    indexes: [
      { name: 'specId', keyPath: 'specId', unique: false },
      { name: 'projectId', keyPath: 'projectId', unique: false },
      { name: 'timestamp', keyPath: 'timestamp', unique: false }
    ]
  },

  // EIM trial-level flags
  eim_trial_flags: {
    keyPath: ['projectId', 'nctId'],
    indexes: [
      { name: 'projectId', keyPath: 'projectId', unique: false },
      { name: 'nonPublicationRisk', keyPath: 'nonPublicationRisk', unique: false },
      { name: 'earlyTerminationFlag', keyPath: 'earlyTerminationFlag', unique: false }
    ]
  },

  // EIM meta-level summaries
  eim_meta: {
    keyPath: ['projectId', 'runId'],
    indexes: [
      { name: 'projectId', keyPath: 'projectId', unique: false },
      { name: 'timestamp', keyPath: 'timestamp', unique: false }
    ]
  },

  // TSA (Trial Sequential Analysis) runs
  tsa_runs: {
    keyPath: ['projectId', 'outcomeId'],
    indexes: [
      { name: 'projectId', keyPath: 'projectId', unique: false },
      { name: 'timestamp', keyPath: 'timestamp', unique: false }
    ]
  },

  // ROB 2.0 Assessments
  rob_assessments: {
    keyPath: ['projectId', 'studyId', 'outcomeId'],
    indexes: [
      { name: 'projectId', keyPath: 'projectId', unique: false },
      { name: 'studyId', keyPath: 'studyId', unique: false },
      { name: 'overallJudgment', keyPath: 'overallJudgment', unique: false },
      { name: 'project_study', keyPath: ['projectId', 'studyId'], unique: false }
    ]
  },

  // Application state persistence
  app_state: {
    keyPath: 'id',
    indexes: [
      { name: 'savedAt', keyPath: 'savedAt', unique: false }
    ]
  }
};

/**
 * Initialize the database
 */
export async function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error('Failed to open database: ' + request.error));
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      const transaction = event.target.transaction;

      // Create or update object stores based on schema
      for (const [storeName, config] of Object.entries(SCHEMA)) {
        let store;

        if (!database.objectStoreNames.contains(storeName)) {
          // Create new store
          store = database.createObjectStore(storeName, {
            keyPath: config.keyPath
          });
        } else {
          // Get existing store for index updates
          store = transaction.objectStore(storeName);
        }

        // Create indexes (skip if already exists)
        for (const index of config.indexes || []) {
          if (!store.indexNames.contains(index.name)) {
            try {
              store.createIndex(index.name, index.keyPath, {
                unique: index.unique || false
              });
            } catch (e) {
              console.warn(`Could not create index ${index.name} on ${storeName}:`, e.message);
            }
          }
        }
      }
    };
  });
}

/**
 * Get the database instance
 */
export function getDB() {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initDB() first.');
  }
  return dbInstance;
}

/**
 * Generic table wrapper for CRUD operations
 */
class Table {
  constructor(storeName) {
    this.storeName = storeName;
  }

  /**
   * Get a transaction for this store
   */
  transaction(mode = 'readonly') {
    return getDB().transaction(this.storeName, mode);
  }

  /**
   * Get the object store
   */
  store(mode = 'readonly') {
    return this.transaction(mode).objectStore(this.storeName);
  }

  /**
   * Get a record by key
   */
  async get(key) {
    // Safety check: return undefined if key is null/undefined
    if (key === null || key === undefined) {
      console.warn(`get() called with ${key} on ${this.storeName}, returning undefined`);
      return undefined;
    }
    return new Promise((resolve, reject) => {
      const request = this.store().get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all records
   */
  async toArray() {
    return new Promise((resolve, reject) => {
      const request = this.store().getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get records by index
   * Falls back to full scan if index doesn't exist
   */
  async where(indexName, value) {
    return new Promise((resolve, reject) => {
      try {
        const store = this.store();

        // Check if index exists, fall back to scan if not
        if (!store.indexNames.contains(indexName)) {
          console.warn(`Index '${indexName}' not found on ${this.storeName}, falling back to scan`);
          const request = store.getAll();
          request.onsuccess = () => {
            // Filter manually
            const results = request.result.filter(record => record[indexName] === value);
            resolve(results);
          };
          request.onerror = () => reject(request.error);
          return;
        }

        const index = store.index(indexName);
        const request = index.getAll(value);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      } catch (e) {
        // Fallback to full scan on any error
        console.warn(`Error accessing index '${indexName}' on ${this.storeName}:`, e.message);
        this.toArray().then(records => {
          resolve(records.filter(record => record[indexName] === value));
        }).catch(reject);
      }
    });
  }

  /**
   * Get records by index range
   */
  async whereRange(indexName, lower, upper, options = {}) {
    return new Promise((resolve, reject) => {
      const store = this.store();
      const index = store.index(indexName);
      const range = IDBKeyRange.bound(
        lower,
        upper,
        options.lowerOpen || false,
        options.upperOpen || false
      );
      const request = index.getAll(range);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Add a new record
   */
  async add(data) {
    return new Promise((resolve, reject) => {
      const request = this.store('readwrite').add(data);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Put (upsert) a record
   */
  async put(data) {
    return new Promise((resolve, reject) => {
      const request = this.store('readwrite').put(data);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Add or update multiple records
   */
  async bulkPut(records) {
    return new Promise((resolve, reject) => {
      const tx = this.transaction('readwrite');
      const store = tx.objectStore(this.storeName);

      let completed = 0;
      const errors = [];

      for (const record of records) {
        const request = store.put(record);
        request.onsuccess = () => {
          completed++;
          if (completed === records.length) {
            resolve({ success: completed, errors });
          }
        };
        request.onerror = () => {
          errors.push(request.error);
          completed++;
          if (completed === records.length) {
            resolve({ success: completed - errors.length, errors });
          }
        };
      }

      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Delete a record by key
   */
  async delete(key) {
    return new Promise((resolve, reject) => {
      const request = this.store('readwrite').delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Delete multiple records
   */
  async bulkDelete(keys) {
    return new Promise((resolve, reject) => {
      const tx = this.transaction('readwrite');
      const store = tx.objectStore(this.storeName);

      for (const key of keys) {
        store.delete(key);
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Clear all records
   */
  async clear() {
    return new Promise((resolve, reject) => {
      const request = this.store('readwrite').clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Count records
   */
  async count() {
    return new Promise((resolve, reject) => {
      const request = this.store().count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Count records by index
   * Falls back to full scan if index doesn't exist
   */
  async countWhere(indexName, value) {
    return new Promise((resolve, reject) => {
      try {
        const store = this.store();

        // Check if index exists, fall back to scan if not
        if (!store.indexNames.contains(indexName)) {
          console.warn(`Index '${indexName}' not found on ${this.storeName}, falling back to scan`);
          const request = store.getAll();
          request.onsuccess = () => {
            const count = request.result.filter(record => record[indexName] === value).length;
            resolve(count);
          };
          request.onerror = () => reject(request.error);
          return;
        }

        const index = store.index(indexName);
        const request = index.count(value);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      } catch (e) {
        // Fallback to full scan on any error
        console.warn(`Error counting index '${indexName}' on ${this.storeName}:`, e.message);
        this.toArray().then(records => {
          resolve(records.filter(record => record[indexName] === value).length);
        }).catch(reject);
      }
    });
  }
}

/**
 * Database tables export
 */
export const db = {
  projects: new Table('projects'),
  searchRuns: new Table('search_runs'),
  records: new Table('records'),
  screening: new Table('screening'),
  extraction: new Table('extraction'),
  analysisSpecs: new Table('analysis_specs'),
  analysisResults: new Table('analysis_results'),
  eimTrialFlags: new Table('eim_trial_flags'),
  eimMeta: new Table('eim_meta'),
  tsaRuns: new Table('tsa_runs'),
  robAssessments: new Table('rob_assessments'),
  appState: new Table('app_state'),

  /**
   * Get a table by name (for dynamic access)
   * @param {string} name - Table name
   * @returns {Table} Table instance
   */
  table(name) {
    return new Table(name);
  }
};

/**
 * Export project data as JSON bundle
 */
export async function exportProjectBundle(projectId) {
  const project = await db.projects.get(projectId);
  if (!project) throw new Error('Project not found');

  const [
    searchRuns,
    screening,
    extraction,
    analysisSpecs,
    analysisResults,
    eimTrialFlags,
    eimMeta,
    tsaRuns,
    robAssessments
  ] = await Promise.all([
    db.searchRuns.where('projectId', projectId),
    db.screening.where('projectId', projectId),
    db.extraction.where('projectId', projectId),
    db.analysisSpecs.where('projectId', projectId),
    db.analysisResults.where('projectId', projectId),
    db.eimTrialFlags.where('projectId', projectId),
    db.eimMeta.where('projectId', projectId),
    db.tsaRuns.where('projectId', projectId),
    db.robAssessments.where('projectId', projectId)
  ]);

  // Get unique NCT IDs from screening
  const nctIds = [...new Set(screening.map(s => s.nctId))];
  const records = await Promise.all(nctIds.map(id => db.records.get(id)));

  return {
    version: DB_VERSION,
    exportedAt: new Date().toISOString(),
    project,
    searchRuns,
    records: records.filter(Boolean),
    screening,
    extraction,
    analysisSpecs,
    analysisResults,
    eimTrialFlags,
    eimMeta,
    tsaRuns,
    robAssessments
  };
}

/**
 * Import project data from JSON bundle
 */
export async function importProjectBundle(bundle) {
  if (!bundle.project) throw new Error('Invalid bundle: missing project');

  // Generate new project ID to avoid conflicts
  const newProjectId = crypto.randomUUID();
  const oldProjectId = bundle.project.id;

  // Remap project ID in all records
  const remap = (obj) => {
    if (obj.projectId === oldProjectId) {
      return { ...obj, projectId: newProjectId };
    }
    return obj;
  };

  // Import project with new ID
  const project = {
    ...bundle.project,
    id: newProjectId,
    importedAt: new Date().toISOString()
  };
  await db.projects.put(project);

  // Import related data
  if (bundle.searchRuns) {
    await db.searchRuns.bulkPut(bundle.searchRuns.map(remap));
  }
  if (bundle.records) {
    await db.records.bulkPut(bundle.records);
  }
  if (bundle.screening) {
    await db.screening.bulkPut(bundle.screening.map(remap));
  }
  if (bundle.extraction) {
    await db.extraction.bulkPut(bundle.extraction.map(remap));
  }
  if (bundle.analysisSpecs) {
    await db.analysisSpecs.bulkPut(bundle.analysisSpecs.map(remap));
  }
  if (bundle.analysisResults) {
    await db.analysisResults.bulkPut(bundle.analysisResults.map(remap));
  }
  if (bundle.eimTrialFlags) {
    await db.eimTrialFlags.bulkPut(bundle.eimTrialFlags.map(remap));
  }
  if (bundle.eimMeta) {
    await db.eimMeta.bulkPut(bundle.eimMeta.map(remap));
  }
  if (bundle.tsaRuns) {
    await db.tsaRuns.bulkPut(bundle.tsaRuns.map(remap));
  }
  if (bundle.robAssessments) {
    await db.robAssessments.bulkPut(bundle.robAssessments.map(remap));
  }

  return project;
}

export default db;
