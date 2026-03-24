/**
 * Funnel Plot Component
 * Canvas-based funnel plot visualization for publication bias assessment
 */

/**
 * Default configuration for funnel plot
 */
const DEFAULT_CONFIG = {
  width: 600,
  height: 500,
  padding: { top: 40, right: 40, bottom: 60, left: 70 },
  fontSize: 12,
  fontFamily: 'system-ui, -apple-system, sans-serif',
  colors: {
    point: '#3b82f6',
    pointOutlier: '#ef4444',
    funnel: 'rgba(59, 130, 246, 0.1)',
    funnelLine: '#93c5fd',
    centerLine: '#1f2937',
    grid: '#e5e7eb',
    text: '#111827',
    contour90: 'rgba(59, 130, 246, 0.05)',
    contour95: 'rgba(59, 130, 246, 0.1)',
    contour99: 'rgba(59, 130, 246, 0.15)'
  },
  pointSize: 6,
  showContours: true,
  showPooledLine: true,
  yAxisInverted: true, // SE on y-axis, inverted (0 at top)
  xLabel: 'Effect Estimate',
  yLabel: 'Standard Error',
  title: 'Funnel Plot'
};

/**
 * Render funnel plot to canvas
 * @param {HTMLCanvasElement} canvas - Target canvas element
 * @param {object} data - { studies: [{yi, vi, sei, id}], pooled: {theta, se} }
 * @param {object} config - Plot configuration
 */
export function renderFunnelPlot(canvas, data, config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const ctx = canvas.getContext('2d');

  const { studies, pooled } = data;

  // Set canvas size
  const dpr = window.devicePixelRatio || 1;
  canvas.width = cfg.width * dpr;
  canvas.height = cfg.height * dpr;
  canvas.style.width = cfg.width + 'px';
  canvas.style.height = cfg.height + 'px';
  ctx.scale(dpr, dpr);

  // Clear canvas
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cfg.width, cfg.height);

  // Calculate scales
  const { xScale, yScale } = calculateScales(studies, pooled, cfg);

  // Draw components
  drawGrid(ctx, xScale, yScale, cfg);

  if (cfg.showContours) {
    drawContours(ctx, pooled, xScale, yScale, cfg);
  }

  drawFunnel(ctx, pooled, xScale, yScale, cfg);
  drawCenterLine(ctx, pooled, xScale, yScale, cfg);
  drawPoints(ctx, studies, pooled, xScale, yScale, cfg);
  drawAxes(ctx, xScale, yScale, cfg);
  drawLabels(ctx, cfg);
}

/**
 * Calculate x and y scales
 */
function calculateScales(studies, pooled, cfg) {
  const plotWidth = cfg.width - cfg.padding.left - cfg.padding.right;
  const plotHeight = cfg.height - cfg.padding.top - cfg.padding.bottom;

  // X range (effect estimates)
  let xMin = Math.min(...studies.map(s => s.yi));
  let xMax = Math.max(...studies.map(s => s.yi));

  if (pooled) {
    xMin = Math.min(xMin, pooled.theta);
    xMax = Math.max(xMax, pooled.theta);
  }

  // Add padding
  const xRange = xMax - xMin;
  xMin -= xRange * 0.2;
  xMax += xRange * 0.2;

  // Y range (standard errors)
  const seValues = studies.map(s => s.sei || Math.sqrt(s.vi));
  let yMin = 0;
  let yMax = Math.max(...seValues) * 1.1;

  const xScale = {
    min: xMin,
    max: xMax,
    toPixel: (value) => cfg.padding.left + ((value - xMin) / (xMax - xMin)) * plotWidth,
    fromPixel: (pixel) => xMin + ((pixel - cfg.padding.left) / plotWidth) * (xMax - xMin)
  };

  const yScale = {
    min: yMin,
    max: yMax,
    toPixel: (value) => {
      if (cfg.yAxisInverted) {
        // Inverted: 0 at top, max at bottom
        return cfg.padding.top + (value / yMax) * plotHeight;
      } else {
        return cfg.height - cfg.padding.bottom - (value / yMax) * plotHeight;
      }
    },
    fromPixel: (pixel) => {
      if (cfg.yAxisInverted) {
        return ((pixel - cfg.padding.top) / plotHeight) * yMax;
      } else {
        return ((cfg.height - cfg.padding.bottom - pixel) / plotHeight) * yMax;
      }
    }
  };

  return { xScale, yScale };
}

/**
 * Draw grid lines
 */
function drawGrid(ctx, xScale, yScale, cfg) {
  ctx.strokeStyle = cfg.colors.grid;
  ctx.lineWidth = 0.5;

  // X grid
  const xTicks = generateTicks(xScale.min, xScale.max, 6);
  xTicks.forEach(tick => {
    const x = xScale.toPixel(tick);
    ctx.beginPath();
    ctx.moveTo(x, cfg.padding.top);
    ctx.lineTo(x, cfg.height - cfg.padding.bottom);
    ctx.stroke();
  });

  // Y grid
  const yTicks = generateTicks(yScale.min, yScale.max, 5);
  yTicks.forEach(tick => {
    const y = yScale.toPixel(tick);
    ctx.beginPath();
    ctx.moveTo(cfg.padding.left, y);
    ctx.lineTo(cfg.width - cfg.padding.right, y);
    ctx.stroke();
  });
}

/**
 * Draw significance contours
 */
function drawContours(ctx, pooled, xScale, yScale, cfg) {
  if (!pooled) return;

  const theta = pooled.theta;
  const levels = [
    { z: 1.645, color: cfg.colors.contour90, label: '90%' },
    { z: 1.96, color: cfg.colors.contour95, label: '95%' },
    { z: 2.576, color: cfg.colors.contour99, label: '99%' }
  ];

  levels.forEach(({ z, color }) => {
    ctx.fillStyle = color;
    ctx.beginPath();

    // Draw contour from top (SE=0) to bottom
    const seMax = yScale.max;
    const steps = 50;

    // Left side of contour
    for (let i = 0; i <= steps; i++) {
      const se = (i / steps) * seMax;
      const x = theta - z * se;
      const px = xScale.toPixel(x);
      const py = yScale.toPixel(se);

      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }

    // Right side of contour
    for (let i = steps; i >= 0; i--) {
      const se = (i / steps) * seMax;
      const x = theta + z * se;
      const px = xScale.toPixel(x);
      const py = yScale.toPixel(se);
      ctx.lineTo(px, py);
    }

    ctx.closePath();
    ctx.fill();
  });
}

/**
 * Draw funnel boundaries
 */
function drawFunnel(ctx, pooled, xScale, yScale, cfg) {
  if (!pooled) return;

  const theta = pooled.theta;
  const z = 1.96; // 95% CI boundaries

  ctx.strokeStyle = cfg.colors.funnelLine;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);

  // Left boundary
  ctx.beginPath();
  ctx.moveTo(xScale.toPixel(theta), yScale.toPixel(0));
  ctx.lineTo(xScale.toPixel(theta - z * yScale.max), yScale.toPixel(yScale.max));
  ctx.stroke();

  // Right boundary
  ctx.beginPath();
  ctx.moveTo(xScale.toPixel(theta), yScale.toPixel(0));
  ctx.lineTo(xScale.toPixel(theta + z * yScale.max), yScale.toPixel(yScale.max));
  ctx.stroke();

  ctx.setLineDash([]);
}

/**
 * Draw center line at pooled estimate
 */
function drawCenterLine(ctx, pooled, xScale, yScale, cfg) {
  if (!pooled || !cfg.showPooledLine) return;

  const x = xScale.toPixel(pooled.theta);

  ctx.strokeStyle = cfg.colors.centerLine;
  ctx.lineWidth = 1;

  ctx.beginPath();
  ctx.moveTo(x, cfg.padding.top);
  ctx.lineTo(x, cfg.height - cfg.padding.bottom);
  ctx.stroke();
}

/**
 * Draw study points
 */
function drawPoints(ctx, studies, pooled, xScale, yScale, cfg) {
  const theta = pooled?.theta || 0;

  studies.forEach(study => {
    const x = xScale.toPixel(study.yi);
    const se = study.sei || Math.sqrt(study.vi);
    const y = yScale.toPixel(se);

    // Check if outside funnel (potential outlier)
    const zScore = Math.abs(study.yi - theta) / se;
    const isOutlier = zScore > 1.96;

    ctx.fillStyle = isOutlier ? cfg.colors.pointOutlier : cfg.colors.point;
    ctx.beginPath();
    ctx.arc(x, y, cfg.pointSize, 0, Math.PI * 2);
    ctx.fill();

    // Add border
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke();
  });
}

/**
 * Draw axes
 */
function drawAxes(ctx, xScale, yScale, cfg) {
  ctx.strokeStyle = cfg.colors.text;
  ctx.fillStyle = cfg.colors.text;
  ctx.font = `${cfg.fontSize - 1}px ${cfg.fontFamily}`;
  ctx.lineWidth = 1;

  // X axis
  ctx.beginPath();
  ctx.moveTo(cfg.padding.left, cfg.height - cfg.padding.bottom);
  ctx.lineTo(cfg.width - cfg.padding.right, cfg.height - cfg.padding.bottom);
  ctx.stroke();

  // X ticks
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const xTicks = generateTicks(xScale.min, xScale.max, 6);
  xTicks.forEach(tick => {
    const x = xScale.toPixel(tick);
    ctx.beginPath();
    ctx.moveTo(x, cfg.height - cfg.padding.bottom);
    ctx.lineTo(x, cfg.height - cfg.padding.bottom + 5);
    ctx.stroke();
    ctx.fillText(tick.toFixed(2), x, cfg.height - cfg.padding.bottom + 8);
  });

  // Y axis
  ctx.beginPath();
  ctx.moveTo(cfg.padding.left, cfg.padding.top);
  ctx.lineTo(cfg.padding.left, cfg.height - cfg.padding.bottom);
  ctx.stroke();

  // Y ticks
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const yTicks = generateTicks(yScale.min, yScale.max, 5);
  yTicks.forEach(tick => {
    const y = yScale.toPixel(tick);
    ctx.beginPath();
    ctx.moveTo(cfg.padding.left - 5, y);
    ctx.lineTo(cfg.padding.left, y);
    ctx.stroke();
    ctx.fillText(tick.toFixed(2), cfg.padding.left - 8, y);
  });
}

/**
 * Draw axis labels and title
 */
function drawLabels(ctx, cfg) {
  ctx.fillStyle = cfg.colors.text;
  ctx.font = `${cfg.fontSize}px ${cfg.fontFamily}`;

  // Title
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = `bold ${cfg.fontSize + 2}px ${cfg.fontFamily}`;
  ctx.fillText(cfg.title, cfg.width / 2, 10);

  // X label
  ctx.font = `${cfg.fontSize}px ${cfg.fontFamily}`;
  ctx.fillText(cfg.xLabel, cfg.width / 2, cfg.height - 15);

  // Y label (rotated)
  ctx.save();
  ctx.translate(15, cfg.height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillText(cfg.yLabel, 0, 0);
  ctx.restore();
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
 * Calculate Egger regression line for overlay
 */
export function calculateEggerLine(studies, pooled) {
  if (studies.length < 3) return null;

  const ses = studies.map(s => s.sei || Math.sqrt(s.vi));
  const z = studies.map((s, i) => s.yi / ses[i]);
  const precision = ses.map(se => 1 / se);

  // Simple linear regression
  const n = studies.length;
  const sumX = precision.reduce((a, b) => a + b, 0);
  const sumY = z.reduce((a, b) => a + b, 0);
  const sumXY = precision.reduce((sum, x, i) => sum + x * z[i], 0);
  const sumX2 = precision.reduce((sum, x) => sum + x * x, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  return { slope, intercept };
}

/**
 * Draw Egger regression line
 */
export function drawEggerLine(ctx, studies, pooled, xScale, yScale, cfg) {
  const egger = calculateEggerLine(studies, pooled);
  if (!egger) return;

  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 4]);

  // Convert Egger line to effect vs SE space
  // z = intercept + slope * precision
  // effect/se = intercept + slope/se
  // effect = intercept * se + slope

  const seMin = 0.01;
  const seMax = yScale.max;

  const x1 = egger.intercept * seMin + egger.slope;
  const x2 = egger.intercept * seMax + egger.slope;

  ctx.beginPath();
  ctx.moveTo(xScale.toPixel(x1), yScale.toPixel(seMin));
  ctx.lineTo(xScale.toPixel(x2), yScale.toPixel(seMax));
  ctx.stroke();

  ctx.setLineDash([]);
}

/**
 * Export funnel plot as PNG
 */
export function exportFunnelPlot(canvas, filename = 'funnel-plot.png') {
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

/**
 * Create funnel plot component for a container
 */
export function createFunnelPlot(container, data, config = {}) {
  const canvas = document.createElement('canvas');
  container.appendChild(canvas);

  renderFunnelPlot(canvas, data, config);

  return {
    canvas,
    update: (newData, newConfig) => renderFunnelPlot(canvas, newData, { ...config, ...newConfig }),
    export: (filename) => exportFunnelPlot(canvas, filename),
    addEggerLine: () => {
      const ctx = canvas.getContext('2d');
      const { xScale, yScale } = calculateScales(data.studies, data.pooled, { ...DEFAULT_CONFIG, ...config });
      drawEggerLine(ctx, data.studies, data.pooled, xScale, yScale, { ...DEFAULT_CONFIG, ...config });
    },
    destroy: () => container.removeChild(canvas)
  };
}

export default {
  renderFunnelPlot,
  exportFunnelPlot,
  createFunnelPlot,
  calculateEggerLine,
  DEFAULT_CONFIG
};
