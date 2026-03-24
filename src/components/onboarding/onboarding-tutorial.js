/**
 * Onboarding Tutorial Component
 * Interactive tutorial for first-time users
 *
 * @module OnboardingTutorial
 */

/**
 * Tutorial steps configuration
 */
const TUTORIAL_STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to Living Meta-Analysis',
    content: `
      <p>Living Meta-Analysis is a browser-based tool for conducting living systematic reviews
      using data from ClinicalTrials.gov.</p>
      <p>This tutorial will guide you through the main features.</p>
    `,
    target: null,
    position: 'center',
    action: null
  },
  {
    id: 'create-project',
    title: 'Create a Project',
    content: `
      <p>Start by creating a new project for your systematic review.</p>
      <p>Click the "New Project" button in the top right corner.</p>
    `,
    target: '#new-project-btn',
    position: 'bottom',
    action: 'click'
  },
  {
    id: 'search',
    title: 'Search ClinicalTrials.gov',
    content: `
      <p>Use the query builder to search for studies on ClinicalTrials.gov.</p>
      <p>You can search by condition, intervention, study status, and more.</p>
    `,
    target: '#search-tab',
    position: 'right',
    action: 'navigate'
  },
  {
    id: 'screening',
    title: 'Screen Studies',
    content: `
      <p>Review studies and decide whether to include or exclude them.</p>
      <p>Use keyboard shortcuts for faster screening:</p>
      <ul>
        <li><kbd>I</kbd> - Include study</li>
        <li><kbd>E</kbd> - Exclude study</li>
        <li><kbd>J</kbd> / <kbd>K</kbd> - Navigate between studies</li>
      </ul>
    `,
    target: '#screening-tab',
    position: 'left',
    action: 'navigate'
  },
  {
    id: 'extraction',
    title: 'Extract Data',
    content: `
      <p>Extract outcome data from included studies.</p>
      <p>Data is auto-filled from ClinicalTrials.gov when available.</p>
    `,
    target: '#extraction-tab',
    position: 'bottom',
    action: 'navigate'
  },
  {
    id: 'analysis',
    title: 'Run Meta-Analysis',
    content: `
      <p>Perform meta-analysis with various statistical methods:</p>
      <ul>
        <li>Fixed Effects & Random Effects</li>
        <li>Network Meta-Analysis</li>
        <li>Trial Sequential Analysis</li>
        <li>Publication bias assessment</li>
      </ul>
    `,
    target: '#analysis-tab',
    position: 'bottom',
    action: 'navigate'
  },
  {
    id: 'report',
    title: 'Export Results',
    content: `
      <p>Export your analysis in multiple formats:</p>
      <ul>
        <li>Forest plots and funnel plots</li>
        <li>PRISMA flow diagrams</li>
        <li>RevMan format</li>
        <li>BibTeX and RIS citations</li>
      </ul>
    `,
    target: '#report-tab',
    position: 'left',
    action: 'navigate'
  },
  {
    id: 'complete',
    title: 'You\'re Ready!',
    content: `
      <p>You've completed the tutorial! Here are some tips:</p>
      <ul>
        <li>Press <kbd>?</kbd> anytime to see keyboard shortcuts</li>
        <li>Your work is auto-saved every 30 seconds</li>
        <li>Enable Living Mode for automatic updates from CT.gov</li>
      </ul>
    `,
    target: null,
    position: 'center',
    action: null
  }
];

/**
 * OnboardingTutorial class
 */
export class OnboardingTutorial {
  /**
   * Create an onboarding tutorial
   * @param {Object} options - Configuration options
   */
  constructor(options = {}) {
    this.options = {
      steps: TUTORIAL_STEPS,
      autoStart: false,
      showProgress: true,
      showSkip: true,
      storageKey: 'onboarding-completed',
      ...options
    };

    this.currentStep = 0;
    this.isActive = false;
    this.element = null;
    this.targetElement = null;
    this onComplete = null;
    this.onSkip = null;
  }

  /**
   * Start the tutorial
   * @param {number} startStep - Step to start from
   */
  async start(startStep = 0) {
    // Check if already completed
    const completed = localStorage.getItem(this.options.storageKey);
    if (completed && startStep === 0) {
      return false;
    }

    this.isActive = true;
    this.currentStep = startStep;

    await this.render();
    await this.showStep(this.currentStep);

    return true;
  }

  /**
   * Show a specific step
   * @param {number} index - Step index
   */
  async showStep(index) {
    if (index < 0 || index >= this.options.steps.length) {
      await this.complete();
      return;
    }

    this.currentStep = index;
    const step = this.options.steps[index];

    // Update highlight
    await this.highlightTarget(step.target);

    // Update content
    this.updateContent(step);

    // Update progress
    this.updateProgress();

    // Execute action if specified
    if (step.action && this.targetElement) {
      await this.executeAction(step.action);
    }
  }

  /**
   * Highlight the target element
   * @param {string} selector - Target selector
   */
  async highlightTarget(selector) {
    // Remove previous highlight
    this.removeHighlight();

    if (!selector) {
      return;
    }

    // Wait for target to be available
    this.targetElement = await this.waitForElement(selector);

    if (this.targetElement) {
      this.targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      this.targetElement.classList.add('tutorial-highlight');

      // Create spotlight overlay
      this.createSpotlight();
    }
  }

  /**
   * Wait for an element to appear in the DOM
   * @param {string} selector - Element selector
   * @param {number} timeout - Timeout in ms
   * @returns {Promise<HTMLElement>} Target element
   */
  async waitForElement(selector, timeout = 5000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const element = document.querySelector(selector);
      if (element) {
        return element;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return null;
  }

  /**
   * Create spotlight overlay
   */
  createSpotlight() {
    if (!this.targetElement) return;

    const rect = this.targetElement.getBoundingClientRect();

    let spotlight = document.getElementById('tutorial-spotlight');
    if (!spotlight) {
      spotlight = document.createElement('div');
      spotlight.id = 'tutorial-spotlight';
      document.body.appendChild(spotlight);
    }

    spotlight.style.cssText = `
      position: fixed;
      top: ${rect.top - 4}px;
      left: ${rect.left - 4}px;
      width: ${rect.width + 8}px;
      height: ${rect.height + 8}px;
      border: 2px solid #3b82f6;
      border-radius: 4px;
      box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5);
      z-index: 9998;
      pointer-events: none;
      transition: all 0.3s ease;
    `;
  }

  /**
   * Remove highlight and spotlight
   */
  removeHighlight() {
    if (this.targetElement) {
      this.targetElement.classList.remove('tutorial-highlight');
    }

    const spotlight = document.getElementById('tutorial-spotlight');
    if (spotlight) {
      spotlight.remove();
    }
  }

  /**
   * Render the tutorial tooltip
   */
  async render() {
    let tooltip = document.getElementById('tutorial-tooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'tutorial-tooltip';
      document.body.appendChild(tooltip);
    }

    tooltip.className = 'tutorial-tooltip';
    tooltip.style.cssText = `
      position: fixed;
      z-index: 9999;
      background: white;
      border-radius: 8px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
      padding: 20px;
      max-width: 400px;
      display: none;
    `;

    this.element = tooltip;
  }

  /**
   * Update tooltip content
   * @param {Object} step - Step data
   */
  updateContent(step) {
    if (!this.element) return;

    const stepNumber = this.currentStep + 1;
    const totalSteps = this.options.steps.length;

    this.element.innerHTML = `
      <div class="tutorial-header">
        <h3 class="tutorial-title">${this.escapeHTML(step.title)}</h3>
        ${this.options.showSkip ? `
          <button class="tutorial-skip" data-action="skip">Skip Tutorial</button>
        ` : ''}
      </div>
      <div class="tutorial-content">
        ${step.content}
      </div>
      <div class="tutorial-footer">
        ${this.options.showProgress ? `
          <div class="tutorial-progress">
            <span class="tutorial-step-number">Step ${stepNumber} of ${totalSteps}</span>
            <div class="tutorial-progress-bar">
              <div class="tutorial-progress-fill" style="width: ${(stepNumber / totalSteps) * 100}%"></div>
            </div>
          </div>
        ` : ''}
        <div class="tutorial-navigation">
          <button class="btn-secondary tutorial-prev" ${this.currentStep === 0 ? 'disabled' : ''}>
            Previous
          </button>
          <button class="btn-primary tutorial-next">
            ${this.currentStep === this.options.steps.length - 1 ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
    `;

    // Position the tooltip
    this.positionTooltip(step.position);

    // Show the tooltip
    this.element.style.display = 'block';

    // Attach event listeners
    this.attachListeners();
  }

  /**
   * Position the tooltip
   * @param {string} position - Position ('top', 'bottom', 'left', 'right', 'center')
   */
  positionTooltip(position) {
    if (!this.element || !this.targetElement) {
      if (position === 'center') {
        this.element.style.top = '50%';
        this.element.style.left = '50%';
        this.element.style.transform = 'translate(-50%, -50%)';
      }
      return;
    }

    const targetRect = this.targetElement.getBoundingClientRect();
    const tooltipRect = this.element.getBoundingClientRect();

    let top, left;

    switch (position) {
      case 'top':
        top = targetRect.top - tooltipRect.height - 10;
        left = targetRect.left + (targetRect.width - tooltipRect.width) / 2;
        break;

      case 'bottom':
        top = targetRect.bottom + 10;
        left = targetRect.left + (targetRect.width - tooltipRect.width) / 2;
        break;

      case 'left':
        top = targetRect.top + (targetRect.height - tooltipRect.height) / 2;
        left = targetRect.left - tooltipRect.width - 10;
        break;

      case 'right':
        top = targetRect.top + (targetRect.height - tooltipRect.height) / 2;
        left = targetRect.right + 10;
        break;

      default:
        top = targetRect.bottom + 10;
        left = targetRect.left;
    }

    // Keep tooltip in viewport
    const padding = 20;
    top = Math.max(padding, Math.min(top, window.innerHeight - tooltipRect.height - padding));
    left = Math.max(padding, Math.min(left, window.innerWidth - tooltipRect.width - padding));

    this.element.style.top = `${top}px`;
    this.element.style.left = `${left}px`;
    this.element.style.transform = 'none';
  }

  /**
   * Attach event listeners
   */
  attachListeners() {
    const prevBtn = this.element.querySelector('.tutorial-prev');
    const nextBtn = this.element.querySelector('.tutorial-next');
    const skipBtn = this.element.querySelector('.tutorial-skip');

    if (prevBtn && !prevBtn.disabled) {
      prevBtn.onclick = () => this.previous();
    }

    if (nextBtn) {
      nextBtn.onclick = () => this.next();
    }

    if (skipBtn) {
      skipBtn.onclick = () => this.skip();
    }
  }

  /**
   * Update progress indicator
   */
  updateProgress() {
    const progress = document.querySelector('.tutorial-progress-fill');
    const stepNumber = document.querySelector('.tutorial-step-number');

    if (progress) {
      const percent = ((this.currentStep + 1) / this.options.steps.length) * 100;
      progress.style.width = `${percent}%`;
    }

    if (stepNumber) {
      stepNumber.textContent = `Step ${this.currentStep + 1} of ${this.options.steps.length}`;
    }
  }

  /**
   * Execute a step action
   * @param {string} action - Action type
   */
  async executeAction(action) {
    switch (action) {
      case 'click':
        if (this.targetElement) {
          this.targetElement.click();
        }
        break;

      case 'navigate':
        // Navigation is handled by the step's target selector
        break;
    }
  }

  /**
   * Go to next step
   */
  async next() {
    await this.showStep(this.currentStep + 1);
  }

  /**
   * Go to previous step
   */
  async previous() {
    if (this.currentStep > 0) {
      await this.showStep(this.currentStep - 1);
    }
  }

  /**
   * Skip the tutorial
   */
  async skip() {
    this.isActive = false;

    if (this.onSkip) {
      await this.onSkip();
    }

    this.destroy();
  }

  /**
   * Complete the tutorial
   */
  async complete() {
    this.isActive = false;

    // Mark as completed
    localStorage.setItem(this.options.storageKey, 'true');

    if (this.onComplete) {
      await this.onComplete();
    }

    this.destroy();
  }

  /**
   * Destroy the tutorial
   */
  destroy() {
    this.removeHighlight();

    if (this.element) {
      this.element.remove();
      this.element = null;
    }

    this.isActive = false;
  }

  /**
   * Escape HTML to prevent XSS
   * @param {string} str - String to escape
   * @returns {string} Escaped string
   */
  escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

/**
 * Create and start an onboarding tutorial
 * @param {Object} options - Configuration options
 * @returns {OnboardingTutorial} Tutorial instance
 */
export function createTutorial(options = {}) {
  const tutorial = new OnboardingTutorial(options);

  if (options.autoStart !== false) {
    // Auto-start for new users
    setTimeout(() => {
      tutorial.start();
    }, 1000);
  }

  return tutorial;
}

/**
 * Check if user has completed onboarding
 * @param {string} storageKey - Storage key
 * @returns {boolean} True if completed
 */
export function hasCompletedOnboarding(storageKey = 'onboarding-completed') {
  return localStorage.getItem(storageKey) === 'true';
}

/**
 * Reset onboarding status
 * @param {string} storageKey - Storage key
 */
export function resetOnboarding(storageKey = 'onboarding-completed') {
  localStorage.removeItem(storageKey);
}

/**
 * Add tutorial styles to document
 */
export function injectTutorialStyles() {
  if (document.getElementById('tutorial-styles')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'tutorial-styles';
  style.textContent = `
    .tutorial-highlight {
      position: relative;
      z-index: 9998;
    }

    .tutorial-highlight::before {
      content: '';
      position: absolute;
      inset: -4px;
      border: 2px solid #3b82f6;
      border-radius: 4px;
      pointer-events: none;
    }

    .tutorial-tooltip {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.5;
      color: #1f2937;
    }

    .tutorial-tooltip .tutorial-header {
      display: flex;
      justify-content: space-between;
      align-items: start;
      margin-bottom: 16px;
    }

    .tutorial-tooltip .tutorial-title {
      font-size: 18px;
      font-weight: 600;
      margin: 0;
    }

    .tutorial-tooltip .tutorial-skip {
      background: none;
      border: none;
      color: #6b7280;
      font-size: 14px;
      cursor: pointer;
      padding: 4px 8px;
    }

    .tutorial-tooltip .tutorial-skip:hover {
      color: #1f2937;
      text-decoration: underline;
    }

    .tutorial-tooltip .tutorial-content {
      margin-bottom: 20px;
    }

    .tutorial-tooltip .tutorial-content ul {
      margin: 8px 0;
      padding-left: 20px;
    }

    .tutorial-tooltip .tutorial-content li {
      margin: 4px 0;
    }

    .tutorial-tooltip .tutorial-content kbd {
      background: #f3f4f6;
      border: 1px solid #d1d5db;
      border-radius: 4px;
      padding: 2px 6px;
      font-family: monospace;
      font-size: 12px;
    }

    .tutorial-tooltip .tutorial-progress {
      margin-bottom: 16px;
    }

    .tutorial-tooltip .tutorial-step-number {
      font-size: 12px;
      color: #6b7280;
      display: block;
      margin-bottom: 8px;
    }

    .tutorial-tooltip .tutorial-progress-bar {
      height: 4px;
      background: #e5e7eb;
      border-radius: 2px;
      overflow: hidden;
    }

    .tutorial-tooltip .tutorial-progress-fill {
      height: 100%;
      background: #3b82f6;
      transition: width 0.3s ease;
    }

    .tutorial-tooltip .tutorial-navigation {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    .tutorial-tooltip button {
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }

    .tutorial-tooltip button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `;

  document.head.appendChild(style);
}

export default {
  OnboardingTutorial,
  createTutorial,
  hasCompletedOnboarding,
  resetOnboarding,
  injectTutorialStyles
};
