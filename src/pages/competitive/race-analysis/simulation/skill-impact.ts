import {
  runnersInCaptureOrder,
  type ParsedRaceCapture
} from '@/lib/race/capture/race-capture-parser';
import type { CaptureRaceSettings } from '@/services/race/race-resimulation';
import type { RaceSkillImpact, SkillSwitchedOff } from '@/services/race/race-skill-impact';

/** The race on screen, the recorded capture it was simulated from, and a rerun's seed and gates. */
export interface SkillImpactRace {
  shown: ParsedRaceCapture;
  recorded: ParsedRaceCapture;
  settings?: CaptureRaceSettings;
}

/** What a skill gained its owner in the race, and her place with it on and switched off (1 is first). */
export interface SkillGain {
  lengths: number;
  seconds: number;
  place: number;
  placeWithout: number;
}

export const skillGainSwings =
  'Large swings can be caused by other skills or position keep modes triggering differently.';

export const skillGainHelp =
  'Distance and time the skill gained in this race, compared with the same race without it. ' +
  skillGainSwings;

/** A recorded race once the simulator has raced it; a rerun needs its seed and gates instead. */
export function recordedImpactRace(capture: ParsedRaceCapture): SkillImpactRace | undefined {
  const simulated = capture.detailed !== undefined && capture.original !== undefined;
  if (!simulated || !capture.courseId) return undefined;

  return { shown: capture, recorded: capture };
}

/** Every skill of every runner, by the runner's capture position: the field one measurement covers. */
export function fieldSkills(capture: ParsedRaceCapture): SkillSwitchedOff[] {
  return runnersInCaptureOrder(capture.runners).flatMap((runner, source) =>
    [...new Set(runner.skillIds)].map((skillId) => ({ runner: source, skillId }))
  );
}

/** What each of her own skills gained the runner at gate position `index`, by skill. */
export function runnerSkillGains(
  capture: ParsedRaceCapture,
  impact: RaceSkillImpact,
  index: number
): Map<number, SkillGain> {
  const gains = new Map<number, SkillGain>();
  const source = runnersInCaptureOrder(capture.runners).findIndex(
    (runner) => runner.index === index
  );
  if (source < 0) return gains;

  const place = impact.finishOrder.indexOf(source) + 1;
  for (const skill of impact.skills) {
    if (skill.runner !== source) continue;

    gains.set(skill.skillId, {
      lengths: skill.lengthsGained[source]!,
      seconds: skill.secondsGained[source]!,
      place,
      placeWithout: skill.finishOrder.indexOf(source) + 1
    });
  }

  return gains;
}
