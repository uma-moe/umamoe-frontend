import { getCharacterById } from '../data/character.data';

export function getCharacterDisplayName(cardId: number | null): string {
  if (!cardId) return 'Unknown';
  return getCharacterById(cardId)?.name || `Character ${cardId}`;
}

export function getCharacterCardImage(cardId: number | null): string | null {
  return cardId ? `assets/images/character_stand/chara_stand_${cardId}.webp` : null;
}

export function getAptitudeGrade(value: number | null): string {
  if (value == null || value < 1) return 'G';
  const grades = ['G', 'F', 'E', 'D', 'C', 'B', 'A', 'S'];
  return grades[Math.min(value - 1, 7)];
}

export function getDistanceDisplayName(type: number | null): string {
  if (type == null) return '-';
  const names: Record<number, string> = {
    1: 'Sprint',
    2: 'Mile',
    3: 'Middle',
    4: 'Long',
    5: 'Dirt',
  };
  return names[type] || `Dist ${type}`;
}

export function getScenarioDisplayName(id: number | null): string {
  if (id == null) return '-';
  const names: Record<number, string> = {
    1: 'URA',
    2: 'Aoharu',
    3: 'GL',
    4: 'MANT',
    5: 'Grand Masters',
    6: 'LArc',
    7: 'U.A.F.',
  };
  return names[id] || `Scenario ${id}`;
}

export function getTotalStats(member: {
  speed?: number | null;
  stamina?: number | null;
  power?: number | null;
  guts?: number | null;
  wiz?: number | null;
}): number {
  return (member.speed || 0)
    + (member.stamina || 0)
    + (member.power || 0)
    + (member.guts || 0)
    + (member.wiz || 0);
}

export function getStarDisplay(rarity: number | null): { filled: boolean; talent: boolean }[] {
  const normalizedRarity = Math.min(rarity ?? 0, 5);
  return Array.from(
    { length: 5 },
    (_entry, index) => ({ filled: index < normalizedRarity, talent: false }),
  );
}
