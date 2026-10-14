import { resolveEncodedSkill, type SkillCatalogEntry } from '@/lib/catalog/skill-catalog';
import type { MonteCarloSkillInput } from '../requests/race-sim-request';
import type {
  StaminaEffectInput,
  StaminaStateInput,
  TraineeStats
} from '../requests/stamina-request';

/**
 * The HP calculator's quick input: how many skills of each kind the runner has and what happens between her and the
 * other runners, instead of each skill one by one. `planEvents` turns it into the recovery, debuffs and state windows
 * the simulator runs, placed where such skills and situations usually happen on the course.
 */

export type StatKey = keyof TraineeStats;
export const STAT_KEYS: StatKey[] = ['speed', 'stamina', 'power', 'guts', 'wisdom'];

export interface SkillCounts {
  gold: number;
  white: number;
  unique: number;
}

/** A situation between runners: on or off, for a number of seconds; `null` uses the usual length. */
export interface Situation {
  on: boolean;
  seconds: number | null;
}

export interface HpPlan {
  /** Recovery skills; the unique's heal and level apply to every unique counted. */
  recovery: SkillCounts & { uniquePercent: number; uniqueLevel: number };
  speed: SkillCounts;
  accel: SkillCounts;
  /** Green skills: ◎ and gold add 60 to a stat, ○ adds 40. */
  green: Record<StatKey, { gold: number; white: number }>;
  positionFight: Situation;
  rushed: Situation;
  paceDown: Situation;
  duel: Situation;
  /** Downhill mode on every downhill of the course. */
  downhill: boolean;
  /** HP debuffs other runners' skills hit her with, by the skill's tier. */
  debuffs: SkillCounts;
}

/** Heal as a percent of maximum HP. Unique recovery grows 2% of its value per level above 1. */
export const RECOVERY_PERCENT = { gold: 5.5, white: 1.5 } as const;
/** HP a debuff from another runner's skill takes, as a percent of her maximum HP. */
export const DEBUFF_PERCENT = { gold: 3, white: 1, unique: 3 } as const;
export const UNIQUE_RECOVERY_TIERS = [1.5, 3.5, 5.5, 7.5, 9.5] as const;
export const UNIQUE_LEVEL_BONUS = 0.02;
/** Typical speed and acceleration skills: what they add and their base duration in seconds per 1,000 m of race. */
export const SPEED_SKILLS = {
  gold: { add: 0.35, seconds: 2.4 },
  white: { add: 0.15, seconds: 2.4 },
  unique: { add: 0.35, seconds: 5 }
} as const;
export const ACCEL_SKILLS = {
  gold: { add: 0.4, seconds: 3 },
  white: { add: 0.2, seconds: 3 },
  unique: { add: 0.4, seconds: 4 }
} as const;
export const GREEN_BONUS = { gold: 60, white: 40 } as const;
/** Upper bound of every counter; keeps the request well inside the simulator's limits. */
export const MAX_COUNT = 20;

export function createHpPlan(): HpPlan {
  const counts = () => ({ gold: 0, white: 0, unique: 0 });
  return {
    recovery: { ...counts(), uniquePercent: 3.5, uniqueLevel: 1 },
    speed: counts(),
    accel: counts(),
    green: Object.fromEntries(
      STAT_KEYS.map((key) => [key, { gold: 0, white: 0 }])
    ) as HpPlan['green'],
    positionFight: { on: false, seconds: null },
    rushed: { on: false, seconds: null },
    paceDown: { on: false, seconds: null },
    duel: { on: false, seconds: null },
    downhill: false,
    debuffs: counts()
  };
}

/**
 * Where each trigger of an effect lands: all at the start, or spread evenly from the start to the end. Used to place
 * markers on the course and to split recovery before and after the spurt check.
 */
export function effectTriggers(input: StaminaEffectInput): number[] {
  const count = Math.round(input.count);
  if (!Number.isFinite(count) || count < 1 || !Number.isFinite(input.startDistanceM)) return [];
  const end = input.endDistanceM;
  if (end === undefined || !Number.isFinite(end) || end <= input.startDistanceM || count === 1)
    return Array.from({ length: count }, () => input.startDistanceM);
  return Array.from(
    { length: count },
    (_, index) => input.startDistanceM + ((end - input.startDistanceM) * index) / (count - 1)
  );
}

/** Scheduled HP changes as a share of maximum HP: those that land before `checkDistance`, and all of them. */
export function effectRates(inputs: StaminaEffectInput[], checkDistance?: number) {
  let before = 0,
    total = 0;
  for (const input of inputs) {
    if (!Number.isFinite(input.hpPercent)) continue;
    for (const at of effectTriggers(input)) {
      total += input.hpPercent / 100;
      if (checkDistance !== undefined && at < checkDistance) before += input.hpPercent / 100;
    }
  }
  return { before, total };
}

/** Course layout the plan places events on, in metres from the start. */
export interface PlanCourse {
  distance: number;
  corners?: { start: number; length: number }[];
  straights?: { start: number; end: number }[];
  slopes?: { start: number; length: number; slope: number }[];
}

/** One placed event, for the course strip. */
export interface PlanMarker {
  kind: 'recovery' | 'debuff' | 'speed' | 'accel' | 'state';
  at: number;
  /** Metres of the stretch it can happen in, or roughly lasts. */
  length?: number;
  label: string;
}

/**
 * Adds a green bonus to a raw stat as the game applies it: on top of the stat after points above 1,200 count half.
 * The simulator halves raw points above 1,200 again, so up there the raw value grows by twice the bonus.
 */
export function withBonus(raw: number, bonus: number): number {
  const counted = (raw > 1200 ? 1200 + (raw - 1200) / 2 : raw) + bonus;
  return Math.round(counted > 1200 ? 1200 + (counted - 1200) * 2 : counted);
}

/** Raw stats with green skills added. */
export function planStats(stats: TraineeStats, plan: HpPlan): TraineeStats {
  const result = { ...stats };
  for (const key of STAT_KEYS)
    result[key] = withBonus(
      stats[key],
      plan.green[key].gold * GREEN_BONUS.gold + plan.green[key].white * GREEN_BONUS.white
    );
  return result;
}

/** Chance in percent that she gets rushed in a race, from her wit. */
export const rushChance = (wit: number) => (6.5 / Math.log10(0.1 * Math.max(1, wit) + 1)) ** 2;

export function uniqueRecovery(plan: HpPlan): number {
  return (
    Math.round(
      plan.recovery.uniquePercent *
        (1 + UNIQUE_LEVEL_BONUS * (plan.recovery.uniqueLevel - 1)) *
        1000
    ) / 1000
  );
}

/**
 * The usual length in seconds of each situation: a position fight from her guts; being rushed for its average
 * length, as it lasts 3 s and is checked every 3 s with a 55% chance to end, up to 12 s; pace down for a few seconds;
 * and a duel from the final straight to the finish at about 20 m/s.
 */
export function situationSeconds(
  key: 'positionFight' | 'rushed' | 'paceDown' | 'duel',
  guts: number,
  course: PlanCourse
): number {
  if (key === 'positionFight') return round1(Math.sqrt(700 * Math.max(1, guts)) * 0.012);
  if (key === 'rushed') return round1(3 * (1 + 0.45 + 0.45 ** 2 + 0.45 ** 3));
  if (key === 'paceDown') return 6;
  return round1((course.distance - finalStraight(course)) / 20);
}

const round1 = (value: number) => Math.round(value * 10) / 10;
const place = (value: number, distance: number) =>
  Math.min(distance - 10, Math.max(0, Math.round(value / 10) * 10));

function finalStraight(course: PlanCourse) {
  const last = [...(course.straights ?? [])].sort((a, b) => b.start - a.start)[0];
  return last && last.start > course.distance / 2 ? last.start : (course.distance * 5) / 6;
}

/**
 * Turns the plan into the simulator's recovery, debuffs and state windows, as windows each race draws from: recovery
 * and debuffs land somewhere in mid race, before the spurt decision at two thirds of the race; speed skills somewhere
 * in the spurt, acceleration skills near its start and unique speed on the final straight; she gets rushed by her
 * wit's chance, somewhere in sections 2 to 9 as the game rolls it. Fights, pace down, duels and downhill mode are
 * where they happen. Skill durations scale with the race distance.
 */
export function planEvents(
  plan: HpPlan,
  course: PlanCourse,
  guts: number,
  wit = 1000
): { effects: StaminaEffectInput[]; states: StaminaStateInput[]; markers: PlanMarker[] } {
  const distance = course.distance;
  const midStart = distance / 6,
    decision = (distance * 2) / 3,
    straight = finalStraight(course),
    scale = distance / 1000;
  const effects: StaminaEffectInput[] = [],
    states: StaminaStateInput[] = [],
    markers: PlanMarker[] = [];
  const tally = (parts: Array<[number, string]>) =>
    parts
      .filter(([count]) => count > 0)
      .map(([count, name]) => count + ' ' + name)
      .join(', ');

  // Recovery and debuffs: each lands somewhere in mid race.
  const from = place(midStart, distance),
    to = place(decision, distance);
  const heals: Array<[number, number, string]> = [
    [plan.recovery.unique, uniqueRecovery(plan), 'unique'],
    [plan.recovery.gold, RECOVERY_PERCENT.gold, 'gold'],
    [plan.recovery.white, RECOVERY_PERCENT.white, 'white']
  ];
  for (const [count, hpPercent] of heals)
    if (count > 0) effects.push({ count, hpPercent, startDistanceM: from, endDistanceM: to });
  if (heals.some(([count]) => count > 0))
    markers.push({
      kind: 'recovery',
      at: from,
      length: to - from,
      label: 'Recovery: ' + tally(heals.map(([count, , name]) => [count, name])) + ', in mid race'
    });
  const debuffs = (['gold', 'white', 'unique'] as const).map(
    (tier) => [plan.debuffs[tier], tier] as [number, string]
  );
  for (const [count, tier] of debuffs)
    if (count > 0)
      effects.push({
        count,
        hpPercent: -DEBUFF_PERCENT[tier as keyof SkillCounts],
        startDistanceM: from,
        endDistanceM: to
      });
  if (debuffs.some(([count]) => count > 0))
    markers.push({
      kind: 'debuff',
      at: from,
      length: to - from,
      label: 'HP debuffs: ' + tally(debuffs) + ', in mid race'
    });

  // Speed and acceleration skills: each starts somewhere in its stretch of the spurt.
  const skill = (kind: 'speed' | 'accel', tier: keyof SkillCounts, start: number, end: number) => {
    const values = (kind === 'speed' ? SPEED_SKILLS : ACCEL_SKILLS)[tier],
      count = plan[kind][tier],
      duration = round1(values.seconds * scale),
      first = place(start, distance),
      // About 20 m/s while it lasts, so it ends before the finish.
      last = Math.max(first, place(end - duration * 20, distance));
    for (let index = 0; index < count; index++)
      states.push({
        startDistanceM: first,
        durationSeconds: duration,
        ...(last > first ? { startSpreadM: last - first } : {}),
        ...(kind === 'speed'
          ? { targetSpeedAddMps: values.add }
          : { accelerationAddMps2: values.add })
      });
    return count ? { first, last: last + duration * 20 } : undefined;
  };
  const stretch = (kind: 'speed' | 'accel', windows: Array<ReturnType<typeof skill>>) => {
    const used = windows.filter((window) => window !== undefined);
    if (!used.length) return;
    const first = Math.min(...used.map((window) => window.first)),
      last = Math.max(...used.map((window) => window.last));
    markers.push({
      kind,
      at: first,
      length: Math.min(distance, last) - first,
      label:
        (kind === 'speed' ? 'Speed: ' : 'Acceleration: ') +
        tally((['gold', 'white', 'unique'] as const).map((tier) => [plan[kind][tier], tier])) +
        ', in the spurt'
    });
  };
  stretch('speed', [
    skill('speed', 'gold', decision, distance - 60),
    skill('speed', 'white', decision, distance - 60),
    skill('speed', 'unique', straight, distance - 60)
  ]);
  stretch(
    'accel',
    (['unique', 'gold', 'white'] as const).map((tier) =>
      skill('accel', tier, decision, decision + distance / 12)
    )
  );

  // Situations between runners.
  const situation = (
    key: 'positionFight' | 'rushed' | 'paceDown' | 'duel',
    at: number,
    flag: Partial<StaminaStateInput>,
    label: string,
    spread = 0
  ) => {
    const item = plan[key];
    if (!item.on) return;
    const seconds = item.seconds ?? situationSeconds(key, guts, course),
      start = place(at, distance);
    states.push({
      startDistanceM: start,
      durationSeconds: seconds,
      ...flag,
      ...(spread ? { startSpreadM: spread } : {})
    });
    markers.push({ kind: 'state', at: start, length: spread || seconds * 20, label });
  };
  situation('positionFight', 150, { spotStruggle: true }, 'Position fight');
  const chance = Math.min(100, rushChance(wit));
  situation(
    'rushed',
    (distance * 2) / 24,
    { rushed: true, chance: Math.round(chance * 10) / 1000 },
    'Rushed in ' + Math.round(chance) + '% of races, early to mid race',
    place((distance * 7) / 24, distance)
  );
  situation('paceDown', distance * 0.35, { paceDown: true }, 'Pace down');
  situation('duel', straight, { dueling: true }, 'Duel');
  if (plan.downhill)
    for (const slope of course.slopes ?? []) {
      if (slope.slope >= 0 || slope.start >= distance) continue;
      const seconds = round1(slope.length / 20);
      states.push({ startDistanceM: slope.start, durationSeconds: seconds, downhill: true });
      markers.push({
        kind: 'state',
        at: slope.start,
        length: slope.length,
        label: 'Downhill mode'
      });
    }

  return { effects, states, markers };
}

/** The part of a catalog effect that holds the first trigger's first value, with its kind. */
function firstEffect(effect: string | undefined) {
  const match = (effect ?? '').match(
    /(Stamina Recovery|Increase Target Speed|Increase Current Speed|Increase Acceleration|(Speed|Stamina|Power|Guts|Wisdom|Wit) Stat Up)\s*\(\s*(-?\d*\.?\d+)\s*\)/i
  );
  if (!match) return undefined;
  const name = match[1]!.toLowerCase();
  const stat = match[2]?.toLowerCase();
  return {
    kind: name.startsWith('stamina recovery')
      ? ('recovery' as const)
      : name.includes('acceleration')
        ? ('accel' as const)
        : name.includes('speed') && !stat
          ? ('speed' as const)
          : ('green' as const),
    stat: (stat === 'wit' ? 'wisdom' : stat) as StatKey | undefined,
    value: Number(match[3])
  };
}

const EARLY = /phase(?:_random)?==0|activate_count_start|is_activate_start/;

/** Whether a green skill's simple conditions hold on this course for this running style; unknown ones count. */
function greenApplies(conditions: string | undefined, context: CountContext) {
  const text = (conditions ?? '').split('@')[0]!.replace(/\s+/g, '');
  const checks: Array<[RegExp, number | undefined]> = [
    [/rotation==(\d)/, context.turn],
    [/ground_type==(\d)/, context.surface],
    [/distance_type==(\d)/, context.distanceType],
    [/running_style==(\d)/, context.style]
  ];
  for (const [pattern, actual] of checks) {
    const match = text.match(pattern);
    if (match && actual !== undefined && Number(match[1]) !== actual) return false;
  }
  if (/is_basis_distance==1/.test(text) && context.distance !== undefined)
    return context.distance % 400 === 0;
  return true;
}

export interface CountContext {
  distance?: number;
  distanceType?: number;
  surface?: number;
  turn?: number;
  /** 1 front runner … 4 end closer, as skill conditions number them. */
  style?: number;
}

/** Which counter one skill adds to, with the value from its catalog effect. */
export type SkillCount =
  | {
      kind: 'recovery' | 'speed' | 'accel';
      tier: keyof SkillCounts;
      value: number;
      /** Fires at the start or in the early race, long before the spurt, so it barely changes HP use. */
      early: boolean;
    }
  | { kind: 'green'; stat: StatKey; tier: 'gold' | 'white'; value: number };

/**
 * Skill icons by what they do. The game draws a skill's icon by its kind (the first four digits) and tier (the last:
 * 1 white, 2 gold, 3 unique, 4 a version that makes things worse), so the icon also tells the kind when the catalog
 * has no effect values.
 */
export const SKILL_ICONS = {
  recovery: {
    white: 'utx_ico_skill_20021',
    gold: 'utx_ico_skill_20022',
    unique: 'utx_ico_skill_20023'
  },
  speed: {
    white: 'utx_ico_skill_20011',
    gold: 'utx_ico_skill_20012',
    unique: 'utx_ico_skill_20013'
  },
  accel: {
    white: 'utx_ico_skill_20041',
    gold: 'utx_ico_skill_20042',
    unique: 'utx_ico_skill_20043'
  },
  /** Other runners' skills that tire her; the game has no unique icon for them, so a unique shows as gold. */
  debuffs: {
    white: 'utx_ico_skill_30051',
    gold: 'utx_ico_skill_30052',
    unique: 'utx_ico_skill_30052'
  },
  green: {
    speed: 'utx_ico_skill_10011',
    stamina: 'utx_ico_skill_10021',
    power: 'utx_ico_skill_10031',
    guts: 'utx_ico_skill_10041',
    wisdom: 'utx_ico_skill_10051'
  } satisfies Record<StatKey, string>
} as const;

const ICON_KINDS: Record<string, 'recovery' | 'speed' | 'accel'> = {
  '2001': 'speed',
  '2002': 'recovery',
  '2004': 'accel'
};
const ICON_STATS: Record<string, StatKey> = {
  '1001': 'speed',
  '1002': 'stamina',
  '1003': 'power',
  '1004': 'guts',
  '1005': 'wisdom'
};
/** How much a unique heals, from how its description puts it. */
const HEAL_WORDS: Array<[RegExp, number]> = [
  [/greatly|tremendously|massively/i, 0.055],
  [/moderately/i, 0.035],
  [/slightly/i, 0.015]
];

/** What a skill does from its icon and description, for catalogs without effect values. */
function iconEffect(skill: SkillCatalogEntry): ReturnType<typeof firstEffect> {
  const code = skill.icon?.match(/(\d{5})\.(?:png|webp)$/)?.[1];
  if (!code || code[4] === '4') return undefined;
  const family = code.slice(0, 4),
    description = skill.description ?? '';
  // Inherited uniques can carry a stat icon; their description says what they really do ("surge ahead" is speed).
  const described = /recover (?:own )?endurance/i.test(description)
    ? ('recovery' as const)
    : /accelerat/i.test(description)
      ? ('accel' as const)
      : /velocity|surge ahead|kick forward/i.test(description)
        ? ('speed' as const)
        : undefined;
  const stat = ICON_STATS[family];
  if (stat && !described) {
    // A green raises a stat: marked ◎ or ○, or said to raise performance, proficiency or a stat by name.
    const green =
      /[◎○]\s*$/.test(skill.name) ||
      (/performance|proficiency|\b(?:speed|stamina|power|guts|wit)\b/i.test(description) &&
        !/\{\d\}/.test(description));
    if (!green) return undefined;
    const strong =
      code[4] === '2' ||
      /◎\s*$/.test(skill.name) ||
      (!/○\s*$/.test(skill.name) && !/^\s*moderately/i.test(description));
    return { kind: 'green', stat, value: strong ? GREEN_BONUS.gold : GREEN_BONUS.white };
  }
  const kind = ICON_KINDS[family] ?? described;
  if (!kind) return undefined;
  const heal = HEAL_WORDS.find(([words]) => words.test(description))?.[1];
  return {
    kind,
    stat: undefined,
    value: kind === 'recovery' ? (heal ?? (code[4] === '2' ? 0.055 : 0.015)) : 1
  };
}

/**
 * What one catalog skill counts as: recovery, speed or acceleration of a tier, or a green skill on a stat. Her own
 * unique counts as unique; an inherited unique counts as white. `undefined` when it does not change her HP use.
 */
export function classifySkill(skill: SkillCatalogEntry, inherited = false): SkillCount | undefined {
  const effect = firstEffect(skill.effect) ?? iconEffect(skill);
  if (!effect || effect.value <= 0) return undefined;
  if (effect.kind === 'green')
    return effect.stat
      ? {
          kind: 'green',
          stat: effect.stat,
          tier: effect.value >= 60 ? 'gold' : 'white',
          value: effect.value
        }
      : undefined;
  return {
    kind: effect.kind,
    tier:
      (skill.unique || skill.rarity >= 3) && !inherited
        ? 'unique'
        : skill.rarity === 2
          ? 'gold'
          : 'white',
    value: effect.value,
    early: effect.kind !== 'recovery' && EARLY.test(skill.conditions ?? '')
  };
}

export const STAT_LABELS: Record<StatKey, string> = {
  speed: 'Speed',
  stamina: 'Stamina',
  power: 'Power',
  guts: 'Guts',
  wisdom: 'Wit'
};
const TIER_LABELS = { gold: 'Gold', white: 'White', unique: 'Unique' } as const;
const KIND_NOUNS = { recovery: 'recovery', speed: 'speed', accel: 'acceleration' } as const;

/** The counter a skill adds to, in words: "Gold recovery", "Stamina ◎". */
export function skillCountLabel(item: SkillCount): string {
  return item.kind === 'green'
    ? STAT_LABELS[item.stat] + (item.tier === 'gold' ? ' ◎' : ' ○')
    : TIER_LABELS[item.tier] + ' ' + KIND_NOUNS[item.kind];
}

/**
 * Adds one skill to the counts. A unique recovery also sets the unique's heal to the nearest tier, and its level when
 * given. Returns false when that counter is already full.
 */
export function addSkillCount(
  plan: Pick<HpPlan, 'recovery' | 'speed' | 'accel' | 'green'>,
  item: SkillCount,
  level?: number
): boolean {
  if (item.kind === 'green') {
    const green = plan.green[item.stat];
    if (green[item.tier] >= MAX_COUNT) return false;
    green[item.tier] += 1;
    return true;
  }
  const group = plan[item.kind];
  if (group[item.tier] >= (item.tier === 'unique' ? 2 : MAX_COUNT)) return false;
  group[item.tier] += 1;
  if (item.kind === 'recovery' && item.tier === 'unique') {
    const percent = item.value * 100;
    plan.recovery.uniquePercent = UNIQUE_RECOVERY_TIERS.reduce((best, tier) =>
      Math.abs(tier - percent) < Math.abs(best - percent) ? tier : best
    );
    if (level !== undefined) plan.recovery.uniqueLevel = Math.min(6, Math.max(1, level));
  }
  return true;
}

/**
 * Counts a runner's learned skills into the plan's skill counts, from each skill's catalog effect: what it heals, how
 * much speed or acceleration it adds, and which stat a green skill raises when its course conditions hold. Early-race
 * speed and acceleration skills are left out, as they fire long before the spurt.
 */
export function countSkills(
  skills: MonteCarloSkillInput[],
  catalog: Map<number, SkillCatalogEntry>,
  context: CountContext = {}
): Pick<HpPlan, 'recovery' | 'speed' | 'accel' | 'green'> {
  const plan = createHpPlan();
  const seen = new Set<number>();
  for (const learned of skills) {
    const { skill, inherited, level } = resolveEncodedSkill(
      catalog,
      learned.skillId * 10 + (learned.level ?? 1)
    );
    if (!skill || seen.has(skill.skill_id)) continue;
    seen.add(skill.skill_id);
    const item = classifySkill(skill, inherited);
    if (!item) continue;
    if (item.kind === 'green' ? !greenApplies(skill.conditions, context) : item.early) continue;
    addSkillCount(plan, item, level);
  }
  return { recovery: plan.recovery, speed: plan.speed, accel: plan.accel, green: plan.green };
}
