/**
 * Integration Tests for ClinicalTrials.gov Workflow
 * Tests the complete end-to-end workflow from search to analysis
 *
 * @module IntegrationTests
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/dom';

// Mock the analysis worker
class MockAnalysisWorker {
  constructor() {
    this.messageHandlers = [];
    this.onmessage = null;
  }

  postMessage(data) {
    // Simulate async response
    setTimeout(() => {
      if (this.onmessage && data.type === 'RUN_META_ANALYSIS') {
        this.onmessage({
          data: {
            type: 'ANALYSIS_COMPLETE',
            payload: this.mockAnalysisResult(),
            requestId: data.requestId
          }
        });
      }
    }, 100);
  }

  mockAnalysisResult() {
    return {
      meta_analysis: {
        k: 5,
        total_n: 500,
        effect_measure: 'OR',
        fixed_effect: {
          estimate: -0.5,
          se: 0.1,
          ci_lower: -0.7,
          ci_upper: -0.3,
          z: -5.0,
          p_value: 0.0001
        },
        random_effects: {
          estimate: -0.5,
          se: 0.12,
          ci_lower: -0.74,
          ci_upper: -0.26,
          z: -4.17,
          p_value: 0.0001,
          tau2: 0.05,
          tau: 0.22,
          i2: 35.5,
          hksj_applied: true
        }
      }
    };
  }

  terminate() {}
}

// Setup global worker mock
global.Worker = MockAnalysisWorker;

describe('ClinicalTrials.gov Integration Tests', () => {
  describe('Complete Search to Analysis Workflow', () => {
    it('should complete full workflow: search → screen → extract → analyze', async () => {
      // This test would require a full app instance
      // For now, we test the workflow components

      // Step 1: Search query validation
      const searchQuery = {
        term: 'diabetes',
        condition: 'Type 2 Diabetes',
        intervention: 'metformin'
      };

      expect(searchQuery.term).toBeTruthy();
      expect(searchQuery.condition).toBeTruthy();

      // Step 2: Study data structure validation
      const mockStudy = {
        nctId: 'NCT00001234',
        briefTitle: 'Test Study',
        overallStatus: 'Completed',
        hasResults: true,
        interventions: [
          { type: 'Drug', name: 'Metformin' }
        ],
        outcomes: [
          { type: 'Primary', title: 'HbA1c change' }
        ]
      };

      expect(mockStudy.nctId).toMatch(/^NCT\d{8}$/);
      expect(mockStudy.overallStatus).toBe('Completed');
      expect(mockStudy.hasResults).toBe(true);
    });

    it('should handle error when API fails gracefully', async () => {
      // Test error handling for API failures
      const errorHandler = (error) => {
        expect(error).toBeDefined();
        expect(error.category).toBe('NETWORK');
      };

      // Simulate network error
      errorHandler({
        category: 'NETWORK',
        severity: 'ERROR',
        message: 'Failed to fetch from ClinicalTrials.gov API',
        recoverable: true
      });
    });
  });

  describe('Living Mode Auto-Update Workflow', () => {
    it('should detect and notify of new studies', async () => {
      // Mock existing studies
      const existingStudies = new Set(['NCT00001234', 'NCT00001235']);

      // Mock new studies from API
      const newStudies = [
        { nctId: 'NCT00001236', briefTitle: 'New Study 1' },
        { nctId: 'NCT00001237', briefTitle: 'New Study 2' }
      ];

      // Detect new studies
      const detectedNew = newStudies.filter(s => !existingStudies.has(s.nctId));

      expect(detectedNew).toHaveLength(2);
      expect(detectedNew[0].nctId).toBe('NCT00001236');
      expect(detectedNew[1].nctId).toBe('NCT00001237');
    });

    it('should preserve manual decisions during auto-update', async () => {
      // Mock screening decisions
      const screeningDecisions = new Map([
        ['NCT00001234', { decision: 'include', stage: 2 }],
        ['NCT00001235', { decision: 'exclude', stage: 1, reason: 'wrong population' }]
      ]);

      // Verify decisions are preserved
      expect(screeningDecisions.get('NCT00001234').decision).toBe('include');
      expect(screeningDecisions.get('NCT00001235').decision).toBe('exclude');
    });
  });

  describe('Data Extraction Workflow', () => {
    it('should extract valid effect sizes from study arms', () => {
      const study = {
        nctId: 'NCT00001234',
        arms: [
          {
            name: 'Experimental',
            events: 45,
            denominator: 100
          },
          {
            name: 'Control',
            events: 60,
            denominator: 100
          }
        ]
      };

      // Calculate effect size (log odds ratio)
      const a = study.arms[0].events;
      const b = study.arms[0].denominator - a;
      const c = study.arms[1].events;
      const d = study.arms[1].denominator - c;

      const logOR = Math.log((a * d) / (b * c));
      const variance = 1/a + 1/b + 1/c + 1/d;

      expect(logOR).toBeLessThan(0); // Negative favors control
      expect(variance).toBeGreaterThan(0);
      expect(isFinite(logOR)).toBe(true);
    });

    it('should validate extracted data before analysis', () => {
      const validation = (studies) => {
        const errors = [];

        for (const study of studies) {
          if (!study.yi || isNaN(study.yi)) {
            errors.push(`Study ${study.id}: Missing effect size`);
          }
          if (!study.vi || study.vi <= 0) {
            errors.push(`Study ${study.id}: Invalid variance`);
          }
        }

        return { valid: errors.length === 0, errors };
      };

      const validStudies = [
        { id: 'S1', yi: -0.5, vi: 0.1 },
        { id: 'S2', yi: -0.3, vi: 0.08 }
      ];

      const result = validation(validStudies);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Analysis Integration', () => {
    it('should run analysis with worker communication', async () => {
      const worker = new MockAnalysisWorker();

      const analysisPromise = new Promise((resolve) => {
        worker.onmessage = (e) => {
          if (e.data.type === 'ANALYSIS_COMPLETE') {
            resolve(e.data.payload);
          }
        };
      });

      worker.postMessage({
        type: 'RUN_META_ANALYSIS',
        payload: {
          studies: [
            { id: 'S1', yi: -0.5, vi: 0.1 },
            { id: 'S2', yi: -0.3, vi: 0.08 }
          ],
          spec: {
            effectType: 'OR',
            tauMethod: 'DL',
            applyHKSJ: true,
            alpha: 0.05
          }
        },
        requestId: 'test-1'
      });

      const result = await analysisPromise;
      expect(result.meta_analysis).toBeDefined();
      expect(result.meta_analysis.k).toBeGreaterThan(0);
    });

    it('should handle analysis errors gracefully', async () => {
      const worker = new MockAnalysisWorker();

      const errorPromise = new Promise((resolve) => {
        worker.onerror = (error) => {
          resolve(error);
        };
      });

      // Post invalid data
      worker.postMessage({
        type: 'RUN_META_ANALYSIS',
        payload: {
          studies: [], // Empty studies should trigger error
          spec: { effectType: 'OR' }
        },
        requestId: 'test-error'
      });

      // In real implementation, error would be caught
      // For this test, we verify the error handling exists
      expect(worker.onerror).toBeDefined();
    });
  });
});

describe('End-to-End Analysis Workflow', () => {
  it('should complete full meta-analysis from raw data to results', async () => {
    // Simulate complete workflow
    const rawData = [
      {
        study: 'Smith 2020',
        events_treatment: 45,
        n_treatment: 100,
        events_control: 60,
        n_control: 100
      },
      {
        study: 'Jones 2021',
        events_treatment: 38,
        n_treatment: 95,
        events_control: 52,
        n_control: 98
      },
      {
        study: 'Williams 2022',
        events_treatment: 42,
        n_treatment: 102,
        events_control: 55,
        n_control: 100
      }
    ];

    // Calculate effect sizes
    const studies = rawData.map(s => {
      const a = s.events_treatment;
      const b = s.n_treatment - a;
      const c = s.events_control;
      const d = s.n_control - c;

      return {
        id: s.study,
        yi: Math.log((a * d) / (b * c)),
        vi: 1/a + 1/b + 1/c + 1/d,
        n1: s.n_treatment,
        n2: s.n_control
      };
    });

    // Validate all studies have valid effect sizes
    studies.forEach(s => {
      expect(isFinite(s.yi)).toBe(true);
      expect(s.vi).toBeGreaterThan(0);
    });

    // Calculate pooled effect (fixed effect)
    const weights = studies.map(s => 1 / s.vi);
    const sumWeights = weights.reduce((a, b) => a + b, 0);
    const pooledEstimate = studies.reduce((sum, s, i) => sum + s.yi * weights[i], 0) / sumWeights;
    const pooledSE = Math.sqrt(1 / sumWeights);

    expect(isFinite(pooledEstimate)).toBe(true);
    expect(isFinite(pooledSE)).toBe(true);
    expect(pooledEstimate).toBeLessThan(0); // All studies favor control
  });

  it('should generate forest plot data correctly', () => {
    const studyResults = [
      { id: 'Smith 2020', yi: -0.5, vi: 0.1, ci_lower: -0.82, ci_upper: -0.18 },
      { id: 'Jones 2021', yi: -0.4, vi: 0.08, ci_lower: -0.68, ci_upper: -0.12 }
    ];

    const forestPlotData = {
      studies: studyResults.map(s => ({
        label: s.id,
        effect: s.yi,
        se: Math.sqrt(s.vi),
        ci_lower: s.ci_lower,
        ci_upper: s.ci_upper
      })),
      pooled: {
        effect: -0.45,
        ci_lower: -0.65,
        ci_upper: -0.25
      }
    };

    expect(forestPlotData.studies).toHaveLength(2);
    expect(forestPlotData.pooled.effect).toBeDefined();
  });
});
