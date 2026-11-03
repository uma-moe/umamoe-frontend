import { expect, it } from 'vitest';
import { setupResourceFixtures } from '../../../../tests/fixtures/resource-setup';
import { parentSparkTotals } from './parent-spark-totals';

setupResourceFixtures();

it('adds matching sparks across all six ancestors without clamping star totals', () => {
  const parents = Array.from({ length: 6 }, () => ({ factors: [{ id: 10, level: 3 }] }));
  expect(parentSparkTotals(parents)).toMatchObject([{ id: 10, name: 'Speed', level: 18 }]);
  expect(parents[0]?.factors[0]?.level).toBe(3);
});

it('combines encoded star IDs with base IDs and keeps categories in display order', () => {
  const parents = [
    {
      factors: [
        { id: 110, level: 2 },
        { id: 103, level: 0 }
      ]
    },
    {
      factors: [
        { id: 10, level: 2 },
        { id: 1103, level: 0 }
      ]
    }
  ];
  expect(parentSparkTotals(parents)).toMatchObject([
    { id: 10, name: 'Speed', level: 5, category: 'stats' },
    { id: 110, name: 'Turf', level: 5, category: 'aptitude' }
  ]);
});

it('handles absent or partially captured lineage without adding missing contributions', () => {
  expect(parentSparkTotals([])).toEqual([]);
  expect(parentSparkTotals([{ factors: [] }, { factors: [{ id: 40, level: 2 }] }])).toMatchObject([
    { name: 'Guts', level: 2 }
  ]);
});
