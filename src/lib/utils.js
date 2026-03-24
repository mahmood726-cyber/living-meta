/**
 * Utility functions for Living Meta-Analysis
 */

import { store, actions } from '../store.js';

/**
 * Show a toast notification
 */
export function showToast({ type = 'info', message, duration = 5000 }) {
  store.dispatch(actions.showToast({ type, message, duration }));
}

/**
 * Hide toast notification
 */
export function hideToast() {
  store.dispatch(actions.hideToast());
}

/**
 * Format a date relative to now
 */
export function formatRelativeTime(date) {
  const now = new Date();
  const d = new Date(date);
  const diffMs = now - d;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

/**
 * Format a date for display
 */
export function formatDate(date, options = {}) {
  const d = new Date(date);
  const defaults = {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  };
  return d.toLocaleDateString(undefined, { ...defaults, ...options });
}

/**
 * Calculate months since a date
 */
export function monthsSince(date, referenceDate = new Date()) {
  const d = new Date(date);
  const ref = new Date(referenceDate);
  const months = (ref.getFullYear() - d.getFullYear()) * 12 +
    (ref.getMonth() - d.getMonth());
  return months;
}

/**
 * Generate a UUID
 */
export function uuid() {
  return crypto.randomUUID();
}

/**
 * Debounce a function
 */
export function debounce(fn, delay = 300) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * Throttle a function
 */
export function throttle(fn, limit = 100) {
  let inThrottle;
  return function (...args) {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Deep clone an object
 */
export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Deep merge objects
 */
export function deepMerge(target, ...sources) {
  if (!sources.length) return target;
  const source = sources.shift();

  if (isObject(target) && isObject(source)) {
    for (const key in source) {
      if (isObject(source[key])) {
        if (!target[key]) Object.assign(target, { [key]: {} });
        deepMerge(target[key], source[key]);
      } else {
        Object.assign(target, { [key]: source[key] });
      }
    }
  }

  return deepMerge(target, ...sources);
}

function isObject(item) {
  return item && typeof item === 'object' && !Array.isArray(item);
}

/**
 * Format a number with precision
 */
export function formatNumber(num, precision = 2) {
  if (num === null || num === undefined || isNaN(num)) return '-';
  return Number(num).toFixed(precision);
}

/**
 * Format a percentage
 */
export function formatPercent(num, precision = 1) {
  if (num === null || num === undefined || isNaN(num)) return '-';
  return (Number(num) * 100).toFixed(precision) + '%';
}

/**
 * Format a p-value
 */
export function formatPValue(p, threshold = 0.001) {
  if (p === null || p === undefined || isNaN(p)) return '-';
  if (p < threshold) return `<${threshold}`;
  return p.toFixed(3);
}

/**
 * Format confidence interval
 */
export function formatCI(lower, upper, precision = 2) {
  if (lower == null || upper == null) return '-';
  return `[${formatNumber(lower, precision)}, ${formatNumber(upper, precision)}]`;
}

/**
 * Calculate sum of array
 */
export function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}

/**
 * Calculate mean of array
 */
export function mean(arr) {
  if (!arr.length) return NaN;
  return sum(arr) / arr.length;
}

/**
 * Calculate standard deviation of array
 */
export function std(arr) {
  if (arr.length < 2) return NaN;
  const avg = mean(arr);
  const squareDiffs = arr.map(x => Math.pow(x - avg, 2));
  return Math.sqrt(sum(squareDiffs) / (arr.length - 1));
}

/**
 * Calculate variance of array
 */
export function variance(arr) {
  const s = std(arr);
  return s * s;
}

/**
 * Download data as JSON file
 */
export function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  downloadBlob(blob, filename);
}

/**
 * Download data as CSV file
 */
export function downloadCSV(data, filename) {
  if (!data.length) return;

  const headers = Object.keys(data[0]);
  const rows = data.map(row =>
    headers.map(h => {
      const val = row[h];
      // Escape quotes and wrap in quotes if contains comma
      if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val ?? '';
    }).join(',')
  );

  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  downloadBlob(blob, filename);
}

/**
 * Download a blob
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Read file as text
 */
export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/**
 * Read file as JSON
 */
export async function readFileAsJSON(file) {
  const text = await readFileAsText(file);
  return JSON.parse(text);
}

/**
 * Escape HTML
 */
export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Parse HTML safely
 */
export function parseHtml(html) {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content;
}

/**
 * Create element from HTML string
 */
export function createElement(html) {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstChild;
}

/**
 * Wait for specified milliseconds
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retry(fn, options = {}) {
  const {
    maxAttempts = 3,
    initialDelay = 1000,
    backoffMultiplier = 2,
    maxDelay = 30000
  } = options;

  let lastError;
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        await sleep(Math.min(delay, maxDelay));
        delay *= backoffMultiplier;
      }
    }
  }

  throw lastError;
}

/**
 * Group array by key
 */
export function groupBy(arr, keyFn) {
  return arr.reduce((groups, item) => {
    const key = typeof keyFn === 'function' ? keyFn(item) : item[keyFn];
    (groups[key] = groups[key] || []).push(item);
    return groups;
  }, {});
}

/**
 * Sort array by multiple keys
 */
export function sortBy(arr, ...keys) {
  return [...arr].sort((a, b) => {
    for (const key of keys) {
      const desc = key.startsWith('-');
      const k = desc ? key.slice(1) : key;
      const aVal = a[k];
      const bVal = b[k];

      if (aVal < bVal) return desc ? 1 : -1;
      if (aVal > bVal) return desc ? -1 : 1;
    }
    return 0;
  });
}

/**
 * Unique values in array
 */
export function unique(arr, keyFn) {
  if (!keyFn) return [...new Set(arr)];
  const seen = new Set();
  return arr.filter(item => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Chunk array into smaller arrays
 */
export function chunk(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Check if value is empty (null, undefined, empty string, empty array, empty object)
 */
export function isEmpty(value) {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

/**
 * Clamp a number between min and max
 */
export function clamp(num, min, max) {
  return Math.min(Math.max(num, min), max);
}

/**
 * Linear interpolation
 */
export function lerp(start, end, t) {
  return start + (end - start) * clamp(t, 0, 1);
}

/**
 * Map a value from one range to another
 */
export function mapRange(value, inMin, inMax, outMin, outMax) {
  return outMin + (outMax - outMin) * ((value - inMin) / (inMax - inMin));
}
