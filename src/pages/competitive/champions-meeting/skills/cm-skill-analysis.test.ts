import { describe, expect, it } from 'vitest';
import {
  activationTiming,
  skillBucketMetrics,
  skillCohorts,
  validateSkillDetail,
  validateSkillOverview
} from './cm-skill-analysis';
import {
  activationBins,
  type SkillOverview,
  type SkillDetail,
  type SkillBuckets
} from '../cm-exploration';
import { skillRows, validateSkillPlayerUsage, type SkillPlayerUsage } from './cm-skill-rows';

const overview: SkillOverview = {
  snapshotId: 'test',
  races: 100,
  players: 4,
  courseDistance: 1200,
  allPlayerCounts: { 1: 3 },
  variants: { 1: [1, 2] },
  populationByStyle: { Nige: [100, 20], Senko: [80, 12] },
  rows: [
    [1, 'Nige', 2, 20, 12, 17, 5, 4, 1, 7, 2],
    [1, 'Senko', 2, 10, 8, 8, 0, 2, 1, 4, 1]
  ]
};
const detail: SkillDetail = {
  snapshotId: 'test',
  skillId: 1,
  bucketCount: 100,
  courseDistance: 1200,
  styles: {
    Nige: [
      [-1, 2, 2, 1, 1],
      [70, 15, 10, 3, 6]
    ],
    Senko: [[70, 8, 8, 2, 4]]
  },
  variants: {
    1: {
      rows: [[1, 'Nige', 0, 20, 12, 17, 5, 4, 1, 7, 2]],
      styles: { Nige: [[70, 15, 10, 3, 6]] }
    },
    2: { rows: [[2, 'Senko', 0, 10, 8, 8, 0, 2, 1, 4, 1]], styles: { Senko: [[70, 8, 8, 2, 4]] } }
  }
};

describe('captured skill analysis', () => {
  it('uses best-team player counts without changing full-simulation outcomes, including zero', () => {
    const usage: SkillPlayerUsage = {
      snapshotId: 'test',
      totalPlayers: 4,
      skills: [
        { id: 1, style: 0, players: 1 },
        { id: 1, style: 1, players: 0 }
      ]
    };
    const [all] = skillRows(overview, 'all', String, { usage });
    expect(all?.players).toBe(1);
    expect(all?.owned).toBe(30);
    expect(all?.wins).toBe(6);
    expect(skillRows(overview, '1', String, { usage })[0]?.players).toBe(0);
  });

  it('keeps loaded mean and median values available to list sorting and style filters', () => {
    expect(skillRows(overview, 'all', String)[0]?.meanDistance).toBeNaN();
    const [row] = skillRows(overview, '1', String, { details: { 1: detail } });
    expect(row?.meanDistance).toBeCloseTo((2 * 6 + 15 * 846) / 17);
    expect(row?.medianDistance).toBe(846);
  });

  it('leaves player counts pending without withholding the simulation statistics', () => {
    const [row] = skillRows(overview, 'all', String, { playersPending: true });

    expect(row?.players).toBeNaN();
    expect(row?.owned).toBe(30);
    expect(row?.wins).toBe(6);
  });

  it('rejects player counts outside the published population', () => {
    expect(() => validateSkillPlayerUsage({ snapshotId: 'test', totalPlayers: 4 })).toThrow(
      'Skill player usage is unavailable'
    );
    expect(() =>
      validateSkillPlayerUsage({
        snapshotId: 'test',
        totalPlayers: 4,
        skills: [{ id: 1, style: 0, players: 5 }]
      })
    ).toThrow('Invalid skill player counts');
  });
  it('rejects inconsistent learned and population counts before deriving inactive cohorts', () => {
    expect(() => validateSkillOverview(overview)).not.toThrow();
    expect(() =>
      validateSkillOverview({ ...overview, populationByStyle: { Nige: [10, 20] } })
    ).toThrow('Invalid skill population counts');
    expect(() =>
      validateSkillOverview({ ...overview, populationByStyle: { Nige: [100, 2] } })
    ).toThrow('Skill entries do not match the population');
    const invalid: SkillOverview = { ...overview, rows: [[1, 'Nige', 1, 2, 3, 3, 0, 0, 0, 0, 0]] };
    expect(() => validateSkillOverview(invalid)).toThrow('Invalid skill entry counts');
  });
  it('counts repeat rates against learned entries and keeps distinct players separate from styles', () => {
    const [row] = skillRows(overview, 'all', (id) => 'Skill ' + id);
    expect(row?.players).toBe(3);
    expect(row?.repeatRate).toBeCloseTo(5 / 30);
    expect(row?.winrate).toBeCloseTo(6 / 20);
    expect(row?.teamWinrate).toBeCloseTo(11 / 20);
    expect(row?.variants).toContain('Skill 2');
    expect(skillRows(overview, '1', String)[0]?.players).toBe(2);
  });

  it('separates activated, inactive and unlearned entries without summing overlapping variants', () => {
    const cohorts = skillCohorts({ overview, detail, style: 'all' });
    expect(cohorts[0]?.total).toEqual({ entries: 20, wins: 6, teamWins: 11 });
    expect(cohorts.filter((row) => row.variantId !== undefined)).toHaveLength(2);
    expect(cohorts.find((row) => row.label === 'Learned, not activated')?.total).toEqual({
      entries: 10,
      wins: 2,
      teamWins: 3
    });
    expect(cohorts.at(-1)?.total).toEqual({ entries: 150, wins: 24, teamWins: undefined });
    expect(skillCohorts({ overview, detail, style: '1' })[0]?.total.entries).toBe(12);
  });

  it('uses first entries rather than repeated events for selected-range outcomes', () => {
    const range = { start: 70, end: 70 };
    expect(skillBucketMetrics(detail.styles, 'all', range)).toEqual({
      procs: 23,
      entries: 18,
      wins: 5,
      teamWins: 10
    });
    const cohorts = skillCohorts({ overview, detail, style: 'all', range });
    expect(cohorts).toHaveLength(3);
    expect(cohorts[0]?.total.entries).toBe(18);
    expect(cohorts[1]?.total.wins).toBe(3);
    expect(skillBucketMetrics(detail.styles, '1', { start: 0, end: 0 }).entries).toBe(2);
  });

  it('estimates timing at bucket midpoints and leaves empty timing unavailable', () => {
    const bins = activationBins(detail, '1');
    const timing = activationTiming(bins, 1200);
    expect(timing?.mean).toBeCloseTo((2 * 6 + 15 * 846) / 17);
    expect(timing?.median).toBe(846);
    expect(activationTiming([], 1200)).toBeUndefined();
  });

  it('supports snapshots without population or variant data', () => {
    const legacy = { ...overview, populationByStyle: undefined, variants: undefined };
    const cohorts = skillCohorts({
      overview: legacy,
      detail: { ...detail, variants: undefined },
      style: 'all'
    });
    expect(cohorts.map((row) => row.label)).toEqual(['Activated', 'Learned, not activated']);
  });

  it('rejects invalid first-entry and win counts before they reach charts', () => {
    expect(() => validateSkillDetail(detail)).not.toThrow();
    const invalidRows: SkillBuckets[string] = [
      [100, 1, 1, 0, 0],
      [0, 1, 2, 0, 0],
      [0, 1, 1, 2, 0],
      [0, 1, 1, 0, 2],
      [0, -1, 0, 0, 0]
    ];
    for (const row of invalidRows) {
      expect(() =>
        validateSkillDetail({
          ...detail,
          styles: { Nige: [row] }
        })
      ).toThrow('Invalid skill activation counts');
    }
  });
});
