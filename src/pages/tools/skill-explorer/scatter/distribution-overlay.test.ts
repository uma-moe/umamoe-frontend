import { describe, expect, it } from 'vitest';
import { SECTIONS } from '../skill-explorer-data';
import { buildGaussianViolin, CI95_Z, IQR_Z, procQuantiles } from './distribution-overlay';

describe('distribution overlay geometry', () => {
  it('computes continuous activation quantiles and skips start-gate passives', () => {
    const passive = new Array<number>(SECTIONS).fill(0);
    passive[0] = 1.0;
    expect(procQuantiles(passive)).toBeUndefined();

    // Uniform mass over sections 8..16 (mid-race 1/3..2/3).
    const mid = new Array<number>(SECTIONS).fill(0);
    for (let i = 8; i < 16; i += 1) mid[i] = 0.1;

    const q = procQuantiles(mid)!;
    expect(q.p25).toBeCloseTo(10 / 24, 3);
    expect(q.p50).toBeCloseTo(12 / 24, 3);
    expect(q.p75).toBeCloseTo(14 / 24, 3);
    expect(q.p5).toBeGreaterThan(8 / 24);
    expect(q.p95).toBeLessThan(16 / 24);
  });

  it('builds a symmetric Gaussian violin with a narrower IQR core inside the 95% extremes', () => {
    const violin = buildGaussianViolin(200, (z) => 150 - z * 25, 26, 0, 300);

    expect(violin.fullPath.startsWith('M ')).toBe(true);
    expect(violin.iqrPath.startsWith('M ')).toBe(true);
    expect(violin.topY).toBeCloseTo(150 - CI95_Z * 25, 3);
    expect(violin.bottomY).toBeCloseTo(150 + CI95_Z * 25, 3);
    expect(violin.q3Y).toBeCloseTo(150 - IQR_Z * 25, 3);
    expect(violin.q1Y).toBeCloseTo(150 + IQR_Z * 25, 3);
    expect(violin.q3Y).toBeGreaterThan(violin.topY);
    expect(violin.q1Y).toBeLessThan(violin.bottomY);
    expect(violin.q3HalfWidth).toBeGreaterThan(15);
  });
});
