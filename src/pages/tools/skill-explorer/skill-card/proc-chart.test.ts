import { describe, expect, it } from 'vitest';
import { SECTIONS } from '../skill-explorer-data';
import { buildProcChart } from './proc-chart';

function fillSections(entries: Record<number, number>): number[] {
  const values = new Array<number>(SECTIONS).fill(0);
  for (const [section, value] of Object.entries(entries)) {
    values[Number(section)] = value;
  }

  return values;
}

describe('buildProcChart', () => {
  it('omits WR line geometry when per-section win rates are absent', () => {
    const sections = fillSections({ 6: 0.4, 16: 0.4 });

    const chart = buildProcChart(sections, undefined, 276);

    expect(chart.hasSectionWins).toBe(false);
    expect(chart.wrMean).toBeUndefined();
    expect(chart.wrSegments).toEqual([]);
    expect(chart.height).toBe(52);
    expect(chart.iqrBand).toBeDefined();
  });

  it('ignores tiny single-race slivers so noise buckets never create zig-zags or shift WR mean', () => {
    const sections = fillSections({ 1: 0.65, 12: 0.003, 16: 0.002 });
    const sectionWins = fillSections({ 1: 3.3, 12: 7.9, 16: 6.5 });

    const chart = buildProcChart(sections, sectionWins, 276);

    expect(chart.height).toBe(64);
    expect(chart.buckets[1]!.reliableWin).toBe(true);
    expect(chart.buckets[12]!.reliableWin).toBe(false);
    expect(chart.buckets[12]!.winY).toBeUndefined();
    expect(chart.wrSegments).toHaveLength(1);
    expect(chart.wrMean).toBeLessThan(0.1);
  });

  it('splits the WR line across inactive gaps and raises high-WR spurt buckets above mid-race ones', () => {
    const sections = fillSections({ 5: 0.1, 6: 0.1, 16: 0.08, 17: 0.06 });
    const sectionWins = fillSections({ 5: 0.6, 6: 0.6, 16: 12.2, 17: 4.0 });

    const chart = buildProcChart(sections, sectionWins, 276);

    expect(chart.wrSegments).toHaveLength(2);
    expect(chart.buckets[16]!.winY).toBeLessThan(chart.buckets[5]!.winY!);
    expect(chart.wrMean).toBeGreaterThan(0.6);
  });

  it('still draws a WR curve for low-proc-rate skills whose buckets fall below 1.5% of all races', () => {
    const sections = fillSections({ 14: 0.012, 15: 0.011, 16: 0.009, 20: 0.001 });
    const sectionWins = fillSections({ 14: 6.2, 15: 7.4, 16: 11.8, 20: 1.0 });

    const chart = buildProcChart(sections, sectionWins, 276);

    expect(chart.buckets[14]!.reliableWin).toBe(true);
    expect(chart.buckets[15]!.reliableWin).toBe(true);
    expect(chart.buckets[16]!.reliableWin).toBe(true);
    // Tiny 0.1% outlier sliver still filtered out against the 3.3% total proc rate.
    expect(chart.buckets[20]!.reliableWin).toBe(false);
    expect(chart.wrSegments).toHaveLength(1);
  });

  it('adds a WR confidence ribbon and IQR proc band when per-proc ci95 is provided', () => {
    const sections = fillSections({ 10: 0.25, 11: 0.35, 12: 0.2 });
    const sectionWins = fillSections({ 10: 4.0, 11: 5.5, 12: 3.0 });

    const chart = buildProcChart(sections, sectionWins, 276, 1.4);

    expect(chart.wrBandPaths).toHaveLength(1);
    expect(chart.wrBandPaths[0]!.startsWith('M ')).toBe(true);
    expect(chart.maxWin).toBeCloseTo(5.5);
    expect(chart.minWin).toBeCloseTo(3.0);
    expect(chart.iqrBand?.p25).toBeGreaterThan(10 / 24);
    expect(chart.iqrBand?.p75).toBeLessThan(13 / 24);
  });
});
