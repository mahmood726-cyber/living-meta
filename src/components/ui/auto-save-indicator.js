/**
 * Auto-Save Indicator Component
 * Visual feedback for auto-save functionality
 *
 * @module AutoSaveIndicator
 */

/**
 * AutoSave states
 */
export const SaveState = {
  SAVED: 'saved',
  SAVING: 'saving',
  UNSAVED: 'unsaved',
  ERROR: 'error'
};

/**
 * AutoSaveIndicator class
 */
export class AutoSaveIndicator {
  /**
   * Create an auto-save indicator
   * @param {HTMLElement} container - Container element
   * @param {Object} options - Configuration options
   */
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      position: 'bottom-right', // 'bottom-right', 'bottom-left', 'top-right', 'top-left'
      autoSaveInterval: 30000, // 30 seconds
      showTimer: true,
      ...options
    };

    this.state = SaveState.SAVED;
    this.lastSaved = new Date();
    this.timer = null;
    this.countdown = null;
    this.interval = this.options.autoSaveInterval;
    this.onSaveCallback = null;

    this.render();
    this.startCountdown();
  }

  /**
   * Render the indicator
   */
  render() {
    const positions = {
      'bottom-right': 'bottom-4 right-4',
      'bottom-left': 'bottom-4 left-4',
      'top-right': 'top-4 right-4',
      'top-left': 'top-4 left-4'
    };

    const position = positions[this.options.position] || positions['bottom-right'];

    this.container.innerHTML = `
      <div class="auto-save-indicator fixed ${position} z-50 transition-all duration-300">
        <div class="bg-white border border-gray-200 rounded-lg shadow-lg p-3 flex items-center space-x-3 max-w-xs">
          <div class="save-icon">
            ${this.getIconForState(SaveState.SAVED)}
          </div>
          <div class="flex-1 min-w-0">
            <div class="save-status text-sm font-medium text-gray-900">
              ${this.getTextForState(SaveState.SAVED)}
            </div>
            ${this.options.showTimer ? `
              <div class="save-timer text-xs text-gray-500 mt-0.5">
                Next save in <span class="countdown">30</span>s
              </div>
            ` : ''}
          </div>
          <button class="save-now-btn text-blue-600 hover:text-blue-800 text-sm font-medium opacity-0 pointer-events-none transition-opacity">
            Save now
          </button>
        </div>
      </div>
    `;

    this.element = this.container.querySelector('.auto-save-indicator');
    this.iconElement = this.container.querySelector('.save-icon');
    this.statusElement = this.container.querySelector('.save-status');
    this.countdownElement = this.container.querySelector('.countdown');
    this.saveNowBtn = this.container.querySelector('.save-now-btn');

    this.attachEventListeners();
  }

  /**
   * Get icon HTML for a state
   * @param {string} state - Save state
   * @returns {string} Icon HTML
   */
  getIconForState(state) {
    const icons = {
      [SaveState.SAVED]: `<svg class="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
      </svg>`,
      [SaveState.SAVING]: `<svg class="w-5 h-5 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>`,
      [SaveState.UNSAVED]: `<svg class="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
      </svg>`,
      [SaveState.ERROR]: `<svg class="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
      </svg>`
    };
    return icons[state] || icons[SaveState.SAVED];
  }

  /**
   * Get text for a state
   * @param {string} state - Save state
   * @returns {string} Status text
   */
  getTextForState(state) {
    const texts = {
      [SaveState.SAVED]: 'All changes saved',
      [SaveState.SAVING]: 'Saving...',
      [SaveState.UNSAVED]: 'Unsaved changes',
      [SaveState.ERROR]: 'Save failed'
    };
    return texts[state] || 'Unknown state';
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    if (this.saveNowBtn) {
      this.saveNowBtn.addEventListener('click', () => {
        this.saveNow();
      });
    }
  }

  /**
   * Update the indicator state
   * @param {string} newState - New state
   */
  setState(newState) {
    this.state = newState;

    if (this.iconElement) {
      this.iconElement.innerHTML = this.getIconForState(newState);
    }

    if (this.statusElement) {
      this.statusElement.textContent = this.getTextForState(newState);
    }

    // Show/hide save now button
    if (this.saveNowBtn) {
      if (newState === SaveState.UNSAVED) {
        this.saveNowBtn.classList.remove('opacity-0', 'pointer-events-none');
        this.saveNowBtn.classList.add('opacity-100');
      } else {
        this.saveNowBtn.classList.add('opacity-0', 'pointer-events-none');
        this.saveNowBtn.classList.remove('opacity-100');
      }
    }

    // Reset countdown on saved
    if (newState === SaveState.SAVED) {
      this.lastSaved = new Date();
      this.resetCountdown();
    }
  }

  /**
   * Mark as having unsaved changes
   */
  markUnsaved() {
    if (this.state !== SaveState.SAVING) {
      this.setState(SaveState.UNSAVED);
    }
  }

  /**
   * Start the auto-save countdown
   */
  startCountdown() {
    if (this.timer) {
      clearInterval(this.timer);
    }

    let remaining = this.interval / 1000;

    this.timer = setInterval(() => {
      remaining--;

      if (this.countdownElement) {
        this.countdownElement.textContent = remaining;
      }

      if (remaining <= 0) {
        if (this.state === SaveState.UNSAVED) {
          this.saveNow();
        }
        remaining = this.interval / 1000;
      }
    }, 1000);
  }

  /**
   * Reset the countdown timer
   */
  resetCountdown() {
    let remaining = this.interval / 1000;
    if (this.countdownElement) {
      this.countdownElement.textContent = remaining;
    }
  }

  /**
   * Trigger save now
   */
  async saveNow() {
    if (this.state === SaveState.SAVING) return;

    this.setState(SaveState.SAVING);

    try {
      if (this.onSaveCallback) {
        await this.onSaveCallback();
      }
      this.setState(SaveState.SAVED);
    } catch (error) {
      console.error('Auto-save failed:', error);
      this.setState(SaveState.ERROR);

      // Reset to unsaved after error
      setTimeout(() => {
        if (this.state === SaveState.ERROR) {
          this.setState(SaveState.UNSAVED);
        }
      }, 3000);
    }
  }

  /**
   * Set the save callback function
   * @param {Function} callback - Save callback
   */
  onSave(callback) {
    this.onSaveCallback = callback;
  }

  /**
   * Update the auto-save interval
   * @param {number} interval - New interval in milliseconds
   */
  setInterval(interval) {
    this.interval = interval;
    this.startCountdown();
  }

  /**
   * Show the indicator
   */
  show() {
    if (this.element) {
      this.element.classList.remove('opacity-0', 'pointer-events-none');
    }
  }

  /**
   * Hide the indicator
   */
  hide() {
    if (this.element) {
      this.element.classList.add('opacity-0', 'pointer-events-none');
    }
  }

  /**
   * Destroy the indicator
   */
  destroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}

/**
 * Create an auto-save indicator
 * @param {HTMLElement} container - Container element
 * @param {Object} options - Configuration options
 * @returns {AutoSaveIndicator} The indicator instance
 */
export function createAutoSaveIndicator(container, options = {}) {
  return new AutoSaveIndicator(container, options);
}

/**
 * Initialize auto-save for a form or component
 * @param {HTMLElement} element - Element to watch for changes
 * @param {Function} saveCallback - Function to call on save
 * @param {Object} options - Configuration options
 * @returns {AutoSaveIndicator} The indicator instance
 */
export function initAutoSave(element, saveCallback, options = {}) {
  // Create container if it doesn't exist
  let container = document.getElementById('auto-save-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'auto-save-container';
    document.body.appendChild(container);
  }

  const indicator = new AutoSaveIndicator(container, options);
  indicator.onSave(saveCallback);

  // Watch for changes on the element
  const observer = new MutationObserver(() => {
    indicator.markUnsaved();
  });

  if (element) {
    observer.observe(element, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true
    });

    // Also watch for input events
    element.addEventListener('input', () => {
      indicator.markUnsaved();
    });
  }

  // Store observer for cleanup
  indicator._observer = observer;

  return indicator;
}

export default AutoSaveIndicator;
