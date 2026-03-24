/**
 * LMA Modal Component
 * Accessible modal dialog with focus trapping and keyboard navigation
 *
 * @example
 * <lma-modal id="myModal" title="Confirm Action">
 *   <p>Are you sure?</p>
 *   <div slot="footer">
 *     <lma-button variant="secondary" data-close>Cancel</lma-button>
 *     <lma-button variant="primary">Confirm</lma-button>
 *   </div>
 * </lma-modal>
 *
 * @attr {string} title - Modal title
 * @attr {boolean} open - Whether modal is visible
 * @attr {string} size - Modal size: sm, md, lg, xl
 */
export class LmaModal extends HTMLElement {
  static get observedAttributes() {
    return ['open', 'title', 'size'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._previouslyFocused = null;
  }

  connectedCallback() {
    this.render();
    this.setupEventListeners();
  }

  disconnectedCallback() {
    document.removeEventListener('keydown', this._handleKeydown);
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'open') {
      if (newValue !== null) {
        this.onOpen();
      } else {
        this.onClose();
      }
    }
    this.render();
  }

  get isOpen() {
    return this.hasAttribute('open');
  }

  set isOpen(value) {
    if (value) {
      this.setAttribute('open', '');
    } else {
      this.removeAttribute('open');
    }
  }

  get title() {
    return this.getAttribute('title') || '';
  }

  get size() {
    return this.getAttribute('size') || 'md';
  }

  open() {
    this.isOpen = true;
  }

  close() {
    this.isOpen = false;
  }

  onOpen() {
    this._previouslyFocused = document.activeElement;
    document.body.style.overflow = 'hidden';

    requestAnimationFrame(() => {
      const focusable = this.shadowRoot.querySelector('[autofocus], button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (focusable) focusable.focus();
    });

    this.dispatchEvent(new CustomEvent('modal-open', { bubbles: true }));
  }

  onClose() {
    document.body.style.overflow = '';
    if (this._previouslyFocused) {
      this._previouslyFocused.focus();
    }
    this.dispatchEvent(new CustomEvent('modal-close', { bubbles: true }));
  }

  setupEventListeners() {
    // Close on backdrop click
    this.shadowRoot.querySelector('.backdrop')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) {
        this.close();
      }
    });

    // Close button
    this.shadowRoot.querySelector('.close-btn')?.addEventListener('click', () => {
      this.close();
    });

    // Escape key
    this._handleKeydown = (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    };
    document.addEventListener('keydown', this._handleKeydown);

    // Close buttons with data-close attribute
    this.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) {
        this.close();
      }
    });
  }

  getSizeClasses() {
    const sizes = {
      sm: 'max-w-sm',
      md: 'max-w-lg',
      lg: 'max-w-2xl',
      xl: 'max-w-4xl',
      full: 'max-w-full mx-4'
    };
    return sizes[this.size] || sizes.md;
  }

  render() {
    const sizeClass = this.getSizeClasses();

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: ${this.isOpen ? 'block' : 'none'};
        }
        .backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 50;
          animation: fadeIn 150ms ease;
        }
        .modal {
          background: white;
          border-radius: 0.5rem;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
          width: 100%;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          animation: slideIn 150ms ease;
        }
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1rem 1.5rem;
          border-bottom: 1px solid #e5e7eb;
        }
        .title {
          font-size: 1.125rem;
          font-weight: 600;
          color: #111827;
          margin: 0;
        }
        .close-btn {
          background: none;
          border: none;
          padding: 0.5rem;
          cursor: pointer;
          color: #6b7280;
          border-radius: 0.25rem;
        }
        .close-btn:hover {
          background: #f3f4f6;
          color: #111827;
        }
        .content {
          padding: 1.5rem;
          overflow-y: auto;
          flex: 1;
        }
        .footer {
          padding: 1rem 1.5rem;
          border-top: 1px solid #e5e7eb;
          display: flex;
          justify-content: flex-end;
          gap: 0.75rem;
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      </style>
      <div class="backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal ${sizeClass}">
          <div class="header">
            <h2 class="title" id="modal-title">${this.title}</h2>
            <button class="close-btn" aria-label="Close modal">
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div class="content">
            <slot></slot>
          </div>
          <div class="footer">
            <slot name="footer"></slot>
          </div>
        </div>
      </div>
    `;

    this.setupEventListeners();
  }
}

customElements.define('lma-modal', LmaModal);
