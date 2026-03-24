/**
 * LMA Table Component
 * Sortable, filterable data table with pagination
 *
 * @example
 * const table = document.querySelector('lma-table');
 * table.columns = [{ key: 'name', label: 'Name', sortable: true }];
 * table.data = [{ name: 'Study 1' }];
 *
 * @prop {Array} columns - Column definitions
 * @prop {Array} data - Table data
 * @prop {boolean} sortable - Enable sorting
 * @prop {boolean} paginated - Enable pagination
 * @prop {number} pageSize - Rows per page
 */
export class LmaTable extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._columns = [];
    this._data = [];
    this._sortColumn = null;
    this._sortDirection = 'asc';
    this._currentPage = 1;
    this._pageSize = 10;
  }

  connectedCallback() {
    this.render();
  }

  get columns() { return this._columns; }
  set columns(value) {
    this._columns = value;
    this.render();
  }

  get data() { return this._data; }
  set data(value) {
    this._data = value;
    this._currentPage = 1;
    this.render();
  }

  get pageSize() { return this._pageSize; }
  set pageSize(value) {
    this._pageSize = value;
    this._currentPage = 1;
    this.render();
  }

  get paginated() { return this.hasAttribute('paginated'); }
  get sortable() { return this.hasAttribute('sortable'); }

  getSortedData() {
    if (!this._sortColumn) return [...this._data];

    return [...this._data].sort((a, b) => {
      const aVal = a[this._sortColumn];
      const bVal = b[this._sortColumn];

      if (aVal === bVal) return 0;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      const comparison = typeof aVal === 'number'
        ? aVal - bVal
        : String(aVal).localeCompare(String(bVal));

      return this._sortDirection === 'asc' ? comparison : -comparison;
    });
  }

  getPagedData() {
    const sorted = this.getSortedData();
    if (!this.paginated) return sorted;

    const start = (this._currentPage - 1) * this._pageSize;
    return sorted.slice(start, start + this._pageSize);
  }

  get totalPages() {
    return Math.ceil(this._data.length / this._pageSize);
  }

  handleSort(column) {
    if (!this.sortable || !column.sortable) return;

    if (this._sortColumn === column.key) {
      this._sortDirection = this._sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this._sortColumn = column.key;
      this._sortDirection = 'asc';
    }
    this.render();
  }

  handlePageChange(page) {
    this._currentPage = Math.max(1, Math.min(page, this.totalPages));
    this.render();
  }

  formatCell(value, column) {
    if (value === null || value === undefined) return '-';
    if (column.format) return column.format(value);
    if (typeof value === 'number') {
      return column.decimals !== undefined
        ? value.toFixed(column.decimals)
        : value.toLocaleString();
    }
    return String(value);
  }

  render() {
    const displayData = this.getPagedData();

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        .table-container {
          overflow-x: auto;
          border: 1px solid #e5e7eb;
          border-radius: 0.5rem;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.875rem;
        }
        th, td {
          padding: 0.75rem 1rem;
          text-align: left;
          border-bottom: 1px solid #e5e7eb;
        }
        th {
          background: #f9fafb;
          font-weight: 600;
          color: #374151;
          white-space: nowrap;
        }
        th.sortable {
          cursor: pointer;
          user-select: none;
        }
        th.sortable:hover {
          background: #f3f4f6;
        }
        .sort-icon {
          margin-left: 0.5rem;
          opacity: 0.5;
        }
        th.sorted .sort-icon {
          opacity: 1;
        }
        tr:hover td {
          background: #f9fafb;
        }
        .pagination {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.75rem 1rem;
          border-top: 1px solid #e5e7eb;
          background: #f9fafb;
        }
        .page-info {
          color: #6b7280;
          font-size: 0.875rem;
        }
        .page-buttons {
          display: flex;
          gap: 0.25rem;
        }
        .page-btn {
          padding: 0.375rem 0.75rem;
          border: 1px solid #d1d5db;
          background: white;
          border-radius: 0.25rem;
          cursor: pointer;
          font-size: 0.875rem;
        }
        .page-btn:hover:not(:disabled) {
          background: #f3f4f6;
        }
        .page-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .empty {
          text-align: center;
          padding: 2rem;
          color: #6b7280;
        }
      </style>
      <div class="table-container">
        <table>
          <thead>
            <tr>
              ${this._columns.map(col => `
                <th
                  class="${this.sortable && col.sortable ? 'sortable' : ''} ${this._sortColumn === col.key ? 'sorted' : ''}"
                  data-column="${col.key}"
                >
                  ${col.label}
                  ${this.sortable && col.sortable ? `
                    <span class="sort-icon">
                      ${this._sortColumn === col.key
                        ? (this._sortDirection === 'asc' ? '↑' : '↓')
                        : '↕'}
                    </span>
                  ` : ''}
                </th>
              `).join('')}
            </tr>
          </thead>
          <tbody>
            ${displayData.length === 0 ? `
              <tr><td colspan="${this._columns.length}" class="empty">No data available</td></tr>
            ` : displayData.map(row => `
              <tr>
                ${this._columns.map(col => `
                  <td>${this.formatCell(row[col.key], col)}</td>
                `).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
        ${this.paginated && this._data.length > this._pageSize ? `
          <div class="pagination">
            <span class="page-info">
              Showing ${(this._currentPage - 1) * this._pageSize + 1}-${Math.min(this._currentPage * this._pageSize, this._data.length)} of ${this._data.length}
            </span>
            <div class="page-buttons">
              <button class="page-btn" data-page="prev" ${this._currentPage === 1 ? 'disabled' : ''}>←</button>
              <button class="page-btn" data-page="next" ${this._currentPage === this.totalPages ? 'disabled' : ''}>→</button>
            </div>
          </div>
        ` : ''}
      </div>
    `;

    // Setup event listeners
    this.shadowRoot.querySelectorAll('th.sortable').forEach(th => {
      th.addEventListener('click', () => {
        const col = this._columns.find(c => c.key === th.dataset.column);
        if (col) this.handleSort(col);
      });
    });

    this.shadowRoot.querySelectorAll('.page-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.page === 'prev') this.handlePageChange(this._currentPage - 1);
        if (btn.dataset.page === 'next') this.handlePageChange(this._currentPage + 1);
      });
    });
  }
}

customElements.define('lma-table', LmaTable);
