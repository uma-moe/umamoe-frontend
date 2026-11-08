import type { skillRarity } from '@/lib/game-data/skills/skills';

export type SkillRarity = ReturnType<typeof skillRarity>;

export interface SkillChipColors {
  border: string;
  /** One colour, or the two ends of a 135° gradient. */
  background: string | [string, string];
  text: string;
}

// Kept in step with the rarity rules in components/game/SkillChip.svelte.
const DARK: Record<SkillRarity, SkillChipColors> = {
  normal: {
    border: 'rgba(255, 255, 255, 0.1)',
    background: 'rgba(255, 255, 255, 0.055)',
    text: 'rgba(255, 255, 255, 0.78)'
  },
  gold: {
    border: 'rgba(255, 193, 7, 0.38)',
    background: 'rgba(255, 170, 32, 0.13)',
    text: '#ffe08a'
  },
  special: {
    border: 'rgba(33, 150, 243, 0.4)',
    background: 'rgba(33, 150, 243, 0.13)',
    text: '#90caf9'
  },
  'unique-inherited': {
    border: 'rgba(186, 104, 200, 0.42)',
    background: ['rgba(126, 87, 194, 0.26)', 'rgba(171, 71, 188, 0.2)'],
    text: '#d7a6e3'
  },
  'unique-main': { border: 'transparent', background: 'rgba(34, 28, 14, 0.9)', text: '#ffe8a6' }
};

const LIGHT: Record<SkillRarity, SkillChipColors> = {
  normal: {
    border: 'rgba(17, 24, 39, 0.16)',
    background: 'rgba(17, 24, 39, 0.045)',
    text: 'rgba(17, 24, 39, 0.78)'
  },
  gold: {
    border: 'rgba(180, 83, 9, 0.36)',
    background: 'rgba(245, 158, 11, 0.13)',
    text: '#92400e'
  },
  special: {
    border: 'rgba(37, 99, 235, 0.34)',
    background: 'rgba(37, 99, 235, 0.1)',
    text: '#1d4ed8'
  },
  'unique-inherited': {
    border: 'rgba(126, 34, 206, 0.32)',
    background: ['rgba(126, 87, 194, 0.1)', 'rgba(171, 71, 188, 0.08)'],
    text: '#6b21a8'
  },
  'unique-main': { border: 'transparent', background: '#fffaf0', text: '#713f12' }
};

/** The main unique skill's border runs through these stops at 135°. */
export const UNIQUE_BORDER_STOPS: [number, string][] = [
  [0, '#ff8a65'],
  [0.3, '#ffd166'],
  [0.58, '#5eead4'],
  [0.76, '#64b5f6'],
  [1, '#ce93d8']
];

export function skillChipColors(rarity: SkillRarity, dark: boolean): SkillChipColors {
  return (dark ? DARK : LIGHT)[rarity];
}
