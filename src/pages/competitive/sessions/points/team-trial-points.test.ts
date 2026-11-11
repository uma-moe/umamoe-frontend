import { describe, expect, it } from 'vitest';
import type { ParsedRaceCapture, RaceRunner } from '@/lib/race/capture/race-capture-parser';
import type { TeamTrialScore } from '@/lib/race/capture/team-trial-capture';
import {
  capture,
  runner
} from '@/pages/competitive/race-analysis/simulation/race-simulation-fixtures';
import { boxSummary, pointsBySource, teamTrialPoints } from './team-trial-points';

const firstPlace: TeamTrialScore = {
  rawScoreId: 60,
  count: 1,
  score: 31000,
  bonuses: [
    { bonusId: 2, score: 19000 },
    { bonusId: 1, score: 1000 }
  ]
};
const skills: TeamTrialScore = { rawScoreId: 57, count: 4, score: 6000, bonuses: [] };
const rushed: TeamTrialScore = { rawScoreId: 23, count: 1, score: -500, bonuses: [] };

function scoring(cardId: number, scores: TeamTrialScore[]): RaceRunner {
  return { ...runner(0), cardId, isPlayer: true, teamTrialScores: scores };
}

function teamTrialRace(runners: RaceRunner[], teamTotalScore: number): ParsedRaceCapture {
  return {
    ...capture([...runners, runner(5)]),
    teamTrial: { round: 1, distanceType: 3, teamTotalScore, teamScores: [] }
  };
}

describe('pointsBySource', () => {
  it('splits an item into its own points and its bonuses', () => {
    const points = pointsBySource([firstPlace, skills, rushed]);

    expect(points).toMatchObject({
      placing: 11000,
      skills: 6000,
      rushed: -500,
      opponentBonus: 19000,
      otherBonus: 1000
    });
  });
});

describe('boxSummary', () => {
  it('needs three races to show a spread', () => {
    expect(boxSummary([1, 2])).toBeUndefined();
  });

  it('reads the quartiles between races', () => {
    expect(boxSummary([10, 20, 30, 40, 50])).toEqual({
      min: 10,
      lowerQuartile: 20,
      median: 30,
      upperQuartile: 40,
      max: 50
    });
  });
});

describe('teamTrialPoints', () => {
  it('averages each runner over her races, best first', () => {
    const races = [
      teamTrialRace([scoring(100101, [skills]), scoring(100201, [firstPlace])], 50000),
      teamTrialRace([scoring(100101, [firstPlace]), scoring(100201, [firstPlace])], 70000)
    ];

    const points = teamTrialPoints(races);

    expect(points?.runners.map((entry) => [entry.runner.cardId, entry.meanTotal])).toEqual([
      [100201, 31000],
      [100101, 18500]
    ]);
    expect(points?.runners[0]?.distanceTypes).toEqual([3]);
    expect(points?.teamAverage).toBe(60000);
  });

  it('has nothing to show without Team Trials races', () => {
    expect(teamTrialPoints([capture([runner(0)])])).toBeUndefined();
  });
});
