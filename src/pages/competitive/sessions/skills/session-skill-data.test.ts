import { describe, expect, it } from 'vitest';
import type { MultiRaceHorseEntry } from '@/lib/race/multi-race-analysis';
import {
  validateSkillDetail,
  validateSkillOverview
} from '../../champions-meeting/skills/cm-skill-analysis';
import { sessionSkillData, skillUseSummaries } from './session-skill-data';

const SKILL = 200_011;

function entry(
  overrides: Partial<MultiRaceHorseEntry> & { activations?: number[] }
): MultiRaceHorseEntry {
  const { activations = [], ...rest } = overrides;

  return {
    raceId: 'race-1',
    runnerIndex: 0,
    charaKey: 'uma',
    name: 'Uma',
    strategy: 1,
    finishOrder: 5,
    trainerName: 'Trainer',
    learnedSkillIds: [SKILL],
    skillActivations: activations.map((distance) => ({ id: SKILL, distance })),
    isPlayer: false,
    teamId: 0,
    lastSpurtStartDistance: 0,
    raceDistance: 2400,
    ...rest
  };
}

describe('session skill data', () => {
  it('counts learners per running style the way CM Data overview rows do', () => {
    const entries = [
      entry({ trainerName: 'A', finishOrder: 1, teamId: 1, activations: [600] }),
      entry({ trainerName: 'A', teamId: 1, activations: [] }),
      entry({ trainerName: 'B', teamId: 2, activations: [1500, 1700] }),
      entry({ trainerName: 'C', strategy: 3, learnedSkillIds: [], activations: [] })
    ];

    const { overview } = sessionSkillData(entries);
    const frontRow = overview.rows.find((row) => row[0] === SKILL && row[1] === 'Nige');

    // players, learned, activated, procs, repeats, wins active/inactive, team wins active/inactive
    expect(frontRow?.slice(2)).toEqual([2, 3, 2, 3, 1, 1, 0, 1, 1]);
    expect(overview.allPlayerCounts[SKILL]).toBe(2);
    expect(overview.populationByStyle).toEqual({ Nige: [3, 1], Sashi: [1, 0] });
    expect(() => validateSkillOverview(overview)).not.toThrow();
  });

  it('files each learner’s result under the course bucket of its first activation', () => {
    const entries = [
      entry({ finishOrder: 1, teamId: 1, activations: [1700, 600] }),
      entry({ activations: [2400] })
    ];

    const { details } = sessionSkillData(entries);
    const buckets = details[SKILL]?.styles.Nige;

    expect(buckets).toEqual([
      [25, 1, 1, 1, 1],
      [70, 1, 0, 0, 0],
      [99, 1, 1, 0, 0]
    ]);
    expect(() => validateSkillDetail(details[SKILL]!)).not.toThrow();
  });

  it('draws the course at the distance most races ran', () => {
    const entries = [
      entry({ raceId: 'a', raceDistance: 2400 }),
      entry({ raceId: 'b', raceDistance: 2400 }),
      entry({ raceId: 'c', raceDistance: 1600 })
    ];

    const { overview } = sessionSkillData(entries);

    expect(overview.courseDistance).toBe(2400);
    expect(overview.races).toBe(3);
  });

  it('sums a skill’s learners and the population for the chosen style', () => {
    const entries = [
      entry({ finishOrder: 1, activations: [600] }),
      entry({ activations: [600, 900] }),
      entry({ strategy: 3, finishOrder: 1, activations: [] })
    ];
    const { overview } = sessionSkillData(entries);

    const frontRunners = skillUseSummaries(overview, '1');
    const everyone = skillUseSummaries(overview, 'all');

    expect(frontRunners.skills).toEqual([
      { skillId: SKILL, owned: 2, activated: 2, repeat: 1, learnerWins: 1 }
    ]);
    expect(frontRunners.population).toEqual({ entries: 2, wins: 1 });
    expect(everyone.skills[0]?.learnerWins).toBe(2);
    expect(everyone.population).toEqual({ entries: 3, wins: 2 });
  });
});
