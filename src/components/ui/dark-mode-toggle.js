/**
 * Dark Mode Toggle Component
 * Supports light, dark, and system theme modes
 *
 * @module DarkModeToggle
 */

/**
 * Theme modes
 */
export const ThemeMode = {
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system'
};

/**
 * CSS custom properties for dark mode
 */
const DARK_MODE_VARS = {
  '--bg-primary': '#1f2937',
  '--bg-secondary': '#111827',
  '--bg-tertiary': '#374151',
  '--text-primary': '#f9fafb',
  '--text-secondary': '#d1d5db',
  '--text-tertiary': '#9ca3af',
  '--border-color': '#374151',
  '--accent-primary': '#3b82f6',
  '--accent-secondary': '#60a5fa',
  '--success': '#10b981',
  '--warning': '#f59e0b',
  '--error': '#ef4444',
  '--info': '#3b82f6'
};

const LIGHT_MODE_VARS = {
  '--bg-primary': '#ffffff',
  '--bg-secondary': '#f9fafb',
  '--bg-tertiary': '#f3f4f6',
  '--text-primary': '#111827',
  '--text-secondary': '#6b7280',
  '--text-tertiary': '#9ca3af',
  '--border-color': '#e5e7eb',
  '--accent-primary': '#2563eb',
  '--accent-secondary': '#3b82f6',
  '--success': '#10b981',
  '--warning': '#f59e0b',
  '--error': '#ef4444',
  '--info': '#3b82f6'
};

/**
 * Get the system color scheme preference
 * @returns {string} 'light' or 'dark'
 */
export function getSystemTheme() {
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return ThemeMode.DARK;
  }
  return ThemeMode.LIGHT;
}

/**
 * Get the current theme (respects system preference)
 * @param {string} mode - Theme mode (light, dark, or system)
 * @returns {string} 'light' or 'dark'
 */
export function getCurrentTheme(mode = ThemeMode.SYSTEM) {
  if (mode === ThemeMode.SYSTEM) {
    return getSystemTheme();
  }
  return mode;
}

/**
 * Apply theme to document
 * @param {string} mode - Theme mode to apply
 */
export function applyTheme(mode) {
  const current = getCurrentTheme(mode);
  const vars = current === ThemeMode.DARK ? DARK_MODE_VARS : LIGHT_MODE_VARS;

  const root = document.documentElement;

  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }

  // Set data attribute for CSS targeting
  root.dataset.theme = current;

  // Update meta theme-color
  let metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (!metaThemeColor) {
    metaThemeColor = document.createElement('meta');
    metaThemeColor.name = 'theme-color';
    document.head.appendChild(metaThemeColor);
  }
  metaThemeColor.content = vars['--bg-primary'];
}

/**
 * Save theme preference to localStorage
 * @param {string} mode - Theme mode to save
 */
export function saveThemePreference(mode) {
  try {
    localStorage.setItem('theme-mode', mode);
  } catch (e) {
    console.warn('Failed to save theme preference:', e);
  }
}

/**
 * Load theme preference from localStorage
 * @returns {string} Saved theme mode, or 'system' if not set
 */
export function loadThemePreference() {
  try {
    return localStorage.getItem('theme-mode') || ThemeMode.SYSTEM;
  } catch (e) {
    console.warn('Failed to load theme preference:', e);
    return ThemeMode.SYSTEM;
  }
}

/**
 * DarkModeToggle class
 */
export class DarkModeToggle {
  /**
   * Create a dark mode toggle
   * @param {HTMLElement} container - Container element
   * @param {Object} options - Configuration options
   */
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      showLabel: true,
      position: 'top-right',
      ...options
    };

    this.currentMode = loadThemePreference();
    this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    this.render();
    this.attachListeners();

    // Apply initial theme
    applyTheme(this.currentMode);
  }

  /**
   * Render the toggle component
   */
  render() {
    const icons = {
      light: `<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/>
      </svg>`,
      dark: `<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>
      </svg>`,
      system: `<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
      </svg>`
    };

    this.container.innerHTML = `
      <div class="dark-mode-toggle relative">
        <button id="theme-toggle-btn"
                class="theme-toggle-btn p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                aria-label="Toggle theme">
          <span class="theme-icon light">${icons.light}</span>
          <span class="theme-icon dark hidden">${icons.dark}</span>
          <span class="theme-icon system hidden">${icons.system}</span>
        </button>
        ${this.options.showLabel ? `
          <span id="theme-label" class="theme-label text-sm text-gray-600 dark:text-gray-400 ml-2">
            ${this.getLabelForMode(this.currentMode)}
          </span>
        ` : ''}
      </div>
    `;

    this.btn = this.container.querySelector('#theme-toggle-btn');
    this.label = this.container.querySelector('#theme-label');
    this.updateIcons();
  }

  /**
   * Get label for theme mode
   * @param {string} mode - Theme mode
   * @returns {string} Label text
   */
  getLabelForMode(mode) {
    const labels = {
      [ThemeMode.LIGHT]: 'Light',
      [ThemeMode.DARK]: 'Dark',
      [ThemeMode.SYSTEM]: 'System'
    };
    return labels[mode] || 'System';
  }

  /**
   * Update icons based on current mode
   */
  updateIcons() {
    if (!this.btn) return;

    const lightIcon = this.btn.querySelector('.theme-icon.light');
    const darkIcon = this.btn.querySelector('.theme-icon.dark');
    const systemIcon = this.btn.querySelector('.theme-icon.system');

    const current = getCurrentTheme(this.currentMode);

    if (this.currentMode === ThemeMode.SYSTEM) {
      lightIcon?.classList.add('hidden');
      darkIcon?.classList.add('hidden');
      systemIcon?.classList.remove('hidden');
    } else if (current === ThemeMode.DARK) {
      lightIcon?.classList.add('hidden');
      darkIcon?.classList.remove('hidden');
      systemIcon?.classList.add('hidden');
    } else {
      lightIcon?.classList.remove('hidden');
      darkIcon?.classList.add('hidden');
      systemIcon?.classList.add('hidden');
    }
  }

  /**
   * Attach event listeners
   */
  attachListeners() {
    if (this.btn) {
      this.btn.addEventListener('click', () => this.cycleTheme());
    }

    // Listen for system theme changes
    this.mediaQuery.addEventListener('change', () => {
      if (this.currentMode === ThemeMode.SYSTEM) {
        applyTheme(ThemeMode.SYSTEM);
        this.updateIcons();
      }
    });
  }

  /**
   * Cycle through theme modes
   */
  cycleTheme() {
    const modes = [ThemeMode.LIGHT, ThemeMode.DARK, ThemeMode.SYSTEM];
    const currentIndex = modes.indexOf(this.currentMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    this.setTheme(modes[nextIndex]);
  }

  /**
   * Set the theme mode
   * @param {string} mode - Theme mode to set
   */
  setTheme(mode) {
    this.currentMode = mode;
    applyTheme(mode);
    saveThemePreference(mode);
    this.updateIcons();

    if (this.label) {
      this.label.textContent = this.getLabelForMode(mode);
    }

    // Trigger custom event
    const event = new CustomEvent('theme-change', { detail: { mode, current: getCurrentTheme(mode) } });
    document.dispatchEvent(event);
  }

  /**
   * Get the current theme mode
   * @returns {string} Current theme mode
   */
  getTheme() {
    return this.currentMode;
  }

  /**
   * Get the actual applied theme
   * @returns {string} 'light' or 'dark'
   */
  getAppliedTheme() {
    return getCurrentTheme(this.currentMode);
  }

  /**
   * Destroy the component
   */
  destroy() {
    if (this.btn) {
      this.btn.removeEventListener('click', () => this.cycleTheme());
    }
    this.mediaQuery.removeEventListener('change', () => {});
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}

/**
 * Initialize dark mode globally
 * @param {string} mode - Initial theme mode
 */
export function initDarkMode(mode = null) {
  const themeMode = mode || loadThemePreference();
  applyTheme(themeMode);

  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (loadThemePreference() === ThemeMode.SYSTEM) {
      applyTheme(ThemeMode.SYSTEM);
    }
  });
}

/**
 * Create a dark mode toggle
 * @param {HTMLElement} container - Container element
 * @param {Object} options - Configuration options
 * @returns {DarkModeToggle} The toggle instance
 */
export function createDarkModeToggle(container, options = {}) {
  return new DarkModeToggle(container, options);
}

// Auto-initialize dark mode on script load
if (typeof document !== 'undefined') {
  initDarkMode();
}

export default DarkModeToggle;
