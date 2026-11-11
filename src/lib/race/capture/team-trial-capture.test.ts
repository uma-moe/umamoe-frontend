import { describe, expect, it } from 'vitest';
import { isTeamTrialCapture, teamTrialRaceInputs, teamTrialScores } from './team-trial-capture';

const skillItem = {
  raw_score_id: 57,
  num: 2,
  score: 3040,
  bonus_array: [
    { score_bonus_id: 2, bonus_score: 1895 },
    { score_bonus_id: 8, bonus_score: 145 }
  ]
};

function teamTrialFile() {
  const horse = (frame: number, team: number, viewer: number, trained: number) => ({
    frame_order: frame,
    team_id: team,
    viewer_id: viewer,
    trained_chara_id: trained
  });

  return {
    race_start_params_array: [
      {
        round: 1,
        race_instance_id: 610026,
        season: 1,
        weather: 1,
        ground_condition: 1,
        random_seed: 42,
        race_horse_data_array: [horse(1, 1, 7, 100), horse(2, 2, 9, 100), horse(3, 0, 0, 57)]
      }
    ],
    race_result_array: [
      {
        round: 1,
        distance_type: 2,
        team_total_score: 9000,
        win_type: 1,
        race_scenario: 'scenario',
        team_score_array: [{ raw_score_id: 95, num: 1, score: 4000, bonus_array: [] }],
        chara_result_array: [
          { viewer_id: 7, trained_chara_id: 100, frame_order: 1, score_array: [skillItem] },
          { viewer_id: 9, trained_chara_id: 100, frame_order: 2, score_array: [] },
          { viewer_id: 0, trained_chara_id: 57, frame_order: 3, score_array: [] }
        ]
      }
    ]
  };
}

describe('Team Trials files', () => {
  it('recognises a Team Trials file, also inside an API envelope', () => {
    expect(isTeamTrialCapture(teamTrialFile())).toBe(true);
    expect(isTeamTrialCapture({ data: teamTrialFile() })).toBe(true);
    expect(isTeamTrialCapture({ race_horse_data_array: [] })).toBe(false);
  });

  it('reads score items with their bonuses', () => {
    expect(teamTrialScores([skillItem, { raw_score_id: 'x' }])).toEqual([
      {
        rawScoreId: 57,
        count: 2,
        score: 3040,
        bonuses: [
          { bonusId: 2, score: 1895 },
          { bonusId: 8, score: 145 }
        ]
      }
    ]);
  });

  it('splits each race into a single-race capture with its runners and scores', () => {
    const [race] = teamTrialRaceInputs(teamTrialFile());

    expect(race?.input).toMatchObject({
      race_scenario: 'scenario',
      race_instance_id: 610026,
      random_seed: 42,
      race_type: 'TeamStadium'
    });
    expect(race?.race).toMatchObject({ round: 1, distanceType: 2, teamTotalScore: 9000 });
    expect(race?.race.teamScores).toHaveLength(1);
  });

  it('keys scores by trainer as well as trained character, which two trainers can share', () => {
    const [race] = teamTrialRaceInputs(teamTrialFile());

    expect([...race!.runnerScores.keys()]).toEqual(['7:100']);
  });
});
