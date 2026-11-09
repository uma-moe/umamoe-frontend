/** Skill that marks a runner as a Runaway (Oonige) when it activates. */
export const RUNAWAY_SKILL_ID = 202051;

export interface SpeedUpCheckRunner {
  index: number;
  distance: number;
  runningStyle: number;
  isRunaway: boolean;
  /** 0 when calm; 3 (Front) and 4 (Speed Up) rush the runner to the front. */
  temptationMode: number;
}

/**
 * The rear range behind each runner that can enter front-runner Speed Up mode, while position
 * keeping lasts: the leading Front Runner (not rushed), and anyone rushed to the front. Runaways
 * check 17.5 m, a lone Front Runner 12.5 m, otherwise 4.5 m. A possible check, not a lottery win.
 */
export function speedUpCheckRanges(
  runners: SpeedUpCheckRunner[],
  raceDistance: number
): Map<number, number> {
  const ranges = new Map<number, number>();
  if (!(raceDistance > 0) || !runners.length) return ranges;

  const valid = runners.filter((runner) => Number.isFinite(runner.distance));
  const leader = valid.reduce<SpeedUpCheckRunner | undefined>(
    (best, runner) => (!best || runner.distance > best.distance ? runner : best),
    undefined
  );
  const fronts = valid.filter((runner) => runner.runningStyle === 1 && !runner.isRunaway).length;
  for (const runner of valid) {
    if (runner.distance < 0 || runner.distance >= (raceDistance * 10) / 24) continue;

    const rushed = runner.temptationMode !== 0;
    const forcedFront = runner.temptationMode === 3 || runner.temptationMode === 4;
    const front = runner.runningStyle === 1 || runner.isRunaway;
    if (!forcedFront && !(front && !rushed && runner.index === leader?.index)) continue;

    ranges.set(runner.index, runner.isRunaway ? 17.5 : fronts === 1 ? 12.5 : 4.5);
  }

  return ranges;
}
