import { Blob } from 'node:buffer';
import { afterEach, expect, it, vi } from 'vitest';
import { downloadRows, type MasterDataRow } from './master-data-export';

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('preserves SQL binary values, zero and empty text in downloaded JSON', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('Blob', Blob);
  const createObjectURL = vi.fn((_blob: Blob) => 'blob:sql-export');
  vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

  const bytes = new Uint8Array([0, 127, 255]);
  const rows: MasterDataRow[] = [{ binary: bytes, zero: 0, empty: '' }];
  downloadRows(rows, ['binary', 'zero', 'empty'], 'json');

  const blob = createObjectURL.mock.calls[0]?.[0];
  if (!blob) throw new Error('The SQL export did not create a download.');
  expect(rows[0]?.binary).toBe(bytes);
  expect(JSON.parse(await blob.text())).toEqual([
    { binary: { 0: 0, 1: 127, 2: 255 }, zero: 0, empty: '' }
  ]);
});
