import { describe, expect, it } from 'vitest';
import { normalizeSkill } from '@/lib/game-data/skills/skills';
import type {
  OptimizeEstimate,
  OptimizeFinalist,
  OptimizeImpact
} from '../../../simulator-repository';
import { offerPurchases } from '../../../setup/build/skill-offers';
import {
  barShape,
  changesFromBest,
  compareRows,
  raceStats,
  raceTime,
  ruledOutSkills,
  screenedImpacts,
  searchTally,
  signed,
  skillLists,
  skillValue,
  statCells,
  valueScale
} from './build-result';

const catalog = new Map(
  [
    { skill_id: 200351, name: 'Swinging Maestro', rarity: 2, base_cost: 170 },
    { skill_id: 200352, name: 'Corner Recovery ○', rarity: 1, base_cost: 170 },
    { skill_id: 201601, name: 'Groundwork', rarity: 1, base_cost: 160 },
    { skill_id: 200432, name: 'Focus', rarity: 1, base_cost: 140 }
  ].map((entry) => [entry.skill_id, normalizeSkill(entry)])
);

// Purchases: 0 Corner Recovery ○, 1 Swinging Maestro (needs 0), 2 Groundwork, 3 Focus.
const { priced: offers } = offerPurchases(
  [200352, 200351, 201601, 200432].map((skillId) => ({ skillId, hint: 0 })),
  [],
  catalog
);

const estimate = (mean: number, standard_error = 0.05, samples = 30): OptimizeEstimate => ({
  mean,
  standard_error,
  samples
});

const finalist = (
  purchases: number[],
  extra: Partial<OptimizeFinalist> = {}
): OptimizeFinalist => ({
  build: { purchases, stats: [] },
  sp_cost: 0,
  search: { fitness: estimate(0), scenarios: [] },
  validation: null,
  ...extra
});

describe('build comparison rows', () => {
  it('puts an upgrade and the skill it replaces in one row, the rows where builds differ first', () => {
    const best = finalist([0, 1, 2]);
    const runnerUp = finalist([0, 2, 3]);

    const rows = compareRows([best, runnerUp], offers);

    const names = (list: typeof rows.differ) => list.map((row) => row.top.skill.name);
    expect(names(rows.differ)).toEqual(['Swinging Maestro', 'Focus']);
    expect(names(rows.shared)).toEqual(['Groundwork']);
    const maestro = rows.differ[0]!;
    expect(maestro.chain).toEqual([1, 0]);
    // The runner-up holds only the Corner Recovery ○ part of the chain.
    expect(maestro.held).toEqual([[1, 0], [0]]);
  });

  it('says what an option buys instead of the best build and what it leaves out', () => {
    // The option keeps Corner Recovery ○ but not Swinging Maestro on it, and buys Focus instead.
    const rows = compareRows([finalist([0, 1, 2]), finalist([0, 2, 3])], offers);

    const changes = changesFromBest(rows.differ, 1, offers);

    expect(changes.added.map((skill) => skill.offer.skill.name)).toEqual(['Focus']);
    expect(changes.dropped.map((skill) => skill.offer.skill.name)).toEqual(['Swinging Maestro']);
    expect(changes.dropped[0]?.via).toEqual([]);
  });
});

describe('skill lists', () => {
  const valued = (purchase: number, mean: number, at: 'best_build' | 'screening') => ({
    purchase,
    alone: estimate(0),
    value: estimate(mean),
    valued_at: at
  });

  it('values a chain in the best build as the sum of its skills, the most useful first', () => {
    const impacts = screenedImpacts(
      [
        valued(0, 0.1, 'best_build'),
        valued(1, 0.3, 'best_build'),
        valued(2, 0.2, 'best_build'),
        valued(3, 0.5, 'screening')
      ],
      offers
    );

    const lists = skillLists(finalist([0, 1, 2]), offers, impacts);

    const maestro = lists.buy[0]!;
    expect(lists.buy.map((row) => row.offer.skill.name)).toEqual([
      'Swinging Maestro',
      'Groundwork'
    ]);
    expect(maestro.via.map((offer) => offer.skill.name)).toEqual(['Corner Recovery ○']);
    expect(maestro.value?.mean).toBeCloseTo(0.4);
    expect(maestro.screened).toBe(false);
  });

  it('marks a skill left out that only the screening valued', () => {
    const impacts = screenedImpacts([valued(3, 0.5, 'screening')], offers);

    const lists = skillLists(finalist([2]), offers, impacts);

    expect(lists.left.map((row) => [row.offer.skill.name, row.screened])).toEqual([
      ['Focus', true]
    ]);
  });
});

describe('skill values', () => {
  const impact = (extra: Partial<OptimizeImpact>): OptimizeImpact => ({
    purchase: 0,
    alone: estimate(0.4),
    together: estimate(0.1),
    ...extra
  });

  it('takes what the search valued a skill at in the best build', () => {
    const value = skillValue(impact({ value: estimate(0.25), valued_at: 'best_build' }));

    expect(value.estimate.mean).toBe(0.25);
    expect(value.at).toBe('best_build');
  });

  it('falls back to the screening as the last one in when an older service sends no value', () => {
    const value = skillValue(impact({}));

    expect(value.estimate.mean).toBe(0.1);
    expect(value.at).toBe('screening');
  });
});

describe('race stats', () => {
  it('averages each field by its races and leaves out what an older service does not send', () => {
    const scenario = (win: number, time: number, races: number, hp?: number) => ({
      name: 'field',
      fitness: estimate(0, 0, races),
      win_rate: estimate(win, 0, races),
      team_win_rate: estimate(0, 0, races),
      finish_time_seconds: estimate(time, 0, races),
      skill_activations: estimate(0, 0, races),
      ...(hp === undefined ? {} : { hp_left: estimate(hp, 0, races) })
    });
    const raced = finalist([], {
      validation: {
        fitness: estimate(0),
        scenarios: [scenario(1, 150, 3, 0.2), scenario(0, 154, 1, 0)]
      }
    });

    const stats = raceStats(raced);

    expect(stats?.win).toBeCloseTo(0.75);
    expect(stats?.time).toBeCloseTo(151);
    expect(stats?.hpLeft).toBeCloseTo(0.15);
    expect(stats?.place).toBeUndefined();
  });

  it('writes a finish time as the game does', () => {
    expect(raceTime(151.416)).toBe('2:31.42');
    expect(raceTime(65.5)).toBe('1:05.50');
  });

  it('marks the best value of each stat across the finalists, lower being better for time', () => {
    const raced = (win: number, time: number) =>
      finalist([], {
        validation: {
          fitness: estimate(0),
          scenarios: [
            {
              name: 'field',
              fitness: estimate(0),
              win_rate: estimate(win),
              team_win_rate: estimate(0),
              finish_time_seconds: estimate(time),
              skill_activations: estimate(0)
            }
          ]
        }
      });

    const cells = statCells([raced(0.3, 150), raced(0.2, 149)]);

    expect(cells[0]?.map((cell) => [cell.label, cell.text, cell.top])).toEqual([
      ['Wins', '30%', true],
      ['Avg time', '2:30.00', false]
    ]);
    expect(cells[1]?.find((cell) => cell.label === 'Avg time')?.top).toBe(true);
  });
});

describe('value bars', () => {
  const row = (mean: number) => ({
    key: 0,
    offer: offers[0]!,
    via: [],
    cost: 0,
    value: estimate(mean),
    screened: false,
    locked: false
  });

  it('draws every bar from zero on one scale, the largest value reaching the end', () => {
    const scale = valueScale([row(0.5), row(0.25), row(-0.1)]);

    const largest = barShape(scale, 0.5);
    const loss = barShape(scale, -0.1);

    expect(largest.left + largest.width).toBeCloseTo(100);
    expect(loss.left).toBeCloseTo(0);
    expect(loss.left + loss.width).toBeCloseTo(largest.left);
  });

  it('leaves room left of zero even when nothing costs her', () => {
    const scale = valueScale([row(0.4)]);

    expect(barShape(scale, 0).zero).toBeGreaterThan(0);
  });
});

describe('result copy', () => {
  it('signs values but shows one that rounds to nothing without a sign', () => {
    expect(signed(0.3)).toBe('+0.30');
    expect(signed(-0.16)).toBe('−0.16');
    expect(signed(-0.001)).toBe('0.00');
  });

  it('says what each skill that can never fire for her here needs instead', () => {
    const inert = [
      { purchase: 1, why: ['distance'] },
      { purchase: 2, why: ['running style', 'weather'] },
      { purchase: 9, why: ['track'] }
    ];

    const ruledOut = ruledOutSkills(inert, offers);

    expect(ruledOut.map((skill) => [skill.offer.skill.name, skill.needs])).toEqual([
      ['Swinging Maestro', 'another distance'],
      ['Groundwork', 'another running style and other weather']
    ]);
  });

  it('tells how much racing the search took, and the check races when there were some', () => {
    const report = {
      schema_version: 5,
      backend: 'cpu',
      candidates_evaluated: 9,
      fully_evaluated_candidates: 3,
      simulations: 230,
      exhaustive: false,
      search_seeds: [1],
      validation_seeds: [2, 3],
      finalists: []
    };
    const result = {
      schema_version: 7,
      mode: 'cm',
      runs_per_variation_per_scenario: 1,
      validation_runs_per_finalist_per_scenario: 1,
      report
    };

    expect(searchTally(result)).toBe(
      'The search tried 9 builds over 230 races, then raced the best ones again on 2 new races to check them.'
    );
    expect(searchTally({ ...result, report: { ...report, validation_seeds: [] } })).toBe(
      'The search tried 9 builds over 230 races.'
    );
  });
});
