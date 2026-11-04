/**
 * Builds the `/api/sim/field` body: a race field generated for the course's settings. The simulator owns the mode's
 * layout and SP budget; this page only names the race and asks for the field.
 */

import { buildRaceSetup, type RaceSetup, type RaceSetupInput } from './stamina-request';

export type FieldMode =
  'cm' | 'league' | 'tt_sprint' | 'tt_mile' | 'tt_medium' | 'tt_long' | 'tt_dirt';

export interface FieldLayoutInput {
  teams?: number;
  team_size?: number;
  mobs?: number;
  mob_team_size?: number;
}

export interface FieldForm {
  courseId: number;
  seed: number;
  setup: RaceSetupInput;
  mode?: FieldMode;
  /** API-only experiment: the page always uses the mode's own layout. */
  layout?: FieldLayoutInput;
  /** Base SP each player runner may spend; the mode's own when omitted. */
  spBudget?: number;
}

export interface FieldBody {
  course_id: number;
  seed: number;
  setup: RaceSetup;
  mode: FieldMode;
  layout?: FieldLayoutInput;
  sp_budget?: number;
}

export function buildFieldRequest(form: FieldForm): FieldBody {
  const body: FieldBody = {
    course_id: clampInt(form.courseId, 0, Number.MAX_SAFE_INTEGER, 0),
    seed: toInt32(form.seed),
    setup: buildRaceSetup(form.setup),
    mode: form.mode ?? 'cm'
  };

  const layout = form.layout;
  if (layout) {
    const teams = optionalCount(layout.teams);
    const teamSize = optionalCount(layout.team_size);
    const mobs = optionalCount(layout.mobs);
    const mobTeamSize = optionalCount(layout.mob_team_size);
    if (
      teams !== undefined ||
      teamSize !== undefined ||
      mobs !== undefined ||
      mobTeamSize !== undefined
    )
      body.layout = {
        ...(teams !== undefined ? { teams } : {}),
        ...(teamSize !== undefined ? { team_size: teamSize } : {}),
        ...(mobs !== undefined ? { mobs } : {}),
        ...(mobTeamSize !== undefined ? { mob_team_size: mobTeamSize } : {})
      };
  }

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
