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
  /** Base SP each player runner may spend; the simulator's CM default when omitted. */
  spBudget?: number;
}

export interface FieldBody {
  course_id: number;
  seed: number;
  setup: RaceSetup;
  mode: FieldMode;
  sp_budget?: number;
}

export function buildFieldRequest(form: FieldForm): FieldBody {
  const body: FieldBody = {
    course_id: clampInt(form.courseId, 0, Number.MAX_SAFE_INTEGER, 0),
    seed: toInt32(form.seed),
    setup: buildRaceSetup(form.setup),
    mode: form.mode ?? 'cm'
  };

  const spBudget = optionalCount(form.spBudget);
  if (spBudget !== undefined) body.sp_budget = spBudget;

  return body;
}

function optionalCount(value: number | undefined): number | undefined {
  if (!Number.isFinite(value)) return undefined;
  const numeric = Number(value);
  return numeric > 0 ? clampInt(numeric, 1, Number.MAX_SAFE_INTEGER, 1) : undefined;
}

function toInt32(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.trunc(value) | 0;
}

function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}
