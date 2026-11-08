import { describe, expect, it } from 'vitest';
import { finishGapLabel } from './replay-results';

describe('finishGapLabel', () => {
  it('keeps one decimal for gaps of a metre or more', () => {
    expect(finishGapLabel(7.08)).toBe('+7.1m');
    expect(finishGapLabel(1)).toBe('+1.0m');
  });

  it('shows millimetres below a metre', () => {
    expect(finishGapLabel(0.362)).toBe('+0.362m');
    expect(finishGapLabel(0.0012)).toBe('+0.001m');
    expect(finishGapLabel(0)).toBe('+0.000m');
  });
});
