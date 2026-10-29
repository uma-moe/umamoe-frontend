import type { ComponentProps } from 'svelte';
import type Badge from '@/components/Badge.svelte';
import type { IconName } from '@/components/icon-types';
import manifest from '../../../public/hakuraku/notes/manifest.json';

export type ResearchNote = (typeof manifest)[number] & { pinned?: boolean };
export type ResearchTopic = 'Race mechanics' | 'Inheritance' | 'Training' | 'Data & analysis';
export type ResearchSort = 'newest' | 'oldest' | 'title';
type BadgeTone = NonNullable<ComponentProps<typeof Badge>['tone']>;

export interface LibraryQuery {
  search: string;
  /** A research topic, or `allTopics` for the whole library. */
  topic: string;
  sort: ResearchSort;
}

export const allTopics = 'All research';

export const researchTopics: readonly ResearchTopic[] = [
  'Race mechanics',
  'Inheritance',
  'Training',
  'Data & analysis'
];

/** Each topic's tab icon and badge tone, so a topic reads the same in tabs, cards, and notes. */
export const topicAppearance: Record<ResearchTopic, { icon: IconName; tone: BadgeTone }> = {
  'Race mechanics': { icon: 'race', tone: 'accent' },
  Inheritance: { icon: 'lineage', tone: 'success' },
  Training: { icon: 'trending-up', tone: 'warning' },
  'Data & analysis': { icon: 'chart', tone: 'neutral' }
};

const noteTopics: Record<string, ResearchTopic> = {
  affinity: 'Inheritance',
  events: 'Race mechanics',
  sparks: 'Inheritance',
  'shop-refresh': 'Training',
  spark_generation: 'Inheritance',
  'spot-struggle': 'Race mechanics',
  dueling: 'Race mechanics',
  'plus-sparks': 'Inheritance',
  'light-hello': 'Training',
  'new-age-umamusume-data': 'Data & analysis'
};

const sortOptions: readonly ResearchSort[] = ['newest', 'oldest', 'title'];

/** Every note, newest first; adjacent-note links follow this order regardless of sorting. */
export const researchNotes: readonly ResearchNote[] = [...manifest].sort((left, right) =>
  right.date.localeCompare(left.date)
);

export interface TopicDisplay {
  /** Absent for a note without a topic; it still gets the default icon and tone. */
  name?: ResearchTopic;
  icon: IconName;
  tone: BadgeTone;
}

export function topicOf(note: ResearchNote): ResearchTopic | undefined {
  return noteTopics[note.id];
}

export function topicDisplay(note: ResearchNote): TopicDisplay {
  const name = topicOf(note);
  if (!name) return { icon: 'book', tone: 'neutral' };

  return { name, ...topicAppearance[name] };
}

export function findNote(id: string): ResearchNote | undefined {
  return researchNotes.find((note) => note.id === id);
}

export function readLibraryQuery(params: URLSearchParams): LibraryQuery {
  const topic = params.get('topic') ?? '';
  const sort = params.get('sort') ?? '';

  return {
    search: params.get('q') ?? '',
    topic: researchTopics.includes(topic as ResearchTopic) ? topic : allTopics,
    sort: sortOptions.includes(sort as ResearchSort) ? (sort as ResearchSort) : 'newest'
  };
}

/** The library URL query, omitting defaults so the plain library stays at `/research`. */
export function libraryQueryString(query: LibraryQuery): string {
  const params = new URLSearchParams();
  if (query.search) params.set('q', query.search);
  if (query.topic !== allTopics) params.set('topic', query.topic);
  if (query.sort !== 'newest') params.set('sort', query.sort);
  return params.toString();
}

export function withLibraryQuery(path: string, queryString: string): string {
  return queryString ? path + '?' + queryString : path;
}

export function filterNotes(query: LibraryQuery): ResearchNote[] {
  const search = query.search.trim().toLowerCase();
  const matching = researchNotes.filter((note) => {
    const topic = topicOf(note);
    const inTopic = query.topic === allTopics || topic === query.topic;
    const searchable = [note.title, note.description, topic ?? ''].join(' ').toLowerCase();
    return inTopic && searchable.includes(search);
  });

  if (query.sort === 'title') matching.sort((a, b) => a.title.localeCompare(b.title));
  else if (query.sort === 'oldest') matching.reverse();

  // Stable sorting keeps the selected order within pinned and unpinned notes.
  return matching.sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));
}

export function countNotes(topic: string): number {
  if (topic === allTopics) return researchNotes.length;
  return researchNotes.filter((note) => topicOf(note) === topic).length;
}

export function publishedDate(date: string): string {
  return new Date(date + 'T12:00:00').toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}
