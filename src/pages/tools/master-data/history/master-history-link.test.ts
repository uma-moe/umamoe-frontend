import { expect, it } from 'vitest';
import { masterHistorySearch, readMasterHistoryLink } from './master-history-link';

it('round-trips a release and table through Hakuraku-compatible parameters', () => {
  const link = { release: 'a866b847996f', table: 'text_data' };

  const search = masterHistorySearch(link);

  expect(search).toBe('?diff=a866b847996f&table=text_data');
  expect(readMasterHistoryLink(search)).toEqual(link);
});

it('keeps the history open without a release', () => {
  const search = masterHistorySearch({ release: '', table: '' });

  expect(search).toBe('?tab=history');
  expect(readMasterHistoryLink(search)).toEqual({ release: '', table: '' });
});

it('leaves query links to the table browser', () => {
  expect(readMasterHistoryLink('?q=SELECT+1')).toBeUndefined();
  expect(readMasterHistoryLink('')).toBeUndefined();
});
