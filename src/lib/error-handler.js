/**
 * Centralized Error Handling Module
 * Provides error boundaries, recovery, and user-friendly error messages
 *
 * @module error-handler
 * @version 1.0.0
 */

import { store, actions } from '../store.js';

/**
 * Error severity levels
 */
export const ErrorSeverity = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical'
};

/**
 * Error categories for better handling
 */
export const ErrorCategory = {
  NETWORK: 'network',
  DATABASE: 'database',
  WORKER: 'worker',
  VALIDATION: 'validation',
  ANALYSIS: 'analysis',
  RENDER: 'render',
  UNKNOWN: 'unknown'
};

/**
 * Application error class with additional context
 */
export class AppError extends Error {
  /**
   * @param {string} message - Error message
   * @param {Object} options - Error options
   * @param {string} [options.category] - Error category
   * @param {string} [options.severity] - Error severity
   * @param {boolean} [options.recoverable] - Whether error is recoverable
   * @param {string} [options.userMessage] - User-friendly message
   * @param {Object} [options.context] - Additional context
   * @param {Error} [options.cause] - Original error
   */
  constructor(message, options = {}) {
    super(message);
    this.name = 'AppError';
    this.category = options.category || ErrorCategory.UNKNOWN;
    this.severity = options.severity || ErrorSeverity.ERROR;
    this.recoverable = options.recoverable !== false;
    this.userMessage = options.userMessage || this.getDefaultUserMessage();
    this.context = options.context || {};
    this.cause = options.cause;
    this.timestamp = new Date().toISOString();
  }

  getDefaultUserMessage() {
    switch (this.category) {
      case ErrorCategory.NETWORK:
        return 'Network error. Please check your connection and try again.';
      case ErrorCategory.DATABASE:
        return 'Database error. Your data may not have been saved.';
      case ErrorCategory.WORKER:
        return 'Background process failed. Please try again.';
      case ErrorCategory.VALIDATION:
        return 'Invalid input. Please check your data.';
      case ErrorCategory.ANALYSIS:
        return 'Analysis failed. Please check your data and settings.';
      case ErrorCategory.RENDER:
        return 'Failed to display content. Please refresh the page.';
      default:
        return 'An unexpected error occurred.';
    }
  }
}

/**
 * Global error handler - catches unhandled errors
 */
export function setupGlobalErrorHandler() {
  // Handle uncaught errors
  window.addEventListener('error', (event) => {
    handleError(new AppError(event.message, {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.ERROR,
      cause: event.error,
      context: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      }
    }));
  });

  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    const error = event.reason instanceof Error
      ? event.reason
      : new Error(String(event.reason));

    handleError(new AppError(error.message, {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.ERROR,
      cause: error,
      context: { type: 'unhandledrejection' }
    }));
  });
}

/**
 * Error log storage (keep last 50 errors)
 * @type {AppError[]}
 */
const errorLog = [];
const MAX_ERROR_LOG = 50;

/**
 * Central error handler
 * @param {Error|AppError} error - Error to handle
 * @param {Object} [options] - Additional options
 */
export function handleError(error, options = {}) {
  // Normalize to AppError
  const appError = error instanceof AppError
    ? error
    : new AppError(error.message, {
        cause: error,
        ...options
      });

  // Log to console in development
  if (process.env.NODE_ENV !== 'production') {
    console.error('[AppError]', appError.category, appError.message, appError);
  }

  // Add to error log
  errorLog.push(appError);
  if (errorLog.length > MAX_ERROR_LOG) {
    errorLog.shift();
  }

  // Update store with error
  store.dispatch(actions.setError({
    message: appError.userMessage,
    severity: appError.severity,
    category: appError.category,
    recoverable: appError.recoverable,
    timestamp: appError.timestamp
  }));

  // Show toast for user-facing errors
  if (appError.severity !== ErrorSeverity.INFO) {
    store.dispatch(actions.showToast({
      type: appError.severity === ErrorSeverity.CRITICAL ? 'error' : 'warning',
      message: appError.userMessage,
      duration: appError.severity === ErrorSeverity.CRITICAL ? 10000 : 5000
    }));
  }

  // For critical errors, show error boundary
  if (appError.severity === ErrorSeverity.CRITICAL && !appError.recoverable) {
    renderErrorBoundary(appError);
  }

  return appError;
}

/**
 * Render error boundary UI for critical errors
 * @param {AppError} error - The error to display
 */
function renderErrorBoundary(error) {
  const container = document.getElementById('route-view');
  if (!container) return;

  container.innerHTML = `
    <div class="min-h-[400px] flex items-center justify-center">
      <div class="card max-w-lg text-center p-8">
        <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-danger-100 flex items-center justify-center">
          <svg class="w-8 h-8 text-danger-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 class="text-xl font-semibold text-gray-900 mb-2">Something went wrong</h2>
        <p class="text-gray-600 mb-4">${escapeHtml(error.userMessage)}</p>
        <div class="space-x-3">
          <button onclick="location.reload()" class="btn-primary">
            Reload Page
          </button>
          <button onclick="window.location.hash='/'" class="btn-secondary">
            Go to Home
          </button>
        </div>
        ${process.env.NODE_ENV !== 'production' ? `
          <details class="mt-6 text-left text-sm">
            <summary class="cursor-pointer text-gray-500 hover:text-gray-700">
              Technical Details
            </summary>
            <pre class="mt-2 p-3 bg-gray-100 rounded overflow-auto text-xs">
Category: ${error.category}
Message: ${error.message}
Stack: ${error.cause?.stack || error.stack || 'N/A'}
Context: ${JSON.stringify(error.context, null, 2)}
            </pre>
          </details>
        ` : ''}
      </div>
    </div>
  `;
}

/**
 * Escape HTML to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
export function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Wrap async function with error handling
 * @param {Function} fn - Async function to wrap
 * @param {Object} [errorOptions] - Default error options
 * @returns {Function} Wrapped function
 */
export function withErrorHandling(fn, errorOptions = {}) {
  return async function(...args) {
    try {
      return await fn.apply(this, args);
    } catch (error) {
      handleError(error, errorOptions);
      throw error; // Re-throw for caller to handle if needed
    }
  };
}

/**
 * Try-catch wrapper that returns [error, result]
 * @param {Promise|Function} promiseOrFn - Promise or function to execute
 * @returns {Promise<[Error|null, any]>} Tuple of [error, result]
 */
export async function tryCatch(promiseOrFn) {
  try {
    const result = typeof promiseOrFn === 'function'
      ? await promiseOrFn()
      : await promiseOrFn;
    return [null, result];
  } catch (error) {
    return [error, null];
  }
}

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {Object} options - Retry options
 * @returns {Promise<any>} Result of successful execution
 */
export async function retry(fn, options = {}) {
  const {
    maxAttempts = 3,
    initialDelay = 1000,
    backoffMultiplier = 2,
    onRetry = null
  } = options;

  let lastError;
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt < maxAttempts) {
        if (onRetry) {
          onRetry(error, attempt, delay);
        }
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= backoffMultiplier;
      }
    }
  }

  throw new AppError(`Failed after ${maxAttempts} attempts: ${lastError.message}`, {
    category: ErrorCategory.UNKNOWN,
    cause: lastError,
    context: { attempts: maxAttempts }
  });
}

/**
 * Get error log for debugging
 * @returns {AppError[]} Error log
 */
export function getErrorLog() {
  return [...errorLog];
}

/**
 * Clear error log
 */
export function clearErrorLog() {
  errorLog.length = 0;
}

export default {
  AppError,
  ErrorSeverity,
  ErrorCategory,
  setupGlobalErrorHandler,
  handleError,
  withErrorHandling,
  tryCatch,
  retry,
  escapeHtml,
  getErrorLog,
  clearErrorLog
};
