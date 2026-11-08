import { describe, expect, it } from 'vitest';
import { oddsGroups, topThreeRate } from './estimate-groups';
import { capture, monteCarlo, runner } from '../race-simulation-fixtures';

describe('odds by team', () => {
  const race = capture([
    { ...runner(0, { raw: { team_id: 5 }, trainerName: 'Aoi' }), isPlayer: true },
    runner(1, { raw: { team_id: 2 }, trainerName: 'Ren' }),
    runner(2, { raw: { team_id: 5 }, trainerName: 'Aoi' }),
    runner(3, { raw: { team_id: 2 }, trainerName: 'Ren' })
  ]);
  const result = monteCarlo([
    [0, 1, 2, 3],
    [2, 0, 1, 3],
    [2, 1, 0, 3],
    [3, 0, 1, 2]
  ]);

  it('ranks the teams, each named after its trainer with its members’ wins added up', () => {
    const groups = oddsGroups(race, result);

    const summary = groups.map((group) =>
      group.kind === 'team' ? [group.label, group.own, group.winRate, group.wins] : ['field']
    );

    expect(summary).toEqual([
      ['Aoi', true, 75, 3],
      ['Ren', false, 25, 1]
    ]);
  });

  it('keeps each team’s members in the capture’s order with their own finishes', () => {
    const [aoi] = oddsGroups(race, result);

    const members = aoi?.runners.map((odds) => [odds.source, odds.winRate, odds.finishes]);

    expect(members).toEqual([
      [0, 25, [1, 2, 1, 0]],
      [2, 50, [2, 0, 1, 1]]
    ]);
  });

  it('rates a runner’s podium finishes', () => {
    const [aoi] = oddsGroups(race, result);

    const rates = aoi?.runners.map((odds) => topThreeRate(odds, result.runs));

    expect(rates).toEqual([100, 75]);
  });
});

describe('odds for a race without teams', () => {
  it('lists the whole field, best first', () => {
    const race = capture([runner(0), runner(1), runner(2)]);
    const result = monteCarlo([
      [1, 0, 2],
      [1, 2, 0],
      [0, 1, 2]
    ]);

    const [field] = oddsGroups(race, result);

    expect(field?.kind).toBe('field');
    expect(field?.runners.map((odds) => odds.source)).toEqual([1, 0, 2]);
  });
});
