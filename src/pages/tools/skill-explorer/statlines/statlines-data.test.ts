import { describe, expect, it } from 'vitest';
import { targetStatlines, type StatlinesData } from './statlines-data';
import type { Stats } from './statline-model';

const flat: Stats = [1550, 800, 1100, 650, 1050];

/** A model that forecasts the same statline everywhere: one intercept per style, no other terms. */
const data: StatlinesData = {
  latestCm: 19,
  model: {
    stats: flat.map((value) => ({
      distance: false,
      coefficients: [value, value, value, value, 0, 0, 0]
    }))
  },
  errors: { model: [27, 63, 50, 100, 81], previousCm: [45, 247, 69, 111, 93], forecasts: 36 },
  past: [
    {
      cm: 19,
      courseId: 10808,
      distance: 2200,
      dirt: false,
      style: 2,
      winners: 56314,
      median: [1590, 786, 1130, 630, 1116],
      p25: [1532, 726, 1062, 584, 1014],
      p75: [1603, 852, 1198, 679, 1202]
    }
  ]
};

describe('target statlines', () => {
  it('shows what winners brought to a measured CM', () => {
    const target = targetStatlines(data, { cm: 19, course: { distance: 2200, dirt: false } });

    expect(target?.kind).toBe('winners');
    expect(target?.rows[0]).toMatchObject({ style: 2, stats: [1590, 786, 1130, 630, 1116] });
  });

  it('forecasts a coming CM with the typical held-out miss', () => {
    const target = targetStatlines(data, { cm: 21, course: { distance: 1600, dirt: false } });

    expect(target).toMatchObject({ kind: 'forecast', margin: [27, 63, 50, 100, 81] });
    expect(target?.rows).toHaveLength(4);
    expect(target?.rows[0]?.stats).toEqual(flat);
  });

  it('has nothing to show without a course', () => {
    expect(targetStatlines(data, {})).toBeUndefined();
  });

  it('prefers precomputed hybrid course forecasts when present', () => {
    const hybrid: StatlinesData = {
      latestCm: 22,
      method: 'hybrid-cm-physics-v1',
      errors: { model: [14, 37, 26, 44, 24], previousCm: [46, 240, 74, 45, 81], forecasts: 20 },
      past: [],
      forecasts: {
        '10504': {
          1: [1580, 790, 1150, 650, 1100],
          2: [1585, 780, 1155, 620, 1105],
          3: [1550, 770, 1170, 660, 1050],
          4: [1565, 765, 1175, 630, 1085]
        }
      }
    };

    const target = targetStatlines(hybrid, {
      cm: 23,
      course: { courseId: 10504, distance: 2000, dirt: false }
    });

    expect(target?.kind).toBe('forecast');
    expect(target?.rows).toHaveLength(4);
    expect(target?.rows[0]).toEqual({ style: 1, stats: [1580, 790, 1150, 650, 1100] });
  });
});
