import { describe, expect, it } from 'vitest';
import type { MultiRaceHorseEntry } from '@/lib/race/multi-race-analysis';
import { SMALL_SAMPLE } from '../session-insights';
import { activationSpread, learnerWinGap, sessionSkills } from './session-skill-stats';

const SKILL = 200_011;

function entry(
  strategy: number,
  finishOrder: number,
  activations: number[],
  learned = [SKILL]
): MultiRaceHorseEntry {
  return {
    raceId: 'race',
    runnerIndex: 0,
    charaKey: 'uma',
    name: 'Uma',
    strategy,
    finishOrder,
    learnedSkillIds: learned,
    skillActivations: activations.map((distance) => ({ id: SKILL, distance })),
    isPlayer: false,
    teamId: 0,
    lastSpurtStartDistance: 0,
    raceDistance: 2400
  };
}

describe('session skills', () => {
  it('splits a skill’s learners by running style and by whether it activated', () => {
    const entries = [
      entry(1, 1, [600]),
      entry(1, 4, []),
      entry(3, 1, []),
      entry(3, 2, [1500, 1700]),
      entry(2, 1, [], [])
    ];

    const [skill] = sessionSkills(entries);
    const front = skill?.byStyle.get(1);
    const late = skill?.byStyle.get(3);

    expect(skill?.all).toMatchObject({
      learned: 4,
      activated: 2,
      activatedWins: 1,
      idleWins: 1,
      doubleProcs: 1
    });
    expect(skill?.all.distances).toEqual([600, 1500, 1700]);
    expect(front).toMatchObject({ learned: 2, activated: 1, activatedWins: 1, idleWins: 0 });
    expect(late).toMatchObject({ learned: 2, activated: 1, activatedWins: 0, idleWins: 1 });
    expect(skill?.byStyle.has(2)).toBe(false);
  });

  it('compares the learners’ win rate with everyone else’s in points', () => {
    const use = {
      learned: 20,
      activated: 15,
      activatedWins: 3,
      idleWins: 1,
      doubleProcs: 0,
      distances: []
    };

    const gap = learnerWinGap(use, { entries: 100, wins: 12 });
    const fewLearners = learnerWinGap(
      { ...use, learned: SMALL_SAMPLE - 1 },
      { entries: 100, wins: 12 }
    );
    const fewOthers = learnerWinGap(use, { entries: 20 + SMALL_SAMPLE - 1, wins: 12 });

    // 4 of 20 learners won (20%) against 8 of 80 other runners (10%).
    expect(gap).toBeCloseTo(10);
    expect(fewLearners).toBeUndefined();
    expect(fewOthers).toBeUndefined();
  });

  it('finds the middle half and median of the activation positions', () => {
    const spread = activationSpread([1000, 200, 600, 1400, 1800]);

    expect(spread).toEqual({ low: 600, median: 1000, high: 1400 });
    expect(activationSpread([])).toBeUndefined();
  });
});
