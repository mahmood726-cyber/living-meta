/**
 * Security Utilities
 * Content Security Policy, input sanitization, SRI hashes
 *
 * @module Security
 */

/**
 * Content Security Policy configuration
 */
export const CSP = {
  /**
   * Generate CSP meta tag content
   * @param {Object} policy - CSP policy configuration
   * @returns {string} CSP policy string
   */
  generatePolicy(policy = {}) {
    const {
      defaultSrc = "'self'",
      scriptSrc = "'self'",
      styleSrc = "'self' 'unsafe-inline'",
      imgSrc = "'self' data: https:",
      fontSrc = "'self' data:",
      connectSrc = "'self' https://clinicaltrials.gov",
      mediaSrc = "'self'",
      objectSrc = "'none'",
      frameSrc = "'none'",
      baseUri = "'self'",
      formAction = "'self'",
      frameAncestors = "'none'",
      reportUri = null,
      reportTo = null
    } = policy;

    const directives = {
      'default-src': defaultSrc,
      'script-src': scriptSrc,
      'style-src': styleSrc,
      'img-src': imgSrc,
      'font-src': fontSrc,
      'connect-src': connectSrc,
      'media-src': mediaSrc,
      'object-src': objectSrc,
      'frame-src': frameSrc,
      'base-uri': baseUri,
      'form-action': formAction,
      'frame-ancestors': frameAncestors
    };

    if (reportUri) {
      directives['report-uri'] = reportUri;
    }

    if (reportTo) {
      directives['report-to'] = reportTo;
    }

    return Object.entries(directives)
      .map(([key, value]) => `${key} ${value}`)
      .join('; ');
  },

  /**
   * Inject CSP meta tag into document
   * @param {Object} policy - CSP policy configuration
   */
  injectMetaTag(policy = {}) {
    const existing = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    if (existing) {
      return;
    }

    const meta = document.createElement('meta');
    meta.httpEquiv = 'Content-Security-Policy';
    meta.content = CSP.generatePolicy(policy);

    document.head.prepend(meta);
  },

  /**
   * Strict CSP policy for production
   */
  strictPolicy: {
    defaultSrc: "'self'",
    scriptSrc: "'self'",
    styleSrc: "'self'",
    imgSrc: "'self' data: https:",
    fontSrc: "'self' data:",
    connectSrc: "'self' https://clinicaltrials.gov",
    mediaSrc: "'self'",
    objectSrc: "'none'",
    frameSrc: "'none'",
    baseUri: "'self'",
    formAction: "'self'",
    frameAncestors: "'none'"
  },

  /**
   * Development CSP policy (more permissive)
   */
  devPolicy: {
    defaultSrc: "'self'",
    scriptSrc: "'self' 'unsafe-inline' 'unsafe-eval'",
    styleSrc: "'self' 'unsafe-inline'",
    imgSrc: "'self' data: https: http:",
    fontSrc: "'self' data:",
    connectSrc: "'self' https://clinicaltrials.gov ws://localhost:* ws://127.0.0.1:*",
    mediaSrc: "'self'",
    objectSrc: "'none'",
    frameSrc: "'none'",
    baseUri: "'self'",
    formAction: "'self'",
    frameAncestors: "'none'"
  }
};

/**
 * Input sanitization utilities
 */
export const Sanitize = {
  /**
   * Escape HTML special characters
   * @param {string} str - String to escape
   * @returns {string} Escaped string
   */
  escapeHTML(str) {
    if (str === null || str === undefined) return '';

    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  /**
   * Escape HTML attributes
   * @param {string} str - String to escape
   * @returns {string} Escaped string
   */
  escapeAttribute(str) {
    if (str === null || str === undefined) return '';

    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  },

  /**
   * Strip HTML tags
   * @param {string} str - String with HTML
   * @returns {string} Plain text
   */
  stripTags(str) {
    if (str === null || str === undefined) return '';

    const div = document.createElement('div');
    div.innerHTML = str;
    return div.textContent || div.innerText || '';
  },

  /**
   * Sanitize HTML (basic implementation)
   * @param {string} html - HTML to sanitize
   * @param {Array} allowedTags - Allowed HTML tags
   * @param {Object} allowedAttributes - Allowed attributes per tag
   * @returns {string} Sanitized HTML
   */
  html(html, allowedTags = [], allowedAttributes = {}) {
    if (html === null || html === undefined) return '';

    const template = document.createElement('template');
    template.innerHTML = html.trim();

    const sanitizeNode = (node) => {
      // Text nodes are safe
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent;
      }

      // Element nodes
      if (node.nodeType === Node.ELEMENT_NODE) {
        const tagName = node.tagName.toLowerCase();

        // Check if tag is allowed
        if (!allowedTags.includes(tagName)) {
          // Recursively sanitize children
          return Array.from(node.childNodes)
            .map(child => sanitizeNode(child))
            .join('');
        }

        // Build opening tag
        let str = `<${tagName}`;

        // Add allowed attributes
        const attrs = allowedAttributes[tagName] || [];
        for (const attr of node.attributes) {
          if (attrs.includes(attr.name)) {
            str += ` ${attr.name}="${Sanitize.escapeAttribute(attr.value)}"`;
          }
        }

        str += '>';

        // Add children
        for (const child of node.childNodes) {
          str += sanitizeNode(child);
        }

        // Closing tag
        str += `</${tagName}>`;

        return str;
      }

      return '';
    };

    return Array.from(template.content.childNodes)
      .map(node => sanitizeNode(node))
      .join('');
  },

  /**
   * Sanitize URL for safe linking
   * @param {string} url - URL to check
   * @param {Array} allowedProtocols - Allowed URL protocols
   * @returns {string|null} Safe URL or null if unsafe
   */
  url(url, allowedProtocols = ['http:', 'https:', 'mailto:', 'tel:']) {
    try {
      const parsed = new URL(url, window.location.href);

      if (!allowedProtocols.includes(parsed.protocol)) {
        return null;
      }

      // Prevent javascript: and data: URLs
      if (parsed.protocol === 'javascript:' || parsed.protocol === 'data:') {
        return null;
      }

      return parsed.href;
    } catch {
      return null;
    }
  },

  /**
   * Sanitize ClinicalTrials.gov query
   * @param {string} query - Query string
   * @returns {string} Sanitized query
   */
  ctgovQuery(query) {
    if (!query) return '';

    // Remove potentially dangerous characters
    let sanitized = query
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/[<>]/g, '') // Remove remaining angle brackets
      .trim();

    // Limit length
    const maxLength = 500;
    if (sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength);
    }

    return sanitized;
  }
};

/**
 * Subresource Integrity (SRI) utilities
 */
export const SRI = {
  /**
   * Generate SRI hash for a resource
   * @param {string} content - Resource content
   * @param {Array} algorithms - Hash algorithms to use
   * @returns {Promise<Object>} SRI hashes
   */
  async generateHash(content, algorithms = ['sha-384']) {
    const hashes = {};

    for (const algo of algorithms) {
      const encoder = new TextEncoder();
      const data = encoder.encode(content);
      const hashBuffer = await crypto.subtle.digest(
        algo.replace('-', ''),
        data
      );

      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashB64 = btoa(String.fromCharCode.apply(null, hashArray));

      hashes[algo] = `${algo}-${hashB64}`;
    }

    return hashes;
  },

  /**
   * Generate SRI attribute value
   * @param {string} content - Resource content
   * @param {Array} algorithms - Hash algorithms
   * @returns {Promise<string>} SRI attribute value
   */
  async generateAttribute(content, algorithms = ['sha-384']) {
    const hashes = await SRI.generateHash(content, algorithms);
    return Object.values(hashes).join(' ');
  },

  /**
   * Add SRI to a script/link element
   * @param {HTMLElement} element - Element to add SRI to
   * @param {string} integrity - SRI hash
   */
  addToElement(element, integrity) {
    element.setAttribute('integrity', integrity);
    element.setAttribute('crossorigin', 'anonymous');
  },

  /**
   * Generate SRI for inline scripts
   * @param {string} script - Script content
   * @returns {Promise<string>} SRI hash
   */
  async forInlineScript(script) {
    return SRI.generateAttribute(script);
  }
};

/**
 * XSRF (Cross-Site Request Forgery) protection
 */
export const XSRF = {
  /**
   * Generate XSRF token
   * @returns {string} Random token
   */
  generateToken() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  },

  /**
   * Get or create XSRF token
   * @param {string} key - Storage key
   * @returns {string} XSRF token
   */
  getToken(key = 'xsrf-token') {
    let token = sessionStorage.getItem(key);

    if (!token) {
      token = XSRF.generateToken();
      sessionStorage.setItem(key, token);
    }

    return token;
  },

  /**
   * Validate XSRF token
   * @param {string} token - Token to validate
   * @param {string} key - Storage key
   * @returns {boolean} True if valid
   */
  validateToken(token, key = 'xsrf-token') {
    const stored = sessionStorage.getItem(key);
    return stored && stored === token;
  },

  /**
   * Add XSRF token to form
   * @param {HTMLFormElement} form - Form element
   * @param {string} token - XSRF token
   */
  addToForm(form, token) {
    let input = form.querySelector('input[name="_xsrf"]');

    if (!input) {
      input = document.createElement('input');
      input.type = 'hidden';
      input.name = '_xsrf';
      form.appendChild(input);
    }

    input.value = token;
  },

  /**
   * Add XSRF token to headers
   * @param {Headers} headers - Headers object
   * @param {string} token - XSRF token
   */
  addToHeaders(headers, token) {
    headers.set('X-XSRF-Token', token);
  }
};

/**
 * Security headers for service workers/fetch
 */
export const SecurityHeaders = {
  /**
   * Generate security headers
   * @param {Object} options - Header options
   * @returns {Object} Headers object
   */
  generate(options = {}) {
    const headers = new Headers();

    // X-Content-Type-Options
    headers.set('X-Content-Type-Options', 'nosniff');

    // X-Frame-Options
    headers.set('X-Frame-Options', options.frameOptions || 'DENY');

    // X-XSS-Protection
    headers.set('X-XSS-Protection', '1; mode=block');

    // Strict-Transport-Security (HTTPS only)
    if (options.https && location.protocol === 'https:') {
      headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    // Referrer-Policy
    headers.set('Referrer-Policy', options.referrerPolicy || 'strict-origin-when-cross-origin');

    // Permissions-Policy
    const permissions = options.permissionsPolicy || [
      'geolocation=()',
      'microphone=()',
      'camera=()'
    ];
    headers.set('Permissions-Policy', permissions.join(', '));

    // Cross-Origin-Opener-Policy
    if (options.coop) {
      headers.set('Cross-Origin-Opener-Policy', options.coop);
    }

    // Cross-Origin-Embedder-Policy
    if (options.coep) {
      headers.set('Cross-Origin-Embedder-Policy', options.coep);
    }

    return headers;
  }
};

/**
 * Content Security Policy violation handler
 */
export const CSPViolation = {
  /**
   * Setup CSP violation reporting
   * @param {Function} callback - Callback for violations
   */
  setupReporting(callback) {
    document.addEventListener('securitypolicyviolation', (event) => {
      const violation = {
        violatedDirective: event.violatedDirective,
        effectiveDirective: event.effectiveDirective,
        originalPolicy: event.originalPolicy,
        blockedURL: event.blockedURI,
        disposition: event.disposition,
        documentURI: event.documentURI,
        lineNumber: event.lineNumber,
        columnNumber: event.columnNumber,
        statusCode: event.statusCode,
        sample: event.sample
      };

      callback(violation);
    });
  },

  /**
   * Log CSP violations
   */
  setupLogging() {
    CSPViolation.setupReporting((violation) => {
      console.warn('CSP Violation:', violation);
    });
  },

  /**
   * Report CSP violations to endpoint
   * @param {string} endpoint - Report endpoint
   */
  setupRemoteReporting(endpoint) {
    CSPViolation.setupReporting((violation) => {
      fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/csp-report'
        },
        body: JSON.stringify({ 'csp-report': violation })
      }).catch(err => {
        console.error('Failed to report CSP violation:', err);
      });
    });
  }
};

/**
 * Security initialization
 * @param {Object} options - Security options
 * @returns {Object} Security API
 */
export function initSecurity(options = {}) {
  const {
    csp = true,
    xsrf = true,
    cspLogging = true,
    isDev = false
  } = options;

  // Inject CSP
  if (csp) {
    const policy = isDev ? CSP.devPolicy : CSP.strictPolicy;
    CSP.injectMetaTag(policy);

    // Setup logging
    if (cspLogging) {
      CSPViolation.setupLogging();
    }
  }

  // Initialize XSRF
  let xsrfToken = null;
  if (xsrf) {
    xsrfToken = XSRF.getToken();
  }

  return {
    CSP,
    Sanitize,
    SRI,
    XSRF,
    SecurityHeaders,
    xsrfToken
  };
}

export default {
  CSP,
  Sanitize,
  SRI,
  XSRF,
  SecurityHeaders,
  CSPViolation,
  initSecurity
};
