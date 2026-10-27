import type { ParsedRaceCapture, RaceFrame } from '@/lib/race/capture/race-capture-parser';
import {
  diagnosticHorse,
  diagnosticLabel,
  type TimedSpan
} from '@/lib/race/capture/race-diagnostics';
import { skillActivityRows } from '../results/skill-activity';

/** Instant skills, or skills without a recorded duration, keep their label this long. */
export const MINIMUM_SKILL_LABEL_SECONDS = 2;

/**
 * A skill active from the gate for longer than any timed effect lasts, such as a passive course skill,
 * describes the build rather than a moment of the race. It is listed apart instead of labelled all race.
 */
const WHOLE_RACE_START_SECONDS = 1;
const WHOLE_RACE_MINIMUM_SECONDS = 30;

export interface SkillWindow {
  runner: number;
  skillId: number;
  start: number;
  /** Absent when the recorded replay has no duration for the effect. */
  end?: number;
  wholeRace: boolean;
}

interface CalloutBase {
  key: string;
  label: string;
  /** Seconds left on the effect or mode, when its end is known. */
  remaining?: number;
}

export type RunnerCallout =
  (CalloutBase & { kind: 'skill'; skillId: number }) | (CalloutBase & { kind: 'mode' });

function lastsWholeRace(period: { start: number; end?: number }) {
  if (period.end === undefined) return false;

  return (
    period.start <= WHOLE_RACE_START_SECONDS &&
    period.end - period.start >= WHOLE_RACE_MINIMUM_SECONDS
  );
}

export function skillWindows(capture: ParsedRaceCapture): SkillWindow[] {
  return capture.runners.flatMap((runner) =>
    skillActivityRows(capture, runner.index).flatMap((row) =>
      row.periods.map((period) => ({
        runner: runner.index,
        skillId: row.id,
        start: period.start,
        end: period.end,
        wholeRace: lastsWholeRace(period)
      }))
    )
  );
}

/** The runner's skills that stay active for the whole race. */
export function wholeRaceSkillIds(capture: ParsedRaceCapture, index: number): number[] {
  return skillActivityRows(capture, index)
    .filter((row) => row.periods.some(lastsWholeRace))
    .map((row) => row.id);
}

function skillCallouts(
  windows: SkillWindow[],
  time: number,
  skillNames: Map<number, string>
): Map<number, RunnerCallout[]> {
  const callouts = new Map<number, RunnerCallout[]>();

  for (const window of windows) {
    if (window.wholeRace) continue;

    const duration = window.end === undefined ? 0 : window.end - window.start;
    const labelEnd = window.start + Math.max(MINIMUM_SKILL_LABEL_SECONDS, duration);
    if (time < window.start || time >= labelEnd) continue;

    const remaining = window.end !== undefined && window.end > time ? window.end - time : undefined;
    const list = callouts.get(window.runner) ?? [];
    list.push({
      key: 'skill-' + window.skillId + '-' + window.start,
      kind: 'skill',
      skillId: window.skillId,
      label: skillNames.get(window.skillId) ?? 'Skill ' + window.skillId,
      remaining
    });

    callouts.set(window.runner, list);
  }

  return callouts;
}

/** The end of an uninterrupted run of spans that all carry the mode's flag. */
function modeEnd(spans: (TimedSpan & { mask: number })[], startIndex: number, flag: number) {
  let end = spans[startIndex]!.endTime;
  for (let i = startIndex + 1; i < spans.length; i++) {
    const span = spans[i]!;
    const continues = Math.abs(span.startTime - end) < 1e-6 && (span.mask & flag) !== 0;
    if (!continues) break;

    end = span.endTime;
  }

  return end;
}

function modeCallouts(
  capture: ParsedRaceCapture,
  frame: RaceFrame | undefined,
  time: number
): Map<number, RunnerCallout[]> {
  const callouts = new Map<number, RunnerCallout[]>();
  const flags = Object.entries(capture.detailed?.annotations.flags ?? {});

  for (const runner of capture.runners) {
    const horse = diagnosticHorse(capture, runner.index);
    const list: RunnerCallout[] = [];

    const spanIndex = horse?.spans.findIndex((s) => time >= s.startTime && time < s.endTime) ?? -1;
    if (horse && spanIndex >= 0) {
      const span = horse.spans[spanIndex]!;
      for (const [name, flag] of flags) {
        if ((span.mask & flag) === 0) continue;

        list.push({
          key: 'mode-' + name,
          kind: 'mode',
          label: diagnosticLabel(name),
          remaining: modeEnd(horse.spans, spanIndex, flag) - time
        });
      }
    }

    // Recorded races carry the rushing state per frame; detailed annotations add its end.
    const rushing = horse?.temptationSpans?.find((s) => time >= s.startTime && time < s.endTime);
    if (rushing)
      list.push({
        key: 'rushed',
        kind: 'mode',
        label: 'Rushed',
        remaining: rushing.endTime - time
      });
    else if (!horse?.temptationSpans && (frame?.horses[runner.index]?.temptationMode ?? 0) > 0)
      list.push({ key: 'rushed', kind: 'mode', label: 'Rushed' });

    if (list.length) callouts.set(runner.index, list);
  }

  return callouts;
}

export function runnerCallouts({
  capture,
  windows,
  frame,
  time,
  skillNames,
  skills,
  modes
}: {
  capture: ParsedRaceCapture;
  windows: SkillWindow[];
  frame: RaceFrame | undefined;
  time: number;
  skillNames: Map<number, string>;
  skills: boolean;
  modes: boolean;
}): Map<number, RunnerCallout[]> {
  const bySkill = skills ? skillCallouts(windows, time, skillNames) : new Map();
  const byMode = modes ? modeCallouts(capture, frame, time) : new Map();

  const callouts = new Map<number, RunnerCallout[]>();
  for (const runner of capture.runners) {
    const list = [...(byMode.get(runner.index) ?? []), ...(bySkill.get(runner.index) ?? [])];
    if (list.length) callouts.set(runner.index, list);
  }

  return callouts;
}

/** The time left on a callout, when timers are shown and its end is known. */
export function calloutTimer(callout: RunnerCallout, timers: boolean): string | undefined {
  if (!timers || callout.remaining === undefined || callout.remaining <= 0) return undefined;

  return callout.remaining.toFixed(1) + 's';
}

export function calloutText(callout: RunnerCallout, timers: boolean) {
  const timer = calloutTimer(callout, timers);
  return timer === undefined ? callout.label : callout.label + ' ' + timer;
}
