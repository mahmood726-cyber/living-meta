/**
 * Rank Chart Component for Network Meta-Analysis
 * Displays SUCRA/P-score rankings and rank probability distributions
 */

/**
 * Default configuration for rank chart
 */
const DEFAULT_CONFIG = {
  width: 700,
  height: 400,
  padding: { top: 50, right: 40, bottom: 80, left: 200 },
  fontSize: 12,
  fontFamily: 'system-ui, -apple-system, sans-serif',
  colors: {
    bar: '#3b82f6',
    barGradientStart: '#60a5fa',
    barGradientEnd: '#1d4ed8',
    text: '#111827',
    grid: '#e5e7eb',
    background: '#ffffff',
    reference: '#10b981',
    highlight: '#f59e0b',
    uncertainty: 'rgba(59, 130, 246, 0.2)'
  },
  barHeight: 24,
  barGap: 8,
  showUncertainty: true,
  showValues: true,
  sortBy: 'sucra', // 'sucra', 'mean_rank', 'name'
  title: 'Treatment Rankings (SUCRA)'
};

/**
 * Render SUCRA bar chart to canvas
 * @param {HTMLCanvasElement} canvas - Target canvas element
 * @param {object} data - { rankings: [{treatment, mean_rank, sucra, p_best, rank_probabilities}] }
 * @param {object} config - Chart configuration
 */
export function renderRankChart(canvas, data, config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const ctx = canvas.getContext('2d');

  let { rankings } = data;

  // Sort rankings
  rankings = [...rankings].sort((a, b) => {
    if (cfg.sortBy === 'sucra') return b.sucra - a.sucra;
    if (cfg.sortBy === 'mean_rank') return a.mean_rank - b.mean_rank;
    return a.treatment.localeCompare(b.treatment);
  });

  // Set canvas size
  const dpr = window.devicePixelRatio || 1;
  canvas.width = cfg.width * dpr;
  canvas.height = cfg.height * dpr;
  canvas.style.width = cfg.width + 'px';
  canvas.style.height = cfg.height + 'px';
  ctx.scale(dpr, dpr);

  // Clear canvas
  ctx.fillStyle = cfg.colors.background;
  ctx.fillRect(0, 0, cfg.width, cfg.height);

  // Calculate plot dimensions
  const plotLeft = cfg.padding.left;
  const plotRight = cfg.width - cfg.padding.right;
  const plotTop = cfg.padding.top;
  const plotBottom = cfg.height - cfg.padding.bottom;
  const plotWidth = plotRight - plotLeft;

  // X scale (SUCRA 0-100%)
  const xScale = {
    min: 0,
    max: 100,
    toPixel: (v) => plotLeft + (v / 100) * plotWidth
  };

  // Draw grid
  drawGrid(ctx, xScale, cfg, plotLeft, plotRight, plotTop, plotBottom);

  // Draw bars
  const totalBarHeight = rankings.length * (cfg.barHeight + cfg.barGap);
  const startY = plotTop + (plotBottom - plotTop - totalBarHeight) / 2;

  rankings.forEach((rank, i) => {
    const y = startY + i * (cfg.barHeight + cfg.barGap);
    drawRankBar(ctx, rank, y, xScale, cfg);
  });

  // Draw axes
  drawAxes(ctx, xScale, cfg, plotLeft, plotRight, plotTop, plotBottom);

  // Draw title
  drawTitle(ctx, cfg);
}

/**
 * Draw grid lines
 */
function drawGrid(ctx, xScale, cfg, plotLeft, plotRight, plotTop, plotBottom) {
  ctx.strokeStyle = cfg.colors.grid;
  ctx.lineWidth = 0.5;

  // Vertical grid lines every 20%
  for (let x = 0; x <= 100; x += 20) {
    const px = xScale.toPixel(x);
    ctx.beginPath();
    ctx.moveTo(px, plotTop);
    ctx.lineTo(px, plotBottom);
    ctx.stroke();
  }
}

/**
 * Draw a single rank bar
 */
function drawRankBar(ctx, rank, y, xScale, cfg) {
  const sucraPercent = rank.sucra * 100;
  const barWidth = (sucraPercent / 100) * (xScale.toPixel(100) - xScale.toPixel(0));

  // Bar gradient
  const gradient = ctx.createLinearGradient(xScale.toPixel(0), y, xScale.toPixel(sucraPercent), y);
  gradient.addColorStop(0, cfg.colors.barGradientStart);
  gradient.addColorStop(1, cfg.colors.barGradientEnd);

  // Draw bar
  ctx.fillStyle = gradient;
  ctx.fillRect(xScale.toPixel(0), y, barWidth, cfg.barHeight);

  // Uncertainty range (if available)
  if (cfg.showUncertainty && rank.rank_probabilities && rank.rank_probabilities.length > 0) {
    // Calculate effective range from rank probabilities
    const probs = rank.rank_probabilities;
    let cumulative = 0;
    let lower = 0;
    let upper = probs.length;

    for (let i = 0; i < probs.length; i++) {
      cumulative += probs[i];
      if (cumulative >= 0.025 && lower === 0) lower = i + 1;
      if (cumulative >= 0.975) {
        upper = i + 1;
        break;
      }
    }

    // Convert rank range to approximate SUCRA range
    const n = probs.length;
    const sucraLower = Math.max(0, ((n - upper) / (n - 1)) * 100);
    const sucraUpper = Math.min(100, ((n - lower) / (n - 1)) * 100);

    ctx.fillStyle = cfg.colors.uncertainty;
    ctx.fillRect(
      xScale.toPixel(sucraLower),
      y,
      xScale.toPixel(sucraUpper) - xScale.toPixel(sucraLower),
      cfg.barHeight
    );
  }

  // Treatment label (left of bar)
  ctx.fillStyle = cfg.colors.text;
  ctx.font = `${cfg.fontSize}px ${cfg.fontFamily}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  let label = rank.treatment;
  if (label.length > 20) label = label.substring(0, 18) + '...';
  ctx.fillText(label, xScale.toPixel(0) - 10, y + cfg.barHeight / 2);

  // SUCRA value (on bar or to the right)
  if (cfg.showValues) {
    ctx.font = `bold ${cfg.fontSize - 1}px ${cfg.fontFamily}`;
    ctx.textAlign = 'left';

    const valueText = `${(sucraPercent).toFixed(1)}%`;
    const valueX = barWidth > 50 ? xScale.toPixel(0) + barWidth - 40 : xScale.toPixel(sucraPercent) + 5;

    ctx.fillStyle = barWidth > 50 ? '#ffffff' : cfg.colors.text;
    ctx.fillText(valueText, valueX, y + cfg.barHeight / 2);
  }
}

/**
 * Draw axes
 */
function drawAxes(ctx, xScale, cfg, plotLeft, plotRight, plotTop, plotBottom) {
  ctx.strokeStyle = cfg.colors.text;
  ctx.fillStyle = cfg.colors.text;
  ctx.lineWidth = 1;

  // X axis
  ctx.beginPath();
  ctx.moveTo(plotLeft, plotBottom);
  ctx.lineTo(plotRight, plotBottom);
  ctx.stroke();

  // X ticks
  ctx.font = `${cfg.fontSize - 1}px ${cfg.fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  for (let x = 0; x <= 100; x += 20) {
    const px = xScale.toPixel(x);
    ctx.beginPath();
    ctx.moveTo(px, plotBottom);
    ctx.lineTo(px, plotBottom + 5);
    ctx.stroke();
    ctx.fillText(`${x}%`, px, plotBottom + 8);
  }

  // X axis label
  ctx.font = `${cfg.fontSize}px ${cfg.fontFamily}`;
  ctx.fillText('SUCRA (%)', (plotLeft + plotRight) / 2, plotBottom + 30);
}

/**
 * Draw title
 */
function drawTitle(ctx, cfg) {
  ctx.fillStyle = cfg.colors.text;
  ctx.font = `bold ${cfg.fontSize + 2}px ${cfg.fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(cfg.title, cfg.width / 2, 10);
}

/**
 * Render rank probability heatmap
 */
export function renderRankProbabilityHeatmap(container, data, config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const { rankings } = data;

  // Sort by SUCRA
  const sortedRankings = [...rankings].sort((a, b) => b.sucra - a.sucra);

  // Create table
  const table = document.createElement('table');
  table.className = 'rank-probability-heatmap';
  table.style.cssText = `
    border-collapse: collapse;
    font-family: ${cfg.fontFamily};
    font-size: ${cfg.fontSize - 1}px;
    margin: 0 auto;
  `;

  // Header
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');

  const th1 = document.createElement('th');
  th1.textContent = 'Treatment';
  th1.style.cssText = 'padding: 8px; border: 1px solid #e5e7eb; background: #f9fafb;';
  headerRow.appendChild(th1);

  const numRanks = sortedRankings[0]?.rank_probabilities?.length || sortedRankings.length;
  for (let r = 1; r <= numRanks; r++) {
    const th = document.createElement('th');
    th.textContent = `Rank ${r}`;
    th.style.cssText = 'padding: 8px; border: 1px solid #e5e7eb; background: #f9fafb; min-width: 50px;';
    headerRow.appendChild(th);
  }

  const thSucra = document.createElement('th');
  thSucra.textContent = 'SUCRA';
  thSucra.style.cssText = 'padding: 8px; border: 1px solid #e5e7eb; background: #f9fafb;';
  headerRow.appendChild(thSucra);

  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Body
  const tbody = document.createElement('tbody');

  sortedRankings.forEach(rank => {
    const tr = document.createElement('tr');

    // Treatment name
    const tdName = document.createElement('td');
    tdName.textContent = rank.treatment;
    tdName.style.cssText = 'padding: 8px; border: 1px solid #e5e7eb; font-weight: bold;';
    tr.appendChild(tdName);

    // Rank probabilities
    const probs = rank.rank_probabilities || [];
    for (let r = 0; r < numRanks; r++) {
      const td = document.createElement('td');
      const prob = probs[r] || 0;
      td.textContent = (prob * 100).toFixed(1) + '%';
      td.style.cssText = `
        padding: 8px;
        border: 1px solid #e5e7eb;
        text-align: center;
        background: ${getProbabilityColor(prob)};
        color: ${prob > 0.5 ? 'white' : '#111827'};
      `;
      tr.appendChild(td);
    }

    // SUCRA
    const tdSucra = document.createElement('td');
    tdSucra.textContent = (rank.sucra * 100).toFixed(1) + '%';
    tdSucra.style.cssText = `
      padding: 8px;
      border: 1px solid #e5e7eb;
      text-align: center;
      font-weight: bold;
      background: ${getSucraColor(rank.sucra)};
      color: ${rank.sucra > 0.6 ? 'white' : '#111827'};
    `;
    tr.appendChild(tdSucra);

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  container.innerHTML = '';
  container.appendChild(table);

  return table;
}

/**
 * Get color for probability value
 */
function getProbabilityColor(prob) {
  const intensity = Math.round(prob * 200);
  return `rgb(${59 + (200 - intensity)}, ${130 + (125 - Math.round(prob * 125))}, ${246 - intensity})`;
}

/**
 * Get color for SUCRA value
 */
function getSucraColor(sucra) {
  if (sucra >= 0.8) return '#22c55e';
  if (sucra >= 0.6) return '#84cc16';
  if (sucra >= 0.4) return '#eab308';
  if (sucra >= 0.2) return '#f97316';
  return '#ef4444';
}

/**
 * Export rank chart as PNG
 */
export function exportRankChart(canvas, filename = 'rank-chart.png') {
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

/**
 * Create ranking summary panel
 */
export function createRankingSummary(container, data) {
  const { rankings } = data;

  // Sort by SUCRA
  const sorted = [...rankings].sort((a, b) => b.sucra - a.sucra);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];

  const panel = document.createElement('div');
  panel.className = 'ranking-summary';
  panel.innerHTML = `
    <div class="summary-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; padding: 16px;">
      <div class="summary-item" style="background: #dcfce7; padding: 12px; border-radius: 8px;">
        <div style="font-size: 11px; color: #166534; text-transform: uppercase;">Best Treatment</div>
        <div style="font-size: 16px; font-weight: bold; color: #166534;">${best.treatment}</div>
        <div style="font-size: 13px; color: #166534;">SUCRA: ${(best.sucra * 100).toFixed(1)}%</div>
      </div>
      <div class="summary-item" style="background: #fef2f2; padding: 12px; border-radius: 8px;">
        <div style="font-size: 11px; color: #991b1b; text-transform: uppercase;">Worst Treatment</div>
        <div style="font-size: 16px; font-weight: bold; color: #991b1b;">${worst.treatment}</div>
        <div style="font-size: 13px; color: #991b1b;">SUCRA: ${(worst.sucra * 100).toFixed(1)}%</div>
      </div>
    </div>
    <div style="font-size: 11px; color: #6b7280; text-align: center; padding: 8px;">
      SUCRA = Surface Under the Cumulative Ranking. Higher values indicate better ranking.
    </div>
  `;

  container.appendChild(panel);
  return panel;
}

/**
 * Create rank chart component
 */
export function createRankChart(container, data, config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const wrapper = document.createElement('div');
  wrapper.className = 'rank-chart-wrapper';

  // Summary
  createRankingSummary(wrapper, data);

  // Canvas for bar chart
  const canvas = document.createElement('canvas');
  wrapper.appendChild(canvas);

  // Heatmap container
  const heatmapTitle = document.createElement('h4');
  heatmapTitle.textContent = 'Rank Probability Distribution';
  heatmapTitle.style.cssText = 'text-align: center; margin: 16px 0 8px; font-size: 14px;';
  wrapper.appendChild(heatmapTitle);

  const heatmapContainer = document.createElement('div');
  heatmapContainer.style.cssText = 'overflow-x: auto;';
  wrapper.appendChild(heatmapContainer);

  container.appendChild(wrapper);

  renderRankChart(canvas, data, cfg);
  renderRankProbabilityHeatmap(heatmapContainer, data, cfg);

  return {
    canvas,
    wrapper,
    heatmapContainer,
    update: (newData, newConfig) => {
      renderRankChart(canvas, newData, { ...cfg, ...newConfig });
      renderRankProbabilityHeatmap(heatmapContainer, newData, { ...cfg, ...newConfig });
    },
    export: (filename) => exportRankChart(canvas, filename),
    destroy: () => container.removeChild(wrapper)
  };
}

export default {
  renderRankChart,
  renderRankProbabilityHeatmap,
  exportRankChart,
  createRankChart,
  createRankingSummary,
  DEFAULT_CONFIG
};
