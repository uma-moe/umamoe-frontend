import { expect, it } from 'vitest';
import { rowHeadingCount } from './row-headings';

it('heads a row with the numbers before its name and the name itself', () => {
  const results = [{ numeric: true }, { numeric: true }, {}, { numeric: true }, { numeric: true }];

  expect(rowHeadingCount(results)).toBe(3);
});

it('heads a row with its name alone when the name comes first', () => {
  expect(rowHeadingCount([{}, { numeric: true }, {}])).toBe(1);
});

it('leaves a table of numbers unstacked', () => {
  expect(rowHeadingCount([{ numeric: true }, { numeric: true }])).toBeUndefined();
});

it('leaves a table unstacked when its name is the last column', () => {
  expect(rowHeadingCount([{ numeric: true }, {}])).toBeUndefined();
});
