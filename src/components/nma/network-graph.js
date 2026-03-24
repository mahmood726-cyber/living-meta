/**
 * Network Graph Component for Network Meta-Analysis
 * Force-directed graph visualization showing treatment comparisons
 */

/**
 * Default configuration for network graph
 */
const DEFAULT_CONFIG = {
  width: 700,
  height: 600,
  padding: 40,
  fontSize: 12,
  fontFamily: 'system-ui, -apple-system, sans-serif',
  colors: {
    node: '#3b82f6',
    nodeReference: '#10b981',
    nodeHighlight: '#f59e0b',
    nodeStroke: '#ffffff',
    edge: '#94a3b8',
    edgeDirect: '#3b82f6',
    edgeIndirect: '#f59e0b',
    edgeHighlight: '#ef4444',
    text: '#111827',
    background: '#ffffff',
    gridLine: '#f3f4f6'
  },
  nodeMinSize: 20,
  nodeMaxSize: 50,
  edgeMinWidth: 1,
  edgeMaxWidth: 8,
  simulation: {
    chargeStrength: -400,
    linkDistance: 150,
    centerStrength: 0.1,
    collisionRadius: 60
  },
  showStudyCount: true,
  showEdgeLabels: true,
  interactive: true,
  title: 'Network of Treatment Comparisons'
};

/**
 * Force simulation for node layout
 */
class ForceSimulation {
  constructor(nodes, edges, config) {
    this.nodes = nodes.map(n => ({
      ...n,
      x: config.width / 2 + (Math.random() - 0.5) * 200,
      y: config.height / 2 + (Math.random() - 0.5) * 200,
      vx: 0,
      vy: 0
    }));
    this.edges = edges;
    this.config = config;
    this.alpha = 1;
    this.alphaDecay = 0.02;
    this.alphaMin = 0.001;
  }

  tick() {
    if (this.alpha < this.alphaMin) return false;

    const { chargeStrength, linkDistance, centerStrength, collisionRadius } = this.config.simulation;
    const centerX = this.config.width / 2;
    const centerY = this.config.height / 2;

    // Reset velocities
    this.nodes.forEach(n => {
      n.vx = 0;
      n.vy = 0;
    });

    // Charge (repulsion)
    for (let i = 0; i < this.nodes.length; i++) {
      for (let j = i + 1; j < this.nodes.length; j++) {
        const n1 = this.nodes[i];
        const n2 = this.nodes[j];
        const dx = n2.x - n1.x;
        const dy = n2.y - n1.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = chargeStrength / (dist * dist);

        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        n1.vx -= fx;
        n1.vy -= fy;
        n2.vx += fx;
        n2.vy += fy;
      }
    }

    // Link force (attraction)
    const nodeMap = new Map(this.nodes.map(n => [n.id, n]));
    this.edges.forEach(edge => {
      const source = nodeMap.get(edge.treatment1);
      const target = nodeMap.get(edge.treatment2);
      if (!source || !target) return;

      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = (dist - linkDistance) * 0.1;

      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;

      source.vx += fx;
      source.vy += fy;
      target.vx -= fx;
      target.vy -= fy;
    });

    // Center gravity
    this.nodes.forEach(n => {
      n.vx += (centerX - n.x) * centerStrength;
      n.vy += (centerY - n.y) * centerStrength;
    });

    // Collision avoidance
    for (let i = 0; i < this.nodes.length; i++) {
      for (let j = i + 1; j < this.nodes.length; j++) {
        const n1 = this.nodes[i];
        const n2 = this.nodes[j];
        const dx = n2.x - n1.x;
        const dy = n2.y - n1.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = collisionRadius;

        if (dist < minDist && dist > 0) {
          const force = (minDist - dist) / dist * 0.5;
          const fx = dx * force;
          const fy = dy * force;

          n1.vx -= fx;
          n1.vy -= fy;
          n2.vx += fx;
          n2.vy += fy;
        }
      }
    }

    // Apply velocities with damping
    this.nodes.forEach(n => {
      n.x += n.vx * this.alpha;
      n.y += n.vy * this.alpha;

      // Boundary constraints
      const pad = this.config.padding + 30;
      n.x = Math.max(pad, Math.min(this.config.width - pad, n.x));
      n.y = Math.max(pad, Math.min(this.config.height - pad, n.y));
    });

    this.alpha -= this.alphaDecay;
    return true;
  }

  run(iterations = 300) {
    for (let i = 0; i < iterations && this.alpha >= this.alphaMin; i++) {
      this.tick();
    }
    return this.nodes;
  }
}

/**
 * Render network graph to canvas
 */
export function renderNetworkGraph(canvas, data, config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const ctx = canvas.getContext('2d');

  const { treatments, comparisons } = data;

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

  // Calculate node sizes based on total studies
  const studyCounts = new Map();
  treatments.forEach(t => studyCounts.set(t.id, 0));
  comparisons.forEach(c => {
    studyCounts.set(c.treatment1, (studyCounts.get(c.treatment1) || 0) + c.num_studies);
    studyCounts.set(c.treatment2, (studyCounts.get(c.treatment2) || 0) + c.num_studies);
  });

  const maxStudies = Math.max(...studyCounts.values(), 1);

  // Create nodes with sizes
  const nodes = treatments.map(t => ({
    ...t,
    studyCount: studyCounts.get(t.id) || 0,
    size: cfg.nodeMinSize + ((studyCounts.get(t.id) || 0) / maxStudies) * (cfg.nodeMaxSize - cfg.nodeMinSize)
  }));

  // Calculate edge widths
  const maxEdgeStudies = Math.max(...comparisons.map(c => c.num_studies), 1);
  const edges = comparisons.map(c => ({
    ...c,
    width: cfg.edgeMinWidth + (c.num_studies / maxEdgeStudies) * (cfg.edgeMaxWidth - cfg.edgeMinWidth)
  }));

  // Run force simulation
  const simulation = new ForceSimulation(nodes, edges, cfg);
  const positionedNodes = simulation.run();

  // Create node position map
  const nodeMap = new Map(positionedNodes.map(n => [n.id, n]));

  // Draw edges
  drawEdges(ctx, edges, nodeMap, cfg);

  // Draw nodes
  drawNodes(ctx, positionedNodes, cfg);

  // Draw title
  drawTitle(ctx, cfg);

  // Store node positions for interactivity
  canvas._networkData = { nodes: positionedNodes, edges, nodeMap };
}

/**
 * Draw network edges
 */
function drawEdges(ctx, edges, nodeMap, cfg) {
  edges.forEach(edge => {
    const source = nodeMap.get(edge.treatment1);
    const target = nodeMap.get(edge.treatment2);
    if (!source || !target) return;

    ctx.strokeStyle = cfg.colors.edge;
    ctx.lineWidth = edge.width;
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(source.x, source.y);
    ctx.lineTo(target.x, target.y);
    ctx.stroke();

    // Edge label (study count)
    if (cfg.showEdgeLabels) {
      const midX = (source.x + target.x) / 2;
      const midY = (source.y + target.y) / 2;

      // Background for label
      ctx.fillStyle = cfg.colors.background;
      const label = `${edge.num_studies}`;
      ctx.font = `${cfg.fontSize - 2}px ${cfg.fontFamily}`;
      const metrics = ctx.measureText(label);
      const pad = 3;
      ctx.fillRect(
        midX - metrics.width / 2 - pad,
        midY - cfg.fontSize / 2 - pad,
        metrics.width + pad * 2,
        cfg.fontSize + pad * 2
      );

      // Label text
      ctx.fillStyle = cfg.colors.text;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, midX, midY);
    }
  });
}

/**
 * Draw network nodes
 */
function drawNodes(ctx, nodes, cfg) {
  nodes.forEach(node => {
    // Node circle
    const color = node.is_reference ? cfg.colors.nodeReference : cfg.colors.node;

    // Shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.size / 2, 0, Math.PI * 2);
    ctx.fill();

    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Border
    ctx.strokeStyle = cfg.colors.nodeStroke;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Node label
    ctx.fillStyle = cfg.colors.text;
    ctx.font = `bold ${cfg.fontSize}px ${cfg.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Truncate long names
    let label = node.name || node.id;
    if (label.length > 12) {
      label = label.substring(0, 10) + '...';
    }
    ctx.fillText(label, node.x, node.y);

    // Study count below
    if (cfg.showStudyCount) {
      ctx.font = `${cfg.fontSize - 2}px ${cfg.fontFamily}`;
      ctx.fillStyle = '#6b7280';
      ctx.fillText(`(${node.studyCount})`, node.x, node.y + node.size / 2 + 12);
    }
  });
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
 * Add interactivity to network graph
 */
function addInteractivity(canvas, container, cfg, onNodeClick) {
  let hoveredNode = null;
  let tooltip = null;

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const data = canvas._networkData;
    if (!data) return;

    // Find hovered node
    let found = null;
    for (const node of data.nodes) {
      const dist = Math.sqrt((x - node.x) ** 2 + (y - node.y) ** 2);
      if (dist < node.size / 2) {
        found = node;
        break;
      }
    }

    if (found !== hoveredNode) {
      hoveredNode = found;
      canvas.style.cursor = found ? 'pointer' : 'default';

      // Update tooltip
      if (tooltip) {
        tooltip.remove();
        tooltip = null;
      }

      if (found) {
        tooltip = document.createElement('div');
        tooltip.className = 'network-tooltip';
        tooltip.innerHTML = `
          <strong>${found.name || found.id}</strong><br>
          Studies: ${found.studyCount}
          ${found.is_reference ? '<br><em>(Reference)</em>' : ''}
        `;
        tooltip.style.cssText = `
          position: absolute;
          left: ${e.clientX + 10}px;
          top: ${e.clientY + 10}px;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          padding: 8px 12px;
          font-size: 12px;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          z-index: 1000;
          pointer-events: none;
        `;
        document.body.appendChild(tooltip);
      }
    }
  });

  canvas.addEventListener('mouseleave', () => {
    hoveredNode = null;
    canvas.style.cursor = 'default';
    if (tooltip) {
      tooltip.remove();
      tooltip = null;
    }
  });

  canvas.addEventListener('click', (e) => {
    if (hoveredNode && onNodeClick) {
      onNodeClick(hoveredNode);
    }
  });
}

/**
 * Export network graph as PNG
 */
export function exportNetworkGraph(canvas, filename = 'network-graph.png') {
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

/**
 * Create network statistics panel
 */
export function createNetworkStats(container, data) {
  const { treatments, comparisons, is_connected, num_loops } = data;

  const totalStudies = comparisons.reduce((sum, c) => sum + c.num_studies, 0);
  const avgStudiesPerComp = comparisons.length > 0 ? (totalStudies / comparisons.length).toFixed(1) : 0;

  const panel = document.createElement('div');
  panel.className = 'network-stats-panel';
  panel.innerHTML = `
    <div class="experimental-banner" style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 6px; padding: 12px; margin-bottom: 16px;">
      <strong style="color: #92400e;">⚠️ EXPERIMENTAL</strong>
      <p style="margin: 8px 0 0; font-size: 13px; color: #78350f;">
        This NMA implementation has not been validated against netmeta or other established software.
        For publication-quality analyses, use validated NMA software.
      </p>
    </div>
    <div class="network-stats-grid">
      <div class="stat-item">
        <span class="label">Treatments</span>
        <span class="value">${treatments.length}</span>
      </div>
      <div class="stat-item">
        <span class="label">Comparisons</span>
        <span class="value">${comparisons.length}</span>
      </div>
      <div class="stat-item">
        <span class="label">Total Studies</span>
        <span class="value">${totalStudies}</span>
      </div>
      <div class="stat-item">
        <span class="label">Connected</span>
        <span class="value ${is_connected ? 'yes' : 'no'}">${is_connected ? 'Yes' : 'No'}</span>
      </div>
      <div class="stat-item">
        <span class="label">Closed Loops</span>
        <span class="value">${num_loops}</span>
      </div>
      <div class="stat-item">
        <span class="label">Avg Studies/Comparison</span>
        <span class="value">${avgStudiesPerComp}</span>
      </div>
    </div>
    ${!is_connected ? '<div class="warning">⚠️ Network is disconnected. NMA results may be unreliable.</div>' : ''}
    ${num_loops === 0 ? '<div class="warning">⚠️ No closed loops. Cannot assess inconsistency.</div>' : ''}
  `;

  container.appendChild(panel);
  return panel;
}

/**
 * Create network graph component
 */
export function createNetworkGraph(container, data, config = {}, onNodeClick = null) {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const wrapper = document.createElement('div');
  wrapper.className = 'network-graph-wrapper';

  const canvas = document.createElement('canvas');
  wrapper.appendChild(canvas);

  // Stats panel
  const statsPanel = createNetworkStats(wrapper, data);

  container.appendChild(wrapper);

  renderNetworkGraph(canvas, data, cfg);

  if (cfg.interactive) {
    addInteractivity(canvas, container, cfg, onNodeClick);
  }

  return {
    canvas,
    wrapper,
    statsPanel,
    update: (newData, newConfig) => {
      renderNetworkGraph(canvas, newData, { ...cfg, ...newConfig });
      statsPanel.remove();
      createNetworkStats(wrapper, newData);
    },
    export: (filename) => exportNetworkGraph(canvas, filename),
    destroy: () => {
      const tooltips = document.querySelectorAll('.network-tooltip');
      tooltips.forEach(t => t.remove());
      container.removeChild(wrapper);
    }
  };
}

export default {
  renderNetworkGraph,
  exportNetworkGraph,
  createNetworkGraph,
  createNetworkStats,
  DEFAULT_CONFIG
};
