/**
 * Memoization Utilities with Enhanced Performance
 * Provides caching for expensive calculations with persistence and metrics
 *
 * @module memoize
 * @version 2.0.0
 */

/**
 * LRU (Least Recently Used) Cache with metrics tracking
 * @template K, V
 */
export class LRUCache {
  /**
   * @param {number} maxSize - Maximum cache size
   * @param {Object} options - Cache options
   * @param {boolean} [options.trackMetrics=false] - Enable metrics tracking
   */
  constructor(maxSize = 100, options = {}) {
    this.maxSize = maxSize;
    this.cache = new Map();
    this.trackMetrics = options.trackMetrics || false;

    // Metrics tracking
    this._hits = 0;
    this._misses = 0;
    this._evictions = 0;
  }

  /**
   * Get value from cache
   * @param {K} key - Cache key
   * @returns {V|undefined} Cached value or undefined
   */
  get(key) {
    if (!this.cache.has(key)) {
      if (this.trackMetrics) this._misses++;
      return undefined;
    }

    if (this.trackMetrics) this._hits++;

    // Move to end (most recently used)
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  /**
   * Set value in cache
   * @param {K} key - Cache key
   * @param {V} value - Value to cache
   * @returns {this}
   */
  set(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Delete oldest (first) entry
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
      if (this.trackMetrics) this._evictions++;
    }
    this.cache.set(key, value);
    return this;
  }

  /**
   * Check if key exists
   * @param {K} key - Cache key
   * @returns {boolean}
   */
  has(key) {
    return this.cache.has(key);
  }

  /**
   * Delete key from cache
   * @param {K} key - Cache key
   * @returns {boolean}
   */
  delete(key) {
    return this.cache.delete(key);
  }

  /**
   * Clear cache
   */
  clear() {
    this.cache.clear();
    if (this.trackMetrics) {
      this._hits = 0;
      this._misses = 0;
      this._evictions = 0;
    }
  }

  /**
   * Get cache size
   * @returns {number}
   */
  get size() {
    return this.cache.size;
  }

  /**
   * Get cache metrics
   * @returns {Object} Metrics object with hits, misses, evictions, hitRate
   */
  getMetrics() {
    const total = this._hits + this._misses;
    return {
      hits: this._hits,
      misses: this._misses,
      evictions: this._evictions,
      hitRate: total > 0 ? this._hits / total : 0,
      size: this.cache.size,
      maxSize: this.maxSize
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this._hits = 0;
    this._misses = 0;
    this._evictions = 0;
  }
}

/**
 * Persistent cache using IndexedDB for cross-session persistence
 * @template K, V
 */
export class PersistentCache {
  /**
   * @param {string} dbName - IndexedDB database name
   * @param {string} storeName - Object store name
   */
  constructor(dbName = 'living-meta-cache', storeName = 'cache') {
    this.dbName = dbName;
    this.storeName = storeName;
    this._db = null;
    this._memoryCache = new LRUCache(50);
  }

  /**
   * Initialize IndexedDB connection
   * @returns {Promise<void>}
   */
  async init() {
    if (this._db) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this._db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
    });
  }

  /**
   * Get value from cache (memory first, then IndexedDB)
   * @param {K} key - Cache key
   * @returns {Promise<V|undefined>}
   */
  async get(key) {
    // Check memory cache first
    if (this._memoryCache.has(key)) {
      return this._memoryCache.get(key);
    }

    // Check IndexedDB
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this._db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(key);

      request.onsuccess = () => {
        const value = request.result;
        if (value !== undefined) {
          // Store in memory cache for faster access
          this._memoryCache.set(key, value);
        }
        resolve(value);
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Set value in cache (both memory and IndexedDB)
   * @param {K} key - Cache key
   * @param {V} value - Value to cache
   * @param {number} [ttl] - Time-to-live in milliseconds
   * @returns {Promise<void>}
   */
  async set(key, value, ttl) {
    // Store in memory cache
    this._memoryCache.set(key, value);

    // Store in IndexedDB
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this._db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);

      const entry = { value };
      if (ttl) {
        entry.expiresAt = Date.now() + ttl;
      }

      const request = store.put(entry, key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear all caches
   * @returns {Promise<void>}
   */
  async clear() {
    this._memoryCache.clear();

    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this._db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clean up expired entries
   * @returns {Promise<number>} Number of entries cleaned
   */
  async cleanupExpired() {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this._db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('expiresAt');

      let cleaned = 0;
      const now = Date.now();
      const range = IDBKeyRange.upperBound(now);

      const request = index.openCursor(range);

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          cleaned++;
          cursor.continue();
        } else {
          resolve(cleaned);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }
}

/**
 * Default key serializer using JSON.stringify
 * @param {any[]} args - Function arguments
 * @returns {string} Cache key
 */
function defaultKeyFn(args) {
  return JSON.stringify(args);
}

/**
 * Create a memoized version of a function
 * @template {(...args: any[]) => any} T
 * @param {T} fn - Function to memoize
 * @param {Object} [options] - Memoization options
 * @param {number} [options.maxSize=100] - Max cache size
 * @param {Function} [options.keyFn] - Custom key generator
 * @param {number} [options.ttl] - Time-to-live in milliseconds
 * @param {boolean} [options.trackMetrics=false] - Enable metrics tracking
 * @param {boolean} [options.persistent=false] - Enable persistent caching
 * @returns {T & { cache: LRUCache|PersistentCache, clear: () => void, getMetrics?: () => Object }}
 */
export function memoize(fn, options = {}) {
  const {
    maxSize = 100,
    keyFn = defaultKeyFn,
    ttl = null,
    trackMetrics = false,
    persistent = false
  } = options;

  const cache = persistent
    ? new PersistentCache()
    : new LRUCache(maxSize, { trackMetrics });

  const timestamps = ttl ? new Map() : null;

  const memoized = async function(...args) {
    const key = keyFn(args);

    // Check TTL expiration
    if (ttl && timestamps && !persistent) {
      if (timestamps.has(key)) {
        const timestamp = timestamps.get(key);
        if (Date.now() - timestamp > ttl) {
          cache.delete(key);
          timestamps.delete(key);
        }
      }
    }

    // Return cached value if exists
    if (persistent || cache.has(key)) {
      const cached = await cache.get(key);
      if (cached !== undefined) {
        return cached;
      }
    }

    // Compute and cache
    const result = await fn.apply(this, args);
    await cache.set(key, result, ttl);

    if (ttl && timestamps && !persistent) {
      timestamps.set(key, Date.now());
    }

    return result;
  };

  // Attach cache for manual inspection/clearing
  memoized.cache = cache;
  memoized.clear = () => {
    cache.clear();
    if (timestamps) timestamps.clear();
  };

  if (trackMetrics && !persistent) {
    memoized.getMetrics = () => cache.getMetrics();
    memoized.resetMetrics = () => cache.resetMetrics();
  }

  return memoized;
}

/**
 * Memoize with weak references (for object arguments)
 * Automatically garbage collects when objects are no longer referenced
 * @template {(...args: any[]) => any} T
 * @param {T} fn - Function to memoize
 * @returns {T & { clear: () => void }}
 */
export function memoizeWeak(fn) {
  const cache = new WeakMap();

  const memoized = function(obj, ...rest) {
    if (typeof obj !== 'object' || obj === null) {
      // Fall back to regular call for non-objects
      return fn.call(this, obj, ...rest);
    }

    if (!cache.has(obj)) {
      cache.set(obj, new Map());
    }

    const objCache = cache.get(obj);
    const key = rest.length > 0 ? JSON.stringify(rest) : '__single__';

    if (objCache.has(key)) {
      return objCache.get(key);
    }

    const result = fn.call(this, obj, ...rest);
    objCache.set(key, result);
    return result;
  };

  memoized.clear = () => {
    // WeakMap clears automatically when objects are GC'd
    // No manual clear needed, but we provide this for API consistency
  };

  return memoized;
}

/**
 * Create a memoized async function with pending promise deduplication
 * @template {(...args: any[]) => Promise<any>} T
 * @param {T} fn - Async function to memoize
 * @param {Object} [options] - Memoization options
 * @returns {T & { cache: LRUCache, clear: () => void }}
 */
export function memoizeAsync(fn, options = {}) {
  const {
    maxSize = 100,
    keyFn = defaultKeyFn,
    ttl = null,
    trackMetrics = false
  } = options;

  const cache = new LRUCache(maxSize, { trackMetrics });
  const pending = new Map();
  const timestamps = ttl ? new Map() : null;

  const memoized = async function(...args) {
    const key = keyFn(args);

    // Check TTL expiration
    if (ttl && timestamps.has(key)) {
      const timestamp = timestamps.get(key);
      if (Date.now() - timestamp > ttl) {
        cache.delete(key);
        timestamps.delete(key);
      }
    }

    // Return cached value if exists
    if (cache.has(key)) {
      return cache.get(key);
    }

    // If already pending, wait for existing promise
    if (pending.has(key)) {
      return pending.get(key);
    }

    // Execute and cache
    const promise = fn.apply(this, args);
    pending.set(key, promise);

    try {
      const result = await promise;
      cache.set(key, result);

      if (ttl) {
        timestamps.set(key, Date.now());
      }

      return result;
    } finally {
      pending.delete(key);
    }
  };

  memoized.cache = cache;
  memoized.clear = () => {
    cache.clear();
    pending.clear();
    if (timestamps) timestamps.clear();
  };

  if (trackMetrics) {
    memoized.getMetrics = () => cache.getMetrics();
    memoized.resetMetrics = () => cache.resetMetrics();
  }

  return memoized;
}

/**
 * Create memoized selector (like reselect)
 * Only recomputes when dependencies change
 * @param {...Function} selectors - Input selectors
 * @param {Function} resultFn - Result function
 * @returns {Function} Memoized selector
 */
export function createSelector(...args) {
  const resultFn = args.pop();
  const selectors = args;

  let lastInputs = null;
  let lastResult = null;

  return function(state) {
    const inputs = selectors.map(selector => selector(state));

    // Check if inputs changed (shallow comparison)
    const inputsChanged = !lastInputs || inputs.some((input, i) => input !== lastInputs[i]);

    if (inputsChanged) {
      lastInputs = inputs;
      lastResult = resultFn(...inputs);
    }

    return lastResult;
  };
}

/**
 * Debounce function execution
 * @param {Function} fn - Function to debounce
 * @param {number} wait - Wait time in ms
 * @returns {Function & { cancel: () => void, flush: () => void }}
 */
export function debounce(fn, wait = 100) {
  let timeout = null;
  let lastArgs = null;
  let lastThis = null;

  const debounced = function(...args) {
    lastArgs = args;
    lastThis = this;

    if (timeout) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(() => {
      timeout = null;
      fn.apply(lastThis, lastArgs);
    }, wait);
  };

  debounced.cancel = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
  };

  debounced.flush = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
      fn.apply(lastThis, lastArgs);
    }
  };

  return debounced;
}

/**
 * Throttle function execution
 * @param {Function} fn - Function to throttle
 * @param {number} limit - Minimum time between calls in ms
 * @returns {Function}
 */
export function throttle(fn, limit = 100) {
  let lastCall = 0;
  let timeout = null;

  return function(...args) {
    const now = Date.now();
    const remaining = limit - (now - lastCall);

    if (remaining <= 0) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      lastCall = now;
      fn.apply(this, args);
    } else if (!timeout) {
      timeout = setTimeout(() => {
        lastCall = Date.now();
        timeout = null;
        fn.apply(this, args);
      }, remaining);
    }
  };
}

/**
 * Dynamic import wrapper with caching
 * @param {string} modulePath - Path to module
 * @param {Object} options - Import options
 * @returns {Promise<any>}
 */
export function dynamicImport(modulePath, options = {}) {
  const { ttl = 300000 } = options; // Default 5 minute TTL

  const cacheKey = `import:${modulePath}`;

  return memoizeAsync(async () => {
    return await import(modulePath);
  }, { keyFn: () => cacheKey, ttl })();
}

export default {
  LRUCache,
  PersistentCache,
  memoize,
  memoizeWeak,
  memoizeAsync,
  createSelector,
  debounce,
  throttle,
  dynamicImport
};
