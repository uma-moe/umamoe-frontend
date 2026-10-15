import type { CourseCatalogEntry } from '@/lib/catalog/course-catalog';
import { courseFit, type VeteranEntry } from './veteran-entries';

export const STYLES = [
  { value: 'all', label: 'All' },
  { value: 'Nige', label: 'Front' },
  { value: 'Senko', label: 'Pace' },
  { value: 'Sashi', label: 'Late' },
  { value: 'Oikomi', label: 'End' }
];
export const STYLE_NAMES: Record<string, string> = {
  Nige: 'Front',
  Senko: 'Pace',
  Sashi: 'Late',
  Oikomi: 'End',
  Oonige: 'Runaway'
};
export const SORTS = [
  { value: 'fit', label: 'Course fit' },
  { value: 'rank', label: 'Rank' },
  { value: 'total', label: 'Total stats' },
  { value: 'newest', label: 'Newest' }
];
export const STATS = [
  ['speed', 'speed'],
  ['stamina', 'stamina'],
  ['power', 'power'],
  ['guts', 'guts'],
  ['wisdom', 'wit']
] as const;

/** The Veterans matching the name search and running style, in the chosen order. */
export function shownVeterans(
  entries: VeteranEntry[],
  query: string,
  style: string,
  sort: string,
  course?: CourseCatalogEntry
): VeteranEntry[] {
  const words = query.trim().toLowerCase();
  const list = entries.filter(
    (entry) =>
      (style === 'all' ||
        entry.uma.trainee.runningStyle === style ||
        (style === 'Nige' && entry.uma.trainee.runningStyle === 'Oonige')) &&
      (!words || entry.uma.name.toLowerCase().includes(words))
  );
  const fit = new Map(list.map((entry) => [entry.key, courseFit(entry.uma, course)]));
  return list.sort(
    sort === 'rank'
      ? (a, b) => (b.score ?? 0) - (a.score ?? 0)
      : sort === 'total'
        ? (a, b) => b.total - a.total
        : sort === 'newest'
          ? (a, b) => b.created - a.created
          : (a, b) => fit.get(a.key)! - fit.get(b.key)! || (b.score ?? 0) - (a.score ?? 0)
  );
}
