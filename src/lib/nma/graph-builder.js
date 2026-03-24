/**
 * Network Meta-Analysis Graph Builder
 * Constructs treatment networks from study data
 *
 * @module NetworkGraph
 * @see {@link https://doi.org/10.1002/jrsm.1192|König et al. (2013) BMC Med 11:159}
 * @description Builds and analyzes treatment networks for network meta-analysis.
 *              Handles multi-arm studies, connectedness checking, and network geometry.
 */

/**
 * Treatment node in the network
 * @typedef {Object} TreatmentNode
 * @property {string} id - Treatment identifier
 * @property {string} name - Treatment name
 * @property {number} studyCount - Number of studies involving this treatment
 * @property {number} armCount - Total number of arms across all studies
 * @property {Set<string>} connectedTo - Set of directly connected treatments
 */

/**
 * Comparison edge in the network
 * @typedef {Object} ComparisonEdge
 * @property {string} treatment1 - First treatment
 * @property {string} treatment2 - Second treatment
 * @property {number} studyCount - Number of direct comparisons
 * @property {number} sampleSize - Total sample size for this comparison
 * @property {boolean} isMultiArm - Whether any study has >2 arms
 * @property {Array} studies - List of study IDs with this comparison
 */

/**
 * Network geometry types
 * @enum {string}
 */
export const NetworkGeometry = {
  STAR: 'star',           // One treatment compared to all others
  CHAIN: 'chain',         // Treatments in a linear chain
  LOOP: 'loop',           // Closed loop of comparisons
  FULL: 'full',           // All treatments directly compared
  COMPLEX: 'complex'      // Mixed geometry
};

/**
 * Treatment network graph for NMA
 */
export class NetworkGraph {
  /**
   * Create a new network graph
   * @param {Array} studies - Array of study objects
   * @param {Object} options - Configuration options
   */
  constructor(studies = [], options = {}) {
    this.studies = studies;
    this.nodes = new Map();        // treatment_id -> TreatmentNode
    this.edges = new Map();         // "t1_t2" -> ComparisonEdge
    this.multiArmStudies = [];      // Studies with >2 arms
    this.twoArmStudies = [];        // Studies with exactly 2 arms
    this.singleArmStudies = [];     // Studies with 1 arm (excluded)

    // Configuration
    this.options = {
      minStudies: 2,               // Minimum studies for a treatment
      minComparisons: 1,           // Minimum comparisons per treatment
      excludeSingleArm: true,      // Exclude studies with only 1 arm
      ...options
    };
  }

  /**
   * Build the network graph from studies
   * @returns {NetworkGraph} This graph for chaining
   */
  build() {
    // Clear existing data
    this.nodes.clear();
    this.edges.clear();
    this.multiArmStudies = [];
    this.twoArmStudies = [];
    this.singleArmStudies = [];

    // Process each study
    for (const study of this.studies) {
      this._processStudy(study);
    }

    // Build adjacency lists
    this._buildAdjacency();

    return this;
  }

  /**
   * Process a single study and add to network
   * @private
   * @param {Object} study - Study object
   */
  _processStudy(study) {
    const arms = study.arms || study.interventions || [];
    const numArms = arms.length;

    // Skip single-arm studies if configured
    if (numArms < 2 && this.options.excludeSingleArm) {
      this.singleArmStudies.push(study);
      return;
    }

    // Categorize study (add nArms property for easy access)
    if (numArms === 2) {
      const studyWithInfo = { ...study, nArms: 2 };
      this.twoArmStudies.push(studyWithInfo);
    } else if (numArms > 2) {
      const studyWithInfo = { ...study, nArms: numArms };
      this.multiArmStudies.push(studyWithInfo);
    }

    // Add treatment nodes
    const treatmentIds = [];
    for (const arm of arms) {
      const treatmentId = arm.treatment || arm.name;
      treatmentIds.push(treatmentId);

      if (!this.nodes.has(treatmentId)) {
        this.nodes.set(treatmentId, {
          id: treatmentId,
          name: arm.label || treatmentId,
          studyCount: 0,
          armCount: 0,
          connectedTo: new Set()
        });
      }

      const node = this.nodes.get(treatmentId);
      node.studyCount++;
      node.armCount += arm.sampleSize || arm.n || 0;
    }

    // Add comparison edges for all pairwise comparisons
    for (let i = 0; i < treatmentIds.length; i++) {
      for (let j = i + 1; j < treatmentIds.length; j++) {
        this._addComparison(treatmentIds[i], treatmentIds[j], study, numArms > 2);
      }
    }
  }

  /**
   * Add or update a comparison edge
   * @private
   * @param {string} t1 - First treatment ID
   * @param {string} t2 - Second treatment ID
   * @param {Object} study - Study object
   * @param {boolean} isMultiArm - Whether from multi-arm study
   */
  _addComparison(t1, t2, study, isMultiArm) {
    // Create canonical edge key (alphabetically sorted)
    const key = t1 < t2 ? `${t1}_${t2}` : `${t2}_${t1}`;

    if (!this.edges.has(key)) {
      this.edges.set(key, {
        treatment1: t1 < t2 ? t1 : t2,
        treatment2: t1 < t2 ? t2 : t1,
        studyCount: 0,
        sampleSize: 0,
        isMultiArm: false,
        studies: []
      });
    }

    const edge = this.edges.get(key);
    edge.studyCount++;
    edge.studies.push(study.id || study.nctId);
    edge.isMultiArm = edge.isMultiArm || isMultiArm;

    // Update sample size
    const arm1 = study.arms?.find(a => a.treatment === t1);
    const arm2 = study.arms?.find(a => a.treatment === t2);
    edge.sampleSize += (arm1?.sampleSize || 0) + (arm2?.sampleSize || 0);
  }

  /**
   * Build adjacency lists for connectivity analysis
   * @private
   */
  _buildAdjacency() {
    for (const [key, edge] of this.edges) {
      const { treatment1, treatment2 } = edge;

      if (this.nodes.has(treatment1)) {
        this.nodes.get(treatment1).connectedTo.add(treatment2);
      }
      if (this.nodes.has(treatment2)) {
        this.nodes.get(treatment2).connectedTo.add(treatment1);
      }
    }
  }

  /**
   * Check if the network is connected (all treatments reachable)
   * Uses BFS traversal from an arbitrary node
   * @returns {boolean} True if network is connected
   */
  isConnected() {
    if (this.nodes.size === 0) return false;
    if (this.nodes.size === 1) return true;

    // Start from first treatment
    const startNode = this.nodes.keys().next().value;
    const visited = new Set();
    const queue = [startNode];

    while (queue.length > 0) {
      const current = queue.shift();
      if (visited.has(current)) continue;

      visited.add(current);

      const node = this.nodes.get(current);
      if (node) {
        for (const neighbor of node.connectedTo) {
          if (!visited.has(neighbor)) {
            queue.push(neighbor);
          }
        }
      }
    }

    return visited.size === this.nodes.size;
  }

  /**
   * Get the network geometry
   * @returns {string} Network geometry type
   */
  getGeometry() {
    if (this.nodes.size === 0) return NetworkGeometry.COMPLEX;
    if (this.nodes.size === 1) return NetworkGeometry.FULL;
    if (this.nodes.size === 2) return NetworkGeometry.FULL;

    // Check for star geometry (one treatment compared to all others)
    const starCandidates = [];
    for (const [id, node] of this.nodes) {
      if (node.connectedTo.size === this.nodes.size - 1) {
        starCandidates.push(id);
      }
    }
    if (starCandidates.length === 1) {
      return NetworkGeometry.STAR;
    }

    // Check for full connectivity (all pairwise comparisons exist)
    const requiredEdges = (this.nodes.size * (this.nodes.size - 1)) / 2;
    if (this.edges.size === requiredEdges) {
      return NetworkGeometry.FULL;
    }

    // Check for chain (each node has at most 2 connections, no branches)
    let maxDegree = 0;
    let branchCount = 0;
    for (const [id, node] of this.nodes) {
      const degree = node.connectedTo.size;
      maxDegree = Math.max(maxDegree, degree);
      if (degree > 2) branchCount++;
    }
    if (maxDegree === 2 && branchCount === 0) {
      return NetworkGeometry.CHAIN;
    }

    // Check for loop (closed cycle exists)
    if (this._hasLoop()) {
      return NetworkGeometry.LOOP;
    }

    return NetworkGeometry.COMPLEX;
  }

  /**
   * Check if network contains a loop
   * @private
   * @returns {boolean} True if loop exists
   */
  _hasLoop() {
    // DFS to detect cycles
    const visited = new Set();
    const recStack = new Set();

    const hasCycle = (node) => {
      visited.add(node);
      recStack.add(node);

      const treatment = this.nodes.get(node);
      if (treatment) {
        for (const neighbor of treatment.connectedTo) {
          if (!visited.has(neighbor)) {
            if (hasCycle(neighbor)) return true;
          } else if (recStack.has(neighbor)) {
            return true;
          }
        }
      }

      recStack.delete(node);
      return false;
    };

    for (const nodeId of this.nodes.keys()) {
      if (!visited.has(nodeId)) {
        if (hasCycle(nodeId)) return true;
      }
    }

    return false;
  }

  /**
   * Get all treatments in the network
   * @returns {Array<TreatmentNode>} Array of treatment nodes
   */
  getTreatments() {
    return Array.from(this.nodes.values());
  }

  /**
   * Get all comparisons in the network
   * @returns {Array<ComparisonEdge>} Array of comparison edges
   */
  getComparisons() {
    return Array.from(this.edges.values());
  }

  /**
   * Get network summary statistics
   * @returns {Object} Network summary
   */
  getSummary() {
    return {
      numTreatments: this.nodes.size,
      numStudies: this.studies.length,
      numComparisons: this.edges.size,
      numMultiArmStudies: this.multiArmStudies.length,
      numTwoArmStudies: this.twoArmStudies.length,
      isConnected: this.isConnected(),
      geometry: this.getGeometry(),
      density: (2 * this.edges.size) / (this.nodes.size * (this.nodes.size - 1)) || 0
    };
  }

  /**
   * Get treatments sorted by study count
   * @returns {Array<TreatmentNode>} Sorted treatments
   */
  getTreatmentsByStudyCount() {
    return Array.from(this.nodes.values()).sort((a, b) => b.studyCount - a.studyCount);
  }

  /**
   * Get the most connected treatment (hub)
   * @returns {TreatmentNode|null} Hub treatment
   */
  getHub() {
    let maxConnections = 0;
    let hub = null;

    for (const [id, node] of this.nodes) {
      if (node.connectedTo.size > maxConnections) {
        maxConnections = node.connectedTo.size;
        hub = node;
      }
    }

    return hub;
  }

  /**
   * Check if a comparison exists between two treatments
   * @param {string} t1 - First treatment
   * @param {string} t2 - Second treatment
   * @returns {boolean} True if direct comparison exists
   */
  hasDirectComparison(t1, t2) {
    const key = t1 < t2 ? `${t1}_${t2}` : `${t2}_${t1}`;
    return this.edges.has(key);
  }

  /**
   * Get studies comparing two treatments
   * @param {string} t1 - First treatment
   * @param {string} t2 - Second treatment
   * @returns {Array} Array of study IDs
   */
  getStudiesForComparison(t1, t2) {
    const key = t1 < t2 ? `${t1}_${t2}` : `${t2}_${t1}`;
    const edge = this.edges.get(key);
    return edge ? edge.studies : [];
  }

  /**
   * Find disconnected components in the network
   * @returns {Array<Array<string>>} Array of components (each is array of treatment IDs)
   */
  getDisconnectedComponents() {
    const visited = new Set();
    const components = [];

    for (const nodeId of this.nodes.keys()) {
      if (visited.has(nodeId)) continue;

      const component = [];
      const queue = [nodeId];

      while (queue.length > 0) {
        const current = queue.shift();
        if (visited.has(current)) continue;

        visited.add(current);
        component.push(current);

        const node = this.nodes.get(current);
        if (node) {
          for (const neighbor of node.connectedTo) {
            if (!visited.has(neighbor)) {
              queue.push(neighbor);
            }
          }
        }
      }

      if (component.length > 0) {
        components.push(component);
      }
    }

    return components;
  }

  /**
   * Export network as JSON for visualization
   * @returns {Object} Network in D3-compatible format
   */
  exportToD3() {
    const nodes = Array.from(this.nodes.values()).map(n => ({
      id: n.id,
      name: n.name,
      group: 1,
      size: n.studyCount
    }));

    const links = Array.from(this.edges.values()).map(e => ({
      source: e.treatment1,
      target: e.treatment2,
      value: e.studyCount,
      studies: e.studyCount
    }));

    return { nodes, links };
  }

  /**
   * Validate network for NMA assumptions
   * @returns {Object} Validation results
   */
  validate() {
    const issues = [];
    const warnings = [];

    // Check connectedness
    if (!this.isConnected()) {
      const components = this.getDisconnectedComponents();
      issues.push(`Network is not connected. Found ${components.length} disconnected components.`);
    }

    // Check for star network (transitivity may be violated)
    if (this.getGeometry() === NetworkGeometry.STAR) {
      warnings.push('Star network detected: transitivity assumption may be violated.');
    }

    // Check for multi-arm studies
    if (this.multiArmStudies.length > 0) {
      warnings.push(`Network contains ${this.multiArmStudies.length} multi-arm studies. Correlated effects must be handled.`);
    }

    // Check minimum sample sizes
    const smallComparisons = Array.from(this.edges.values()).filter(e => e.sampleSize < 100);
    if (smallComparisons.length > 0) {
      warnings.push(`${smallComparisons.length} comparisons have small sample sizes (<100).`);
    }

    return {
      isValid: issues.length === 0,
      issues,
      warnings,
      summary: this.getSummary()
    };
  }
}

/**
 * Build a network graph from studies
 * @param {Array} studies - Array of study objects
 * @param {Object} options - Configuration options
 * @returns {NetworkGraph} Built network graph
 */
export function buildNetworkGraph(studies, options = {}) {
  const graph = new NetworkGraph(studies, options);
  return graph.build();
}

/**
 * Create a contrast matrix from network
 * @param {NetworkGraph} graph - Network graph
 * @returns {Array<Array>} Contrast matrix for NMA
 */
export function createContrastMatrix(graph) {
  const treatments = graph.getTreatments();
  const n = treatments.length;
  const matrix = Array(n).fill(null).map(() => Array(n).fill(0));

  // Map treatment IDs to indices
  const treatmentIndex = new Map();
  treatments.forEach((t, i) => treatmentIndex.set(t.id, i));

  // Fill matrix with comparison counts
  for (const [key, edge] of graph.edges) {
    const i = treatmentIndex.get(edge.treatment1);
    const j = treatmentIndex.get(edge.treatment2);
    matrix[i][j] = edge.studyCount;
    matrix[j][i] = edge.studyCount;
  }

  return matrix;
}

export default {
  NetworkGraph,
  buildNetworkGraph,
  createContrastMatrix,
  NetworkGeometry
};
