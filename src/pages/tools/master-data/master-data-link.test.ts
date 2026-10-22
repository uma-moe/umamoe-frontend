import { expect, it } from 'vitest';
import { masterDataSearch, readMasterDataLink } from './master-data-link';

it('round-trips a query and filter through Hakuraku-compatible parameters', () => {
  const link = { sql: 'SELECT * FROM "text_data" WHERE category = 6', filter: 'Special Week' };

  const search = masterDataSearch(link);

  expect(search).toBe('?q=SELECT+*+FROM+%22text_data%22+WHERE+category+%3D+6&filter=Special+Week');
  expect(readMasterDataLink(search)).toEqual(link);
});

it('leaves blank queries and filters out of the address', () => {
  expect(masterDataSearch({ sql: '  ', filter: '' })).toBe('');
  expect(readMasterDataLink('')).toEqual({ sql: '', filter: '' });
});
