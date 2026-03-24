/**
 * Trial Sequential Analysis (TSA) Chart Component
 * Canvas-based visualization showing cumulative Z-curve with monitoring boundaries
 */

/**
 * Default configuration for TSA chart
 */
const DEFAULT_CONFIG = {
  width: 800,
  height: 500,
  padding: { top: 50, right: 60, bottom: 70, left: 80 },
  fontSize: 12,
  fontFamily: 'system-ui, -apple-system, sans-serif',
  colors: {
    zCurve: '#3b82f6',
    zCurvePoint: '#1d4ed8',
    upperBoundary: '#ef4444',
    lowerBoundary: '#ef4444',
    futilityBoundary: '#f59e0b',
    risLine: '#10b981',
    grid: '#e5e7eb',
    text: '#111827',
    background: '#ffffff',
    zoneBenefit: 'rgba(34, 197, 94, 0.1)',
    zoneHarm: 'rgba(239, 68, 68, 0.1)',
    zoneFutility: 'rgba(245, 158, 11, 0.1)'
  },
  showFutilityBoundary: true,
  showConfidenceRegion: true,
  showStudyLabels: true,
  xLabel: 'Information Fraction (%)',
  yLabel: 'Cumulative Z-score',
  title: 'Trial Sequential Analysis'
};

/**
 * Render TSA chart to canvas
 * @param {HTMLCanvasElement} canvas - Target canvas element
 * @param {object} data - TSA result data
 * @param {object} config - Chart configuration
 */
export function renderTSAChart(canvas, data, config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const ctx = canvas.getContext('2d');

  const { cumulative_z, boundaries, ris, daris, information_fraction, conclusion } = data;

  // Set canvas size with DPR
  const dpr = window.devicePixelRatio || 1;
  canvas.width = cfg.width * dpr;
  canvas.height = cfg.height * dpr;
  canvas.style.width = cfg.width + 'px';
  canvas.style.height = cfg.height + 'px';
  ctx.scale(dpr, dpr);

  // Clear canvas
  ctx.fillStyle = cfg.colors.background;
  ctx.fillRect(0, 0, cfg.width, cfg.height);

  // Calculate plot area
  const plotLeft = cfg.padding.left;
  const plotRight = cfg.width - cfg.padding.right;
  const plotTop = cfg.padding.top;
  const plotBottom = cfg.height - cfg.padding.bottom;
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotBottom - plotTop;

  // X scale: information fraction 0-100%
  const xScale = {
    min: 0,
    max: 100,
    toPixel: (v) => plotLeft + (v / 100) * plotWidth,
    fromPixel: (px) => ((px - plotLeft) / plotWidth) * 100
  };

  // Y scale: Z-score (typically -5 to 5)
  const zScores = cumulative_z.map(p => p.z_score);
  const boundaryZs = [
    ...boundaries.alpha_upper.map(b => b[1]),
    ...boundaries.alpha_lower.map(b => b[1])
  ];
  const allZ = [...zScores, ...boundaryZs];
  const zMin = Math.min(-3, Math.min(...allZ) - 0.5);
  const zMax = Math.max(3, Math.max(...allZ) + 0.5);

  const yScale = {
    min: zMin,
    max: zMax,
    toPixel: (v) => plotTop + ((zMax - v) / (zMax - zMin)) * plotHeight,
    fromPixel: (px) => zMax - ((px - plotTop) / plotHeight) * (zMax - zMin)
  };

  // Draw components
  drawGrid(ctx, xScale, yScale, cfg, plotLeft, plotRight, plotTop, plotBottom);

  if (cfg.showConfidenceRegion) {
    drawConfidenceRegions(ctx, boundaries, xScale, yScale, cfg);
  }

  drawBoundaries(ctx, boundaries, xScale, yScale, cfg);
  drawRISLine(ctx, information_fraction, xScale, cfg, plotTop, plotBottom);
  drawZCurve(ctx, cumulative_z, daris, xScale, yScale, cfg);
  drawAxes(ctx, xScale, yScale, cfg, plotLeft, plotRight, plotTop, plotBottom);
  drawLabels(ctx, cfg, conclusion);
}

/**
 * Draw grid lines
 */
function drawGrid(ctx, xScale, yScale, cfg, plotLeft, plotRight, plotTop, plotBottom) {
  ctx.strokeStyle = cfg.colors.grid;
  ctx.lineWidth = 0.5;

  // X grid (every 10%)
  for (let x = 0; x <= 100; x += 10) {
    const px = xScale.toPixel(x);
    ctx.beginPath();
    ctx.moveTo(px, plotTop);
    ctx.lineTo(px, plotBottom);
    ctx.stroke();
  }

  // Y grid
  const yTicks = generateTicks(yScale.min, yScale.max, 8);
  yTicks.forEach(tick => {
    const py = yScale.toPixel(tick);
    ctx.beginPath();
    ctx.moveTo(plotLeft, py);
    ctx.lineTo(plotRight, py);
    ctx.stroke();
  });

  // Zero line (stronger)
  ctx.strokeStyle = cfg.colors.text;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(plotLeft, yScale.toPixel(0));
  ctx.lineTo(plotRight, yScale.toPixel(0));
  ctx.stroke();
}

/**
 * Draw confidence regions (benefit/harm zones)
 */
function drawConfidenceRegions(ctx, boundaries, xScale, yScale, cfg) {
  // Benefit zone (above upper boundary)
  if (boundaries.alpha_upper.length > 0) {
    ctx.fillStyle = cfg.colors.zoneBenefit;
    ctx.beginPath();

    const firstPoint = boundaries.alpha_upper[0];
    ctx.moveTo(xScale.toPixel(firstPoint[0] * 100), yScale.toPixel(firstPoint[1]));

    boundaries.alpha_upper.forEach(([t, z]) => {
      ctx.lineTo(xScale.toPixel(t * 100), yScale.toPixel(z));
    });

    // Close to top
    const lastPoint = boundaries.alpha_upper[boundaries.alpha_upper.length - 1];
    ctx.lineTo(xScale.toPixel(lastPoint[0] * 100), yScale.toPixel(yScale.max));
    ctx.lineTo(xScale.toPixel(firstPoint[0] * 100), yScale.toPixel(yScale.max));
    ctx.closePath();
    ctx.fill();
  }

  // Harm zone (below lower boundary)
  if (boundaries.alpha_lower.length > 0) {
    ctx.fillStyle = cfg.colors.zoneHarm;
    ctx.beginPath();

    const firstPoint = boundaries.alpha_lower[0];
    ctx.moveTo(xScale.toPixel(firstPoint[0] * 100), yScale.toPixel(firstPoint[1]));

    boundaries.alpha_lower.forEach(([t, z]) => {
      ctx.lineTo(xScale.toPixel(t * 100), yScale.toPixel(z));
    });

    // Close to bottom
    const lastPoint = boundaries.alpha_lower[boundaries.alpha_lower.length - 1];
    ctx.lineTo(xScale.toPixel(lastPoint[0] * 100), yScale.toPixel(yScale.min));
    ctx.lineTo(xScale.toPixel(firstPoint[0] * 100), yScale.toPixel(yScale.min));
    ctx.closePath();
    ctx.fill();
  }
}

/**
 * Draw monitoring boundaries
 */
function drawBoundaries(ctx, boundaries, xScale, yScale, cfg) {
  // Upper boundary (benefit)
  if (boundaries.alpha_upper.length > 0) {
    ctx.strokeStyle = cfg.colors.upperBoundary;
    ctx.lineWidth = 2;
    ctx.setLineDash([]);

    ctx.beginPath();
    boundaries.alpha_upper.forEach(([t, z], i) => {
      const px = xScale.toPixel(t * 100);
      const py = yScale.toPixel(z);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();

    // Label
    const lastUpper = boundaries.alpha_upper[boundaries.alpha_upper.length - 1];
    ctx.fillStyle = cfg.colors.upperBoundary;
    ctx.font = `${cfg.fontSize - 1}px ${cfg.fontFamily}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('Benefit', xScale.toPixel(lastUpper[0] * 100) + 5, yScale.toPixel(lastUpper[1]));
  }

  // Lower boundary (harm)
  if (boundaries.alpha_lower.length > 0) {
    ctx.strokeStyle = cfg.colors.lowerBoundary;
    ctx.lineWidth = 2;
    ctx.setLineDash([]);

    ctx.beginPath();
    boundaries.alpha_lower.forEach(([t, z], i) => {
      const px = xScale.toPixel(t * 100);
      const py = yScale.toPixel(z);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();

    // Label
    const lastLower = boundaries.alpha_lower[boundaries.alpha_lower.length - 1];
    ctx.fillStyle = cfg.colors.lowerBoundary;
    ctx.fillText('Harm', xScale.toPixel(lastLower[0] * 100) + 5, yScale.toPixel(lastLower[1]));
  }

  // Futility boundary
  if (cfg.showFutilityBoundary && boundaries.beta_boundary && boundaries.beta_boundary.length > 0) {
    ctx.strokeStyle = cfg.colors.futilityBoundary;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);

    ctx.beginPath();
    boundaries.beta_boundary.forEach(([t, z], i) => {
      const px = xScale.toPixel(t * 100);
      const py = yScale.toPixel(z);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    // Label
    const lastFutility = boundaries.beta_boundary[boundaries.beta_boundary.length - 1];
    ctx.fillStyle = cfg.colors.futilityBoundary;
    ctx.fillText('Futility', xScale.toPixel(lastFutility[0] * 100) + 5, yScale.toPixel(lastFutility[1]));
  }
}

/**
 * Draw RIS/DARIS line
 */
function drawRISLine(ctx, infoFraction, xScale, cfg, plotTop, plotBottom) {
  if (infoFraction >= 1) return; // Already at RIS

  const risPercent = 100; // RIS is always at 100%
  const currentPercent = infoFraction * 100;

  // Vertical line at RIS (100%)
  ctx.strokeStyle = cfg.colors.risLine;
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 4]);

  ctx.beginPath();
  ctx.moveTo(xScale.toPixel(risPercent), plotTop);
  ctx.lineTo(xScale.toPixel(risPercent), plotBottom);
  ctx.stroke();
  ctx.setLineDash([]);

  // Label
  ctx.fillStyle = cfg.colors.risLine;
  ctx.font = `${cfg.fontSize - 1}px ${cfg.fontFamily}`;
  ctx.textAlign = 'center';
  ctx.fillText('RIS', xScale.toPixel(risPercent), plotTop - 8);
}

/**
 * Draw cumulative Z-curve
 */
function drawZCurve(ctx, cumulative_z, daris, xScale, yScale, cfg) {
  if (cumulative_z.length === 0) return;

  // Draw line
  ctx.strokeStyle = cfg.colors.zCurve;
  ctx.lineWidth = 2.5;
  ctx.setLineDash([]);

  ctx.beginPath();
  cumulative_z.forEach((point, i) => {
    const infoFrac = (point.information / daris) * 100;
    const px = xScale.toPixel(infoFrac);
    const py = yScale.toPixel(point.z_score);

    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();

  // Draw points
  cumulative_z.forEach((point, i) => {
    const infoFrac = (point.information / daris) * 100;
    const px = xScale.toPixel(infoFrac);
    const py = yScale.toPixel(point.z_score);

    ctx.fillStyle = cfg.colors.zCurvePoint;
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fill();

    // White border
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Study label
    if (cfg.showStudyLabels && i === cumulative_z.length - 1) {
      ctx.fillStyle = cfg.colors.text;
      ctx.font = `${cfg.fontSize - 2}px ${cfg.fontFamily}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`n=${cumulative_z.length}`, px + 8, py - 4);
    }
  });
}

/**
 * Draw axes
 */
function drawAxes(ctx, xScale, yScale, cfg, plotLeft, plotRight, plotTop, plotBottom) {
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

  // Y axis
  ctx.beginPath();
  ctx.moveTo(plotLeft, plotTop);
  ctx.lineTo(plotLeft, plotBottom);
  ctx.stroke();

  // Y ticks
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const yTicks = generateTicks(yScale.min, yScale.max, 8);
  yTicks.forEach(tick => {
    const py = yScale.toPixel(tick);
    ctx.beginPath();
    ctx.moveTo(plotLeft - 5, py);
    ctx.lineTo(plotLeft, py);
    ctx.stroke();
    ctx.fillText(tick.toFixed(1), plotLeft - 8, py);
  });
}

/**
 * Draw labels and title
 */
function drawLabels(ctx, cfg, conclusion) {
  ctx.fillStyle = cfg.colors.text;

  // Title
  ctx.font = `bold ${cfg.fontSize + 2}px ${cfg.fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(cfg.title, cfg.width / 2, 10);

  // X label
  ctx.font = `${cfg.fontSize}px ${cfg.fontFamily}`;
  ctx.fillText(cfg.xLabel, cfg.width / 2, cfg.height - 20);

  // Y label (rotated)
  ctx.save();
  ctx.translate(18, cfg.height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillText(cfg.yLabel, 0, 0);
  ctx.restore();

  // Conclusion box
  if (conclusion) {
    const boxX = cfg.width - cfg.padding.right - 180;
    const boxY = cfg.padding.top + 10;
    const boxW = 170;
    const boxH = 50;

    // Background
    ctx.fillStyle = conclusion.firm_evidence
      ? (conclusion.direction === 'benefit' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)')
      : 'rgba(156, 163, 175, 0.15)';
    ctx.fillRect(boxX, boxY, boxW, boxH);

    // Border
    ctx.strokeStyle = conclusion.firm_evidence
      ? (conclusion.direction === 'benefit' ? '#22c55e' : '#ef4444')
      : '#9ca3af';
    ctx.lineWidth = 1;
    ctx.strokeRect(boxX, boxY, boxW, boxH);

    // Text
    ctx.fillStyle = cfg.colors.text;
    ctx.font = `bold ${cfg.fontSize - 1}px ${cfg.fontFamily}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const status = conclusion.firm_evidence ? 'Firm Evidence' : 'Inconclusive';
    ctx.fillText(status, boxX + 8, boxY + 8);

    ctx.font = `${cfg.fontSize - 2}px ${cfg.fontFamily}`;
    const direction = conclusion.direction
      ? conclusion.direction.charAt(0).toUpperCase() + conclusion.direction.slice(1)
      : 'Continue monitoring';
    ctx.fillText(direction, boxX + 8, boxY + 28);
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
 * Export TSA chart as PNG
 */
export function exportTSAChart(canvas, filename = 'tsa-chart.png') {
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

/**
 * Create interactive TSA chart info panel
 */
export function createTSAInfoPanel(container, data) {
  const { ris, daris, information_fraction, conclusion } = data;

  const panel = document.createElement('div');
  panel.className = 'tsa-info-panel';
  panel.innerHTML = `
    <div class="tsa-info-grid">
      <div class="tsa-info-item">
        <span class="label">Required Information Size (RIS)</span>
        <span class="value">${ris.toFixed(0)}</span>
      </div>
      <div class="tsa-info-item">
        <span class="label">Diversity-adjusted RIS</span>
        <span class="value">${daris.toFixed(0)}</span>
      </div>
      <div class="tsa-info-item">
        <span class="label">Information Fraction</span>
        <span class="value">${(information_fraction * 100).toFixed(1)}%</span>
      </div>
      <div class="tsa-info-item">
        <span class="label">Conclusion</span>
        <span class="value ${conclusion.firm_evidence ? 'firm' : 'inconclusive'}">
          ${conclusion.firm_evidence ? 'Firm evidence' : 'More data needed'}
        </span>
      </div>
    </div>
    <div class="tsa-message">
      ${conclusion.message}
    </div>
  `;

  container.appendChild(panel);
  return panel;
}

/**
 * Create TSA chart component for a container
 */
export function createTSAChart(container, data, config = {}) {
  const wrapper = document.createElement('div');
  wrapper.className = 'tsa-chart-wrapper';

  const canvas = document.createElement('canvas');
  wrapper.appendChild(canvas);
  container.appendChild(wrapper);

  renderTSAChart(canvas, data, config);

  // Add info panel below chart
  const infoPanel = createTSAInfoPanel(wrapper, data);

  return {
    canvas,
    wrapper,
    infoPanel,
    update: (newData, newConfig) => {
      renderTSAChart(canvas, newData, { ...config, ...newConfig });
      // Update info panel
      infoPanel.remove();
      createTSAInfoPanel(wrapper, newData);
    },
    export: (filename) => exportTSAChart(canvas, filename),
    destroy: () => container.removeChild(wrapper)
  };
}

export default {
  renderTSAChart,
  exportTSAChart,
  createTSAChart,
  createTSAInfoPanel,
  DEFAULT_CONFIG
};
