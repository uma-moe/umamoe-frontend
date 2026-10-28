import { describe, expect, it } from 'vitest';
import { groupStatlines, roundStat } from './statline-groups';
import type { Stats } from './statline-model';
import type { TargetStatlines } from './statlines-data';

const margin: Stats = [27, 63, 50, 100, 81];

function forecast(rows: Stats[]): TargetStatlines {
  return {
    kind: 'forecast',
    margin,
    rows: rows.map((stats, index) => ({ style: (index + 1) as 1 | 2 | 3 | 4, stats }))
  };
}

describe('roundStat', () => {
  it('rounds to tens', () => {
    expect(roundStat(1565)).toBe(1570);
    expect(roundStat(1564)).toBe(1560);
  });
});

describe('groupStatlines', () => {
  it('folds styles within the typical miss into one rounded row', () => {
    const target = forecast([
      [1565, 526, 1222, 674, 1142],
      [1573, 496, 1231, 667, 1151],
      [1559, 516, 1248, 689, 1079],
      [1567, 486, 1247, 683, 1091]
    ]);

    const groups = groupStatlines(target);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.styles).toEqual([1, 2, 3, 4]);
    expect(groups[0]!.stats).toEqual([1570, 510, 1240, 680, 1120]);
  });

  it('gives a style its own row when a stat sets it apart, and marks that stat', () => {
    const target = forecast([
      [1565, 526, 1222, 674, 1142],
      [1573, 496, 1231, 667, 1151],
      [1559, 516, 1248, 689, 1079],
      [1567, 760, 1247, 683, 1091]
    ]);

    const groups = groupStatlines(target);

    expect(groups.map((group) => group.styles)).toEqual([[1, 2, 3], [4]]);
    expect(groups[1]!.apart).toEqual([false, true, false, false, false]);
    expect(groups[1]!.stats[1]).toBe(760);
  });

  it('keeps every style apart when no two agree', () => {
    const target = forecast([
      [1200, 500, 1000, 600, 900],
      [1400, 700, 1200, 800, 1100],
      [1600, 900, 1400, 1000, 1300],
      [1800, 1100, 1600, 1200, 1500]
    ]);

    expect(groupStatlines(target)).toHaveLength(4);
  });
});
