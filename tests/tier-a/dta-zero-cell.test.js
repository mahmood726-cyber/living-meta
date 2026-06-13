/**
 * DTA zero-cell continuity-correction regression test
 * Tier-A: guards against NaN/Infinity propagation when a 2x2 cell is zero.
 */

import { describe, it, expect } from 'vitest';
import { calculateDTAMetrics } from '../../src/lib/dta-meta.js';

describe('calculateDTAMetrics zero-cell handling', () => {
  it('produces finite metrics when a cell is zero (continuity correction)', () => {
    const m = calculateDTAMetrics(0, 5, 10, 20); // tp = 0
    expect(Number.isFinite(m.sens)).toBe(true);
    expect(Number.isFinite(m.spec)).toBe(true);
    expect(Number.isFinite(m.logitSens)).toBe(true);
    expect(Number.isFinite(m.logitSpec)).toBe(true);
    expect(Number.isFinite(m.varLogitSens)).toBe(true);
    expect(Number.isFinite(m.varLogitSpec)).toBe(true);
    expect(Number.isFinite(m.dor)).toBe(true);
    expect(Number.isFinite(m.logDOR)).toBe(true);
  });

  it('leaves studies without zero cells unchanged (no spurious correction)', () => {
    const m = calculateDTAMetrics(50, 5, 10, 35);
    expect(m.sens).toBeCloseTo(50 / 60, 10);
    expect(m.spec).toBeCloseTo(35 / 40, 10);
    // DOR = (tp*tn)/(fp*fn), exact (no continuity correction applied)
    expect(m.dor).toBeCloseTo((50 * 35) / (5 * 10), 10);
  });
});
