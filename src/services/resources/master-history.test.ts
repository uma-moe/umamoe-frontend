import { afterEach, expect, it, vi } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import { gzipSync } from 'node:zlib';
import {
  loadMasterDiff,
  loadMasterReleases,
  parseMasterDiff,
  parseMasterReleases
} from './master-history';

const INITIAL_HASH = 'e0013366d059b091bb2a6b05275033d6b2302fb3297fc9227cc022d871ac0bfb';
const NEXT_HASH = 'a866b847996fd773c918a7b5192bbac3874d56fc84b3a44a6f4912e92b9ef426';

const publishedReleases = [
  {
    hash: INITIAL_HASH,
    short_hash: 'e0013366d059',
    date: '2026-09-28',
    previous_hash: null,
    summary: null
  },
  {
    hash: NEXT_HASH,
    short_hash: 'a866b847996f',
    date: '2026-10-07',
    previous_hash: INITIAL_HASH,
    summary: { tables_changed: 1, added: 1, removed: 0, modified: 1 }
  }
];

const publishedDiff = {
  from_hash: INITIAL_HASH,
  to_hash: NEXT_HASH,
  date: '2026-10-07',
  summary: { tables_changed: 1, added: 1, removed: 0, modified: 1 },
  tables: {
    text_data: {
      columns: ['category', 'index', 'text', 'icon'],
      added: [[6, 1003, 'Tokai Teio', null]],
      removed: [],
      modified: [
        {
          key: [63, 157],
          before: [63, 157, 'starting on MM/DD', { blob_hex: '00ff' }],
          after: [63, 157, 'starting on Oct 15', { blob_hex: '00ff' }]
        }
      ]
    }
  }
};

afterEach(() => {
  vi.unstubAllGlobals();
});

it('reads the published release history into camel-cased releases', () => {
  const releases = parseMasterReleases(publishedReleases);

  expect(releases).toEqual([
    {
      hash: INITIAL_HASH,
      shortHash: 'e0013366d059',
      date: '2026-09-28',
      previousHash: null,
      summary: null
    },
    {
      hash: NEXT_HASH,
      shortHash: 'a866b847996f',
      date: '2026-10-07',
      previousHash: INITIAL_HASH,
      summary: { tablesChanged: 1, added: 1, removed: 0, modified: 1 }
    }
  ]);
});

it.each([
  { case: 'not a list', history: { releases: [] } },
  { case: 'a malformed short hash', history: [{ ...publishedReleases[0], short_hash: '../x' }] },
  {
    case: 'a negative count',
    history: [{ ...publishedReleases[1], summary: { ...publishedReleases[1]?.summary, added: -1 } }]
  },
  { case: 'a missing previous hash', history: [{ ...publishedReleases[0], previous_hash: 7 }] }
])('rejects a release history with $case', ({ history }) => {
  expect(() => parseMasterReleases(history)).toThrow('Invalid master release history.');
});

it('keeps NULL, numbers, text and blobs distinct in a diff', () => {
  const diff = parseMasterDiff(publishedDiff);

  const textData = diff.tables.text_data;
  expect(diff.summary).toEqual({ tablesChanged: 1, added: 1, removed: 0, modified: 1 });
  expect(textData?.added).toEqual([[6, 1003, 'Tokai Teio', null]]);
  expect(textData?.modified[0]?.before[3]).toEqual({ blobHex: '00ff' });
});

it('rejects diff rows that do not match their columns', () => {
  const truncated = structuredClone(publishedDiff);
  truncated.tables.text_data.added = [[6, 1003]] as never;

  expect(() => parseMasterDiff(truncated)).toThrow('Invalid master diff for table text_data.');
});

it('loads the history without a stale copy and a diff from its immutable path', async () => {
  vi.stubGlobal('Blob', NodeBlob);
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
    url.endsWith('versions.json')
      ? new Response(JSON.stringify(publishedReleases))
      : new Response(new Uint8Array(gzipSync(JSON.stringify(publishedDiff))))
  );
  vi.stubGlobal('fetch', fetchMock);

  const releases = await loadMasterReleases();
  const diff = await loadMasterDiff('a866b847996f');

  expect(releases).toHaveLength(2);
  expect(diff.toHash).toBe(NEXT_HASH);
  expect(fetchMock.mock.calls.map(([url, init]) => [url, init?.cache])).toEqual([
    ['/resources/masterdata/versions.json', 'no-cache'],
    ['/resources/masterdata/diffs/a866b847996f.json.gz', undefined]
  ]);
});

it('refuses to request a diff for anything but a short hash', async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);

  await expect(loadMasterDiff('../manifest')).rejects.toThrow('Invalid release.');
  expect(fetchMock).not.toHaveBeenCalled();
});
