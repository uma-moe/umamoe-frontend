import { expect, it } from 'vitest';
import { exportContent } from './master-data-export';

it('exports NULL, zero, empty text and blobs without losing their distinctions', () => {
  const rows = [[null, 0, '', new Uint8Array([0, 127, 255])]];

  const json = JSON.parse(exportContent(['missing', 'zero', 'empty', 'icon'], rows, 'json'));
  const csv = exportContent(['missing', 'zero', 'empty', 'icon'], rows, 'csv');

  expect(json).toEqual([{ missing: null, zero: 0, empty: '', icon: "X'007fff'" }]);
  expect(csv).toBe("missing,zero,empty,icon\r\n,0,,X'007fff'");
});

it('quotes CSV fields that contain separators and keeps repeated column names apart in JSON', () => {
  const rows = [[1, 'Special Week, "Spe"\nline two']];

  const csv = exportContent(['id', 'id'], rows, 'csv');
  const json = JSON.parse(exportContent(['id', 'id'], rows, 'json'));

  expect(csv).toBe('id,id\r\n1,"Special Week, ""Spe""\nline two"');
  expect(json).toEqual([{ id: 1, id_2: 'Special Week, "Spe"\nline two' }]);
});
