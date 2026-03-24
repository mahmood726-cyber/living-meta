/**
 * Forest Plot Component
 * Canvas-based forest plot visualization for meta-analysis results
 */

import { backTransform } from '../../lib/effect-sizes.js';

/**
 * Default configuration for forest plot
 */
const DEFAULT_CONFIG = {
  width: 800,
  height: null, // Auto-calculated based on studies
  padding: { top: 60, right: 200, bottom: 40, left: 300 },
  rowHeight: 28,
  fontSize: 12,
  fontFamily: 'system-ui, -apple-system, sans-serif',
  colors: {
    line: '#374151',
    diamond: '#3b82f6',
    square: '#1f2937',
    ci: '#6b7280',
    nullLine: '#ef4444',
    grid: '#e5e7eb',
    text: '#111827',
    subgroup: '#f3f4f6'
  },
  nullValue: 0, // 0 for log-scale, 1 for ratio display
  logScale: true,
  showWeights: true,
  showHeterogeneity: true,
  effectLabel: 'Effect Estimate',
  favorsLeftLabel: 'Favors Control',
  favorsRightLabel: 'Favors Treatment'
};

/**
 * Render forest plot to canvas
 * @param {HTMLCanvasElement} canvas - Target canvas element
 * @param {object} data - Analysis results
 * @param {object} config - Plot configuration
 */
export function renderForestPlot(canvas, data, config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const ctx = canvas.getContext('2d');

  const { studies, pooled, subgroups } = data;

  // Calculate dimensions
  const numRows = studies.length + (subgroups ? subgroups.length + 1 : 0) + 2; // +2 for header and pooled
  cfg.height = cfg.height || cfg.padding.top + cfg.padding.bottom + numRows * cfg.rowHeight;

  // Set canvas size (account for device pixel ratio)
  const dpr = window.devicePixelRatio || 1;
  canvas.width = cfg.width * dpr;
  canvas.height = cfg.height * dpr;
  canvas.style.width = cfg.width + 'px';
  canvas.style.height = cfg.height + 'px';
  ctx.scale(dpr, dpr);

  // Clear canvas
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cfg.width, cfg.height);

  // Calculate x-axis range
  const xRange = calculateXRange(studies, pooled, cfg);
  const xScale = createXScale(xRange, cfg);

  // Draw components
  drawGrid(ctx, xScale, cfg);
  drawNullLine(ctx, xScale, cfg);
  drawHeader(ctx, cfg);
  drawStudies(ctx, studies, xScale, cfg);

  if (subgroups) {
    drawSubgroups(ctx, subgroups, studies, xScale, cfg);
  }

  drawPooledEstimate(ctx, pooled, studies.length, xScale, cfg);
  drawXAxis(ctx, xScale, cfg);
  drawFavorsLabels(ctx, xScale, cfg);

  if (cfg.showHeterogeneity && pooled) {
    drawHeterogeneity(ctx, pooled, cfg);
  }
}

/**
 * Calculate x-axis range from data
 */
function calculateXRange(studies, pooled, cfg) {
  let min = Infinity;
  let max = -Infinity;

  studies.forEach(s => {
    if (s.ci_lower !== null) min = Math.min(min, s.ci_lower);
    if (s.ci_upper !== null) max = Math.max(max, s.ci_upper);
  });

  if (pooled) {
    if (pooled.ci_lower !== null) min = Math.min(min, pooled.ci_lower);
    if (pooled.ci_upper !== null) max = Math.max(max, pooled.ci_upper);
    if (pooled.pi_lower !== null) min = Math.min(min, pooled.pi_lower);
    if (pooled.pi_upper !== null) max = Math.max(max, pooled.pi_upper);
  }

  // Add padding
  const range = max - min;
  min -= range * 0.1;
  max += range * 0.1;

  // Ensure null value is included
  min = Math.min(min, cfg.nullValue);
  max = Math.max(max, cfg.nullValue);

  return { min, max };
}

/**
 * Create x-scale function
 */
function createXScale(range, cfg) {
  const plotWidth = cfg.width - cfg.padding.left - cfg.padding.right;

  return {
    range,
    toPixel: (value) => {
      const normalized = (value - range.min) / (range.max - range.min);
      return cfg.padding.left + normalized * plotWidth;
    },
    fromPixel: (pixel) => {
      const normalized = (pixel - cfg.padding.left) / plotWidth;
      return range.min + normalized * (range.max - range.min);
    }
  };
}

/**
 * Draw grid lines
 */
function drawGrid(ctx, xScale, cfg) {
  ctx.strokeStyle = cfg.colors.grid;
  ctx.lineWidth = 0.5;

  // Generate nice tick values
  const ticks = generateTicks(xScale.range.min, xScale.range.max, 5);

  ticks.forEach(tick => {
    const x = xScale.toPixel(tick);
    ctx.beginPath();
    ctx.moveTo(x, cfg.padding.top);
    ctx.lineTo(x, cfg.height - cfg.padding.bottom);
    ctx.stroke();
  });
}

/**
 * Draw null effect line
 */
function drawNullLine(ctx, xScale, cfg) {
  const x = xScale.toPixel(cfg.nullValue);

  ctx.strokeStyle = cfg.colors.nullLine;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);

  ctx.beginPath();
  ctx.moveTo(x, cfg.padding.top);
  ctx.lineTo(x, cfg.height - cfg.padding.bottom);
  ctx.stroke();

  ctx.setLineDash([]);
}

/**
 * Draw column headers
 */
function drawHeader(ctx, cfg) {
  ctx.fillStyle = cfg.colors.text;
  ctx.font = `bold ${cfg.fontSize}px ${cfg.fontFamily}`;
  ctx.textBaseline = 'middle';

  const y = cfg.padding.top - 25;

  // Study column
  ctx.textAlign = 'left';
  ctx.fillText('Study', 10, y);

  // Effect column
  ctx.textAlign = 'center';
  ctx.fillText(cfg.effectLabel, cfg.padding.left + (cfg.width - cfg.padding.left - cfg.padding.right) / 2, y);

  // Stats column
  ctx.textAlign = 'right';
  ctx.fillText('Effect [95% CI]', cfg.width - 10, y);

  if (cfg.showWeights) {
    ctx.fillText('Weight', cfg.width - 120, y);
  }
}

/**
 * Draw individual studies
 */
function drawStudies(ctx, studies, xScale, cfg) {
  studies.forEach((study, i) => {
    const y = cfg.padding.top + i * cfg.rowHeight + cfg.rowHeight / 2;

    // Study label
    ctx.fillStyle = cfg.colors.text;
    ctx.font = `${cfg.fontSize}px ${cfg.fontFamily}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const label = truncateText(ctx, study.label || study.id || `Study ${i + 1}`, cfg.padding.left - 20);
    ctx.fillText(label, 10, y);

    // Confidence interval line
    if (study.ci_lower !== null && study.ci_upper !== null) {
      const x1 = xScale.toPixel(study.ci_lower);
      const x2 = xScale.toPixel(study.ci_upper);

      ctx.strokeStyle = cfg.colors.ci;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x1, y);
      ctx.lineTo(x2, y);
      ctx.stroke();

      // CI whiskers
      ctx.beginPath();
      ctx.moveTo(x1, y - 4);
      ctx.lineTo(x1, y + 4);
      ctx.moveTo(x2, y - 4);
      ctx.lineTo(x2, y + 4);
      ctx.stroke();
    }

    // Point estimate (square sized by weight)
    if (study.yi !== null) {
      const x = xScale.toPixel(study.yi);
      const size = Math.sqrt(study.weight || 1) * 3 + 4;

      ctx.fillStyle = cfg.colors.square;
      ctx.fillRect(x - size / 2, y - size / 2, size, size);
    }

    // Effect text
    ctx.fillStyle = cfg.colors.text;
    ctx.textAlign = 'right';

    const effectText = formatEffect(study.yi, study.ci_lower, study.ci_upper, cfg.logScale);
    ctx.fillText(effectText, cfg.width - 10, y);

    // Weight
    if (cfg.showWeights && study.weightPercent !== undefined) {
      ctx.fillText(`${study.weightPercent.toFixed(1)}%`, cfg.width - 120, y);
    }
  });
}

/**
 * Draw subgroup headers and summaries
 */
function drawSubgroups(ctx, subgroups, studies, xScale, cfg) {
  let rowOffset = studies.length;

  subgroups.forEach(subgroup => {
    const y = cfg.padding.top + rowOffset * cfg.rowHeight + cfg.rowHeight / 2;

    // Subgroup background
    ctx.fillStyle = cfg.colors.subgroup;
    ctx.fillRect(0, y - cfg.rowHeight / 2, cfg.width, cfg.rowHeight);

    // Subgroup label
    ctx.fillStyle = cfg.colors.text;
    ctx.font = `bold ${cfg.fontSize}px ${cfg.fontFamily}`;
    ctx.textAlign = 'left';
    ctx.fillText(subgroup.name, 10, y);

    // Subgroup diamond
    if (subgroup.theta !== null) {
      drawDiamond(ctx, xScale.toPixel(subgroup.theta), y,
        xScale.toPixel(subgroup.ci_lower), xScale.toPixel(subgroup.ci_upper),
        cfg.colors.diamond, 0.6);
    }

    rowOffset++;
  });
}

/**
 * Draw pooled estimate diamond
 */
function drawPooledEstimate(ctx, pooled, studyCount, xScale, cfg) {
  if (!pooled) return;

  const y = cfg.padding.top + (studyCount + 1) * cfg.rowHeight + cfg.rowHeight / 2;

  // Separator line
  ctx.strokeStyle = cfg.colors.line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(10, y - cfg.rowHeight / 2 - 5);
  ctx.lineTo(cfg.width - 10, y - cfg.rowHeight / 2 - 5);
  ctx.stroke();

  // Label
  ctx.fillStyle = cfg.colors.text;
  ctx.font = `bold ${cfg.fontSize}px ${cfg.fontFamily}`;
  ctx.textAlign = 'left';
  ctx.fillText(`Overall (${pooled.model || 'RE'})`, 10, y);

  // Diamond
  if (pooled.theta !== null) {
    const cx = xScale.toPixel(pooled.theta);
    const x1 = xScale.toPixel(pooled.ci_lower);
    const x2 = xScale.toPixel(pooled.ci_upper);

    drawDiamond(ctx, cx, y, x1, x2, cfg.colors.diamond, 1);

    // Prediction interval (if available)
    if (pooled.pi_lower !== null && pooled.pi_upper !== null) {
      const pi1 = xScale.toPixel(pooled.pi_lower);
      const pi2 = xScale.toPixel(pooled.pi_upper);

      ctx.strokeStyle = cfg.colors.diamond;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(pi1, y);
      ctx.lineTo(pi2, y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Effect text
  ctx.fillStyle = cfg.colors.text;
  ctx.textAlign = 'right';
  const effectText = formatEffect(pooled.theta, pooled.ci_lower, pooled.ci_upper, cfg.logScale);
  ctx.fillText(effectText, cfg.width - 10, y);
}

/**
 * Draw diamond shape
 */
function drawDiamond(ctx, cx, cy, x1, x2, color, alpha = 1) {
  const height = 10;

  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;

  ctx.beginPath();
  ctx.moveTo(x1, cy);
  ctx.lineTo(cx, cy - height / 2);
  ctx.lineTo(x2, cy);
  ctx.lineTo(cx, cy + height / 2);
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = 1;
}

/**
 * Draw x-axis
 */
function drawXAxis(ctx, xScale, cfg) {
  const y = cfg.height - cfg.padding.bottom + 15;

  ctx.strokeStyle = cfg.colors.line;
  ctx.fillStyle = cfg.colors.text;
  ctx.font = `${cfg.fontSize - 1}px ${cfg.fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const ticks = generateTicks(xScale.range.min, xScale.range.max, 5);

  ticks.forEach(tick => {
    const x = xScale.toPixel(tick);

    // Tick mark
    ctx.beginPath();
    ctx.moveTo(x, cfg.height - cfg.padding.bottom);
    ctx.lineTo(x, cfg.height - cfg.padding.bottom + 5);
    ctx.stroke();

    // Label
    const label = cfg.logScale ? tick.toFixed(2) : Math.exp(tick).toFixed(2);
    ctx.fillText(label, x, y);
  });
}

/**
 * Draw favors labels
 */
function drawFavorsLabels(ctx, xScale, cfg) {
  const y = cfg.height - 10;
  const nullX = xScale.toPixel(cfg.nullValue);

  ctx.fillStyle = cfg.colors.text;
  ctx.font = `italic ${cfg.fontSize - 1}px ${cfg.fontFamily}`;
  ctx.textBaseline = 'bottom';

  // Left label
  ctx.textAlign = 'left';
  ctx.fillText(`← ${cfg.favorsLeftLabel}`, cfg.padding.left, y);

  // Right label
  ctx.textAlign = 'right';
  ctx.fillText(`${cfg.favorsRightLabel} →`, cfg.width - cfg.padding.right, y);
}

/**
 * Draw heterogeneity statistics
 */
function drawHeterogeneity(ctx, pooled, cfg) {
  const y = cfg.height - cfg.padding.bottom + 35;

  ctx.fillStyle = cfg.colors.text;
  ctx.font = `${cfg.fontSize - 1}px ${cfg.fontFamily}`;
  ctx.textAlign = 'left';

  let text = `Heterogeneity: I² = ${pooled.I2?.toFixed(1) || '?'}%`;
  if (pooled.tau2 !== undefined) {
    text += `, τ² = ${pooled.tau2.toFixed(4)}`;
  }
  if (pooled.pQ !== undefined) {
    text += `, Q p = ${pooled.pQ < 0.001 ? '<0.001' : pooled.pQ.toFixed(3)}`;
  }

  ctx.fillText(text, 10, y);

  // Test for overall effect
  if (pooled.pValue !== undefined) {
    const testText = `Test for overall effect: z = ${pooled.z?.toFixed(2) || '?'}, p = ${pooled.pValue < 0.001 ? '<0.001' : pooled.pValue.toFixed(3)}`;
    ctx.fillText(testText, 10, y + 15);
  }
}

/**
 * Generate nice tick values
 */
function generateTicks(min, max, count) {
  const range = max - min;
  const step = range / count;
  const magnitude = Math.pow(10, Math.floor(Math.log10(step)));
  const residual = step / magnitude;

  let niceStep;
  if (residual > 5) niceStep = 10 * magnitude;
  else if (residual > 2) niceStep = 5 * magnitude;
  else if (residual > 1) niceStep = 2 * magnitude;
  else niceStep = magnitude;

  const ticks = [];
  let tick = Math.ceil(min / niceStep) * niceStep;
  while (tick <= max) {
    ticks.push(tick);
    tick += niceStep;
  }

  return ticks;
}

/**
 * Format effect estimate with CI
 */
function formatEffect(yi, ciLower, ciUpper, logScale) {
  if (yi === null || yi === undefined) return '—';

  if (logScale) {
    // Display on original scale (exponentiated)
    const est = Math.exp(yi).toFixed(2);
    const lower = ciLower !== null ? Math.exp(ciLower).toFixed(2) : '?';
    const upper = ciUpper !== null ? Math.exp(ciUpper).toFixed(2) : '?';
    return `${est} [${lower}, ${upper}]`;
  } else {
    const est = yi.toFixed(2);
    const lower = ciLower !== null ? ciLower.toFixed(2) : '?';
    const upper = ciUpper !== null ? ciUpper.toFixed(2) : '?';
    return `${est} [${lower}, ${upper}]`;
  }
}

/**
 * Truncate text to fit width
 */
function truncateText(ctx, text, maxWidth) {
  let truncated = text;
  while (ctx.measureText(truncated).width > maxWidth && truncated.length > 3) {
    truncated = truncated.slice(0, -4) + '...';
  }
  return truncated;
}

/**
 * Export forest plot as PNG
 */
export function exportForestPlot(canvas, filename = 'forest-plot.png') {
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

/**
 * Create forest plot component for a container
 */
export function createForestPlot(container, data, config = {}) {
  // Create canvas
  const canvas = document.createElement('canvas');
  container.appendChild(canvas);

  // Render
  renderForestPlot(canvas, data, config);

  // Return API
  return {
    canvas,
    update: (newData, newConfig) => renderForestPlot(canvas, newData, { ...config, ...newConfig }),
    export: (filename) => exportForestPlot(canvas, filename),
    destroy: () => container.removeChild(canvas)
  };
}

export default {
  renderForestPlot,
  exportForestPlot,
  createForestPlot,
  DEFAULT_CONFIG
};
