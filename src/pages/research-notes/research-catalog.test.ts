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
  expect(oldestFirst[0]).toBe(researchNotes.at(-1));
});

it('round-trips library filters through the URL and ignores unknown values', () => {
  const query = readLibraryQuery(new URLSearchParams('q=duel&topic=Race+mechanics&sort=title'));
  const fallback = readLibraryQuery(new URLSearchParams('topic=Cooking&sort=random'));

  expect(libraryQueryString(query)).toBe('q=duel&topic=Race+mechanics&sort=title');
  expect(fallback).toEqual({ search: '', topic: allTopics, sort: 'newest' });
  expect(libraryQueryString(fallback)).toBe('');
});
