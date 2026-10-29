import { expect, it } from 'vitest';
import { sparkMetrics } from './spark-probability';

it('preserves independent parent contributions, zero-star odds and the two inheritance rolls', () => {
  const sources = [
    { spark: { type: 0, level: 3 }, affinity: 83 },
    { spark: { type: 0, level: 2 }, affinity: 0 }
  ];

  expect(sparkMetrics(sources)).toEqual({ chance: 100, expected: 1.8, guaranteed: true });
  expect(sparkMetrics(sources, true)).toEqual({ chance: 100, expected: 3.6, guaranteed: true });
  expect(sparkMetrics([{ spark: { type: 0, level: 0 }, affinity: 0 }]).chance).toBe(0);
  expect(sparkMetrics([{ spark: { type: -1, level: 2 }, affinity: 83 }]).chance).toBe(10.98);
  expect(sparkMetrics([{ spark: { type: 1, level: 3 }, affinity: 0 }], true).chance).toBe(9.75);
});
