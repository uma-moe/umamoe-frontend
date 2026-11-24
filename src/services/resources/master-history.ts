import { pageFetch, withPageRequest } from '@/services/http/page-request';
import { readJsonResponse } from './json-response';

/** A SQLite value as the resource API writes it; blobs arrive as hexadecimal text. */
export type MasterCell = string | number | null | { blobHex: string };

export interface MasterDiffSummary {
  tablesChanged: number;
  added: number;
  removed: number;
  modified: number;
}

/** One release of the game's master database, named by the SHA-256 of its bytes. */
export interface MasterRelease {
  hash: string;
  /** The first 12 hex digits of `hash`, which name its diff and its shared links. */
  shortHash: string;
  /** The UTC day the release was published, as `YYYY-MM-DD`. */
  date: string;
  previousHash: string | null;
  /** Absent for the first release and when the previous database was unavailable. */
  summary: MasterDiffSummary | null;
  resourceVersion?: string;
  isPreliminary?: boolean;
  detectedAt?: string;
  cdnLastModified?: string;
}

/** One unreleased Global CDN resource version observed ahead of the live app version. */
export interface PreliminaryResourceVersion {
  resourceVersion: string;
  liveResourceVersion: string;
  masterSha256: string;
  masterShortHash: string;
  masterChangedFromLive: boolean;
  detectedAt: string;
  cdnLastModified?: string;
  promotedAt?: string;
}

export interface MasterModifiedRow {
  before: MasterCell[];
  after: MasterCell[];
}

/** Rows are cell arrays in `columns` order; rows are matched by the table's primary key. */
export interface MasterTableDiff {
  columns: string[];
  added: MasterCell[][];
  removed: MasterCell[][];
  modified: MasterModifiedRow[];
}

export interface MasterDiff {
  fromHash: string;
  toHash: string;
  date: string;
  summary: MasterDiffSummary;
  tables: Record<string, MasterTableDiff>;
}

const historyPath = '/resources/masterdata';
const shortHashPattern = /^[0-9a-f]{12}$/;

/** Every published release, oldest first. */
export function loadMasterReleases(signal?: AbortSignal): Promise<MasterRelease[]> {
  return withPageRequest(async () => {
    const response = await pageFetch(`${historyPath}/versions.json`, {
      cache: 'no-cache',
      credentials: 'omit',
      signal
    });

    return parseMasterReleases(
      await readJsonResponse<unknown>(response, 'The master release history')
    );
  });
}

/** Every observed preliminary Global CDN resource version, oldest first. */
export function loadPreliminaryResourceVersions(
  signal?: AbortSignal
): Promise<PreliminaryResourceVersion[]> {
  return withPageRequest(async () => {
    const response = await pageFetch(`${historyPath}/preliminary-versions.json`, {
      cache: 'no-cache',
      credentials: 'omit',
      signal
    });

    if (response.status === 404) return [];
    return parsePreliminaryResourceVersions(
      await readJsonResponse<unknown>(response, 'Preliminary CDN versions')
    );
  });
}

/** The row-level changes a release made; each diff is immutable once published. */
export function loadMasterDiff(shortHash: string, signal?: AbortSignal): Promise<MasterDiff> {
  if (!shortHashPattern.test(shortHash)) return Promise.reject(new Error('Invalid release.'));

  return withPageRequest(async () => {
    const response = await pageFetch(`${historyPath}/diffs/${shortHash}.json.gz`, {
      credentials: 'omit',
      signal
    });

    return parseMasterDiff(await readJsonResponse<unknown>(response, `Release ${shortHash}`));
  });
}

export function parseMasterReleases(value: unknown): MasterRelease[] {
  if (!Array.isArray(value)) throw new Error('Invalid master release history.');

  return value.map((entry) => {
    const release = parseRelease(entry);
    if (!release) throw new Error('Invalid master release history.');
    return release;
  });
}

export function parseMasterDiff(value: unknown): MasterDiff {
  if (
    !isRecord(value) ||
    typeof value.from_hash !== 'string' ||
    typeof value.to_hash !== 'string' ||
    typeof value.date !== 'string' ||
    !isRecord(value.tables)
  )
    throw new Error('Invalid master diff.');

  const summary = parseSummary(value.summary);
  if (!summary) throw new Error('Invalid master diff.');

  const tables: Record<string, MasterTableDiff> = {};
  for (const [name, table] of Object.entries(value.tables)) {
    const parsed = parseTableDiff(table);
    if (!parsed) throw new Error(`Invalid master diff for table ${name}.`);
    tables[name] = parsed;
  }

  return { fromHash: value.from_hash, toHash: value.to_hash, date: value.date, summary, tables };
}

function parseRelease(value: unknown): MasterRelease | undefined {
  if (
    !isRecord(value) ||
    typeof value.hash !== 'string' ||
    typeof value.short_hash !== 'string' ||
    !shortHashPattern.test(value.short_hash) ||
    typeof value.date !== 'string'
  )
    return undefined;

  const previousHash = value.previous_hash;
  if (previousHash !== null && typeof previousHash !== 'string') return undefined;

  let summary: MasterDiffSummary | null = null;
  if (value.summary !== null) {
    const parsed = parseSummary(value.summary);
    if (!parsed) return undefined;
    summary = parsed;
  }

  const release: MasterRelease = {
    hash: value.hash,
    shortHash: value.short_hash,
    date: value.date,
    previousHash,
    summary
  };

  if (typeof value.resource_version === 'string' && value.resource_version)
    release.resourceVersion = value.resource_version;
  if (value.is_preliminary === true) release.isPreliminary = true;
  if (typeof value.detected_at === 'string' && value.detected_at)
    release.detectedAt = value.detected_at;
  if (typeof value.cdn_last_modified === 'string' && value.cdn_last_modified)
    release.cdnLastModified = value.cdn_last_modified;

  return release;
}

export function parsePreliminaryResourceVersions(value: unknown): PreliminaryResourceVersion[] {
  if (!Array.isArray(value)) throw new Error('Invalid preliminary CDN version history.');

  return value.map((entry) => {
    if (
      !isRecord(entry) ||
      typeof entry.resource_version !== 'string' ||
      typeof entry.live_resource_version !== 'string' ||
      typeof entry.master_sha256 !== 'string' ||
      typeof entry.master_short_hash !== 'string' ||
      typeof entry.master_changed_from_live !== 'boolean' ||
      typeof entry.detected_at !== 'string'
    )
      throw new Error('Invalid preliminary CDN version history.');

    const parsed: PreliminaryResourceVersion = {
      resourceVersion: entry.resource_version,
      liveResourceVersion: entry.live_resource_version,
      masterSha256: entry.master_sha256,
      masterShortHash: entry.master_short_hash,
      masterChangedFromLive: entry.master_changed_from_live,
      detectedAt: entry.detected_at
    };

    if (typeof entry.cdn_last_modified === 'string' && entry.cdn_last_modified)
      parsed.cdnLastModified = entry.cdn_last_modified;
    if (typeof entry.promoted_at === 'string' && entry.promoted_at)
      parsed.promotedAt = entry.promoted_at;
    return parsed;
  });
}

function parseSummary(value: unknown): MasterDiffSummary | undefined {
  if (!isRecord(value)) return undefined;

  const { tables_changed: tablesChanged, added, removed, modified } = value;
  if (!isCount(tablesChanged) || !isCount(added) || !isCount(removed) || !isCount(modified))
    return undefined;

  return { tablesChanged, added, removed, modified };
}

function parseTableDiff(value: unknown): MasterTableDiff | undefined {
  if (!isRecord(value)) return undefined;

  const columns = value.columns;
  if (!Array.isArray(columns) || !columns.every((column) => typeof column === 'string'))
    return undefined;

  const added = parseRows(value.added, columns.length);
  const removed = parseRows(value.removed, columns.length);
  const modified = parseModifiedRows(value.modified, columns.length);
  if (!added || !removed || !modified) return undefined;

  return { columns, added, removed, modified };
}

function parseModifiedRows(value: unknown, width: number): MasterModifiedRow[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const rows: MasterModifiedRow[] = [];
  for (const row of value) {
    if (!isRecord(row)) return undefined;

    const before = parseRow(row.before, width);
    const after = parseRow(row.after, width);
    if (!before || !after) return undefined;
    rows.push({ before, after });
  }

  return rows;
}

function parseRows(value: unknown, width: number): MasterCell[][] | undefined {
  if (!Array.isArray(value)) return undefined;

  const rows: MasterCell[][] = [];
  for (const row of value) {
    const cells = parseRow(row, width);
    if (!cells) return undefined;
    rows.push(cells);
  }

  return rows;
}

function parseRow(value: unknown, width: number): MasterCell[] | undefined {
  if (!Array.isArray(value) || value.length !== width) return undefined;

  const cells: MasterCell[] = [];
  for (const cell of value) {
    const parsed = parseCell(cell);
    if (parsed === undefined) return undefined;
    cells.push(parsed);
  }

  return cells;
}

function parseCell(value: unknown): MasterCell | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'number') return value;
  if (isRecord(value) && typeof value.blob_hex === 'string') return { blobHex: value.blob_hex };
  return undefined;
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
