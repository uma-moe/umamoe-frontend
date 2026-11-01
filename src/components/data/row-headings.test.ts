import { expect, it } from 'vitest';
import { rowHeadingCount } from './row-headings';

it('heads a row with the numbers before its name and the name itself', () => {
  const results = [{ numeric: true }, { numeric: true }, {}, { numeric: true }, { numeric: true }];

  expect(rowHeadingCount(results)).toBe(3);
});

it('heads a row with its name alone when the name comes first', () => {
  expect(rowHeadingCount([{}, { numeric: true }, {}])).toBe(1);
});

it('pins nothing in a table of numbers', () => {
  expect(rowHeadingCount([{ numeric: true }, { numeric: true }])).toBeUndefined();
});

it('pins nothing when the name is the last column', () => {
  expect(rowHeadingCount([{ numeric: true }, {}])).toBeUndefined();
});
