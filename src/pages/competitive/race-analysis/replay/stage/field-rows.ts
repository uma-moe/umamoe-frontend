import type { RaceRunner } from '@/lib/race/capture/race-capture-parser';
import { formatRaceTime, hpRemainingColor, runningStyleName } from '@/lib/race/replay/race-display';
import { portrait, styleColors } from '@/pages/competitive/analysis-view';
import type { ReplayState } from '../replay-state.svelte';

/** One runner's line in the race field, as the list and clip frames both show it. */
export interface FieldRow {
  runner: RaceRunner;
  portrait?: string;
  finished: boolean;
  /** Absent before the first frame, and for ensembles once everyone has finished. */
  place?: number;
  chosen: boolean;
  blocked: boolean;
  visibility: number;
  pacemaker: boolean;
  styleName: string;
  /** Absent for a style without a colour, which then takes the muted text colour. */
  styleColor?: string;
  hpText: string;
  /** Absent when the replay has no HP, so the text takes the muted text colour. */
  hpColor?: string;
  gapText: string;
  gapTitle: string;
  /** The current speed, or the finish status once the runner is over the line. */
  detail: string;
}

export function formatHp(value?: number) {
  if (value === undefined) return '—';

  const percent = Math.round(value * 10) / 10;
  return (percent === 0 || percent === 100 ? String(percent) : percent.toFixed(1)) + '%';
}

function runningStyle(runner: RaceRunner) {
  return runner.result?.runningStyle ?? Number(runner.raw.runningStyle);
}

function gapText(replay: ReplayState, runner: RaceRunner, finished: boolean) {
  if (finished) {
    if (replay.ensemble) return 'At line';

    const finish = replay.finishTimes.get(runner.index);
    return finish === undefined ? '—' : formatRaceTime(finish, 2);
  }

  const horse = replay.readoutFrame?.horses[runner.index];
  if (!horse) return '—';

  const gap = Math.max(0, replay.readoutLeader - horse.distance);
  return gap < 0.05 ? 'Lead' : gap.toFixed(1) + ' m';
}

function gapTitle(replay: ReplayState, finished: boolean) {
  if (!finished) return 'Distance behind the leader';

  return replay.ensemble ? 'All samples finished' : 'Finish time';
}

function placeOf(replay: ReplayState, runner: RaceRunner, order: number, finished: boolean) {
  if (finished) return replay.ensemble ? undefined : replay.finishRanks.get(runner.index);

  return replay.readoutFrame ? order + 1 : undefined;
}

function detail(replay: ReplayState, runner: RaceRunner, finished: boolean) {
  if (finished) return replay.ensemble ? 'All finished' : 'Finished';

  const horse = replay.readoutFrame?.horses[runner.index];
  return horse ? (horse.speed / 100).toFixed(1) + ' m/s' : 'No frame';
}

export function fieldRows({
  replay,
  visibility,
  showBlocked,
  dark
}: {
  replay: ReplayState;
  visibility: Record<number, number>;
  showBlocked: boolean;
  dark: boolean;
}): FieldRow[] {
  return replay.fieldOrder.map((runner, order) => {
    const finished = replay.hasFinished(runner);
    const hp = replay.fieldHp(runner.index, finished);
    const style = runningStyle(runner);

    return {
      runner,
      portrait: portrait(runner.cardId),
      finished,
      place: placeOf(replay, runner, order, finished),
      chosen: replay.runner?.index === runner.index,
      blocked: showBlocked && replay.blockingNow.some((pair) => pair.horseIndex === runner.index),
      visibility: visibility[runner.index] ?? 0,
      pacemaker: replay.pacemaker === runner.index,
      styleName: runningStyleName(style),
      styleColor: styleColors[style],
      hpText: formatHp(hp),
      hpColor: hp === undefined ? undefined : hpRemainingColor(hp, dark),
      gapText: gapText(replay, runner, finished),
      gapTitle: gapTitle(replay, finished),
      detail: detail(replay, runner, finished)
    };
  });
}
