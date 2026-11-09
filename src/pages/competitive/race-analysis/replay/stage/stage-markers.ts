import { resolveEncodedSkill, skillRarity, type SkillData } from '@/lib/game-data/skills/skills';
import { portrait } from '@/pages/competitive/analysis-view';
import { calloutText, calloutTimer, type RunnerCallout } from '../replay-callouts';
import { snapPixel, type PixelSnap, type ReplayToggles } from '../replay-display';
import type { ReplayState } from '../replay-state.svelte';
import { crowdedRunners } from '../runner-crowding';
import { markerReadout, type MarkerReadout } from '../runner-marker-state';
import type { SkillRarity } from './canvas/skill-chip-colors';
import { laneY, type StageGeometry } from './position-scene';

export type MarkerCallout =
  | { kind: 'mode'; key: string; text: string }
  | { kind: 'skill'; key: string; name: string; timer?: string; rarity: SkillRarity };

/** A runner on the race positions stage, placed and described for one frame. */
export interface StageMarker {
  index: number;
  x: number;
  y: number;
  name: string;
  gate: number;
  color: string;
  portrait?: string;
  crowded: boolean;
  dim: boolean;
  readout: MarkerReadout;
  callouts: MarkerCallout[];
  /** Stage x of the rear end of the runner's Speed Up check range, when it can enter one. */
  speedUpRearX?: number;
}

/** Skill callouts take the rarity colours of the report's skill chips. */
export function markerCallouts(
  callouts: RunnerCallout[] | undefined,
  { timers, skills }: { timers: boolean; skills: Map<number, SkillData> }
): MarkerCallout[] {
  return (callouts ?? []).map((callout) => {
    if (callout.kind === 'mode')
      return { kind: 'mode', key: callout.key, text: calloutText(callout, timers) };

    const resolved = resolveEncodedSkill(skills, callout.skillId);
    return {
      kind: 'skill',
      key: callout.key,
      name: resolved.skill?.name ?? callout.label,
      timer: calloutTimer(callout, timers),
      rarity: skillRarity(resolved.skill, resolved.inherited)
    };
  });
}

/** The runners in view and inside the lane scale, unless hidden from the race field. */
export function stageMarkers({
  replay,
  geometry,
  laneMax,
  visibility,
  toggles,
  callouts,
  skills,
  snap,
  dark
}: {
  replay: ReplayState;
  geometry: StageGeometry;
  laneMax: number;
  visibility: Record<number, number>;
  toggles: ReplayToggles;
  callouts: Map<number, RunnerCallout[]>;
  skills: Map<number, SkillData>;
  snap: PixelSnap;
  dark: boolean;
}): StageMarker[] {
  const { display, pixelsPerMetre, scroll } = geometry;
  const placed = replay.capture.runners.flatMap((runner) => {
    const horse = replay.frame?.horses[runner.index];
    if (!horse || visibility[runner.index] === 2) return [];

    const inView = horse.distance >= display.min && horse.distance <= display.max;
    if (!inView || horse.lanePosition > laneMax) return [];

    const x = horse.distance * pixelsPerMetre - scroll;
    const range = toggles.positionKeep ? replay.speedUpRanges.get(runner.index) : undefined;
    const rearX = range === undefined ? undefined : x - range * pixelsPerMetre;
    return [{ runner, x, y: laneY(geometry, horse.lanePosition / laneMax), rearX }];
  });

  const crowded = crowdedRunners(placed.map(({ runner, x, y }) => ({ index: runner.index, x, y })));

  return placed.map(({ runner, x, y, rearX }) => ({
    index: runner.index,
    x: snapPixel(x, snap),
    y: snapPixel(y, snap),
    name: runner.name,
    gate: runner.index + 1,
    color: replay.teamColor(runner),
    portrait: portrait(runner.cardId),
    crowded: crowded.has(runner.index),
    dim: visibility[runner.index] === 1,
    readout: markerReadout({ replay, runner, toggles, dark }),
    callouts: markerCallouts(callouts.get(runner.index), { timers: toggles.skillTimers, skills }),
    speedUpRearX: rearX === undefined ? undefined : snapPixel(rearX, snap)
  }));
}
