/**
 * League Table Component for Network Meta-Analysis
 * Matrix display of all pairwise treatment comparisons
 */

/**
 * Default configuration for league table
 */
const DEFAULT_CONFIG = {
  fontSize: 12,
  fontFamily: 'system-ui, -apple-system, sans-serif',
  colors: {
    significant: '#dcfce7',
    nonsignificant: '#ffffff',
    diagonal: '#f3f4f6',
    text: '#111827',
    border: '#e5e7eb',
    headerBg: '#f9fafb',
    positive: '#22c55e',
    negative: '#ef4444',
    neutral: '#6b7280'
  },
  showCI: true,
  significanceLevel: 0.05,
  effectMeasure: 'OR', // OR, RR, MD, SMD
  title: 'League Table of Treatment Comparisons'
};

/**
 * Render league table to container
 * @param {HTMLElement} container - Target container
 * @param {object} data - { treatments, league_table, relative_effects }
 * @param {object} config - Table configuration
 */
export function renderLeagueTable(container, data, config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const { treatments, league_table, relative_effects } = data;

  // Clear container
  container.innerHTML = '';

  // Title
  const title = document.createElement('h3');
  title.className = 'league-table-title';
  title.textContent = cfg.title;
  title.style.cssText = `
    font-size: ${cfg.fontSize + 2}px;
    font-family: ${cfg.fontFamily};
    font-weight: bold;
    text-align: center;
    margin-bottom: 16px;
  `;
  container.appendChild(title);

  // Create table
  const table = document.createElement('table');
  table.className = 'league-table';
  table.style.cssText = `
    border-collapse: collapse;
    font-family: ${cfg.fontFamily};
    font-size: ${cfg.fontSize}px;
    width: 100%;
    margin: 0 auto;
  `;

  // Header row
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');

  // Empty corner cell
  const cornerCell = document.createElement('th');
  cornerCell.style.cssText = `
    background: ${cfg.colors.headerBg};
    border: 1px solid ${cfg.colors.border};
    padding: 8px;
    min-width: 80px;
  `;
  headerRow.appendChild(cornerCell);

  // Column headers
  treatments.forEach(t => {
    const th = document.createElement('th');
    th.textContent = t.name || t.id;
    th.style.cssText = `
      background: ${cfg.colors.headerBg};
      border: 1px solid ${cfg.colors.border};
      padding: 8px;
      font-weight: bold;
      min-width: 100px;
      text-align: center;
    `;
    if (t.is_reference) {
      th.style.fontStyle = 'italic';
      th.title = 'Reference treatment';
    }
    headerRow.appendChild(th);
  });

  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Body rows
  const tbody = document.createElement('tbody');

  treatments.forEach((rowTreatment, i) => {
    const tr = document.createElement('tr');

    // Row header
    const rowHeader = document.createElement('th');
    rowHeader.textContent = rowTreatment.name || rowTreatment.id;
    rowHeader.style.cssText = `
      background: ${cfg.colors.headerBg};
      border: 1px solid ${cfg.colors.border};
      padding: 8px;
      font-weight: bold;
      text-align: left;
    `;
    if (rowTreatment.is_reference) {
      rowHeader.style.fontStyle = 'italic';
    }
    tr.appendChild(rowHeader);

    // Data cells
    treatments.forEach((colTreatment, j) => {
      const td = document.createElement('td');
      td.style.cssText = `
        border: 1px solid ${cfg.colors.border};
        padding: 8px;
        text-align: center;
        vertical-align: middle;
      `;

      if (i === j) {
        // Diagonal cell (same treatment)
        td.style.background = cfg.colors.diagonal;
        td.textContent = rowTreatment.name || rowTreatment.id;
        td.style.fontWeight = 'bold';
      } else {
        // Find the comparison
        const cell = league_table[i]?.[j];

        if (cell) {
          const { effect, ci_lower, ci_upper } = cell;

          // Determine significance
          const isSignificant = (ci_lower > 0 && ci_upper > 0) || (ci_lower < 0 && ci_upper < 0);
          const direction = effect > 0 ? 'positive' : effect < 0 ? 'negative' : 'neutral';

          // Format effect
          const effectStr = formatEffect(effect, cfg.effectMeasure);
          const ciStr = cfg.showCI
            ? ` (${formatEffect(ci_lower, cfg.effectMeasure)} to ${formatEffect(ci_upper, cfg.effectMeasure)})`
            : '';

          td.innerHTML = `
            <span class="effect-value" style="color: ${isSignificant ? cfg.colors[direction] : cfg.colors.neutral}; font-weight: ${isSignificant ? 'bold' : 'normal'}">
              ${effectStr}
            </span>
            <br>
            <span class="ci-value" style="font-size: ${cfg.fontSize - 2}px; color: #6b7280">
              ${ciStr}
            </span>
          `;

          if (isSignificant) {
            td.style.background = cfg.colors.significant;
          }

          // Tooltip
          td.title = `${rowTreatment.name} vs ${colTreatment.name}\n${cfg.effectMeasure}: ${effectStr}\n95% CI: ${formatEffect(ci_lower, cfg.effectMeasure)} to ${formatEffect(ci_upper, cfg.effectMeasure)}`;
        } else {
          td.textContent = '—';
          td.style.color = '#9ca3af';
        }
      }

      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  container.appendChild(table);

  // Legend
  const legend = document.createElement('div');
  legend.className = 'league-table-legend';
  legend.innerHTML = `
    <div style="font-size: ${cfg.fontSize - 1}px; color: #6b7280; margin-top: 12px; text-align: center;">
      <span style="background: ${cfg.colors.significant}; padding: 2px 8px; border-radius: 4px; margin-right: 8px;">
        Significant (95% CI excludes null)
      </span>
      <span style="color: ${cfg.colors.positive}">▲ Favors row treatment</span>
      &nbsp;&nbsp;
      <span style="color: ${cfg.colors.negative}">▼ Favors column treatment</span>
    </div>
    <div style="font-size: ${cfg.fontSize - 2}px; color: #9ca3af; margin-top: 8px; text-align: center;">
      Reading: Row vs Column. ${cfg.effectMeasure} > 1 (or > 0 for MD/SMD) favors row treatment.
    </div>
  `;
  container.appendChild(legend);

  return table;
}

/**
 * Format effect estimate based on measure type
 */
function formatEffect(value, measure) {
  if (value === null || value === undefined || isNaN(value)) return '—';

  // For ratio measures (OR, RR, HR), display on natural scale
  if (['OR', 'RR', 'HR'].includes(measure)) {
    const natural = Math.exp(value);
    return natural.toFixed(2);
  }

  // For difference measures (MD, SMD, RD)
  return value.toFixed(2);
}

/**
 * Export league table as CSV
 */
export function exportLeagueTableCSV(data, config = {}) {
  const { treatments, league_table } = data;
  const cfg = { ...DEFAULT_CONFIG, ...config };

  let csv = ','; // Empty corner

  // Header row
  csv += treatments.map(t => t.name || t.id).join(',') + '\n';

  // Data rows
  treatments.forEach((rowTreatment, i) => {
    let row = rowTreatment.name || rowTreatment.id;

    treatments.forEach((colTreatment, j) => {
      if (i === j) {
        row += ',' + (rowTreatment.name || rowTreatment.id);
      } else {
        const cell = league_table[i]?.[j];
        if (cell) {
          const effectStr = formatEffect(cell.effect, cfg.effectMeasure);
          const ciStr = `${formatEffect(cell.ci_lower, cfg.effectMeasure)} to ${formatEffect(cell.ci_upper, cfg.effectMeasure)}`;
          row += `,"${effectStr} (${ciStr})"`;
        } else {
          row += ',—';
        }
      }
    });

    csv += row + '\n';
  });

  return csv;
}

/**
 * Download league table as CSV
 */
export function downloadLeagueTableCSV(data, filename = 'league-table.csv', config = {}) {
  const csv = exportLeagueTableCSV(data, config);
  const blob = new Blob([csv], { type: 'text/csv' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}

/**
 * Create league table component
 */
export function createLeagueTable(container, data, config = {}) {
  const wrapper = document.createElement('div');
  wrapper.className = 'league-table-wrapper';
  wrapper.style.cssText = 'overflow-x: auto; padding: 16px;';

  container.appendChild(wrapper);

  const table = renderLeagueTable(wrapper, data, config);

  return {
    wrapper,
    table,
    update: (newData, newConfig) => renderLeagueTable(wrapper, newData, { ...config, ...newConfig }),
    exportCSV: (filename) => downloadLeagueTableCSV(data, filename, config),
    destroy: () => container.removeChild(wrapper)
  };
}

export default {
  renderLeagueTable,
  exportLeagueTableCSV,
  downloadLeagueTableCSV,
  createLeagueTable,
  DEFAULT_CONFIG
};
