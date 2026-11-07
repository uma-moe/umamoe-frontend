import { expect, it } from 'vitest';
import { gateStalls } from './replay-gate';

it('builds one stall per runner in lane order', () => {
  const stalls = gateStalls([2, 0, 1], 0.4);

  expect(stalls).toEqual([
    { gate: 2, centre: 0, from: -0.5, to: 0.5 },
    { gate: 3, centre: 1, from: 0.5, to: 1.5 },
    { gate: 1, centre: 2, from: 1.5, to: 2.5 }
  ]);
});

it('keeps every stall the same width when starting lanes bunch together', () => {
  const stalls = gateStalls([0, 0.6, 0.8, 3], 0.4);
  const widths = stalls.map((stall) => stall.to - stall.from);

  expect(widths).toEqual([1, 1, 1, 1]);
  expect(stalls.map((stall) => stall.centre)).toEqual([0, 1, 2, 3]);
});

it('gives a lone runner a stall of the fallback width', () => {
  expect(gateStalls([3], 0.4)).toEqual([{ gate: 1, centre: 3, from: 2.6, to: 3.4 }]);
  expect(gateStalls([], 0.4)).toEqual([]);
});
