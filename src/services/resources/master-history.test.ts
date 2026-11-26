import { afterEach, expect, it, vi } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import { gzipSync } from 'node:zlib';
import {
  loadMasterDiff,
  loadMasterReleases,
  loadPreliminaryResourceVersions,
  parseMasterDiff,
  parseMasterReleases,
  parsePreliminaryResourceVersions
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

it('parses preliminary release metadata and observed CDN versions', async () => {
  const preliminaryReleases = parseMasterReleases([
    ...publishedReleases,
    {
      hash: NEXT_HASH,
      short_hash: 'a866b847996f',
      date: '2026-11-24',
      previous_hash: INITIAL_HASH,
      summary: { tables_changed: 2, added: 5, removed: 0, modified: 1 },
      resource_version: '10008800',
      is_preliminary: true,
      detected_at: '2026-11-24T19:35:00Z',
      cdn_last_modified: 'Tue, 24 Nov 2026 11:14:05 GMT'
    }
  ]);

  expect(preliminaryReleases[2]).toMatchObject({
    resourceVersion: '10008800',
    isPreliminary: true,
    detectedAt: '2026-11-24T19:35:00Z',
    cdnLastModified: 'Tue, 24 Nov 2026 11:14:05 GMT'
  });

  const payload = [
    {
      resource_version: '10008800',
      live_resource_version: '10008790',
      master_sha256: NEXT_HASH,
      master_short_hash: 'a866b847996f',
      master_changed_from_live: true,
      detected_at: '2026-11-24T19:35:00Z',
      cdn_last_modified: 'Tue, 24 Nov 2026 11:14:05 GMT'
    }
  ];
  expect(parsePreliminaryResourceVersions(payload)).toEqual([
    {
      resourceVersion: '10008800',
      liveResourceVersion: '10008790',
      masterSha256: NEXT_HASH,
      masterShortHash: 'a866b847996f',
      masterChangedFromLive: true,
      detectedAt: '2026-11-24T19:35:00Z',
      cdnLastModified: 'Tue, 24 Nov 2026 11:14:05 GMT'
    }
  ]);

  const fetchMock = vi.fn(async () => new Response(JSON.stringify(payload)));
  vi.stubGlobal('fetch', fetchMock);
  const loaded = await loadPreliminaryResourceVersions();
  expect(loaded).toHaveLength(1);
  expect(loaded[0]?.resourceVersion).toBe('10008800');
});

it('orders versioned releases by numeric resource version while keeping legacy entries in place', () => {
  const releases = parseMasterReleases([
    ...publishedReleases,
    {
      hash: '27745b9cfcde9dbecd9aacebc897197ac38ed1839575851ba3fecbd722d0a6d9',
      short_hash: '27745b9cfcde',
      date: '2026-11-20',
      previous_hash: NEXT_HASH,
      summary: { tables_changed: 66, added: 1623, removed: 0, modified: 63 },
      resource_version: '10008790'
    },
    {
      hash: 'd2ef9d9033fd715dc80e952da47642839356a68dcf2d571a0888cdc84df3205c',
      short_hash: 'd2ef9d9033fd',
      date: '2026-11-24',
      previous_hash: '27745b9cfcde9dbecd9aacebc897197ac38ed1839575851ba3fecbd722d0a6d9',
      summary: { tables_changed: 128, added: 8872, removed: 0, modified: 340 },
      resource_version: '10008800',
      is_preliminary: true
    },
    {
      hash: '6301580557455f070e10c334e869fba8502b90ca705ea6b04b423e4aecfeea15',
      short_hash: '630158055745',
      date: '2026-11-26',
      previous_hash: '27745b9cfcde9dbecd9aacebc897197ac38ed1839575851ba3fecbd722d0a6d9',
      summary: { tables_changed: 4, added: 3, removed: 0, modified: 17 },
      resource_version: '10008795'
    }
  ]);

  expect(releases.map((entry) => entry.resourceVersion ?? entry.shortHash)).toEqual([
    'e0013366d059',
    'a866b847996f',
    '10008790',
    '10008795',
    '10008800'
  ]);
});

it('orders a superseded preliminary release before a live release of the same resource version', () => {
  const releases = parseMasterReleases([
    {
      hash: NEXT_HASH,
      short_hash: 'a866b847996f',
      date: '2026-12-01',
      previous_hash: INITIAL_HASH,
      summary: { tables_changed: 1, added: 1, removed: 0, modified: 0 },
      resource_version: '10008800'
    },
    {
      hash: INITIAL_HASH,
      short_hash: 'e0013366d059',
      date: '2026-11-24',
      previous_hash: null,
      summary: null,
      resource_version: '10008800',
      is_preliminary: true
    }
  ]);

  expect(
    releases.map((entry) => ({
      shortHash: entry.shortHash,
      preliminary: Boolean(entry.isPreliminary)
    }))
  ).toEqual([
    { shortHash: 'e0013366d059', preliminary: true },
    { shortHash: 'a866b847996f', preliminary: false }
  ]);
});

it('orders observed preliminary CDN versions by numeric resource version', () => {
  const versions = parsePreliminaryResourceVersions([
    {
      resource_version: '10008810',
      live_resource_version: '10008795',
      master_sha256: NEXT_HASH,
      master_short_hash: 'a866b847996f',
      master_changed_from_live: true,
      detected_at: '2026-11-25T10:00:00Z'
    },
    {
      resource_version: '10008800',
      live_resource_version: '10008790',
      master_sha256: INITIAL_HASH,
      master_short_hash: 'e0013366d059',
      master_changed_from_live: true,
      detected_at: '2026-11-24T19:35:00Z'
    }
  ]);

  expect(versions.map((entry) => entry.resourceVersion)).toEqual(['10008800', '10008810']);
});
