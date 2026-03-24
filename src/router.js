/**
 * Simple hash-based SPA router
 * No external dependencies
 */

import { escapeHtml } from './lib/error-handler.js';

class Router {
  constructor() {
    this.routes = [];
    this.currentRoute = null;
    this.params = {};
    this.query = {};
    this.beforeHooks = [];
    this.afterHooks = [];
    this.initialized = false;
  }

  /**
   * Register a route
   * @param {string} path - Route path (supports :param syntax)
   * @param {Object} config - Route configuration
   */
  register(path, config) {
    const { pattern, paramNames } = this.pathToRegex(path);
    this.routes.push({
      path,
      pattern,
      paramNames,
      ...config
    });
    return this;
  }

  /**
   * Convert path to regex pattern
   */
  pathToRegex(path) {
    if (path === '*') {
      return { pattern: /^.*$/, paramNames: [] };
    }

    const paramNames = [];
    // Escape forward slashes and convert :param to capture groups
    let regexStr = path
      .replace(/\//g, '\\/')
      .replace(/:([^/]+)/g, (_, name) => {
        paramNames.push(name);
        return '([^/]+)';
      });

    return {
      pattern: new RegExp(`^${regexStr}$`),
      paramNames
    };
  }

  /**
   * Parse query string
   */
  parseQuery(queryString) {
    if (!queryString) return {};
    const params = new URLSearchParams(queryString);
    const query = {};
    for (const [key, value] of params) {
      query[key] = value;
    }
    return query;
  }

  /**
   * Start the router
   */
  start() {
    if (this.initialized) return;
    this.initialized = true;

    // Listen for hash changes
    window.addEventListener('hashchange', () => this.handleRouteChange());

    // Handle initial route
    this.handleRouteChange();
  }

  /**
   * Handle route change
   */
  async handleRouteChange() {
    const hash = window.location.hash.slice(1) || '/';
    const [path, queryString] = hash.split('?');

    // Find matching route (skip wildcard, try it last)
    let matchedRoute = null;
    let params = {};
    let wildcardRoute = null;

    for (const route of this.routes) {
      if (route.path === '*') {
        wildcardRoute = route;
        continue;
      }

      const match = path.match(route.pattern);
      if (match) {
        matchedRoute = route;
        // Extract params from capture groups
        if (route.paramNames && route.paramNames.length > 0) {
          route.paramNames.forEach((name, i) => {
            params[name] = match[i + 1];
          });
        }
        break;
      }
    }

    // Use wildcard as fallback
    if (!matchedRoute) {
      matchedRoute = wildcardRoute || {
        path: '*',
        title: 'Not Found',
        render: () => '<div class="text-center py-12"><h1 class="text-2xl font-bold">Page Not Found</h1></div>'
      };
    }

    // Parse query params
    const query = this.parseQuery(queryString);

    // Run before hooks
    for (const hook of this.beforeHooks) {
      const result = await hook(matchedRoute, this.currentRoute, params, query);
      if (result === false) return;
      if (typeof result === 'string') {
        this.navigate(result);
        return;
      }
    }

    // Update state
    const prevRoute = this.currentRoute;
    this.currentRoute = matchedRoute;
    this.params = params;
    this.query = query;

    // Update document title
    if (matchedRoute.title) {
      document.title = `${matchedRoute.title} | Living Meta-Analysis`;
    }

    // Render route
    await this.render(matchedRoute, params, query);

    // Run after hooks
    for (const hook of this.afterHooks) {
      await hook(matchedRoute, prevRoute, params, query);
    }
  }

  /**
   * Render a route
   */
  async render(route, params, query) {
    const container = document.getElementById('route-view');
    if (!container) return;

    try {
      // Show loading state
      container.innerHTML = '<div class="flex items-center justify-center h-64"><div class="spinner"></div></div>';

      // Load component if needed (lazy loading)
      if (route.component && !route._render) {
        const module = await route.component();
        route._render = module.render || module.default?.render;
        route._init = module.init || module.default?.init;
      }

      // Use loaded render or static render
      const renderFn = route._render || route.render;

      if (renderFn) {
        const content = await renderFn(params, query);
        if (typeof content === 'string') {
          container.innerHTML = content;
        } else if (content instanceof HTMLElement) {
          container.innerHTML = '';
          container.appendChild(content);
        }
      }

      // Initialize page scripts if present
      const initFn = route._init || route.init;
      if (initFn) {
        await initFn(params, query);
      }

      // Update navigation
      this.updateNav();

    } catch (err) {
      container.innerHTML = `
        <div class="card text-center py-12">
          <h2 class="text-xl font-semibold text-danger-700 mb-2">Error Loading Page</h2>
          <p class="text-gray-600">${escapeHtml(err.message)}</p>
        </div>
      `;
    }
  }

  /**
   * Update navigation active states
   */
  updateNav() {
    const nav = document.getElementById('main-nav');
    if (!nav) return;

    const links = nav.querySelectorAll('a');
    links.forEach(link => {
      const href = link.getAttribute('href');
      const isActive = href === `#${this.currentRoute?.path}` ||
        (this.currentRoute?.navMatch && href.includes(this.currentRoute.navMatch));

      link.classList.toggle('bg-gray-100', isActive);
      link.classList.toggle('text-primary-700', isActive);
    });
  }

  /**
   * Navigate to a path
   */
  navigate(path, query = {}) {
    const queryString = Object.keys(query).length
      ? '?' + new URLSearchParams(query).toString()
      : '';
    window.location.hash = path + queryString;
  }

  /**
   * Replace current route (no history entry)
   */
  replace(path, query = {}) {
    const queryString = Object.keys(query).length
      ? '?' + new URLSearchParams(query).toString()
      : '';
    window.location.replace('#' + path + queryString);
  }

  /**
   * Go back in history
   */
  back() {
    window.history.back();
  }

  /**
   * Add before navigation hook
   */
  beforeEach(hook) {
    this.beforeHooks.push(hook);
    return this;
  }

  /**
   * Add after navigation hook
   */
  afterEach(hook) {
    this.afterHooks.push(hook);
    return this;
  }

  /**
   * Get current params
   */
  getParams() {
    return this.params;
  }

  /**
   * Get current query
   */
  getQuery() {
    return this.query;
  }

  /**
   * Get current route
   */
  getCurrentRoute() {
    return this.currentRoute;
  }
}

// Create singleton router
export const router = new Router();

// Route definitions
export function setupRoutes() {
  router
    // Dashboard / Projects list
    .register('/', {
      title: 'Projects',
      navMatch: 'projects',
      render: () => `
        <div id="projects-page">
          <div class="flex justify-between items-center mb-6">
            <h1>Projects</h1>
            <button id="create-project-btn" class="btn-primary">
              <svg class="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg>
              New Project
            </button>
          </div>
          <div id="projects-list" class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <!-- Projects loaded dynamically -->
          </div>
        </div>
      `,
      init: async () => {
        const { initProjectsPage } = await import('./components/project/project-list.js');
        initProjectsPage();
      }
    })

    // Search tab
    .register('/project/:id/search', {
      title: 'Search',
      navMatch: 'search',
      component: () => import('./components/search/query-builder.js')
    })

    // Screening tab
    .register('/project/:id/screening', {
      title: 'Screening',
      navMatch: 'screening',
      component: () => import('./components/screening/screening-queue.js')
    })

    // Extraction tab
    .register('/project/:id/extraction', {
      title: 'Extraction',
      navMatch: 'extraction',
      component: () => import('./components/extraction/extraction-table.js')
    })

    // EIM tab
    .register('/project/:id/eim', {
      title: 'Evidence Integrity',
      navMatch: 'eim',
      component: () => import('./components/eim/eim-dashboard.js')
    })

    // ROB 2.0 Assessment
    .register('/project/:projectId/rob/:studyId', {
      title: 'Risk of Bias',
      navMatch: 'rob',
      component: () => import('./components/rob/rob2-assessment.js')
    })

    .register('/project/:projectId/rob/:studyId/:outcomeId', {
      title: 'Risk of Bias',
      navMatch: 'rob',
      component: () => import('./components/rob/rob2-assessment.js')
    })

    // Analysis tab
    .register('/project/:id/analysis', {
      title: 'Analysis',
      navMatch: 'analysis',
      component: () => import('./components/analysis/analysis-config.js')
    })

    // Report tab
    .register('/project/:id/report', {
      title: 'Report',
      navMatch: 'report',
      component: () => import('./components/reporting/export-panel.js')
    })

    // 404 - must be last
    .register('*', {
      title: 'Not Found',
      render: () => `
        <div class="card text-center py-12">
          <svg class="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h1 class="text-2xl font-bold text-gray-900 mb-2">Page Not Found</h1>
          <p class="text-gray-600 mb-4">The page you're looking for doesn't exist.</p>
          <a href="#/" class="btn-primary">Go to Projects</a>
        </div>
      `
    });

  // Start the router after all routes are registered
  router.start();
}

export default router;
