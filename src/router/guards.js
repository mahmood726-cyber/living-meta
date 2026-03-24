/**
 * Route Guards
 * Protect routes with authentication, authorization, and validation
 *
 * @module RouteGuards
 */

/**
 * Guard types
 */
export const GuardType = {
  AUTH: 'auth',
  PROJECT: 'project',
  PERMISSION: 'permission',
  VALIDATION: 'validation'
};

/**
 * Route guard manager
 */
export class RouteGuards {
  constructor() {
    this.guards = new Map();
    this.beforeHooks = [];
    this.afterHooks = [];
  }

  /**
   * Register a route guard
   * @param {string} routePath - Route path pattern
   * @param {Function} guardFn - Guard function
   * @param {Object} options - Guard options
   * @returns {Function} Unregister function
   */
  register(routePath, guardFn, options = {}) {
    const {
      type = GuardType.VALIDATION,
      redirect = null,
      allow = [],
      deny = []
    } = options;

    const guard = {
      path: routePath,
      fn: guardFn,
      type,
      redirect,
      allow: new Set(allow),
      deny: new Set(deny)
    };

    this.guards.set(routePath, guard);

    return () => this.guards.delete(routePath);
  }

  /**
   * Check if a route has guards
   * @param {string} path - Route path
   * @returns {boolean} True if has guards
   */
  hasGuards(path) {
    return this.guards.has(path);
  }

  /**
   * Get guards for a route
   * @param {string} path - Route path
   * @returns {Array} Array of guards
   */
  getGuards(path) {
    const guards = [];

    // Exact match
    if (this.guards.has(path)) {
      guards.push(this.guards.get(path));
    }

    // Pattern match
    for (const [guardPath, guard] of this.guards.entries()) {
      if (guardPath.includes(':') && this.matchPattern(path, guardPath)) {
        guards.push(guard);
      }
    }

    return guards;
  }

  /**
   * Match path against pattern
   * @param {string} path - Route path
   * @param {string} pattern - Pattern with :params
   * @returns {boolean} True if matches
   */
  matchPattern(path, pattern) {
    const patternParts = pattern.split('/');
    const pathParts = path.split('/');

    if (patternParts.length !== pathParts.length) {
      return false;
    }

    for (let i = 0; i < patternParts.length; i++) {
      const patternPart = patternParts[i];
      const pathPart = pathParts[i];

      if (patternPart.startsWith(':')) {
        // Parameter - matches anything
        continue;
      }

      if (patternPart !== pathPart) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if route access is allowed
   * @param {string} path - Route path
   * @param {Object} context - Guard context
   * @returns {Object} Guard check result
   */
  async checkAccess(path, context = {}) {
    const guards = this.getGuards(path);

    if (guards.length === 0) {
      return { allowed: true };
    }

    for (const guard of guards) {
      try {
        const result = await guard.fn(context);

        if (result === false) {
          return {
            allowed: false,
            guard,
            redirect: guard.redirect || '/login'
          };
        }

        if (typeof result === 'string') {
          return {
            allowed: false,
            guard,
            redirect: result
          };
        }

      } catch (error) {
        console.error('Guard error:', error);
        return {
          allowed: false,
          guard,
          redirect: guard.redirect || '/error',
          error
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Register a global before navigation hook
   * @param {Function} hook - Hook function
   * @returns {Function} Unregister function
   */
  beforeEach(hook) {
    this.beforeHooks.push(hook);
    return () => {
      const index = this.beforeHooks.indexOf(hook);
      if (index >= 0) {
        this.beforeHooks.splice(index, 1);
      }
    };
  }

  /**
   * Register a global after navigation hook
   * @param {Function} hook - Hook function
   * @returns {Function} Unregister function
   */
  afterEach(hook) {
    this.afterHooks.push(hook);
    return () => {
      const index = this.afterHooks.indexOf(hook);
      if (index >= 0) {
        this.afterHooks.splice(index, 1);
      }
    };
  }

  /**
   * Run before hooks
   * @param {Object} to - Target route
   * @param {Object} from - Source route
   * @param {Object} context - Navigation context
   * @returns {boolean|string|undefined} Guard result
   */
  async runBeforeHooks(to, from, context) {
    for (const hook of this.beforeHooks) {
      const result = await hook(to, from, context);

      if (result === false || typeof result === 'string') {
        return result;
      }
    }
  }

  /**
   * Run after hooks
   * @param {Object} to - Target route
   * @param {Object} from - Source route
   * @param {Object} context - Navigation context
   */
  async runAfterHooks(to, from, context) {
    for (const hook of this.afterHooks) {
      await hook(to, from, context);
    }
  }

  /**
   * Clear all guards
   */
  clear() {
    this.guards.clear();
    this.beforeHooks = [];
    this.afterHooks = [];
  }
}

/**
 * Common guard functions
 */
export const Guards = {
  /**
   * Require authentication
   * @param {Object} store - Application store
   * @returns {Function} Guard function
   */
  requireAuth(store) {
    return async (context) => {
      const state = store.getState();
      return state.user?.authenticated;
    };
  },

  /**
   * Require project existence
   * @param {string} projectId - Project ID parameter
   * @param {Object} db - Database instance
   * @returns {Function} Guard function
   */
  requireProject(projectId, db) {
    return async (context) => {
      const project = await db.projects.get(projectId);
      return !!project;
    };
  },

  /**
   * Require specific permission
   * @param {string} permission - Required permission
   * @param {Object} store - Application store
   * @returns {Function} Guard function
   */
  requirePermission(permission, store) {
    return async (context) => {
      const state = store.getState();
      return state.user?.permissions?.includes(permission);
    };
  },

  /**
   * Prevent navigation during unsaved changes
   * @param {Object} store - Application store
   * @returns {Function} Guard function
   */
  preventUnsavedChanges(store) {
    return async (context) => {
      const state = store.getState();
      return !state.sync?.pendingChanges || state.sync?.pendingChanges === 0;
    };
  },

  /**
   * Validate required data
   * @param {Array} requiredFields - Required fields in context
   * @returns {Function} Guard function
   */
  requireData(requiredFields) {
    return async (context) => {
      for (const field of requiredFields) {
        if (!context[field]) {
          return false;
        }
      }
      return true;
    };
  },

  /**
   * Prevent back navigation
   * @param {string} fromRoute - Route to prevent back from
   * @returns {Function} Guard function
   */
  preventBack(fromRoute) {
    return async (context) => {
      return context.from?.path !== fromRoute;
    };
  },

  /**
   * Require completed screening
   * @param {string} projectId - Project ID
   * @param {Object} db - Database instance
   * @returns {Function} Guard function
   */
  requireCompletedScreening(projectId, db) {
    return async (context) => {
      const decisions = await db.screeningDecisions
        .where('projectId').equals(projectId)
        .filter(decision => decision.decision === 'include')
        .count();

      return decisions >= 2; // Need at least 2 studies for meta-analysis
    };
  },

  /**
   * Require completed extraction
   * @param {string} projectId - Project ID
   * @param {Object} db - Database instance
   * @returns {Function} Guard function
   */
  requireCompletedExtraction(projectId, db) {
    return async (context) => {
      const extractions = await db.extractions
        .where('projectId').equals(projectId)
        .filter(extraction => extraction.verified)
        .count();

      return extractions >= 2;
    };
  }
};

/**
 * Create guard factory for router integration
 * @param {Object} options - Configuration options
 * @returns {Object} Guard API
 */
export function createRouteGuards(options = {}) {
  const {
    store = null,
    db = null,
    router = null
  } = options;

  const guards = new RouteGuards();

  // Setup router integration
  if (router) {
    router.beforeEach(async (to, from, next) => {
      const context = {
        to,
        from,
        store,
        db
      };

      // Run registered hooks
      const hookResult = await guards.runBeforeHooks(to, from, context);
      if (hookResult !== undefined) {
        return next(hookResult);
      }

      // Check route guards
      const access = await guards.checkAccess(to.path, context);

      if (!access.allowed) {
        return next(access.redirect || '/');
      }

      next();
    });

    router.afterEach(async (to, from) => {
      const context = {
        to,
        from,
        store,
        db
      };

      await guards.runAfterHooks(to, from, context);
    });
  }

  return {
    guards,
    register: guards.register.bind(guards),
    beforeEach: guards.beforeEach.bind(guards),
    afterEach: guards.afterEach.bind(guards),
    checkAccess: guards.checkAccess.bind(guards),
    Guards
  };
}

/**
 * Initialize default route guards
 * @param {Object} options - Configuration options
 * @returns {Object} Guard API
 */
export function initRouteGuards(options = {}) {
  const { store, db, router } = options;

  const api = createRouteGuards({ store, db, router });

  // Register common guards
  if (store) {
    // Require auth for protected routes
    api.register('/project/:id/*', Guards.requireAuth(store), {
      type: GuardType.AUTH,
      redirect: '/login'
    });

    // Prevent unsaved changes
    api.register('/project/:id/*', Guards.preventUnsavedChanges(store), {
      type: GuardType.VALIDATION
    });
  }

  if (db) {
    // Require project exists
    api.register('/project/:id/*', async (context) => {
      const projectId = context.to.params?.id;
      if (projectId) {
        return Guards.requireProject(projectId, db)();
      }
      return true;
    }, {
      type: GuardType.PROJECT,
      redirect: '/projects'
    });

    // Require completed screening for analysis
    api.register('/project/:id/analysis', async (context) => {
      const projectId = context.to.params?.id;
      if (projectId) {
        return Guards.requireCompletedScreening(projectId, db)();
      }
      return true;
    }, {
      type: GuardType.VALIDATION,
      redirect: (context) => `/project/${context.to.params?.id}/screening`
    });
  }

  return api;
}

export default RouteGuards;
