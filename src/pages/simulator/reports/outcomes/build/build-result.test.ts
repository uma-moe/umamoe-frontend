import { describe, expect, it } from 'vitest';
import { normalizeSkill } from '@/lib/game-data/skills/skills';
import type {
  OptimizeFinalist,
  OptimizeResult,
  OptimizeTheory,
  TheoryFire
} from '../../../simulator-repository';
import { offerPurchases } from '../../../setup/build/skill-offers';
import {
  compareRows,
  contributionScale,
  fireText,
  fireWhere,
  gapText,
  leftoverSp,
  lengthsText,
  racedGap,
  ruledOutSkills,
  searchTally,
  theorizedResult,
  winRateText,
  winText,
  worthState
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

const fire = (rate: number, mean_m: number | null = 1000): TheoryFire => ({ rate, mean_m });

const finalist = (purchases: number[], sp_cost = 0): OptimizeFinalist => ({
  build: { purchases, stats: [] },
  sp_cost,
  search: { fitness: { samples: 1, mean: 0, standard_error: 0 }, scenarios: [] },
  validation: null,
  validation_gain: { samples: 32, mean: 0.4, standard_error: 0.05 }
});

// The pick buys Swinging Maestro on Corner Recovery ○ and Groundwork; the runner-up keeps only Corner Recovery ○ of
// that chain and buys Focus instead.
const pick = finalist([0, 1, 2], 400);
const runnerUp = finalist([0, 2, 3], 380);

const theory: OptimizeTheory = {
  unit: 'lengths',
  search_draws: 64,
  report_draws: 256,
  builds_valued: 120,
  lengths_per_second: 8,
  runners_per_length: 0.3,
  phase_bounds: [0, 400, 1600, 2000, 2400],
  field: {
    position_fight_seconds: 8.8,
    rushed_chance: 0.12,
    drain_mean: 0.054,
    drain_spread: 0.034,
    base_hp_left: 110
  },
  finalists: [
    {
      purchases: [0, 1, 2],
      lengths: 1.6,
      hp_left: 120,
      skills: [
        { purchase: 1, lengths: 0.9, fire: fire(1, 1030) },
        { purchase: 2, lengths: 0.5, fire: fire(0.88, 12) }
      ]
    },
    {
      purchases: [0, 2, 3],
      lengths: 1.2,
      hp_left: 40,
      skills: [
        { purchase: 0, lengths: 0.3, fire: fire(1, 1040) },
        { purchase: 2, lengths: 0.6, fire: fire(0.9, 10) },
        { purchase: 3, lengths: 0.1, fire: fire(0.86, 5) }
      ]
    }
  ],
  offers: [
    {
      purchase: 0,
      lengths: 0,
      fire: fire(1, 1040),
      source: 'physics',
      effect: 'recovery',
      count_gated: false
    },
    {
      purchase: 1,
      lengths: 0.2,
      fire: fire(1, 1030),
      source: 'physics',
      effect: 'recovery',
      count_gated: false
    },
    {
      purchase: 2,
      lengths: 0,
      fire: fire(0, null),
      source: 'physics',
      effect: 'acceleration',
      count_gated: true
    },
    {
      purchase: 3,
      lengths: 0.15,
      fire: fire(0.86, 5),
      source: 'prior',
      effect: 'start',
      count_gated: false
    }
  ]
};

const result = (extra: Partial<OptimizeResult> = {}): OptimizeResult => ({
  schema_version: 8,
  mode: 'cm',
  objective: 'finish_time',
  runs_per_variation_per_scenario: 0,
  validation_runs_per_finalist_per_scenario: 32,
  report: {
    schema_version: 5,
    backend: 'theory',
    candidates_evaluated: 120,
    fully_evaluated_candidates: 2,
    simulations: 96,
    exhaustive: false,
    search_seeds: [],
    validation_seeds: Array.from({ length: 32 }, (_, i) => i),
    finalists: [pick, runnerUp]
  },
  theory,
  ...extra
});

describe('contribution bar scale', () => {
  it('scales each build to its own contributions, independent of another build’s larger scores', () => {
    expect(contributionScale([{ value: 3.08 }, { value: 1.92 }])).toBe(3.08);
    expect(contributionScale([{ value: 16.58 }, { value: 11.68 }])).toBe(16.58);
  });

  it('handles losses, missing scores and an empty build', () => {
    expect(contributionScale([{ value: -5 }, { value: 2 }, { value: undefined }])).toBe(5);
    expect(contributionScale([{ value: 0 }, { value: undefined }])).toBe(1);
    expect(contributionScale([])).toBe(1);
  });
});

describe('build comparison rows', () => {
  it('puts an upgrade and the skill it replaces in one row, the rows where builds differ first', () => {
    const rows = compareRows([pick, runnerUp], offers);

    const names = (list: typeof rows.differ) => list.map((row) => row.top.skill.name);
    expect(names(rows.differ)).toEqual(['Swinging Maestro', 'Focus']);
    expect(names(rows.shared)).toEqual(['Groundwork']);
    const maestro = rows.differ[0]!;
    expect(maestro.chain).toEqual([1, 0]);
    // The runner-up holds only the Corner Recovery ○ part of the chain.
    expect(maestro.held).toEqual([[1, 0], [0]]);
  });
});

describe('theorized builds', () => {
  it('includes losses when setting the shared contribution scale', () => {
    const withLosses: OptimizeTheory = {
      ...theory,
      finalists: theory.finalists.map((build) => ({
        ...build,
        skills: build.skills.map((skill, index) => ({ ...skill, lengths: index === 0 ? -12 : -6 }))
      }))
    };
    const view = theorizedResult({ result: result({ theory: withLosses }), offers })!;

    expect(view.scale).toBe(12);
  });

  it('scores each build by its own theorized worth, in the theory order', () => {
    const theorized = theorizedResult({ result: result(), offers });

    const worths = theorized?.builds.map((build) => [build.finalist, build.value, build.count]);
    expect(worths).toEqual([
      [pick, 1.6, 2],
      [runnerUp, 1.2, 3]
    ]);
  });

  it('lists a card’s skills by what each adds to that build, a chain as the part the build holds', () => {
    const [, runnerUpCard] = theorizedResult({ result: result(), offers })!.builds;

    const lines = runnerUpCard!.cells.map((cell) => [
      cell.skill.offer.skill.name,
      cell.value,
      cell.differs
    ]);
    expect(lines).toEqual([
      ['Groundwork', 0.6, false],
      ['Corner Recovery ○', 0.3, true],
      ['Focus', 0.1, true]
    ]);
  });

  it('names the pick’s skills a build does without', () => {
    const [pickCard, runnerUpCard] = theorizedResult({ result: result(), offers })!.builds;

    expect(pickCard!.skipped).toEqual([]);
    expect(runnerUpCard!.skipped).toEqual([]);
    expect(pickCard!.cells.map((cell) => cell.skill.via.map((base) => base.skill.name))).toEqual([
      ['Corner Recovery ○'],
      []
    ]);
  });

  it('lists every skill on offer by its worth on her own, marking what the pick buys', () => {
    const theorized = theorizedResult({ result: result(), offers });

    const listed = theorized?.skills.map((skill) => [
      skill.offer.skill.name,
      skill.value,
      skill.bought
    ]);
    expect(listed).toEqual([
      ['Swinging Maestro', 0.2, true],
      ['Focus', 0.15, false],
      ['Corner Recovery ○', 0, true],
      ['Groundwork', 0, true]
    ]);
    expect(theorized?.scale).toBe(0.9);
  });

  it('carries the service’s win estimates to builds, their skills and the offers when it sends them', () => {
    const [first, second] = theory.finalists;
    const withWin: OptimizeTheory = {
      ...theory,
      finalists: [
        { ...first!, win: 0.09, skills: first!.skills.map((skill) => ({ ...skill, win: 0.05 })) },
        { ...second!, win: 0.07 }
      ],
      offers: theory.offers.map((offer) => ({ ...offer, win: 0.01 }))
    };

    const theorized = theorizedResult({ result: result({ theory: withWin }), offers })!;

    expect(theorized.builds.map((build) => build.win)).toEqual([0.09, 0.07]);
    expect(theorized.builds[0]!.cells.map((cell) => cell.win)).toEqual([0.05, 0.05]);
    expect(theorized.skills.every((skill) => skill.win === 0.01)).toBe(true);
  });

  it('leaves the estimates out for a service that sends none', () => {
    const theorized = theorizedResult({ result: result(), offers })!;

    expect(theorized.builds[0]!.win).toBeUndefined();
    expect(theorized.skills[0]!.win).toBeUndefined();
  });

  it('carries each build’s win rate from the races that ranked them', () => {
    const [first, second] = theory.finalists;
    const raced: OptimizeTheory = {
      ...theory,
      finalists: [
        { ...first!, raced: { win_rate: 0.381, over_pick: 0.024, error: 0.004 } },
        { ...second!, raced: { win_rate: 0.357, over_pick: 0, error: 0 } }
      ],
      ranking_races: 8000
    };

    const theorized = theorizedResult({ result: result({ theory: raced }), offers })!;

    const rates = theorized.builds.map((build) => build.raced?.win_rate);
    expect(rates).toEqual([0.381, 0.357]);
  });

  it('reads no answer from a response whose theory it cannot read', () => {
    const broken = result({
      theory: { ...theory, finalists: [{ purchases: [0] }] } as unknown as OptimizeTheory
    });

    expect(theorizedResult({ result: broken, offers })).toBeUndefined();
  });

  it('reads no answer from builds whose race results are malformed', () => {
    const [first, second] = theory.finalists;
    const malformed = {
      ...theory,
      finalists: [{ ...first!, raced: { win_rate: 0.38 } }, second!]
    } as unknown as OptimizeTheory;

    expect(theorizedResult({ result: result({ theory: malformed }), offers })).toBeUndefined();
  });
});

describe('race-ranked builds', () => {
  it('puts a build’s gap to the pick within both errors over the theory’s pick', () => {
    const pickRaced = { win_rate: 0.381, over_pick: 0.024, error: 0.003 };
    const runnerUpRaced = { win_rate: 0.375, over_pick: 0.018, error: 0.004 };

    const gap = racedGap(pickRaced, runnerUpRaced);

    expect(gap.behind).toBeCloseTo(0.006);
    expect(gap.error).toBeCloseTo(0.005);
  });

  it('shows win rates and gaps in points with their error', () => {
    expect(winRateText(0.3814)).toBe('38.1%');
    expect(gapText({ behind: 0.006, error: 0.005 })).toBe('−0.6 ± 0.5 pts');
    expect(gapText({ behind: 0.0004, error: 0.0003 })).toBe('−0.04 ± 0.03 pts');
  });
});

describe('worth in words', () => {
  it('shows lengths signed, and one that rounds to nothing without a sign', () => {
    expect([0.62, -0.16, 0.001].map((lengths) => lengthsText(lengths))).toEqual([
      '+0.62 L',
      '−0.16 L',
      '0.00 L'
    ]);
    expect(lengthsText(7.87, 1, false)).toBe('+7.9');
  });

  it('shows estimated win points as a signed share of races', () => {
    expect(winText(0.056)).toBe('+5.6%');
    expect(winText(-0.004)).toBe('−0.40%');
    expect(winText(0)).toBe('0.00%');
  });

  it('tells a skill that helps from one that adds nothing or costs her', () => {
    expect([0.4, 0.01, -0.2].map((value) => worthState(value))).toEqual([
      'helps',
      'nothing',
      'costs'
    ]);
  });

  it('says where a skill first fires: the gate, then the race’s phases', () => {
    const bounds = theory.phase_bounds;

    expect([10, 200, 1000, 1800, 2300].map((m) => fireWhere(m, bounds))).toEqual([
      'at the gate',
      'in the opening',
      'mid race',
      'in the late race',
      'in the last spurt'
    ]);
  });

  it('says how often and where a skill fires, and when it waits for her other skills', () => {
    const bounds = theory.phase_bounds;

    expect(fireText({ fire: fire(0.71, 1732), phaseBounds: bounds, countGated: false })).toBe(
      'Fires in 71% of races, first in the late race (~1,730 m)'
    );
    expect(fireText({ fire: fire(0.2, 12), phaseBounds: bounds, countGated: true })).toBe(
      'Fires in 20% of races (rarely), first at the gate (~10 m), once enough of her skills have fired'
    );
    expect(fireText({ fire: fire(0, null), phaseBounds: bounds, countGated: true })).toBe(
      'Never fires here: too few of her skills fire before it'
    );
  });

  it('names what the SP left could buy that adds nothing', () => {
    const theorized = theorizedResult({ result: result(), offers })!;

    const leftover = leftoverSp({
      pick,
      budget: 600,
      offers,
      inert: new Set(),
      skills: theorized.skills
    });

    expect(leftover?.left).toBe(200);
    expect(leftover?.useless).toEqual([]);
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

  it('says what the simulator lacks to race each skill it cannot process', () => {
    const cant = [
      { purchase: 1, why: ['unknown skill'] },
      { purchase: 2, why: ['needs a skill it cannot process'] }
    ];

    expect(ruledOutSkills(cant, offers).map((skill) => skill.needs)).toEqual([
      'skill data the simulator does not have yet',
      'a skill the simulator cannot race yet'
    ]);
  });

  it('tells how many builds the theory valued, and the races that checked them', () => {
    const tally = searchTally(result(), theory);
    const unchecked = result();
    unchecked.report.validation_seeds = [];

    expect(tally).toBe(
      'The theory valued 120 builds over 64 drawn races each, then the best ones and her build as it is raced 32 real races to check them.'
    );
    expect(searchTally(unchecked, theory)).toBe(
      'The theory valued 120 builds over 64 drawn races each.'
    );
  });

  it('tells the races of her real fields that ranked the builds by her win rate', () => {
    const tally = searchTally(result(), { ...theory, ranking_races: 8000 });

    expect(tally).toBe(
      'The theory valued 120 builds over 64 drawn races each, then its best builds raced 8,000 races of her real CM fields, seed for seed beside its pick, and her win rate there ranks them, and the best ones and her build as it is raced 32 real races to check them.'
    );
  });
});
