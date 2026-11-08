import type { RaceRunner } from '@/lib/race/capture/race-capture-parser';

export const replayTeamColors = ['#69b7ee', '#e69c72', '#c79be7', '#78bba3'];

function teamKey(runner: RaceRunner) {
  return String(runner.raw.trainer_id ?? runner.raw.team_id ?? runner.trainerName ?? runner.index);
}

/** Each runner's team colour as the replay draws it: the capture's own colour, else the palette in team order. */
export function teamColors(runners: RaceRunner[]): (runner: RaceRunner) => string {
  const teams = [...new Set(runners.map(teamKey))];

  return (runner) => {
    const recorded = runner.raw.team_color;
    if (typeof recorded === 'string' && /^#[0-9a-f]{6}$/i.test(recorded)) return recorded;

    return replayTeamColors[teams.indexOf(teamKey(runner)) % replayTeamColors.length]!;
  };
}
