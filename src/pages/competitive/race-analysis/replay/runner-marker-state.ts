import type { RaceRunner } from '@/lib/race/capture/race-capture-parser';
import { hpRemainingColor } from '@/lib/race/replay/race-display';
import type { ReplayToggles } from './replay-display';
import type { ReplayState } from './replay-state.svelte';

/** What a runner's marker shows at the replay's current moment, on either view. */
export interface MarkerReadout {
  selected: boolean;
  blocked: boolean;
  triggered: boolean;
  pacemaker: boolean;
  /** Present while HP bars are shown; the percentage is absent when the replay has no HP. */
  hp?: { percent: number | undefined; color: string };
  speed?: string;
  acceleration?: string;
  description: string;
}

export function markerReadout({
  replay,
  runner,
  toggles,
  dark
}: {
  replay: ReplayState;
  runner: RaceRunner;
  toggles: ReplayToggles;
  dark: boolean;
}): MarkerReadout {
  const horse = replay.readoutFrame?.horses[runner.index];
  const hp = replay.fieldHp(runner.index, false);
  const acceleration = toggles.accel ? replay.acceleration(runner.index) : 0;
  const signedAcceleration = (acceleration > 0 ? '+' : '') + acceleration.toFixed(2);
  const description = horse
    ? `${runner.name}, gate ${runner.index + 1}, ${(horse.speed / 100).toFixed(2)} m/s, ` +
      `${horse.distance.toFixed(1)} m, lane ${replay.laneMetres(horse.lanePosition)} m`
    : runner.name;

  return {
    selected: replay.runner?.index === runner.index,
    blocked: toggles.blocked && replay.blockingNow.some((pair) => pair.horseIndex === runner.index),
    triggered:
      toggles.skills && replay.recentSkills.some((event) => event.params[0] === runner.index),
    pacemaker: toggles.positionKeep && replay.pacemaker === runner.index,
    hp: toggles.hpBars ? { percent: hp, color: hpRemainingColor(hp, dark) } : undefined,
    speed: horse && toggles.speed ? (horse.speed / 100).toFixed(2) : undefined,
    acceleration: horse && toggles.accel ? signedAcceleration : undefined,
    description
  };
}
