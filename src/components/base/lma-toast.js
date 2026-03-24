/**
 * LMA Toast Notification Component
 * Auto-dismissing notification with variants
 *
 * @example
 * LmaToast.show({ type: 'success', message: 'Saved!' });
 *
 * @attr {string} type - Toast type: success, error, warning, info
 * @attr {number} duration - Auto-dismiss duration in ms (0 = no auto-dismiss)
 */
export class LmaToast extends HTMLElement {
  static get observedAttributes() {
    return ['type', 'duration'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._timeout = null;
  }

  connectedCallback() {
    this.render();
    this.setupAutoDismiss();
  }

  disconnectedCallback() {
    if (this._timeout) {
      clearTimeout(this._timeout);
    }
  }

  get type() {
    return this.getAttribute('type') || 'info';
  }

  get duration() {
    const d = this.getAttribute('duration');
    return d ? parseInt(d, 10) : 5000;
  }

  get message() {
    return this.getAttribute('message') || '';
  }

  setupAutoDismiss() {
    if (this.duration > 0) {
      this._timeout = setTimeout(() => this.dismiss(), this.duration);
    }
  }

  dismiss() {
    this.classList.add('dismissing');
    setTimeout(() => this.remove(), 150);
  }

  getTypeStyles() {
    const types = {
      success: { bg: '#ecfdf5', border: '#10b981', icon: '#059669', iconPath: 'M5 13l4 4L19 7' },
      error: { bg: '#fef2f2', border: '#ef4444', icon: '#dc2626', iconPath: 'M6 18L18 6M6 6l12 12' },
      warning: { bg: '#fffbeb', border: '#f59e0b', icon: '#d97706', iconPath: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' },
      info: { bg: '#eff6ff', border: '#3b82f6', icon: '#2563eb', iconPath: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' }
    };
    return types[this.type] || types.info;
  }

  render() {
    const styles = this.getTypeStyles();

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          animation: slideIn 150ms ease;
        }
        :host(.dismissing) {
          animation: slideOut 150ms ease forwards;
        }
        .toast {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          padding: 1rem;
          background: ${styles.bg};
          border: 1px solid ${styles.border};
          border-radius: 0.5rem;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
          max-width: 24rem;
        }
        .icon {
          flex-shrink: 0;
          width: 1.25rem;
          height: 1.25rem;
          color: ${styles.icon};
        }
        .content {
          flex: 1;
          font-size: 0.875rem;
          color: #374151;
        }
        .close-btn {
          flex-shrink: 0;
          background: none;
          border: none;
          padding: 0.25rem;
          cursor: pointer;
          color: #9ca3af;
          border-radius: 0.25rem;
        }
        .close-btn:hover {
          color: #6b7280;
          background: rgba(0, 0, 0, 0.05);
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(100%); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes slideOut {
          from { opacity: 1; transform: translateX(0); }
          to { opacity: 0; transform: translateX(100%); }
        }
      </style>
      <div class="toast" role="alert" aria-live="polite">
        <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${styles.iconPath}"/>
        </svg>
        <div class="content">
          <slot>${this.message}</slot>
        </div>
        <button class="close-btn" aria-label="Dismiss">
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
    `;

    this.shadowRoot.querySelector('.close-btn').addEventListener('click', () => this.dismiss());
  }

  /**
   * Static method to show a toast notification
   * @param {Object} options - Toast options
   * @param {string} options.type - Toast type
   * @param {string} options.message - Toast message
   * @param {number} [options.duration=5000] - Auto-dismiss duration
   */
  static show({ type = 'info', message, duration = 5000 }) {
    const container = document.getElementById('toast-container') || document.body;
    const toast = document.createElement('lma-toast');
    toast.setAttribute('type', type);
    toast.setAttribute('duration', duration);
    toast.setAttribute('message', message);
    container.appendChild(toast);
    return toast;
  }
}

customElements.define('lma-toast', LmaToast);
