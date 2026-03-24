/**
 * Accessibility Utilities
 * ARIA attributes, keyboard navigation, and screen reader support
 *
 * @module Accessibility
 */

/**
 * ARIA attribute generators
 */
export const ARIA = {
  /**
   * Generate aria-label for a button with icon
   * @param {string} label - The label text
   * @param {string} description - Additional description
   * @returns {Object} ARIA attributes
   */
  buttonLabel(label, description = '') {
    return {
      'aria-label': label,
      ...(description && { 'aria-describedby': description })
    };
  },

  /**
   * Generate aria-live region attributes
   * @param {string} level - 'polite', 'assertive', or 'off'
   * @returns {Object} ARIA attributes
   */
  liveRegion(level = 'polite') {
    return {
      'aria-live': level,
      'aria-atomic': 'true',
      role: 'status'
    };
  },

  /**
   * Generate aria-expanded for collapsible content
   * @param {boolean} expanded - Whether content is expanded
   * @returns {Object} ARIA attributes
   */
  expanded(expanded) {
    return {
      'aria-expanded': String(expanded)
    };
  },

  /**
   * Generate aria-selected for tabs/selectable items
   * @param {boolean} selected - Whether item is selected
   * @returns {Object} ARIA attributes
   */
  selected(selected) {
    return {
      'aria-selected': String(selected),
      ...(selected && { tabindex: '0' })
    };
  },

  /**
   * Generate aria-pressed for toggle buttons
   * @param {boolean} pressed - Whether button is pressed
   * @returns {Object} ARIA attributes
   */
  pressed(pressed) {
    return {
      'aria-pressed': String(pressed)
    };
  },

  /**
   * Generate aria-checked for checkboxes
   * @param {boolean} checked - Whether checkbox is checked
   * @param {string} state - 'true', 'false', or 'mixed'
   * @returns {Object} ARIA attributes
   */
  checked(state) {
    return {
      'aria-checked': String(state)
    };
  },

  /**
   * Generate aria-disabled attribute
   * @param {boolean} disabled - Whether element is disabled
   * @returns {Object} ARIA attributes
   */
  disabled(disabled) {
    return {
      'aria-disabled': String(disabled),
      ...(disabled && { tabindex: '-1' })
    };
  },

  /**
   * Generate aria-busy for loading states
   * @param {boolean} busy - Whether element is busy
   * @returns {Object} ARIA attributes
   */
  busy(busy) {
    return {
      'aria-busy': String(busy)
    };
  },

  /**
   * Generate aria-invalid for validation
   * @param {boolean} invalid - Whether value is invalid
   * @param {string} message - Error message
   * @returns {Object} ARIA attributes
   */
  invalid(invalid, message = '') {
    return {
      'aria-invalid': String(invalid),
      ...(invalid && message && { 'aria-errormessage': message })
    };
  },

  /**
   * Generate aria-hidden to hide from screen readers
   * @param {boolean} hidden - Whether to hide
   * @returns {Object} ARIA attributes
   */
  hidden(hidden) {
    return {
      'aria-hidden': String(hidden)
    };
  },

  /**
   * Generate dialog attributes
   * @param {boolean} open - Whether dialog is open
   * @param {string} labelId - ID of dialog label
   * @param {string} descId - ID of dialog description
   * @returns {Object} ARIA attributes
   */
  dialog(open, labelId, descId) {
    return {
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': labelId,
      'aria-describedby': descId,
      ...(open && { 'aria-hidden': 'false' }),
      ...(!open && { 'aria-hidden': 'true' })
    };
  },

  /**
   * Generate alert role for important messages
   * @returns {Object} ARIA attributes
   */
  alert() {
    return {
      role: 'alert',
      'aria-live': 'assertive'
    };
  },

  /**
   * Generate listbox role for dropdowns
   * @param {string} labelId - ID of label
   * @returns {Object} ARIA attributes
   */
  listbox(labelId) {
    return {
      role: 'listbox',
      'aria-labelledby': labelId,
      'aria-orientation': 'vertical'
    };
  },

  /**
   * Generate option role for listbox options
   * @param {boolean} selected - Whether option is selected
   * @param {number} index - Option index
   * @param {number} setSize - Total number of options
   * @returns {Object} ARIA attributes
   */
  option(selected, index, setSize) {
    return {
      role: 'option',
      'aria-selected': String(selected),
      'aria-setsize': String(setSize),
      'aria-posinset': String(index + 1)
    };
  },

  /**
   * Generate tablist role for tabs
   * @param {string} labelId - ID of label
   * @returns {Object} ARIA attributes
   */
  tablist(labelId) {
    return {
      role: 'tablist',
      'aria-labelledby': labelId,
      'aria-orientation': 'horizontal'
    };
  },

  /**
   * Generate tab role
   * @param {boolean} selected - Whether tab is selected
   * @param {string} panelId - ID of associated panel
   * @param {number} index - Tab index
   * @param {number} setSize - Total number of tabs
   * @returns {Object} ARIA attributes
   */
  tab(selected, panelId, index, setSize) {
    return {
      role: 'tab',
      'aria-selected': String(selected),
      'aria-controls': panelId,
      'aria-setsize': String(setSize),
      'aria-posinset': String(index + 1),
      tabindex: selected ? '0' : '-1'
    };
  },

  /**
   * Generate tabpanel role
   * @param {string} tabId - ID of associated tab
   * @param {boolean} hidden - Whether panel is hidden
   * @returns {Object} ARIA attributes
   */
  tabpanel(tabId, hidden) {
    return {
      role: 'tabpanel',
      'aria-labelledby': tabId,
      ...(hidden && { 'aria-hidden': 'true' }),
      ...(!hidden && { tabindex: '0' })
    };
  },

  /**
   * Generate navigation attributes
   * @param {string} label - Label for navigation
   * @returns {Object} ARIA attributes
   */
  navigation(label) {
    return {
      role: 'navigation',
      'aria-label': label
    };
  },

  /**
   * Generate main content attributes
   * @param {string} label - Label for main content
   * @returns {Object} ARIA attributes
   */
  main(label) {
    return {
      role: 'main',
      'aria-label': label
    };
  },

  /**
   * Generate search role
   * @param {string} label - Label for search
   * @returns {Object} ARIA attributes
   */
  search(label) {
    return {
      role: 'search',
      'aria-label': label
    };
  },

  /**
   * Generate combobox role for autocomplete
   * @param {string} labelId - ID of label
   * @param {string} listId - ID of associated listbox
   * @param {boolean} expanded - Whether listbox is expanded
   * @returns {Object} ARIA attributes
   */
  combobox(labelId, listId, expanded) {
    return {
      role: 'combobox',
      'aria-labelledby': labelId,
      'aria-controls': listId,
      'aria-autocomplete': 'list',
      'aria-expanded': String(expanded),
      'aria-haspopup': 'listbox',
      autocomplete: 'off'
    };
  }
};

/**
 * Focus management utilities
 */
export const Focus = {
  /**
   * Trap focus within an element
   * @param {HTMLElement} element - Element to trap focus in
   * @returns {Function} Cleanup function
   */
  trapFocus(element) {
    const focusableElements = element.querySelectorAll(
      'a[href], button:not([disabled]), textarea:not([disabled]), ' +
      'input[type="text"]:not([disabled]), input[type="radio"]:not([disabled]), ' +
      'input[type="checkbox"]:not([disabled]), select:not([disabled]), ' +
      '[tabindex]:not([tabindex="-1"])'
    );

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleKeyDown = (e) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    element.addEventListener('keydown', handleKeyDown);

    // Focus first element
    firstElement?.focus();

    return () => {
      element.removeEventListener('keydown', handleKeyDown);
    };
  },

  /**
   * Restore focus to previous element
   * @returns {Function} Function to restore focus
   */
  saveFocus() {
    const activeElement = document.activeElement;

    return () => {
      activeElement?.focus();
    };
  },

  /**
   * Manage focus for a component
   * @param {HTMLElement} container - Container element
   * @param {Object} options - Options
   * @returns {Object} Focus management API
   */
  manage(container, options = {}) {
    const { autofocus = true, trap = false } = options;

    let cleanupTrap = null;

    const focusables = () => {
      return container.querySelectorAll(
        'a[href], button:not([disabled]), textarea:not([disabled]), ' +
        'input[type="text"]:not([disabled]), input[type="radio"]:not([disabled]), ' +
        'input[type="checkbox"]:not([disabled]), select:not([disabled]), ' +
        '[tabindex]:not([tabindex="-1"])'
      );
    };

    const focusFirst = () => {
      const elements = focusables();
      if (elements.length > 0) {
        elements[0].focus();
      }
    };

    const focusLast = () => {
      const elements = focusables();
      if (elements.length > 0) {
        elements[elements.length - 1].focus();
      }
    };

    const init = () => {
      if (autofocus) {
        setTimeout(focusFirst, 100);
      }

      if (trap) {
        cleanupTrap = Focus.trapFocus(container);
      }
    };

    const destroy = () => {
      cleanupTrap?.();
    };

    return {
      focusFirst,
      focusLast,
      focusables,
      init,
      destroy
    };
  }
};

/**
 * Screen reader announcements
 */
export const Announcer = {
  /**
   * Create an announcer element
   * @param {string} level - 'polite' or 'assertive'
   * @returns {Object} Announcer API
   */
  create(level = 'polite') {
    let element = document.getElementById('a11y-announcer');

    if (!element) {
      element = document.createElement('div');
      element.id = 'a11y-announcer';
      element.setAttribute('role', 'status');
      element.setAttribute('aria-live', level);
      element.setAttribute('aria-atomic', 'true');
      element.className = 'sr-only';
      element.style.cssText = `
        position: absolute;
        left: -10000px;
        width: 1px;
        height: 1px;
        overflow: hidden;
      `;
      document.body.appendChild(element);
    }

    return {
      /**
       * Announce a message to screen readers
       * @param {string} message - Message to announce
       * @param {number} priority - Priority level (higher = more important)
       */
      announce(message, priority = 0) {
        element.textContent = '';
        setTimeout(() => {
          element.textContent = message;
        }, 100);
      },

      /**
       * Clear the current announcement
       */
      clear() {
        element.textContent = '';
      },

      /**
       * Destroy the announcer
       */
      destroy() {
        element.remove();
      }
    };
  },

  /**
   * Announce a message (convenience function)
   * @param {string} message - Message to announce
   * @param {string} level - 'polite' or 'assertive'
   */
  announce(message, level = 'polite') {
    const announcer = Announcer.create(level);
    announcer.announce(message);
  }
};

/**
 * Keyboard navigation utilities
 */
export const Keyboard = {
  /**
   * Check if a key press matches a shortcut
   * @param {KeyboardEvent} event - Keyboard event
   * @param {string|Array} shortcut - Key or array of keys
   * @returns {boolean} True if matches
   */
  matches(event, shortcut) {
    if (Array.isArray(shortcut)) {
      return shortcut.includes(event.key);
    }
    return event.key === shortcut;
  },

  /**
   * Check if modifier keys are pressed
   * @param {KeyboardEvent} event - Keyboard event
   * @param {Object} modifiers - Modifiers to check
   * @returns {boolean} True if modifiers match
   */
  hasModifiers(event, modifiers = {}) {
    return (
      (modifiers.ctrl ?? false) === event.ctrlKey &&
      (modifiers.shift ?? false) === event.shiftKey &&
      (modifiers.alt ?? false) === event.altKey &&
      (modifiers.meta ?? false) === event.metaKey
    );
  },

  /**
   * Create keyboard handler with shortcuts
   * @param {Object} shortcuts - Map of shortcuts to handlers
   * @returns {Function} Event handler
   */
  createHandler(shortcuts) {
    return (event) => {
      for (const [shortcut, handler] of Object.entries(shortcuts)) {
        const parts = shortcut.split('+');
        const key = parts.pop();
        const modifiers = {};

        for (const part of parts) {
          switch (part.toLowerCase()) {
            case 'ctrl':
            case 'control':
              modifiers.ctrl = true;
              break;
            case 'shift':
              modifiers.shift = true;
              break;
            case 'alt':
              modifiers.alt = true;
              break;
            case 'meta':
            case 'cmd':
              modifiers.meta = true;
              break;
          }
        }

        if (Keyboard.matches(event, key) && Keyboard.hasModifiers(event, modifiers)) {
          event.preventDefault();
          handler(event);
          return;
        }
      }
    };
  },

  /**
   * Add keyboard navigation to a list
   * @param {HTMLElement} container - Container element
   * @param {Object} options - Options
   * @returns {Function} Cleanup function
   */
  navigateList(container, options = {}) {
    const {
      itemSelector = '[role="option"], [role="tab"], li',
      onSelect = null,
      activateOnEnter = true,
      activateOnSpace = true,
      loop = true
    } = options;

    let currentIndex = -1;
    let items = [];

    const updateItems = () => {
      items = Array.from(container.querySelectorAll(itemSelector));
    };

    const setActive = (index) => {
      if (index < 0) {
        index = loop ? items.length - 1 : 0;
      } else if (index >= items.length) {
        index = loop ? 0 : items.length - 1;
      }

      items.forEach((item, i) => {
        if (i === index) {
          item.setAttribute('aria-selected', 'true');
          item.classList.add('active');
          item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } else {
          item.setAttribute('aria-selected', 'false');
          item.classList.remove('active');
        }
      });

      currentIndex = index;
    };

    const activate = () => {
      if (currentIndex >= 0 && items[currentIndex]) {
        items[currentIndex].click();
      }
    };

    const handleKeyDown = (event) => {
      switch (event.key) {
        case 'ArrowDown':
        case 'ArrowRight':
          event.preventDefault();
          setActive(currentIndex + 1);
          break;

        case 'ArrowUp':
        case 'ArrowLeft':
          event.preventDefault();
          setActive(currentIndex - 1);
          break;

        case 'Home':
          event.preventDefault();
          setActive(0);
          break;

        case 'End':
          event.preventDefault();
          setActive(items.length - 1);
          break;

        case 'Enter':
          if (activateOnEnter) {
            event.preventDefault();
            activate();
          }
          break;

        case ' ':
          if (activateOnSpace) {
            event.preventDefault();
            activate();
          }
          break;

        default:
          // Character navigation
          if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
            const char = event.key.toLowerCase();
            const matchingIndex = items.findIndex((item, i) =>
              i > currentIndex &&
              item.textContent?.toLowerCase().startsWith(char)
            );

            if (matchingIndex >= 0) {
              event.preventDefault();
              setActive(matchingIndex);
            }
          }
      }
    };

    updateItems();
    container.addEventListener('keydown', handleKeyDown);

    // Observer for dynamic content
    const observer = new MutationObserver(updateItems);
    observer.observe(container, { childList: true, subtree: true });

    return () => {
      container.removeEventListener('keydown', handleKeyDown);
      observer.disconnect();
    };
  }
};

/**
 * High contrast mode support
 */
export const Contrast = {
  /**
   * Check if high contrast mode is enabled
   * @returns {boolean} True if high contrast
   */
  isEnabled() {
    if (window.matchMedia) {
      return window.matchMedia('(prefers-contrast: high)').matches;
    }
    return false;
  },

  /**
   * Listen for high contrast mode changes
   * @param {Function} callback - Callback when mode changes
   * @returns {Function} Cleanup function
   */
  onChange(callback) {
    if (window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-contrast: high)');
      mediaQuery.addEventListener('change', callback);
      return () => mediaQuery.removeEventListener('change', callback);
    }
    return () => {};
  },

  /**
   * Get appropriate colors for current contrast mode
   * @param {Object} colors - Color map
   * @returns {Object} Adjusted colors
   */
  getColors(colors) {
    if (Contrast.isEnabled()) {
      return {
        ...colors,
        // High contrast overrides
        text: '#ffffff',
        background: '#000000',
        border: '#ffffff',
        primary: '#ffff00',
        secondary: '#00ffff'
      };
    }
    return colors;
  }
};

/**
 * Reduced motion support
 */
export const Motion = {
  /**
   * Check if reduced motion is preferred
   * @returns {boolean} True if reduced motion
   */
  isReduced() {
    if (window.matchMedia) {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    return false;
  },

  /**
   * Listen for reduced motion changes
   * @param {Function} callback - Callback when preference changes
   * @returns {Function} Cleanup function
   */
  onChange(callback) {
    if (window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      mediaQuery.addEventListener('change', callback);
      return () => mediaQuery.removeEventListener('change', callback);
    }
    return () => {};
  },

  /**
   * Get animation duration (respects reduced motion)
   * @param {number} duration - Normal duration in ms
   * @returns {number} Adjusted duration
   */
  getDuration(duration) {
    return Motion.isReduced() ? 0 : duration;
  }
};

/**
 * Initialize accessibility features
 * @param {Object} options - Options
 * @returns {Object} Accessibility API
 */
export function initAccessibility(options = {}) {
  const {
    skipLink = true,
    focusIndicator = true,
    liveRegions = true
  } = options;

  // Add skip link
  if (skipLink && !document.getElementById('skip-link')) {
    const skipLinkEl = document.createElement('a');
    skipLinkEl.id = 'skip-link';
    skipLinkEl.href = '#main-content';
    skipLinkEl.textContent = 'Skip to main content';
    skipLinkEl.style.cssText = `
      position: absolute;
      top: -40px;
      left: 0;
      background: #000;
      color: #fff;
      padding: 8px;
      text-decoration: none;
      z-index: 100000;
    `;
    skipLinkEl.addEventListener('focus', () => {
      skipLinkEl.style.top = '0';
    });
    skipLinkEl.addEventListener('blur', () => {
      skipLinkEl.style.top = '-40px';
    });
    document.body.prepend(skipLinkEl);
  }

  // Add focus indicator
  if (focusIndicator) {
    document.documentElement.style.setProperty('--focus-ring', '2px solid #0066cc');
    document.documentElement.style.setProperty('--focus-offset', '2px');
  }

  // Create live regions
  let announcer = null;
  if (liveRegions) {
    announcer = Announcer.create();
  }

  return {
    announcer,
    ARIA,
    Focus,
    Keyboard,
    Contrast,
    Motion
  };
}

export default {
  ARIA,
  Focus,
  Announcer,
  Keyboard,
  Contrast,
  Motion,
  initAccessibility
};
