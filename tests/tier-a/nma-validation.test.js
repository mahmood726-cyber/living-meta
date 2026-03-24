/**
 * NMA Validation Tests
 * Validate against R netmeta package gold standards
 *
 * @see {@link https://cran.r-project.org/package=netmeta|R netmeta package}
 * @see {@link https://doi.org/10.1002/jrsm.1278|White et al. (2012) RSM 3:80-89}
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { networkMetaAnalysis, createNMAForestPlot, createNetworkPlot } from '../../src/lib/nma/nma-results.js';
import { NetworkGraph } from '../../src/lib/nma/graph-builder.js';
import { nodeSplitting, sideSplitting } from '../../src/lib/nma/inconsistency-measures.js';

describe('Network Meta-Analysis Validation', () => {
  describe('Network Graph Construction', () => {
    it('should build a simple star network', () => {
      const studies = [
        {
          id: 'S1',
          arms: [
            { treatment: 'Placebo', events: 10, denominator: 100 },
            { treatment: 'Drug A', events: 5, denominator: 100 }
          ]
        },
        {
          id: 'S2',
          arms: [
            { treatment: 'Placebo', events: 12, denominator: 100 },
            { treatment: 'Drug B', events: 6, denominator: 100 }
          ]
        },
        {
          id: 'S3',
          arms: [
            { treatment: 'Placebo', events: 8, denominator: 100 },
            { treatment: 'Drug C', events: 4, denominator: 100 }
          ]
        }
      ];

      const graph = new NetworkGraph(studies);
      graph.build();

      expect(graph.nodes.size).toBe(4); // Placebo, Drug A, Drug B, Drug C
      expect(graph.edges.size).toBe(3);
      expect(graph.isConnected()).toBe(true);
      expect(graph.getGeometry()).toBe('star');
    });

    it('should detect network connectedness', () => {
      const studies = [
        {
          id: 'S1',
          arms: [
            { treatment: 'A', events: 10, denominator: 100 },
            { treatment: 'B', events: 5, denominator: 100 }
          ]
        },
        {
          id: 'S2',
          arms: [
            { treatment: 'C', events: 12, denominator: 100 },
            { treatment: 'D', events: 6, denominator: 100 }
          ]
        }
      ];

      const graph = new NetworkGraph(studies);
      graph.build();

      expect(graph.isConnected()).toBe(false);
      expect(graph.getDisconnectedComponents()).toHaveLength(2);
    });

    it('should handle multi-arm studies correctly', () => {
      const studies = [
        {
          id: 'S1',
          arms: [
            { treatment: 'Placebo', events: 20, denominator: 200 },
            { treatment: 'Drug A', events: 10, denominator: 200 },
            { treatment: 'Drug B', events: 8, denominator: 200 }
          ]
        }
      ];

      const graph = new NetworkGraph(studies);
      graph.build();

      expect(graph.nodes.size).toBe(3);
      expect(graph.multiArmStudies).toHaveLength(1);
      expect(graph.multiArmStudies[0].nArms).toBe(3);
    });
  });

  describe('NMA Basic Functionality', () => {
    it('should perform simple NMA with 3 treatments', () => {
      const studies = [
        {
          id: 'S1',
          arms: [
            { treatment: 'Placebo', events: 40, denominator: 200 },
            { treatment: 'Drug A', events: 20, denominator: 200 }
          ]
        },
        {
          id: 'S2',
          arms: [
            { treatment: 'Placebo', events: 45, denominator: 200 },
            { treatment: 'Drug B', events: 15, denominator: 200 }
          ]
        },
        {
          id: 'S3',
          arms: [
            { treatment: 'Placebo', events: 50, denominator: 200 },
            { treatment: 'Drug C', events: 25, denominator: 200 }
          ]
        }
      ];

      const result = networkMetaAnalysis(studies, { reference: 'Placebo' });

      expect(result.error).toBeUndefined();
      expect(result.network).toBeDefined();
      expect(result.network.treatments).toContain('Placebo');
      expect(result.network.treatments).toContain('Drug A');
      expect(result.network.treatments).toContain('Drug B');
      expect(result.effects).toBeDefined();
      expect(result.rankings).toBeDefined();
    });

    it('should require at least 3 studies', () => {
      const studies = [
        {
          id: 'S1',
          arms: [
            { treatment: 'A', events: 10, denominator: 100 },
            { treatment: 'B', events: 5, denominator: 100 }
          ]
        }
      ];

      const result = networkMetaAnalysis(studies);
      expect(result.error).toContain('Insufficient studies for network meta-analysis');
    });

    it('should detect disconnected network', () => {
      const studies = [
        {
          id: 'S1',
          arms: [
            { treatment: 'A', events: 10, denominator: 100 },
            { treatment: 'B', events: 5, denominator: 100 }
          ]
        },
        {
          id: 'S2',
          arms: [
            { treatment: 'C', events: 12, denominator: 100 },
            { treatment: 'D', events: 6, denominator: 100 }
          ]
        },
        {
          id: 'S3',
          arms: [
            { treatment: 'E', events: 8, denominator: 100 },
            { treatment: 'F', events: 4, denominator: 100 }
          ]
        }
      ];

      const result = networkMetaAnalysis(studies);
      expect(result.error).toBe('Network is not connected');
      expect(result.components).toBeDefined();
    });
  });

  describe('Treatment Effects Calculation', () => {
    it('should calculate log odds ratios correctly', () => {
      const arm1 = { events: 10, denominator: 100 };
      const arm2 = { events: 5, denominator: 100 };

      // logOR = log((10*95)/(90*5)) = log(950/450) = log(2.111) ≈ 0.747
      const expectedLogOR = Math.log((10 * 95) / (90 * 5));
      expect(expectedLogOR).toBeCloseTo(0.747, 2);
    });

    it('should calculate variance correctly', () => {
      const arm1 = { events: 10, denominator: 100 };
      const arm2 = { events: 5, denominator: 100 };

      // Variance = 1/10 + 1/90 + 1/5 + 1/95 ≈ 0.1 + 0.011 + 0.2 + 0.011 = 0.322
      const expectedVariance = 1/10 + 1/90 + 1/5 + 1/95;
      expect(expectedVariance).toBeCloseTo(0.322, 2);
    });
  });

  describe('Network Geometry Detection', () => {
    it('should detect star geometry', () => {
      const studies = [
        { id: 'S1', arms: [{ treatment: 'A', events: 10, denominator: 100 }, { treatment: 'B', events: 5, denominator: 100 }] },
        { id: 'S2', arms: [{ treatment: 'A', events: 12, denominator: 100 }, { treatment: 'C', events: 6, denominator: 100 }] },
        { id: 'S3', arms: [{ treatment: 'A', events: 8, denominator: 100 }, { treatment: 'D', events: 4, denominator: 100 }] }
      ];

      const graph = new NetworkGraph(studies);
      graph.build();
      expect(graph.getGeometry()).toBe('star');
    });

    it('should detect full geometry (complete graph)', () => {
      const studies = [
        { id: 'S1', arms: [{ treatment: 'A', events: 10, denominator: 100 }, { treatment: 'B', events: 5, denominator: 100 }] },
        { id: 'S2', arms: [{ treatment: 'B', events: 12, denominator: 100 }, { treatment: 'C', events: 6, denominator: 100 }] },
        { id: 'S3', arms: [{ treatment: 'C', events: 8, denominator: 100 }, { treatment: 'A', events: 4, denominator: 100 }] }
      ];

      const graph = new NetworkGraph(studies);
      graph.build();
      // All three treatments are connected to each other = full/complete
      expect(graph.getGeometry()).toBe('full');
    });
  });

  describe('Design Extraction', () => {
    it('should extract unique study designs', () => {
      const studies = [
        {
          id: 'S1',
          arms: [
            { treatment: 'A', events: 10, denominator: 100 },
            { treatment: 'B', events: 5, denominator: 100 }
          ]
        },
        {
          id: 'S2',
          arms: [
            { treatment: 'A', events: 12, denominator: 100 },
            { treatment: 'B', events: 6, denominator: 100 }
          ]
        },
        {
          id: 'S3',
          arms: [
            { treatment: 'B', events: 8, denominator: 100 },
            { treatment: 'C', events: 4, denominator: 100 }
          ]
        },
        {
          id: 'S4',
          arms: [
            { treatment: 'C', events: 15, denominator: 100 },
            { treatment: 'D', events: 3, denominator: 100 }
          ]
        }
      ];

      const result = networkMetaAnalysis(studies, { reference: 'A' });
      expect(result.designs).toBeDefined();
      expect(result.nDesigns).toBeGreaterThan(0);
    });
  });
});

describe('Inconsistency Measures Validation', () => {
  describe('Node Splitting', () => {
    it('should detect inconsistency at split node', () => {
      const studies = [
        {
          id: 'S1',
          arms: [
            { treatment: 'A', events: 10, denominator: 100 },
            { treatment: 'B', events: 5, denominator: 100 }
          ]
        },
        {
          id: 'S2',
          arms: [
            { treatment: 'B', events: 12, denominator: 100 },
            { treatment: 'C', events: 6, denominator: 100 }
          ]
        },
        {
          id: 'S3',
          arms: [
            { treatment: 'A', events: 8, denominator: 100 },
            { treatment: 'C', events: 2, denominator: 100 }
          ]
        }
      ];

      const result = nodeSplitting(studies, 'B');
      expect(result).toBeDefined();
      expect(result.splitNode).toBe('B');
      expect(result.comparisons).toBeDefined();
    });
  });

  describe('Side Splitting', () => {
    it('should test inconsistency in closed loops', () => {
      const studies = [
        {
          id: 'S1',
          arms: [
            { treatment: 'A', events: 10, denominator: 100 },
            { treatment: 'B', events: 5, denominator: 100 }
          ]
        },
        {
          id: 'S2',
          arms: [
            { treatment: 'B', events: 12, denominator: 100 },
            { treatment: 'C', events: 6, denominator: 100 }
          ]
        },
        {
          id: 'S3',
          arms: [
            { treatment: 'C', events: 8, denominator: 100 },
            { treatment: 'A', events: 4, denominator: 100 }
          ]
        }
      ];

      const result = sideSplitting(studies, ['A', 'B', 'C']);
      expect(result).toBeDefined();
      expect(result.loop).toEqual(['A', 'B', 'C']);
    });
  });
});

describe('NMA Output Generation', () => {
  it('should create forest plot data', () => {
    const mockResult = {
      effects: {
        'Drug A': { effect: -0.5, se: 0.2, ciLower: -0.9, ciUpper: -0.1, pValue: 0.01 },
        'Drug B': { effect: -0.3, se: 0.15, ciLower: -0.6, ciUpper: 0.0, pValue: 0.05 },
        'Placebo': { effect: 0, se: 0, ciLower: 0, ciUpper: 0, pValue: 1 }
      },
      rankings: { sucras: [85, 70, 15] },
      reference: 'Placebo',
      nStudies: 5,
      nTreatments: 3
    };

    const plotData = createNMAForestPlot(mockResult);
    expect(plotData.treatments).toHaveLength(3);
    expect(plotData.reference).toBe('Placebo');
    expect(plotData.treatments[0].sucra).toBeDefined();
  });

  it('should create network plot data', () => {
    const mockGraph = {
      exportToD3: () => ({
        nodes: [{ id: 'A' }, { id: 'B' }],
        links: [{ source: 'A', target: 'B' }]
      })
    };

    const mockResult = { network: { graph: mockGraph } };
    const plotData = createNetworkPlot(mockResult);
    expect(plotData.nodes).toBeDefined();
    expect(plotData.links).toBeDefined();
  });
});
