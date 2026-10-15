import type { StatStripItem } from '@/components/game/StatStrip.svelte';
import type { ChartDatum } from '@/lib/statistics/statistics';
import { scenarioName } from '@/lib/profile/profile-display';
import type { DistributionItem, StatisticsCatalogEntry } from './statistics-repository';

export const scenarioNames = Object.fromEntries(
  [1, 2, 3, 4, 5, 6, 7].map((id) => [String(id), scenarioName(id)])
);
export const statNames: Record<string, string> = {
  speed: 'Speed',
  stamina: 'Stamina',
  power: 'Power',
  guts: 'Guts',
  wiz: 'Wit',
  wisdom: 'Wit',
  rank_score: 'Rank Score'
};
export const statColors: Record<string, string> = {
  speed: '#098cdb',
  stamina: '#da4b38',
  power: '#db7602',
  guts: '#db447e',
  wiz: '#009e5e',
  wisdom: '#009e5e',
  wit: '#009e5e',
  friend: '#ffb441',
  group: '#21ce3e'
};

export const statIds = ['speed', 'stamina', 'power', 'guts', 'wiz'];
export const statOptions = statIds.map((value) => ({ value, label: statNames[value]! }));
export const allClasses = ['1', '2', '3', '4', '5', '6'];

export function title(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function statName(value: string): string {
  return statNames[value] ?? title(value);
}

export function compact(value?: number): string {
  return value == null
    ? '-'
    : new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

export function characterName(
  characters: StatisticsCatalogEntry[],
  id: string,
  item?: DistributionItem
): string {
  return (
    characters.find((entry) => entry.id === (item?.id ?? id))?.title ??
    item?.name ??
    `Uma ${item?.id ?? id}`
  );
}

export function supportName(
  catalog: Map<string, StatisticsCatalogEntry>,
  id: string,
  item?: DistributionItem
): string {
  return catalog.get(String(item?.id ?? id))?.title ?? item?.name ?? `Support ${item?.id ?? id}`;
}

export function skillName(
  catalog: Map<string, StatisticsCatalogEntry>,
  id: string,
  item?: DistributionItem
): string {
  return catalog.get(String(item?.id ?? id))?.title ?? item?.name ?? `Skill ${item?.id ?? id}`;
}

export function supportRow(
  catalog: Map<string, StatisticsCatalogEntry>,
  item: ChartDatum
): ChartDatum & { detail: string } {
  const card = catalog.get(item.id);
  return {
    ...item,
    image: card?.image,
    detail: [...(card?.tags ?? []), '#' + item.id].join(' · ')
  };
}

export function statStrip(values: Record<string, number>): StatStripItem[] {
  return statIds.map((id) => ({
    id,
    label: statName(id),
    value: values[id] ?? '-',
    tone: (id === 'wiz' ? 'wit' : id) as StatStripItem['tone'],
    icon: '/assets/images/icon/stats/' + (id === 'wiz' ? 'wit' : id) + '.webp'
  }));
}
