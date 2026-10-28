import { describe, expect, it } from 'vitest';
import { dayAllows } from './cm/race-day';
import {
  averageStyles,
  parseScope,
  scopePath,
  SECTIONS,
  type SkillPoint
} from './skill-explorer-data';

function sections(firstSection: number, permille: number): number[] {
  const shares = new Array<number>(SECTIONS).fill(0);
  shares[firstSection] = permille;
  return shares;
}

function point(overrides: Partial<SkillPoint>): SkillPoint {
  return {
    skillId: 200011,
    win: 0,
    winAlone: 0,
    rate: 0,
    mean: 0,
    courses: 1,
    sections: new Array<number>(SECTIONS).fill(0),
    ...overrides
  };
}

const courseFile = {
  courses: 1,
  styles: {
    '1': [[200011, 4.8, 3.2, 0.9, 0.5, 1, sections(12, 900)]],
    '2': [],
    '3': [],
    '4': []
  },
  builds: { '1': [200011], '2': [], '3': [], '4': [] },
  partners: { '1': { '200011': [[200331, 0.21]] }, '2': {}, '3': {}, '4': {} }
};

describe('Skill Explorer data', () => {
  it('reads scope rows and adds every style averaged', () => {
    const scope = parseScope(courseFile);

    const front = scope.styles['1'][0]!;
    expect(front.win).toBe(4.8);
    expect(front.winAlone).toBe(3.2);
    expect(front.sections[12]).toBeCloseTo(0.9);
    expect(scope.builds?.['1']).toEqual([200011]);
    expect(scope.styles.all[0]!.win).toBeCloseTo(1.2);
  });

  it('reads the partners of each skill on a single course', () => {
    const scope = parseScope(courseFile);

    expect(scope.partners?.['1']?.get(200011)).toEqual([{ skillId: 200331, win: 0.21 }]);
    expect(scope.partners?.['2']?.size).toBe(0);
  });

  it('rejects rows with the wrong section count', () => {
    const file = { courses: 1, styles: { '1': [[200011, 4, 4, 1, 0.5, 1, [1, 2]]] } };

    expect(() => parseScope(file)).toThrow(/section count/);
  });

  it('averages win points over every style but the proc point over races it fired in', () => {
    const fires = point({ win: 8, rate: 1, mean: 0.8, sections: sections(19, 1) });
    const neverFires = point({ rate: 0, mean: 0 });

    const [averaged] = averageStyles([[fires], [neverFires]]);

    expect(averaged!.win).toBe(4);
    expect(averaged!.rate).toBe(0.5);
    expect(averaged!.mean).toBe(0.8);
    expect(averaged!.sections[19]).toBe(0.5);
  });

  it('finds a course under its own surface and length, as the simulator serves it', () => {
    const kyoto2200 = {
      courseId: 10808,
      distance: 2200,
      distanceType: 3,
      surface: 1,
      trackId: 10008
    };

    expect(scopePath({ kind: 'course', course: kyoto2200 })).toBe('turf/medium/10808.json.gz');
    expect(scopePath({ kind: 'group', surface: '2', distance: 'all' })).toBe('dirt/all.json.gz');
  });
});

describe('race days', () => {
  it('holds a skill when some alternative matches the day', () => {
    const springFirm = { season: 1, weather: 1, ground: 1 };

    expect(dayAllows('season==1@season==5', springFirm)).toBe(true);
    expect(dayAllows('ground_condition==3', springFirm)).toBe(false);
    expect(dayAllows('weather!=3&distance_rate>=50', springFirm)).toBe(true);
    expect(dayAllows('', springFirm)).toBe(true);
  });
});
