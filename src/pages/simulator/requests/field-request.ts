/**
 * Builds the `/api/sim/field` body: a CM race field generated for the course's settings. League of Heroes and Team
 * Trials stay off until the simulator has room models for them.
 */

import { buildRaceSetup, type RaceSetup, type RaceSetupInput } from './stamina-request';

export type FieldMode = 'cm';

export interface FieldForm {
  courseId: number;
  seed: number;
  setup: RaceSetupInput;
  mode?: FieldMode;
}

export interface FieldBody {
  course_id: number;
  seed: number;
  setup: RaceSetup;
  mode: FieldMode;
}

export function buildFieldRequest(form: FieldForm): FieldBody {
  return {
    course_id: clampInt(form.courseId, 0, Number.MAX_SAFE_INTEGER, 0),
    seed: toInt32(form.seed),
    setup: buildRaceSetup(form.setup),
    mode: form.mode ?? 'cm'
  };
}

function toInt32(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.trunc(value) | 0;
}

function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}
