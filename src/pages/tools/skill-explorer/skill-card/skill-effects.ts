import type { SkillEffect, SkillEffectAlternative } from '@/lib/game-data/skills/skill-effects';

export interface SkillEffectDetails {
  effects: string[];
  duration: string;
}

const EFFECT_LABELS: Record<number, string> = {
  1: 'Speed stat',
  2: 'Stamina stat',
  3: 'Power stat',
  4: 'Guts stat',
  5: 'Wit stat',
  8: 'Vision',
  9: 'HP',
  10: 'Start delay',
  13: 'Rushing duration',
  14: 'Start delay',
  21: 'Current speed',
  22: 'Current speed',
  27: 'Target speed',
  28: 'Lane movement',
  31: 'Acceleration',
  35: 'Target lane',
  37: 'Random gold skills'
};

function decimal(value: number): string {
  return String(Number(value.toFixed(4)));
}

function effectText(effect: SkillEffect): string {
  const { kind, value, target } = effect;
  const label = EFFECT_LABELS[kind] ?? 'Additional effect';
  const affected = target === 1 ? label : `Opponents: ${label.toLowerCase()}`;
  if (kind === 10) return `${affected} ×${decimal(value)}`;
  if (kind === 9) return `${affected} ${value > 0 ? '+' : ''}${decimal(value * 100)}% max HP`;

  let unit = '';
  if ([21, 22, 27].includes(kind)) unit = 'm/s';
  else if (kind === 31) unit = 'm/s²';
  else if (kind === 8) unit = 'm';
  else if ([13, 14].includes(kind)) unit = 's';

  const sign = value > 0 ? '+' : '';
  return `${affected} ${sign}${decimal(value)}${unit ? ` ${unit}` : ''}`;
}

/** Base strengths at level 1; timed durations scale with course distance, as in the simulator. */
export function skillEffectDetails(
  alternatives: readonly SkillEffectAlternative[] | undefined,
  distance?: number
): SkillEffectDetails[] {
  const shown = new Set<string>();
  return (alternatives ?? []).flatMap((alternative) => {
    let duration = 'Whole race';
    if (alternative.seconds === 0) duration = 'Instant';
    else if (alternative.seconds > 0) {
      const seconds = alternative.seconds * (distance === undefined ? 1 : distance / 1000);
      const label =
        distance === undefined || alternative.variableDuration ? 'base duration' : 'duration';
      duration = `${decimal(seconds)} s ${label}`;
    }

    const effects = alternative.effects.map(effectText);
    const key = `${effects.join('|')}|${duration}`;
    if (shown.has(key)) return [];

    shown.add(key);
    return [{ effects, duration }];
  });
}
