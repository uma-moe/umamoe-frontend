/** One line of a Team Trials score: a score item, how often it was earned, and the bonuses added to it. */
export interface TeamTrialScore {
  /** `team_stadium_raw_score.id`, which also keys the item's name. */
  rawScoreId: number;
  count: number;
  /** Points including the bonuses. */
  score: number;
  bonuses: { bonusId: number; score: number }[];
}

export interface TeamTrialRace {
  round: number;
  /** The game's distance category: 1 sprint, 2 mile, 3 medium, 4 long, 5 dirt. */
  distanceType?: number;
  teamTotalScore?: number;
  /** 1 a win, 2 a loss, 3 a draw. */
  winType?: number;
  /** Team items such as placings and victory, scored to no single runner. */
  teamScores: TeamTrialScore[];
}

export const TEAM_TRIALS_RACE_TYPE = 'TeamStadium';

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function finiteNumber(value: unknown): number | undefined {
  const number = Number(value);
  return value !== null && value !== undefined && Number.isFinite(number) ? number : undefined;
}

export function isTeamTrialCapture(value: unknown): boolean {
  const input = record(value);
  const data = Object.keys(record(input.data)).length ? record(input.data) : input;

  return Array.isArray(data.race_start_params_array) && Array.isArray(data.race_result_array);
}

function teamTrialData(value: unknown): JsonRecord {
  const input = record(value);
  return Object.keys(record(input.data)).length ? record(input.data) : input;
}

export function teamTrialScores(value: unknown): TeamTrialScore[] {
  return array(value).flatMap((item): TeamTrialScore[] => {
    const entry = record(item);
    const rawScoreId = finiteNumber(entry.raw_score_id);
    const score = finiteNumber(entry.score);
    if (rawScoreId === undefined || score === undefined) return [];

    const bonuses = array(entry.bonus_array).flatMap((bonusItem) => {
      const bonus = record(bonusItem);
      const bonusId = finiteNumber(bonus.score_bonus_id);
      const bonusScore = finiteNumber(bonus.bonus_score);

      return bonusId === undefined || bonusScore === undefined
        ? []
        : [{ bonusId, score: bonusScore }];
    });

    return [{ rawScoreId, count: finiteNumber(entry.num) ?? 1, score, bonuses }];
  });
}

/** A runner's key in a Team Trials race: her trainer and trained character, which no two runners share. */
export function teamTrialRunnerKey(runner: JsonRecord): string {
  return String(runner.viewer_id ?? 0) + ':' + String(runner.trained_chara_id ?? '');
}

export interface TeamTrialRaceInput {
  /** The race as the single-race capture the game sends for one race. */
  input: JsonRecord;
  race: TeamTrialRace;
  /** Each scoring runner's score items, by `teamTrialRunnerKey`. */
  runnerScores: Map<string, TeamTrialScore[]>;
}

/** The races of a Team Trials file, in the order the file lists them. */
export function teamTrialRaceInputs(value: unknown): TeamTrialRaceInput[] {
  const data = teamTrialData(value);
  const starts = array(data.race_start_params_array);
  const results = array(data.race_result_array);
  const count = Math.min(starts.length, results.length);

  return Array.from({ length: count }, (_, index) => {
    const start = record(starts[index]);
    const result = record(results[index]);
    const runnerScores = new Map<string, TeamTrialScore[]>();

    for (const item of array(result.chara_result_array)) {
      const charaResult = record(item);
      const scores = teamTrialScores(charaResult.score_array);
      if (scores.length) runnerScores.set(teamTrialRunnerKey(charaResult), scores);
    }

    return {
      runnerScores,
      race: {
        round: finiteNumber(result.round ?? start.round) ?? index + 1,
        distanceType: finiteNumber(result.distance_type),
        teamTotalScore: finiteNumber(result.team_total_score),
        winType: finiteNumber(result.win_type),
        teamScores: teamTrialScores(result.team_score_array)
      },
      input: {
        race_horse_data_array: start.race_horse_data_array,
        race_scenario: result.race_scenario,
        race_instance_id: start.race_instance_id,
        season: start.season,
        weather: start.weather,
        ground_condition: start.ground_condition,
        random_seed: start.random_seed,
        race_type: TEAM_TRIALS_RACE_TYPE,
        horseACT_version: data.horseACT_version
      }
    };
  });
}
