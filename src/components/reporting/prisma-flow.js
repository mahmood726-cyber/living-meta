/**
 * PRISMA Flow Diagram Component
 * Generates PRISMA 2020 compliant flow diagram for systematic reviews
 */

/**
 * Default configuration for PRISMA flow diagram
 */
const DEFAULT_CONFIG = {
  width: 900,
  height: 800,
  padding: 30,
  fontSize: 11,
  fontFamily: 'system-ui, -apple-system, sans-serif',
  colors: {
    box: '#ffffff',
    boxStroke: '#374151',
    boxHeader: '#f3f4f6',
    arrow: '#374151',
    text: '#111827',
    textSecondary: '#6b7280',
    background: '#ffffff',
    highlight: '#dbeafe',
    excluded: '#fef2f2',
    included: '#dcfce7'
  },
  boxWidth: 180,
  boxMinHeight: 60,
  arrowWidth: 2,
  cornerRadius: 6,
  title: 'PRISMA 2020 Flow Diagram'
};

/**
 * PRISMA flow data structure
 * @typedef {object} PRISMAData
 * @property {number} identified_database - Records from databases
 * @property {number} identified_registers - Records from registers
 * @property {number} identified_other - Records from other sources
 * @property {number} duplicates_removed - Duplicates removed
 * @property {number} automation_excluded - Excluded by automation tools
 * @property {number} screened - Records screened
 * @property {number} screened_excluded - Excluded at screening
 * @property {number} sought_retrieval - Reports sought for retrieval
 * @property {number} not_retrieved - Reports not retrieved
 * @property {number} assessed_eligibility - Reports assessed for eligibility
 * @property {number} excluded_total - Total excluded with reasons
 * @property {object} excluded_reasons - Breakdown by reason
 * @property {number} included_studies - Studies included in review
 * @property {number} included_reports - Reports included
 * @property {number} included_meta - Studies in meta-analysis
 */

/**
 * Render PRISMA flow diagram to canvas
 * @param {HTMLCanvasElement} canvas - Target canvas element
 * @param {PRISMAData} data - PRISMA flow data
 * @param {object} config - Diagram configuration
 */
export function renderPRISMAFlow(canvas, data, config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const ctx = canvas.getContext('2d');

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

  // Draw title
  drawTitle(ctx, cfg);

  // Calculate positions
  const layout = calculateLayout(data, cfg);

  // Draw arrows first (behind boxes)
  drawArrows(ctx, layout, cfg);

  // Draw boxes
  drawBoxes(ctx, layout, data, cfg);
}

/**
 * Calculate box layout positions
 */
function calculateLayout(data, cfg) {
  const centerX = cfg.width / 2;
  const boxW = cfg.boxWidth;

  // Vertical spacing
  const startY = cfg.padding + 50;
  const rowGap = 100;

  const layout = {
    // Identification section
    identification: {
      x: centerX - boxW - 40,
      y: startY,
      width: boxW * 2 + 40,
      height: 80,
      label: 'Identification'
    },
    database: {
      x: centerX - boxW - 20,
      y: startY + 20,
      width: boxW,
      height: 60
    },
    other: {
      x: centerX + 20,
      y: startY + 20,
      width: boxW,
      height: 60
    },

    // Duplicates removed
    duplicates: {
      x: centerX - boxW / 2,
      y: startY + rowGap,
      width: boxW,
      height: 50
    },

    // Screening section
    screened: {
      x: centerX - boxW - 40,
      y: startY + rowGap * 2,
      width: boxW,
      height: 50
    },
    screenedExcluded: {
      x: centerX + 40,
      y: startY + rowGap * 2,
      width: boxW,
      height: 50
    },

    // Retrieval section
    retrieval: {
      x: centerX - boxW - 40,
      y: startY + rowGap * 3,
      width: boxW,
      height: 50
    },
    notRetrieved: {
      x: centerX + 40,
      y: startY + rowGap * 3,
      width: boxW,
      height: 50
    },

    // Eligibility section
    eligibility: {
      x: centerX - boxW - 40,
      y: startY + rowGap * 4,
      width: boxW,
      height: 50
    },
    excluded: {
      x: centerX + 40,
      y: startY + rowGap * 4,
      width: boxW,
      height: calculateExcludedBoxHeight(data, cfg)
    },

    // Included section
    included: {
      x: centerX - boxW / 2,
      y: startY + rowGap * 5.5,
      width: boxW,
      height: 70
    }
  };

  return layout;
}

/**
 * Calculate excluded box height based on reasons
 */
function calculateExcludedBoxHeight(data, cfg) {
  const reasonCount = data.excluded_reasons ? Object.keys(data.excluded_reasons).length : 0;
  return Math.max(80, 50 + reasonCount * 18);
}

/**
 * Draw arrows connecting boxes
 */
function drawArrows(ctx, layout, cfg) {
  ctx.strokeStyle = cfg.colors.arrow;
  ctx.fillStyle = cfg.colors.arrow;
  ctx.lineWidth = cfg.arrowWidth;

  // Database -> Duplicates
  drawArrow(ctx,
    layout.database.x + layout.database.width / 2,
    layout.database.y + layout.database.height,
    layout.duplicates.x + layout.duplicates.width / 2,
    layout.duplicates.y
  );

  // Other -> Duplicates
  drawArrow(ctx,
    layout.other.x + layout.other.width / 2,
    layout.other.y + layout.other.height,
    layout.duplicates.x + layout.duplicates.width / 2,
    layout.duplicates.y
  );

  // Duplicates -> Screened
  drawArrow(ctx,
    layout.duplicates.x + layout.duplicates.width / 2,
    layout.duplicates.y + layout.duplicates.height,
    layout.screened.x + layout.screened.width / 2,
    layout.screened.y
  );

  // Screened -> Excluded (horizontal)
  drawArrow(ctx,
    layout.screened.x + layout.screened.width,
    layout.screened.y + layout.screened.height / 2,
    layout.screenedExcluded.x,
    layout.screenedExcluded.y + layout.screenedExcluded.height / 2
  );

  // Screened -> Retrieval
  drawArrow(ctx,
    layout.screened.x + layout.screened.width / 2,
    layout.screened.y + layout.screened.height,
    layout.retrieval.x + layout.retrieval.width / 2,
    layout.retrieval.y
  );

  // Retrieval -> Not Retrieved (horizontal)
  drawArrow(ctx,
    layout.retrieval.x + layout.retrieval.width,
    layout.retrieval.y + layout.retrieval.height / 2,
    layout.notRetrieved.x,
    layout.notRetrieved.y + layout.notRetrieved.height / 2
  );

  // Retrieval -> Eligibility
  drawArrow(ctx,
    layout.retrieval.x + layout.retrieval.width / 2,
    layout.retrieval.y + layout.retrieval.height,
    layout.eligibility.x + layout.eligibility.width / 2,
    layout.eligibility.y
  );

  // Eligibility -> Excluded (horizontal)
  drawArrow(ctx,
    layout.eligibility.x + layout.eligibility.width,
    layout.eligibility.y + layout.eligibility.height / 2,
    layout.excluded.x,
    layout.excluded.y + 25
  );

  // Eligibility -> Included
  drawArrow(ctx,
    layout.eligibility.x + layout.eligibility.width / 2,
    layout.eligibility.y + layout.eligibility.height,
    layout.included.x + layout.included.width / 2,
    layout.included.y
  );
}

/**
 * Draw a single arrow
 */
function drawArrow(ctx, x1, y1, x2, y2) {
  const headLength = 10;
  const angle = Math.atan2(y2 - y1, x2 - x1);

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  // Arrowhead
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - headLength * Math.cos(angle - Math.PI / 6),
    y2 - headLength * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    x2 - headLength * Math.cos(angle + Math.PI / 6),
    y2 - headLength * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
}

/**
 * Draw all boxes
 */
function drawBoxes(ctx, layout, data, cfg) {
  // Database sources
  drawBox(ctx, layout.database, {
    header: 'Databases (n=' + (data.identified_database || 0) + ')',
    content: 'ClinicalTrials.gov',
    color: cfg.colors.box
  }, cfg);

  // Other sources
  drawBox(ctx, layout.other, {
    header: 'Registers (n=' + (data.identified_registers || 0) + ')',
    content: 'Other sources: ' + (data.identified_other || 0),
    color: cfg.colors.box
  }, cfg);

  // Duplicates removed
  drawBox(ctx, layout.duplicates, {
    header: 'Duplicates removed',
    content: 'n=' + (data.duplicates_removed || 0),
    color: cfg.colors.excluded
  }, cfg);

  // Screened
  drawBox(ctx, layout.screened, {
    header: 'Records screened',
    content: 'n=' + (data.screened || 0),
    color: cfg.colors.box
  }, cfg);

  // Screened excluded
  drawBox(ctx, layout.screenedExcluded, {
    header: 'Records excluded',
    content: 'n=' + (data.screened_excluded || 0),
    color: cfg.colors.excluded
  }, cfg);

  // Retrieval
  drawBox(ctx, layout.retrieval, {
    header: 'Reports sought',
    content: 'n=' + (data.sought_retrieval || 0),
    color: cfg.colors.box
  }, cfg);

  // Not retrieved
  drawBox(ctx, layout.notRetrieved, {
    header: 'Not retrieved',
    content: 'n=' + (data.not_retrieved || 0),
    color: cfg.colors.excluded
  }, cfg);

  // Eligibility
  drawBox(ctx, layout.eligibility, {
    header: 'Reports assessed',
    content: 'n=' + (data.assessed_eligibility || 0),
    color: cfg.colors.box
  }, cfg);

  // Excluded with reasons
  const excludedContent = buildExcludedContent(data);
  drawBox(ctx, layout.excluded, {
    header: 'Reports excluded',
    content: excludedContent,
    color: cfg.colors.excluded
  }, cfg);

  // Included
  drawBox(ctx, layout.included, {
    header: 'Studies included',
    content: `Studies: ${data.included_studies || 0}\nReports: ${data.included_reports || data.included_studies || 0}\nIn meta-analysis: ${data.included_meta || data.included_studies || 0}`,
    color: cfg.colors.included
  }, cfg);

  // Section labels
  drawSectionLabels(ctx, layout, cfg);
}

/**
 * Build excluded reasons content
 */
function buildExcludedContent(data) {
  let content = 'n=' + (data.excluded_total || 0);

  if (data.excluded_reasons) {
    Object.entries(data.excluded_reasons).forEach(([reason, count]) => {
      content += `\n${reason}: ${count}`;
    });
  }

  return content;
}

/**
 * Draw a single box
 */
function drawBox(ctx, box, content, cfg) {
  const { x, y, width, height } = box;
  const r = cfg.cornerRadius;

  // Background
  ctx.fillStyle = content.color || cfg.colors.box;
  ctx.strokeStyle = cfg.colors.boxStroke;
  ctx.lineWidth = 1;

  // Rounded rectangle
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();

  ctx.fill();
  ctx.stroke();

  // Header (if present)
  let textY = y + 15;
  if (content.header) {
    ctx.fillStyle = cfg.colors.text;
    ctx.font = `bold ${cfg.fontSize}px ${cfg.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(content.header, x + width / 2, textY);
    textY += 18;
  }

  // Content
  if (content.content) {
    ctx.fillStyle = cfg.colors.textSecondary;
    ctx.font = `${cfg.fontSize - 1}px ${cfg.fontFamily}`;

    const lines = content.content.split('\n');
    lines.forEach(line => {
      ctx.fillText(line, x + width / 2, textY);
      textY += 14;
    });
  }
}

/**
 * Draw section labels
 */
function drawSectionLabels(ctx, layout, cfg) {
  ctx.fillStyle = cfg.colors.textSecondary;
  ctx.font = `bold ${cfg.fontSize}px ${cfg.fontFamily}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  // Identification
  ctx.save();
  ctx.translate(cfg.padding, layout.database.y + layout.database.height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Identification', 0, 0);
  ctx.restore();

  // Screening
  ctx.save();
  ctx.translate(cfg.padding, layout.screened.y + layout.screened.height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Screening', 0, 0);
  ctx.restore();

  // Included
  ctx.save();
  ctx.translate(cfg.padding, layout.included.y + layout.included.height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Included', 0, 0);
  ctx.restore();
}

/**
 * Draw title
 */
function drawTitle(ctx, cfg) {
  ctx.fillStyle = cfg.colors.text;
  ctx.font = `bold ${cfg.fontSize + 4}px ${cfg.fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(cfg.title, cfg.width / 2, cfg.padding);
}

/**
 * Export PRISMA flow as PNG
 */
export function exportPRISMAFlow(canvas, filename = 'prisma-flow.png') {
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

/**
 * Generate PRISMA data from project screening state
 */
export function generatePRISMAData(project) {
  // Safety check for undefined project
  if (!project) {
    return {
      totalIdentified: 0,
      duplicatesRemoved: 0,
      screened: 0,
      screenedExcluded: 0,
      soughtForRetrieval: 0,
      notRetrieved: 0,
      assessed: 0,
      assessedExcluded: 0,
      included: 0,
      excludedReasons: {}
    };
  }
  const { searchRuns, records, screeningDecisions } = project;

  // Count from search runs
  const totalIdentified = searchRuns?.reduce((sum, run) => sum + (run.totalFound || 0), 0) || 0;

  // Count unique records
  const uniqueRecords = new Set(records?.map(r => r.nctId) || []);
  const duplicatesRemoved = totalIdentified - uniqueRecords.size;

  // Count screening outcomes
  let screened = 0;
  let screenedExcluded = 0;
  let included = 0;

  const excludedReasons = {};

  screeningDecisions?.forEach(decision => {
    screened++;
    if (decision.decision === 'exclude') {
      screenedExcluded++;
      const reason = decision.reason || 'Other';
      excludedReasons[reason] = (excludedReasons[reason] || 0) + 1;
    } else if (decision.decision === 'include') {
      included++;
    }
  });

  return {
    identified_database: totalIdentified,
    identified_registers: 0,
    identified_other: 0,
    duplicates_removed: duplicatesRemoved,
    automation_excluded: 0,
    screened: screened || uniqueRecords.size,
    screened_excluded: screenedExcluded,
    sought_retrieval: included,
    not_retrieved: 0,
    assessed_eligibility: included,
    excluded_total: screenedExcluded,
    excluded_reasons: excludedReasons,
    included_studies: included,
    included_reports: included,
    included_meta: included
  };
}

/**
 * Create PRISMA flow component
 */
export function createPRISMAFlow(container, data, config = {}) {
  const wrapper = document.createElement('div');
  wrapper.className = 'prisma-flow-wrapper';
  wrapper.style.cssText = 'text-align: center; overflow: auto;';

  const canvas = document.createElement('canvas');
  wrapper.appendChild(canvas);

  container.appendChild(wrapper);

  renderPRISMAFlow(canvas, data, config);

  return {
    canvas,
    wrapper,
    update: (newData, newConfig) => renderPRISMAFlow(canvas, newData, { ...config, ...newConfig }),
    export: (filename) => exportPRISMAFlow(canvas, filename),
    getData: () => data,
    destroy: () => container.removeChild(wrapper)
  };
}

export default {
  renderPRISMAFlow,
  exportPRISMAFlow,
  generatePRISMAData,
  createPRISMAFlow,
  DEFAULT_CONFIG
};
