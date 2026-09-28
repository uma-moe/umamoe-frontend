/**
 * Builds the `/api/sim/stamina` body from the page's form state.
 *
 * Kept pure and separate from the component: this is the contract with the
 * simulator, and it is the part worth testing. `effects` and `states` are
 * normalized here, so the page can hand over raw rows without validating them.
 */

export const APTITUDE_GRADES = ['S', 'A', 'B', 'C', 'D', 'E', 'F', 'G'] as const;
export type AptitudeGrade = (typeof APTITUDE_GRADES)[number];

/** The simulator scales grades as 8=S … 1=G. */
export function aptitudeGradeNumber(grade: AptitudeGrade): number {
  return APTITUDE_GRADES.length - APTITUDE_GRADES.indexOf(grade);
}

/** `race_type` values the simulator accepts: CM, CM alt, career, career team, CM win rate, Team Trials. */
export const RACE_TYPES = [0, 5, 6, 7, 8, 14] as const;
export type RaceType = (typeof RACE_TYPES)[number];

/** `effects` limits: at most 256 groups totalling at most 1024 triggers. */
export const MAX_EFFECT_GROUPS = 256;
export const MAX_EFFECT_TRIGGERS = 1024;
/** `states` limit: at most 64 windows. */
export const MAX_STATE_WINDOWS = 64;

export interface TraineeStats {
  speed: number;
  stamina: number;
  power: number;
  guts: number;
  wisdom: number;
}

/** The simulator's `setup` block. */
export interface RaceSetup {
  race_instance_id: number;
  race_type: number;
  season: number;
  weather: number;
  ground_condition: number;
  start_time_type: number;
}

/** Flat race setup as a form holds it; `buildRaceSetup` writes the body shape. */
export interface RaceSetupInput {
  raceInstanceId: number;
  /** Defaults to 0 (Champions Meeting) when missing or unknown. */
  raceType?: number;
  season: number;
  weather: number;
  ground: number;
  startTimeType: number;
}

/** An HP effect row before normalization. */
export interface StaminaEffectInput {
  count: number;
  /** Positive heals, negative drains; a percent of max HP. */
  hpPercent: number;
  startDistanceM: number;
  /** Omit to fire every trigger at `startDistanceM`. */
  endDistanceM?: number;
}

export interface StaminaEffect {
  count: number;
  hp_percent: number;
  start_distance_m: number;
  end_distance_m?: number;
}

/** A distance window before normalization; flags combine and additions sum. */
export interface StaminaStateInput {
  startDistanceM: number;
  /** Real seconds, not distance-scaled. */
  durationSeconds: number;
  spotStruggle?: boolean;
  rushed?: boolean;
  paceDown?: boolean;
  downhill?: boolean;
  dueling?: boolean;
  targetSpeedAddMps?: number;
  currentSpeedAddMps?: number;
  accelerationAddMps2?: number;
  hpConsumptionMultiplier?: number;
}

export interface StaminaState {
  start_distance_m: number;
  duration_seconds: number;
  spot_struggle?: boolean;
  rushed?: boolean;
  pace_down?: boolean;
  downhill?: boolean;
  dueling?: boolean;
  target_speed_add_mps?: number;
  current_speed_add_mps?: number;
  acceleration_add_mps2?: number;
  hp_consumption_multiplier?: number;
}

export interface StaminaForm extends RaceSetupInput {
  courseId: number;
  seed: number;
  stats: TraineeStats;
  runningStyle: string;
  motivation: number;
  /** Sprint, Mile, Medium, Long. */
  distanceAptitudes: Array<AptitudeGrade>;
  /** Nige, Senko, Sashi, Oikomi. */
  styleAptitudes: Array<AptitudeGrade>;
  /** Turf, Dirt. */
  groundAptitudes: Array<AptitudeGrade>;
  fullSpurt: boolean;
  /** Optional course length; when set, effect rows at or past the finish are dropped. */
  courseDistanceM?: number;
  effects?: Array<StaminaEffectInput>;
  states?: Array<StaminaStateInput>;
}

/** Writes the simulator's `setup` block, clamping the ranges the API documents. */
export function buildRaceSetup(input: RaceSetupInput): RaceSetup {
  return {
    race_instance_id: clampInt(input.raceInstanceId, 0, Number.MAX_SAFE_INTEGER, 0),
    race_type: raceTypeValue(input.raceType),
    season: clampInt(input.season, 1, 5, 1),
    weather: clampInt(input.weather, 1, 4, 1),
    ground_condition: clampInt(input.ground, 1, 4, 1),
    start_time_type: clampInt(input.startTimeType, 1, 4, 2)
  };
}

export function buildStaminaRequest(form: StaminaForm) {
  return {
    course_id: form.courseId,
    seed: toInt32(form.seed),
    setup: buildRaceSetup(form),
    uma: {
      stats: form.stats,
      running_style: form.runningStyle,
      motivation: form.motivation,
      aptitudes: {
        distance: form.distanceAptitudes.map(aptitudeGradeNumber),
        running_style: form.styleAptitudes.map(aptitudeGradeNumber),
        ground: form.groundAptitudes.map(aptitudeGradeNumber)
      },
      single_mode_team_rank: 0
    },
    full_spurt: form.fullSpurt,
    effects: buildEffects(form.effects ?? [], form.courseDistanceM),
    states: buildStates(form.states ?? [])
  };
}

/**
 * Normalizes effect rows: keeps every trigger on the course and before the
 * finish, clamps counts/percentages and drops rows that cannot trigger.
 */
function buildEffects(effects: Array<StaminaEffectInput>, courseDistanceM?: number): Array<StaminaEffect> {
  const finish =
    courseDistanceM !== undefined && Number.isFinite(courseDistanceM) && courseDistanceM > 0
      ? courseDistanceM
      : Number.POSITIVE_INFINITY;
  const built: Array<StaminaEffect> = [];
  let triggers = 0;

  for (const effect of effects) {
    if (built.length >= MAX_EFFECT_GROUPS || triggers >= MAX_EFFECT_TRIGGERS) break;
    if (!Number.isFinite(effect.count) || effect.count < 1) continue;
    const start = effect.startDistanceM;
    if (!Number.isFinite(start) || start < 0 || start >= finish) continue;

    const remaining = MAX_EFFECT_TRIGGERS - triggers;
    const count = Math.min(clampInt(effect.count, 1, MAX_EFFECT_TRIGGERS, 1), remaining);
    const body: StaminaEffect = {
      count,
      hp_percent: clampNumber(effect.hpPercent, -100, 100, 0),
      start_distance_m: start
    };

    const end = effect.endDistanceM;
    if (end !== undefined && Number.isFinite(end) && end > start && end < finish) {
      body.end_distance_m = end;
    }

    built.push(body);
    triggers += count;
  }

  return built;
}

/** Normalizes distance windows: drops rows without a real window and clamps every addition. */
function buildStates(states: Array<StaminaStateInput>): Array<StaminaState> {
  const built: Array<StaminaState> = [];

  for (const state of states) {
    if (built.length >= MAX_STATE_WINDOWS) break;
    if (!Number.isFinite(state.startDistanceM) || state.startDistanceM < 0) continue;
    if (!Number.isFinite(state.durationSeconds) || state.durationSeconds <= 0) continue;

    const body: StaminaState = {
      start_distance_m: state.startDistanceM,
      duration_seconds: clampNumber(state.durationSeconds, 0.001, 1200, 1)
    };

    if (state.spotStruggle) body.spot_struggle = true;
    if (state.rushed) body.rushed = true;
    if (state.paceDown) body.pace_down = true;
    if (state.downhill) body.downhill = true;
    if (state.dueling) body.dueling = true;
    if (state.targetSpeedAddMps !== undefined && Number.isFinite(state.targetSpeedAddMps)) {
      body.target_speed_add_mps = clampNumber(state.targetSpeedAddMps, -30, 30, 0);
    }
    if (state.currentSpeedAddMps !== undefined && Number.isFinite(state.currentSpeedAddMps)) {
      body.current_speed_add_mps = clampNumber(state.currentSpeedAddMps, -30, 30, 0);
    }
    if (state.accelerationAddMps2 !== undefined && Number.isFinite(state.accelerationAddMps2)) {
      body.acceleration_add_mps2 = clampNumber(state.accelerationAddMps2, -30, 30, 0);
    }
    if (state.hpConsumptionMultiplier !== undefined && Number.isFinite(state.hpConsumptionMultiplier)) {
      body.hp_consumption_multiplier = clampNumber(state.hpConsumptionMultiplier, 0, 10, 1);
    }

    built.push(body);
  }

  return built;
}

function raceTypeValue(raceType: number | undefined): number {
  if (raceType !== undefined && RACE_TYPES.some((candidate) => candidate === raceType)) {
    return raceType;
  }
  return 0;
}

/** `seed` is an int32 in the contract; a typed float or overflow is normalized, not sent raw. */
function toInt32(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.trunc(value) | 0;
}

function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}
