/**
 * LMA Button Component
 * Reusable button with variants, loading states, and accessibility
 *
 * @example
 * <lma-button variant="primary" loading="false">Click Me</lma-button>
 *
 * @attr {string} variant - Button style: primary, secondary, danger, ghost
 * @attr {boolean} loading - Show loading spinner
 * @attr {boolean} disabled - Disable the button
 * @attr {string} size - Button size: sm, md, lg
 */
export class LmaButton extends HTMLElement {
  static get observedAttributes() {
    return ['variant', 'loading', 'disabled', 'size'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
    this.setupEventListeners();
  }

  attributeChangedCallback() {
    this.render();
  }

  get variant() {
    return this.getAttribute('variant') || 'primary';
  }

  get loading() {
    return this.hasAttribute('loading');
  }

  get isDisabled() {
    return this.hasAttribute('disabled') || this.loading;
  }

  get size() {
    return this.getAttribute('size') || 'md';
  }

  setupEventListeners() {
    this.shadowRoot.querySelector('button').addEventListener('click', (e) => {
      if (this.isDisabled) {
        e.preventDefault();
        e.stopPropagation();
      }
    });
  }

  getVariantClasses() {
    const variants = {
      primary: 'bg-primary-600 hover:bg-primary-700 text-white border-transparent',
      secondary: 'bg-white hover:bg-gray-50 text-gray-700 border-gray-300',
      danger: 'bg-red-600 hover:bg-red-700 text-white border-transparent',
      ghost: 'bg-transparent hover:bg-gray-100 text-gray-700 border-transparent'
    };
    return variants[this.variant] || variants.primary;
  }

  getSizeClasses() {
    const sizes = {
      sm: 'px-2.5 py-1.5 text-xs',
      md: 'px-4 py-2 text-sm',
      lg: 'px-6 py-3 text-base'
    };
    return sizes[this.size] || sizes.md;
  }

  render() {
    const variantClasses = this.getVariantClasses();
    const sizeClasses = this.getSizeClasses();
    const disabledClasses = this.isDisabled ? 'opacity-50 cursor-not-allowed' : '';

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: inline-block;
        }
        button {
          font-family: 'Inter', sans-serif;
          font-weight: 500;
          border-radius: 0.375rem;
          border-width: 1px;
          transition: all 150ms ease;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
        }
        .spinner {
          width: 1em;
          height: 1em;
          border: 2px solid currentColor;
          border-right-color: transparent;
          border-radius: 50%;
          animation: spin 0.75s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      </style>
      <button
        class="${variantClasses} ${sizeClasses} ${disabledClasses}"
        ?disabled="${this.isDisabled}"
        aria-busy="${this.loading}"
      >
        ${this.loading ? '<span class="spinner"></span>' : ''}
        <slot></slot>
      </button>
    `;
  }
}

customElements.define('lma-button', LmaButton);
