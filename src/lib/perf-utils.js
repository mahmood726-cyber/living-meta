/**
 * perf-utils.js - High-Performance Utilities
 *
 * Provides memoization, batching, and performance optimizations
 * for computationally intensive meta-analysis operations.
 */

/**
 * LRU Cache with configurable size
 * Used for memoizing expensive calculations
 */
export class LRUCache {
  constructor(maxSize = 100) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  get(key) {
    if (!this.cache.has(key)) return undefined;
    // Move to end (most recently used)
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Delete oldest entry (first key)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
    return this;
  }

  has(key) {
    return this.cache.has(key);
  }

  clear() {
    this.cache.clear();
  }

  get size() {
    return this.cache.size;
  }
}

/**
 * Memoize a function with LRU cache
 * @param {Function} fn - Function to memoize
 * @param {Object} options - { maxSize, keyFn }
 * @returns {Function} Memoized function
 */
export function memoize(fn, options = {}) {
  const { maxSize = 100, keyFn = JSON.stringify } = options;
  const cache = new LRUCache(maxSize);

  const memoized = function (...args) {
    const key = keyFn(args);
    if (cache.has(key)) {
      return cache.get(key);
    }
    const result = fn.apply(this, args);
    cache.set(key, result);
    return result;
  };

  memoized.cache = cache;
  memoized.clear = () => cache.clear();

  return memoized;
}

/**
 * Pre-computed lookup tables for common statistical functions
 */
const NORMAL_Z_TABLE = new Float64Array(401); // z from -4 to +4 in 0.02 steps
const T_QUANTILE_CACHE = new Map();

// Pre-compute normal CDF table
(function initNormalTable() {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  for (let i = 0; i <= 400; i++) {
    const z = (i - 200) / 50; // -4 to +4
    const sign = z < 0 ? -1 : 1;
    const x = Math.abs(z) / Math.SQRT2;
    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    NORMAL_Z_TABLE[i] = 0.5 * (1.0 + sign * y);
  }
})();

/**
 * Fast normal CDF using lookup table with linear interpolation
 * @param {number} z - Z-score
 * @returns {number} CDF value
 */
export function fastNormalCDFTable(z) {
  if (z <= -4) return 0;
  if (z >= 4) return 1;

  const idx = (z + 4) * 50;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);

  if (lo === hi) return NORMAL_Z_TABLE[lo];

  const frac = idx - lo;
  return NORMAL_Z_TABLE[lo] * (1 - frac) + NORMAL_Z_TABLE[hi] * frac;
}

/**
 * Pre-compute t-distribution quantiles for common df values
 * @param {number} p - Probability
 * @param {number} df - Degrees of freedom
 * @returns {number} t quantile
 */
export function fastTQuantile(p, df) {
  // Check cache first
  const key = `${p.toFixed(4)}_${df}`;
  if (T_QUANTILE_CACHE.has(key)) {
    return T_QUANTILE_CACHE.get(key);
  }

  // Compute using Newton-Raphson
  const result = computeTQuantile(p, df);

  // Cache if df is small (common case)
  if (df <= 100 && T_QUANTILE_CACHE.size < 1000) {
    T_QUANTILE_CACHE.set(key, result);
  }

  return result;
}

function computeTQuantile(p, df) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;

  // Start with normal approximation
  let t = fastNormalQuantile(p);

  // Newton-Raphson refinement
  for (let iter = 0; iter < 8; iter++) {
    const cdf = tCDF(t, df);
    const pdf = tPDF(t, df);
    if (Math.abs(pdf) < 1e-15) break;

    const delta = (cdf - p) / pdf;
    t -= delta;

    if (Math.abs(delta) < 1e-10) break;
  }

  return t;
}

/**
 * Fast normal quantile using rational approximation
 */
export function fastNormalQuantile(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;

  const a = [
    -3.969683028665376e+01, 2.209460984245205e+02,
    -2.759285104469687e+02, 1.383577518672690e+02,
    -3.066479806614716e+01, 2.506628277459239e+00
  ];
  const b = [
    -5.447609879822406e+01, 1.615858368580409e+02,
    -1.556989798598866e+02, 6.680131188771972e+01,
    -1.328068155288572e+01
  ];
  const c = [
    -7.784894002430293e-03, -3.223964580411365e-01,
    -2.400758277161838e+00, -2.549732539343734e+00,
    4.374664141464968e+00, 2.938163982698783e+00
  ];
  const d = [
    7.784695709041462e-03, 3.224671290700398e-01,
    2.445134137142996e+00, 3.754408661907416e+00
  ];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let q, r;

  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
           ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  } else if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q /
           (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
            ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  }
}

function tCDF(t, df) {
  const x = df / (df + t * t);
  return t >= 0 ? 1 - 0.5 * incompleteBeta(df / 2, 0.5, x)
                : 0.5 * incompleteBeta(df / 2, 0.5, x);
}

function tPDF(t, df) {
  const coef = Math.exp(gammaln((df + 1) / 2) - gammaln(df / 2)) /
               Math.sqrt(df * Math.PI);
  return coef * Math.pow(1 + t * t / df, -(df + 1) / 2);
}

function incompleteBeta(a, b, x) {
  if (x === 0) return 0;
  if (x === 1) return 1;

  const bt = Math.exp(gammaln(a + b) - gammaln(a) - gammaln(b) +
              a * Math.log(x) + b * Math.log(1 - x));

  if (x < (a + 1) / (a + b + 2)) {
    return bt * betacf(a, b, x) / a;
  } else {
    return 1 - bt * betacf(b, a, 1 - x) / b;
  }
}

function betacf(a, b, x) {
  const maxIter = 100;
  const eps = 1e-10;

  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - qab * x / qap;
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= maxIter; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < eps) break;
  }

  return h;
}

function gammaln(x) {
  const coef = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5
  ];

  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);

  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) {
    ser += coef[j] / ++y;
  }

  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

/**
 * Batch processing for large arrays
 * Prevents UI blocking by processing in chunks
 *
 * @param {Array} items - Items to process
 * @param {Function} fn - Processing function
 * @param {Object} options - { chunkSize, onProgress }
 * @returns {Promise<Array>} Processed results
 */
export async function batchProcess(items, fn, options = {}) {
  const { chunkSize = 100, onProgress } = options;
  const results = [];
  const n = items.length;

  for (let i = 0; i < n; i += chunkSize) {
    const chunk = items.slice(i, Math.min(i + chunkSize, n));
    const chunkResults = chunk.map(fn);
    results.push(...chunkResults);

    if (onProgress) {
      onProgress(Math.min(i + chunkSize, n) / n);
    }

    // Yield to event loop
    if (i + chunkSize < n) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  return results;
}

/**
 * Parallel map using Promise.all with concurrency limit
 *
 * @param {Array} items - Items to process
 * @param {Function} fn - Async processing function
 * @param {number} concurrency - Max concurrent operations
 * @returns {Promise<Array>} Results
 */
export async function parallelMap(items, fn, concurrency = 4) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array(Math.min(concurrency, items.length))
    .fill(null)
    .map(() => worker());

  await Promise.all(workers);
  return results;
}

/**
 * Debounce function for UI updates
 */
export function debounce(fn, wait = 100) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), wait);
  };
}

/**
 * Throttle function for rate-limiting
 */
export function throttle(fn, limit = 100) {
  let lastCall = 0;
  return function (...args) {
    const now = Date.now();
    if (now - lastCall >= limit) {
      lastCall = now;
      return fn.apply(this, args);
    }
  };
}

/**
 * Object pool for reducing GC pressure
 */
export class ObjectPool {
  constructor(factory, reset, initialSize = 10) {
    this.factory = factory;
    this.reset = reset;
    this.pool = [];

    for (let i = 0; i < initialSize; i++) {
      this.pool.push(factory());
    }
  }

  acquire() {
    return this.pool.length > 0 ? this.pool.pop() : this.factory();
  }

  release(obj) {
    this.reset(obj);
    this.pool.push(obj);
  }
}

/**
 * Typed array pool for numerical computations
 */
export const Float64Pool = {
  pools: new Map(),

  acquire(size) {
    if (!this.pools.has(size)) {
      this.pools.set(size, []);
    }
    const pool = this.pools.get(size);
    return pool.length > 0 ? pool.pop() : new Float64Array(size);
  },

  release(arr) {
    const pool = this.pools.get(arr.length);
    if (pool && pool.length < 10) {
      arr.fill(0);
      pool.push(arr);
    }
  }
};

export default {
  LRUCache,
  memoize,
  fastNormalCDFTable,
  fastTQuantile,
  fastNormalQuantile,
  batchProcess,
  parallelMap,
  debounce,
  throttle,
  ObjectPool,
  Float64Pool
};
