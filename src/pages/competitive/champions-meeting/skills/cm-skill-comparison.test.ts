import { expect, it } from 'vitest';
import { comparisonLines } from './cm-skill-comparison';

it('scales each skill to its own peak while retaining actual event counts', () => {
  const chart = comparisonLines([
    { id: 1, bins: [10, 30, 60], total: 100 },
    { id: 2, bins: [100, 300, 600], total: 1000 },
    { id: 3, bins: [0, 0, 10], total: 10 }
  ]);

  expect(chart.lines[0]?.path).toBe(chart.lines[1]?.path);
  expect(chart.lines[0]?.normalizedBins).toEqual([1 / 6, 0.5, 1]);
  expect(chart.lines[0]?.bins).toEqual([10, 30, 60]);
  expect(chart.lines[0]?.total).toBe(100);
  expect(chart.lines[0]?.path).toContain('L25,24.00');
  expect(chart.lines[2]?.path).toContain('L25,24.00');
  expect(new Set(chart.lines.map((line) => line.color)).size).toBe(3);
  expect(new Set(chart.lines.map((line) => line.dash)).size).toBe(3);
});

it('keeps zero-event skills finite without inventing a distribution', () => {
  const chart = comparisonLines([{ id: 1, bins: [0, 0], total: 0 }]);

  expect(chart.lines[0]?.normalizedBins).toEqual([0, 0]);
  expect(chart.lines[0]?.path).toBe('M5,96.00 L15,96.00');
});
