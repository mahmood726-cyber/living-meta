/**
 * Keyboard Shortcuts System
 * Global keyboard shortcut management
 *
 * @module KeyboardShortcuts
 */

/**
 * Default keyboard shortcuts
 */
export const DEFAULT_SHORTCUTS = {
  // Navigation
  'goto-dashboard': { keys: ['g', 'd'], description: 'Go to dashboard' },
  'goto-search': { keys: ['g', 's'], description: 'Go to search' },
  'goto-screening': { keys: ['g', 'c'], description: 'Go to screening' },
  'goto-extraction': { keys: ['g', 'e'], description: 'Go to extraction' },
  'goto-analysis': { keys: ['g', 'a'], description: 'Go to analysis' },
  'goto-report': { keys: ['g', 'r'], description: 'Go to report' },

  // Actions
  'new-project': { keys: ['Mod', 'n'], description: 'Create new project' },
  'save': { keys: ['Mod', 's'], description: 'Save' },
  'quick-search': { keys: ['Mod', 'k'], description: 'Quick search' },
  'export': { keys: ['Mod', 'e'], description: 'Export data' },
  'help': { keys: ['?'], description: 'Show keyboard shortcuts' },

  // Screening
  'screening-include': { keys: ['i'], description: 'Include study', context: 'screening' },
  'screening-exclude': { keys: ['e'], description: 'Exclude study', context: 'screening' },
  'screening-maybe': { keys: ['m'], description: 'Maybe study', context: 'screening' },
  'screening-next': { keys: ['j'], description: 'Next study', context: 'screening' },
  'screening-previous': { keys: ['k'], description: 'Previous study', context: 'screening' },

  // Analysis
  'run-analysis': { keys: ['Mod', 'Enter'], description: 'Run analysis', context: 'analysis' },
  'toggle-forest-plot': { keys: ['f'], description: 'Toggle forest plot', context: 'analysis' },
  'toggle-funnel-plot': { keys: ['u'], description: 'Toggle funnel plot', context: 'analysis' },

  // Utility
  'toggle-sidebar': { keys: ['Mod', '\\'], description: 'Toggle sidebar' },
  'toggle-theme': { keys: ['Mod', 'Shift', 't'], description: 'Toggle dark mode' },
  'close-modal': { keys: ['Escape'], description: 'Close modal/dialog' },
  'undo': { keys: ['Mod', 'z'], description: 'Undo' },
  'redo': { keys: ['Mod', 'Shift', 'z'], description: 'Redo' }
};

/**
 * KeyboardShortcuts manager class
 */
export class KeyboardShortcuts {
  /**
   * Create a keyboard shortcuts manager
   * @param {Object} options - Configuration options
   */
  constructor(options = {}) {
    this.options = {
      preventDefault: true,
      allowInInput: false,
      ...options
    };

    this.shortcuts = new Map();
    this.context = null;
    this.buffer = [];
    this.bufferTimeout = null;
    this.enabled = true;

    // Load custom shortcuts from localStorage
    this.loadCustomShortcuts();

    // Register default shortcuts
    this.registerDefaults();

    // Bind event listener
    this.handleKeyDown = this.handleKeyDown.bind(this);
    document.addEventListener('keydown', this.handleKeyDown);
  }

  /**
   * Register default shortcuts
   */
  registerDefaults() {
    for (const [id, shortcut] of Object.entries(DEFAULT_SHORTCUTS)) {
      this.register(id, shortcut.keys, {
        description: shortcut.description,
        context: shortcut.context
      });
    }
  }

  /**
   * Register a keyboard shortcut
   * @param {string} id - Unique identifier for the shortcut
   * @param {Array} keys - Array of key combinations
   * @param {Object} options - Options for the shortcut
   * @returns {Function} Unregister function
   */
  register(id, keys, options = {}) {
    const normalized = this.normalizeKeys(keys);
    const keyCombo = normalized.join('+');

    this.shortcuts.set(keyCombo, {
      id,
      keys: normalized,
      callback: options.callback || null,
      description: options.description || '',
      context: options.context || null
    });

    // Return unregister function
    return () => this.unregister(id);
  }

  /**
   * Unregister a keyboard shortcut
   * @param {string} id - Shortcut identifier
   */
  unregister(id) {
    for (const [keyCombo, shortcut] of this.shortcuts.entries()) {
      if (shortcut.id === id) {
        this.shortcuts.delete(keyCombo);
      }
    }
  }

  /**
   * Normalize key names
   * @param {Array} keys - Array of key names
   * @returns {Array} Normalized keys
   */
  normalizeKeys(keys) {
    return keys.map(key => {
      if (key === 'Mod' || key === 'Cmd' || key === 'Ctrl') {
        return navigator.platform.includes('Mac') ? 'Meta' : 'Control';
      }
      if (key === '/') return 'Slash';
      if (key === '?') return 'Slash';
      if (key === '\\') return 'Backslash';
      if (key === ' ') return 'Space';
      return key;
    });
  }

  /**
   * Handle key down event
   * @param {KeyboardEvent} event - Keyboard event
   */
  handleKeyDown(event) {
    if (!this.enabled) return;

    // Check if we're in an input field
    if (!this.options.allowInInput) {
      const target = event.target;
      const isInput = target instanceof HTMLInputElement ||
                      target instanceof HTMLTextAreaElement ||
                      target.isContentEditable;

      if (isInput && !this.isModifierKey(event.key)) {
        return;
      }
    }

    // Build key combination
    const keys = [];
    if (event.metaKey) keys.push('Meta');
    if (event.ctrlKey) keys.push('Control');
    if (event.shiftKey) keys.push('Shift');
    if (event.altKey) keys.push('Alt');

    let key = event.key;

    // Normalize special keys
    if (key === ' ') key = 'Space';
    if (key === '/' || key === '?') key = 'Slash';
    if (key === '\\') key = 'Backslash';

    keys.push(key);

    const keyCombo = keys.join('+');

    // Handle single key sequences (like g, then d)
    if (keys.length === 1 && !this.isModifierKey(key)) {
      this.buffer.push(key);
      clearTimeout(this.bufferTimeout);
      this.bufferTimeout = setTimeout(() => {
        this.buffer = [];
      }, 1000);

      // Check for sequence match
      const sequence = this.buffer.join('+');
      const shortcut = this.findShortcut(sequence);

      if (shortcut && this.checkContext(shortcut)) {
        event.preventDefault();
        this.buffer = [];
        if (shortcut.callback) {
          shortcut.callback(event);
        }
        this.trigger('shortcut', { id: shortcut.id, event });
      }
      return;
    }

    // Clear buffer on modifier key
    this.buffer = [];

    // Check for exact match
    const shortcut = this.shortcuts.get(keyCombo);
    if (shortcut && this.checkContext(shortcut)) {
      if (this.options.preventDefault) {
        event.preventDefault();
      }

      if (shortcut.callback) {
        shortcut.callback(event);
      }

      this.trigger('shortcut', { id: shortcut.id, event });
    }
  }

  /**
   * Find shortcut by key combination
   * @param {string} keyCombo - Key combination
   * @returns {Object|null} Shortcut object
   */
  findShortcut(keyCombo) {
    return this.shortcuts.get(keyCombo) || null;
  }

  /**
   * Check if shortcut matches current context
   * @param {Object} shortcut - Shortcut object
   * @returns {boolean} True if context matches
   */
  checkContext(shortcut) {
    if (!shortcut.context) return true;
    return this.context === shortcut.context;
  }

  /**
   * Check if key is a modifier key
   * @param {string} key - Key name
   * @returns {boolean} True if modifier key
   */
  isModifierKey(key) {
    return ['Control', 'Shift', 'Alt', 'Meta'].includes(key);
  }

  /**
   * Set current context
   * @param {string} context - Context name
   */
  setContext(context) {
    this.context = context;
    this.trigger('context-change', { context });
  }

  /**
   * Enable or disable shortcuts
   * @param {boolean} enabled - Enable state
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }

  /**
   * Trigger an event
   * @param {string} name - Event name
   * @param {Object} data - Event data
   */
  trigger(name, data) {
    const event = new CustomEvent(`kb:${name}`, { detail: data });
    document.dispatchEvent(event);
  }

  /**
   * Save custom shortcuts to localStorage
   */
  saveCustomShortcuts() {
    const custom = {};
    for (const [keyCombo, shortcut] of this.shortcuts.entries()) {
      if (shortcut.callback) {
        custom[shortcut.id] = {
          keys: shortcut.keys,
          description: shortcut.description,
          context: shortcut.context
        };
      }
    }
    try {
      localStorage.setItem('keyboard-shortcuts', JSON.stringify(custom));
    } catch (e) {
      console.warn('Failed to save keyboard shortcuts:', e);
    }
  }

  /**
   * Load custom shortcuts from localStorage
   */
  loadCustomShortcuts() {
    try {
      const saved = localStorage.getItem('keyboard-shortcuts');
      if (saved) {
        const custom = JSON.parse(saved);
        for (const [id, shortcut] of Object.entries(custom)) {
          this.register(id, shortcut.keys, shortcut);
        }
      }
    } catch (e) {
      console.warn('Failed to load keyboard shortcuts:', e);
    }
  }

  /**
   * Get all shortcuts
   * @param {string} context - Optional context filter
   * @returns {Array} Array of shortcuts
   */
  getShortcuts(context = null) {
    const shortcuts = [];
    const seen = new Set();

    for (const shortcut of this.shortcuts.values()) {
      if (seen.has(shortcut.id)) continue;
      seen.add(shortcut.id);

      if (!context || shortcut.context === context || !shortcut.context) {
        shortcuts.push({
          id: shortcut.id,
          keys: shortcut.keys,
          description: shortcut.description,
          context: shortcut.context
        });
      }
    }

    return shortcuts.sort((a, b) => a.id.localeCompare(b.id));
  }

  /**
   * Show keyboard shortcuts help
   */
  showHelp() {
    const existing = document.getElementById('kb-shortcuts-modal');
    if (existing) {
      existing.remove();
      return;
    }

    const shortcuts = this.getShortcuts();
    const grouped = {};

    for (const shortcut of shortcuts) {
      const context = shortcut.context || 'global';
      if (!grouped[context]) {
        grouped[context] = [];
      }
      grouped[context].push(shortcut);
    }

    let html = `
      <div id="kb-shortcuts-modal" class="fixed inset-0 z-50 flex items-center justify-center">
        <div class="absolute inset-0 bg-black/50" onclick="this.parentElement.remove()"></div>
        <div class="relative bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
          <div class="p-6">
            <div class="flex justify-between items-center mb-4">
              <h2 class="text-xl font-bold">Keyboard Shortcuts</h2>
              <button onclick="this.closest('#kb-shortcuts-modal').remove()" class="text-gray-400 hover:text-gray-600">
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <div class="space-y-6 overflow-y-auto max-h-[60vh]">
    `;

    for (const [context, ctxShortcuts] of Object.entries(grouped)) {
      html += `
        <div>
          <h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            ${context === 'global' ? 'Global Shortcuts' : context}
          </h3>
          <div class="space-y-2">
      `;

      for (const shortcut of ctxShortcuts) {
        const keys = shortcut.keys.map(k => {
          if (k === 'Meta') return '⌘';
          if (k === 'Control') return 'Ctrl';
          if (k === 'Shift') return '⇧';
          if (k === 'Space') return 'Space';
          if (k === 'Slash') return '?';
          return k;
        }).join(' + ');

        html += `
          <div class="flex justify-between items-center py-2">
            <span class="text-gray-700">${shortcut.description}</span>
            <kbd class="px-2 py-1 text-xs font-mono bg-gray-100 border border-gray-300 rounded">${keys}</kbd>
          </div>
        `;
      }

      html += `</div></div>`;
    }

    html += `
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
  }

  /**
   * Destroy the keyboard shortcuts manager
   */
  destroy() {
    document.removeEventListener('keydown', this.handleKeyDown);
    this.shortcuts.clear();
    clearTimeout(this.bufferTimeout);
  }
}

/**
 * Create a keyboard shortcuts manager
 * @param {Object} options - Configuration options
 * @returns {KeyboardShortcuts} The manager instance
 */
export function createKeyboardShortcuts(options = {}) {
  return new KeyboardShortcuts(options);
}

// Global instance
let globalInstance = null;

/**
 * Get or create the global keyboard shortcuts instance
 * @returns {KeyboardShortcuts} The global instance
 */
export function getGlobalKeyboardShortcuts() {
  if (!globalInstance) {
    globalInstance = new KeyboardShortcuts();
  }
  return globalInstance;
}

export default KeyboardShortcuts;
