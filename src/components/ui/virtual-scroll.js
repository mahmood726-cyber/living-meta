/**
 * Virtual Scrolling Component
 * Efficient rendering of large lists by only rendering visible items
 *
 * @module VirtualScroll
 */

import { escapeHtml } from '../../lib/error-handler.js';

/**
 * Default configuration for virtual scrolling
 */
const DEFAULT_CONFIG = {
  itemHeight: 50, // pixels
  containerHeight: 400, // pixels
  overscan: 3, // number of items to render above/below viewport
  buffer: 100 // pixels to buffer before/after viewport
};

/**
 * VirtualScroll class for efficient list rendering
 */
export class VirtualScroll {
  /**
   * Create a virtual scroll instance
   * @param {HTMLElement} container - The container element
   * @param {Array} items - The array of items to render
   * @param {Function} renderItem - Function to render a single item
   * @param {Object} config - Configuration options
   */
  constructor(container, items, renderItem, config = {}) {
    this.container = container;
    this.items = items;
    this.renderItem = renderItem;
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.state = {
      scrollTop: 0,
      startIndex: 0,
      endIndex: Math.ceil(this.config.containerHeight / this.config.itemHeight)
    };

    this.viewport = null;
    this.content = null;
    this.spacerTop = null;
    this.spacerBottom = null;
    this.itemElements = new Map();
    this.visibleRange = { start: 0, end: 0 };
    this.lastRenderedRange = { start: -1, end: -1 };

    this.init();
  }

  /**
   * Initialize the virtual scroll component
   */
  init() {
    this.render();
    this.attachEventListeners();
  }

  /**
   * Render the virtual scroll structure
   */
  render() {
    const totalHeight = this.items.length * this.config.itemHeight;

    this.container.innerHTML = `
      <div class="virtual-scroll-viewport" style="
        height: ${this.config.containerHeight}px;
        overflow: auto;
        position: relative;
        border: 1px solid #e5e7eb;
        border-radius: 0.5rem;
        background: white;
      ">
        <div class="virtual-scroll-content" style="
          position: relative;
          min-height: ${totalHeight}px;
        ">
          <div class="virtual-scroll-spacer-top" style="height: 0px;"></div>
          <div class="virtual-scroll-items" style="
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
          "></div>
          <div class="virtual-scroll-spacer-bottom" style="height: 0px;"></div>
        </div>
      </div>
    `;

    this.viewport = this.container.querySelector('.virtual-scroll-viewport');
    this.content = this.container.querySelector('.virtual-scroll-content');
    this.spacerTop = this.container.querySelector('.virtual-scroll-spacer-top');
    this.spacerBottom = this.container.querySelector('.virtual-scroll-spacer-bottom');
    this.itemsContainer = this.container.querySelector('.virtual-scroll-items');

    this.updateVisibleItems();
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    this.viewport.addEventListener('scroll', () => {
      this.state.scrollTop = this.viewport.scrollTop;
      this.updateVisibleItems();
    });

    // Handle window resize
    window.addEventListener('resize', () => {
      this.updateVisibleItems();
    });
  }

  /**
   * Calculate the range of visible items
   */
  calculateVisibleRange() {
    const scrollTop = this.state.scrollTop;
    const containerHeight = this.config.containerHeight;
    const itemHeight = this.config.itemHeight;

    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - this.config.overscan);
    const endIndex = Math.min(
      this.items.length - 1,
      Math.ceil((scrollTop + containerHeight) / itemHeight) + this.config.overscan
    );

    return { start: startIndex, end: endIndex };
  }

  /**
   * Update visible items based on scroll position
   */
  updateVisibleItems() {
    const range = this.calculateVisibleRange();
    this.visibleRange = range;

    // Only update if range has changed
    if (
      range.start === this.lastRenderedRange.start &&
      range.end === this.lastRenderedRange.end
    ) {
      return;
    }

    this.lastRenderedRange = range;

    // Update spacer heights
    const topHeight = range.start * this.config.itemHeight;
    const bottomHeight = (this.items.length - 1 - range.end) * this.config.itemHeight;

    this.spacerTop.style.height = `${topHeight}px`;
    this.spacerBottom.style.height = `${bottomHeight}px`;
    this.itemsContainer.style.top = `${topHeight}px`;

    // Render items in visible range
    this.renderRange(range);
  }

  /**
   * Render a range of items
   * @param {Object} range - The range to render { start, end }
   */
  renderRange(range) {
    const fragment = document.createDocumentFragment();

    for (let i = range.start; i <= range.end; i++) {
      const item = this.items[i];
      const existingElement = this.itemElements.get(i);

      if (existingElement) {
        fragment.appendChild(existingElement);
      } else {
        const element = this.createItemElement(item, i);
        this.itemElements.set(i, element);
        fragment.appendChild(element);
      }
    }

    // Remove items that are no longer visible
    const itemsArray = Array.from(this.itemElements.entries());
    for (const [index, element] of itemsArray) {
      if (index < range.start || index > range.end) {
        this.itemElements.delete(index);
      }
    }

    this.itemsContainer.innerHTML = '';
    this.itemsContainer.appendChild(fragment);
  }

  /**
   * Create an item element
   * @param {*} item - The item data
   * @param {number} index - The item index
   * @returns {HTMLElement} The item element
   */
  createItemElement(item, index) {
    const wrapper = document.createElement('div');
    wrapper.className = 'virtual-scroll-item';
    wrapper.style.height = `${this.config.itemHeight}px`;
    wrapper.style.boxSizing = 'border-box';
    wrapper.dataset.index = index;

    const content = this.renderItem(item, index);
    if (typeof content === 'string') {
      wrapper.innerHTML = content;
    } else if (content instanceof HTMLElement) {
      wrapper.appendChild(content);
    }

    return wrapper;
  }

  /**
   * Update the items in the list
   * @param {Array} newItems - New array of items
   */
  updateItems(newItems) {
    this.items = newItems;
    this.itemElements.clear();
    this.lastRenderedRange = { start: -1, end: -1 };

    const totalHeight = this.items.length * this.config.itemHeight;
    this.content.style.minHeight = `${totalHeight}px`;

    this.updateVisibleItems();
  }

  /**
   * Scroll to a specific item
   * @param {number} index - The index of the item to scroll to
   * @param {string} behavior - Scroll behavior ('auto' or 'smooth')
   */
  scrollToItem(index, behavior = 'auto') {
    const scrollTop = index * this.config.itemHeight;
    this.viewport.scrollTo({ top: scrollTop, behavior });
  }

  /**
   * Get the currently visible items
   * @returns {Array} Array of visible items
   */
  getVisibleItems() {
    const { start, end } = this.visibleRange;
    return this.items.slice(start, end + 1);
  }

  /**
   * Destroy the virtual scroll instance and clean up
   */
  destroy() {
    this.itemElements.clear();
    this.container.innerHTML = '';
  }

  /**
   * Refresh the rendering (force re-render)
   */
  refresh() {
    this.itemElements.clear();
    this.lastRenderedRange = { start: -1, end: -1 };
    this.updateVisibleItems();
  }
}

/**
 * Create a virtual scroll list
 * @param {HTMLElement} container - The container element
 * @param {Array} items - The array of items
 * @param {Function} renderItem - Function to render an item
 * @param {Object} config - Configuration options
 * @returns {VirtualScroll} The virtual scroll instance
 */
export function createVirtualScroll(container, items, renderItem, config = {}) {
  return new VirtualScroll(container, items, renderItem, config);
}

/**
 * Virtual scroll component for study lists
 */
export function createStudyList(container, studies, onItemClick) {
  return createVirtualScroll(
    container,
    studies,
    (study, index) => `
      <div class="study-item p-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
           data-nct-id="${escapeHtml(study.nctId)}"
           style="display: flex; align-items: center; justify-content: space-between;">
        <div class="flex-1 min-w-0">
          <div class="font-medium text-gray-900 truncate">${escapeHtml(study.briefTitle)}</div>
          <div class="text-sm text-gray-500">
            ${escapeHtml(study.nctId)} • ${escapeHtml(study.overallStatus || 'Unknown')}
          </div>
        </div>
        <div class="flex items-center space-x-2 ml-4">
          ${study.hasResults
            ? '<span class="px-2 py-1 text-xs bg-green-100 text-green-700 rounded-full">Results</span>'
            : ''}
          <span class="text-xs text-gray-400">#${index + 1}</span>
        </div>
      </div>
    `,
    { itemHeight: 72, containerHeight: 500, overscan: 5 }
  );
}

/**
 * Virtual scroll component for screening queue
 */
export function createScreeningQueue(container, queue, onDecision) {
  return createVirtualScroll(
    container,
    queue,
    (item, index) => {
      const decisionColors = {
        include: 'bg-green-100 text-green-700 border-green-200',
        exclude: 'bg-red-100 text-red-700 border-red-200',
        maybe: 'bg-yellow-100 text-yellow-700 border-yellow-200',
        pending: 'bg-gray-100 text-gray-700 border-gray-200'
      };

      return `
        <div class="screening-item p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors"
             data-nct-id="${escapeHtml(item.nctId)}"
             style="display: flex; align-items: center; justify-content: space-between;">
          <div class="flex-1 min-w-0">
            <div class="font-medium text-gray-900 truncate">${escapeHtml(item.briefTitle)}</div>
            <div class="text-sm text-gray-500 mt-1">${escapeHtml(item.nctId)}</div>
          </div>
          <div class="flex items-center space-x-2 ml-4">
            <span class="px-3 py-1 text-xs font-medium rounded-full border ${decisionColors[item.decision] || decisionColors.pending}">
              ${item.decision || 'pending'}
            </span>
            ${item.reason ? `<span class="text-xs text-gray-400 max-w-xs truncate">${escapeHtml(item.reason)}</span>` : ''}
          </div>
        </div>
      `;
    },
    { itemHeight: 80, containerHeight: 600, overscan: 3 }
  );
}

/**
 * Virtual scroll component for extraction table
 */
export function createExtractionTable(container, rows, onEdit) {
  return createVirtualScroll(
    container,
    rows,
    (row, index) => `
      <div class="extraction-row p-3 border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors"
           data-row-id="${escapeHtml(row.id)}"
           style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr 1fr auto; gap: 1rem; align-items: center;">
        <div class="truncate" title="${escapeHtml(row.nctId)}">${escapeHtml(row.nctId)}</div>
        <div class="truncate">${row.outcomeId || '-'}</div>
        <div class="text-center">${row.sampleSize || '-'}</div>
        <div class="text-center">${row.events || '-'}</div>
        <div class="text-center">${row.mean?.toFixed(2) || '-'}</div>
        <div class="flex items-center space-x-2">
          ${row.verified
            ? '<span class="text-green-500" title="Verified">✓</span>'
            : '<span class="text-gray-300" title="Not verified">○</span>'
          }
          <button class="text-blue-600 hover:text-blue-800 text-sm" data-action="edit">Edit</button>
        </div>
      </div>
    `,
    { itemHeight: 48, containerHeight: 400, overscan: 5 }
  );
}

export default VirtualScroll;
