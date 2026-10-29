import { expect, it } from 'vitest';
import {
  allTopics,
  filterNotes,
  libraryQueryString,
  readLibraryQuery,
  researchNotes,
  topicOf
} from './research-catalog';

it('filters notes by topic and search text in the chosen order', () => {
  const raceMechanics = filterNotes({ search: '', topic: 'Race mechanics', sort: 'newest' });
  const spotStruggle = filterNotes({ search: 'SPOT struggle', topic: allTopics, sort: 'newest' });
  const byTitle = filterNotes({ search: '', topic: allTopics, sort: 'title' });
  const oldestFirst = filterNotes({ search: '', topic: allTopics, sort: 'oldest' });

  expect(raceMechanics.every((note) => topicOf(note) === 'Race mechanics')).toBe(true);
  expect(spotStruggle.map((note) => note.id)).toEqual(['spot-struggle']);
  expect(byTitle[0]?.title).toBe('A new age for Umamusume data');
  expect(oldestFirst.find((note) => !note.pinned)).toBe(researchNotes.at(-1));
});

it('round-trips library filters through the URL and ignores unknown values', () => {
  const query = readLibraryQuery(new URLSearchParams('q=duel&topic=Race+mechanics&sort=title'));
  const fallback = readLibraryQuery(new URLSearchParams('topic=Cooking&sort=random'));

  expect(libraryQueryString(query)).toBe('q=duel&topic=Race+mechanics&sort=title');
  expect(fallback).toEqual({ search: '', topic: allTopics, sort: 'newest' });
  expect(libraryQueryString(fallback)).toBe('');
});

it('keeps public pins above sorted results while respecting topic and search filters', () => {
  const pinned = researchNotes.filter((note) => note.pinned);
  expect(pinned).not.toHaveLength(0);

  for (const sort of ['newest', 'oldest', 'title'] as const) {
    const results = filterNotes({ search: '', topic: allTopics, sort });
    expect(results.slice(0, pinned.length).every((note) => note.pinned)).toBe(true);
    const unpinned = results.filter((note) => !note.pinned);
    const expected = researchNotes.filter((note) => !note.pinned);
    if (sort === 'oldest') expected.reverse();
    else if (sort === 'title') expected.sort((a, b) => a.title.localeCompare(b.title));

    expect(unpinned).toEqual(expected);
  }

  const matching = filterNotes({
    search: 'spot struggle',
    topic: 'Race mechanics',
    sort: 'oldest'
  });
  expect(matching.map((note) => note.id)).toEqual(['spot-struggle']);
});
