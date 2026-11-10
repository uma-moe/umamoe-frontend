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

/** A hex colour blended toward white by `ratio` (0 to 1); other colour strings pass through. */
export function towardWhite(color: string, ratio: number) {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return color;

  const channel = (offset: number) =>
    Math.round(parseInt(color.slice(offset, offset + 2), 16) * (1 - ratio) + 255 * ratio);
  return `rgb(${channel(1)}, ${channel(3)}, ${channel(5)})`;
}
