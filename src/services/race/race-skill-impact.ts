import { appHttp } from '../http/app-http';
import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
import { captureRaceRequest, type CaptureRaceSettings } from './race-resimulation';

/** A skill to switch off, by its owner's position in the capture's own runner list. */
export interface SkillSwitchedOff {
  runner: number;
  skillId: number;
}

/** What one skill did in the race: how much sooner each runner finished with it on, by capture position. */
export interface SkillImpact extends SkillSwitchedOff {
  secondsGained: number[];
  /** Lengths of 2.5 m, at the speed each runner crossed the line with every skill on. */
  lengthsGained: number[];
  /** Capture positions, winner first, with the skill switched off. */
  finishOrder: number[];
}

export interface RaceSkillImpact {
  /** Capture positions, winner first, with every skill on. */
  finishOrder: number[];
  /** One entry per requested skill, in request order. */
  skills: SkillImpact[];
}

/**
 * Races the capture's race once more per listed skill with that skill switched off. The simulator measures them all in
 * one request: each race runs as the race with every skill on until the skill first takes effect.
 */
export async function measureSkillImpact(
  capture: ParsedRaceCapture,
  courseId: number,
  skills: SkillSwitchedOff[],
  options: CaptureRaceSettings & { signal?: AbortSignal } = {}
): Promise<RaceSkillImpact> {
  const body = { capture: captureRaceRequest(capture, courseId, options), skills };
  // Browser verification is required even when the account is signed in.
  const response = await appHttp.request<unknown>('/api/sim/skill-impact', {
    method: 'POST',
    body,
    signal: options.signal,
    browserProof: true,
    headers: { Accept: 'application/json' }
  });

  return parseSkillImpact(response, skills);
}

export function parseSkillImpact(value: unknown, requested: SkillSwitchedOff[]): RaceSkillImpact {
  if (!isRecord(value) || !isIndexList(value.finishOrder) || !Array.isArray(value.skills))
    throw Error('The simulator returned an incompatible skill impact.');

  const runners = value.finishOrder.length;
  if (value.skills.length !== requested.length)
    throw Error('The simulator measured a different number of skills than requested.');

  const skills = value.skills.map((entry: unknown, index) => {
    const skill = requested[index]!;
    if (!isSkillImpact(entry, runners))
      throw Error('The simulator returned an incompatible skill impact.');
    if (entry.runner !== skill.runner || entry.skillId !== skill.skillId)
      throw Error('The simulator measured other skills than requested.');

    return entry;
  });

  return { finishOrder: value.finishOrder, skills };
}

function isSkillImpact(value: unknown, runners: number): value is SkillImpact {
  return (
    isRecord(value) &&
    typeof value.runner === 'number' &&
    typeof value.skillId === 'number' &&
    isNumberList(value.secondsGained, runners) &&
    isNumberList(value.lengthsGained, runners) &&
    isIndexList(value.finishOrder) &&
    value.finishOrder.length === runners
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNumberList(value: unknown, length: number): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === length &&
    value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
  );
}

function isIndexList(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((entry) => Number.isSafeInteger(entry) && entry >= 0);
}
