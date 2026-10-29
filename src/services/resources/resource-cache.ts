import { RequestCache } from '@/services/cache/request-cache';
import { pageFetch, withPageRequest } from '@/services/http/page-request';
import { hashJsonResponse, readJsonResponse } from './json-response';

type ManifestEntry =
  | string
  | {
      name?: string;
      path?: string;
      current_path?: string;
      currentPath?: string;
      url?: string;
      href?: string;
      sha256?: string;
      current_sha256?: string;
      hash?: string;
    };

/** The game's SQLite master database that an export was generated from. */
export interface MasterDatabaseLocation {
  /** Versioned and immutable, so the browser cache can keep it. */
  path: string;
  /** Game version and master revision, such as `1.35.2:10008300`. */
  marker?: string;
}

interface ResourceManifest {
  version?: string;
  resource_version?: string;
  current_version?: string;
  master_version?: string;
  generated_at?: string;
  files?: Record<string, ManifestEntry> | ManifestEntry[];
  artifacts?: Record<string, ManifestEntry> | ManifestEntry[];
  resources?: Record<string, ManifestEntry> | ManifestEntry[];
  paths?: Record<string, ManifestEntry> | ManifestEntry[];
  entries?: Record<string, ManifestEntry> | ManifestEntry[];
  master?: MasterDatabaseLocation;
}

const requestCache = new RequestCache();
const baseUrl = '/resources';
const cachePrefix = 'umamoe-resource-data-';
const metaPrefix = 'umamoe_resource_meta_v1:';
const latestRequests = new Map<string, symbol>();
const pendingWrites = new Map<string, Promise<void>>();

interface ResourceMeta {
  url: string;
  version: string;
  cacheName: string;
  cachedAt: number;
  fingerprint?: string;
  manifestGeneratedAt?: string;
  checksum?: string;
}

interface ResourceSnapshot {
  data: unknown;
  meta?: ResourceMeta;
  checksum?: Promise<string | undefined>;
}

const memorySnapshots = new Map<string, ResourceSnapshot>();
const consumers = new Map<
  string,
  { decode: (data: unknown) => unknown; unpublished?: () => unknown }
>();

const listeners = new Set<(name: string) => void>();

const manifestInterval = 60_000;
const manifestVersions = [
  'version',
  'resource_version',
  'current_version',
  'master_version',
  'generated_at'
] as const;

const manifestContainers = ['files', 'artifacts', 'resources', 'paths', 'entries'] as const;
const entryFields = [
  'name',
  'path',
  'current_path',
  'currentPath',
  'url',
  'href',
  'sha256',
  'current_sha256',
  'hash'
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isManifestEntry(value: unknown): value is ManifestEntry {
  if (typeof value === 'string') return true;
  return (
    isRecord(value) &&
    entryFields.every((field) => value[field] === undefined || typeof value[field] === 'string')
  );
}

function isManifestContainer(
  value: unknown
): value is ManifestEntry[] | Record<string, ManifestEntry> {
  if (Array.isArray(value)) return value.every(isManifestEntry);
  return isRecord(value) && Object.values(value).every(isManifestEntry);
}

function parseManifest(value: unknown): ResourceManifest {
  if (!isRecord(value)) throw new Error('Invalid resource manifest.');
  const manifest: ResourceManifest = {};

  for (const field of manifestVersions) {
    const entry = value[field];
    if (entry == null) continue;
    if (typeof entry !== 'string') throw new Error('Invalid resource manifest.');
    manifest[field] = entry;
  }

  for (const field of manifestContainers) {
    const entries = value[field];
    if (entries == null) continue;
    if (!isManifestContainer(entries)) throw new Error('Invalid resource manifest.');
    manifest[field] = entries;
  }

  const master = parseMasterDatabase(value.master);
  if (master) manifest.master = master;
  return manifest;
}

// Only Master Data reads this entry, so a malformed one must not block every other resource.
function parseMasterDatabase(value: unknown): MasterDatabaseLocation | undefined {
  if (!isRecord(value) || typeof value.path !== 'string' || !value.path.startsWith(baseUrl + '/'))
    return undefined;

  const location: MasterDatabaseLocation = { path: value.path };
  if (typeof value.marker === 'string') location.marker = value.marker;
  return location;
}

function parseResourceMeta(value: unknown): ResourceMeta | undefined {
  if (
    !isRecord(value) ||
    typeof value.url !== 'string' ||
    typeof value.cacheName !== 'string' ||
    !value.cacheName.startsWith(cachePrefix)
  )
    return undefined;

  // Legacy cache entries contain only a URL and cache name; missing freshness fields force revalidation.
  const version = value.version ?? '';
  const cachedAt = value.cachedAt ?? 0;
  if (typeof version !== 'string' || typeof cachedAt !== 'number' || !Number.isFinite(cachedAt)) {
    return undefined;
  }

  const meta: ResourceMeta = { url: value.url, cacheName: value.cacheName, version, cachedAt };

  for (const field of ['fingerprint', 'manifestGeneratedAt', 'checksum'] as const) {
    const entry = value[field];
    if (entry === undefined) continue;
    if (typeof entry !== 'string') return undefined;
    meta[field] = entry;
  }

  return meta;
}

function sha256(value?: string): string | undefined {
  return value !== undefined && /^[a-f0-9]{64}$/i.test(value) ? value.toLowerCase() : undefined;
}

async function cacheResponse(
  name: string,
  meta: ResourceMeta,
  response: Response,
  previous?: ResourceMeta
): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    await (await caches.open(meta.cacheName)).put(meta.url, response);
    localStorage.setItem(`${metaPrefix}${name}`, JSON.stringify(meta));
    if (previous && (previous.cacheName !== meta.cacheName || previous.url !== meta.url))
      await (await caches.open(previous.cacheName)).delete(previous.url);
  } catch {
    /* Cache quota/privacy failures must not discard a successful resource response. */
  }
}

async function readStoredSnapshot(name: string): Promise<ResourceSnapshot | undefined> {
  if (typeof caches === 'undefined') return undefined;
  try {
    await pendingWrites.get(name);
    const meta = parseResourceMeta(
      JSON.parse(localStorage.getItem(`${metaPrefix}${name}`) ?? 'null')
    );

    if (!meta) return undefined;
    const response = await (await caches.open(meta.cacheName)).match(meta.url);
    if (!response) return undefined;
    const copy = response.clone();
    const data = await readJsonResponse<unknown>(response, meta.url);
    // Rendering uses parsed data immediately; the background manifest check awaits this hash.
    return { data, meta, checksum: hashJsonResponse(copy).catch(() => undefined) };
  } catch {
    return undefined;
  }
}

async function readCachedSnapshot(name: string): Promise<ResourceSnapshot | undefined> {
  const snapshot =
    memorySnapshots.get(name) ??
    (await requestCache.get(`stored:${name}`, Infinity, () => readStoredSnapshot(name)));

  // A disk read must not replace a newer network response.
  if (snapshot && !memorySnapshots.has(name)) memorySnapshots.set(name, snapshot);
  return memorySnapshots.get(name);
}

function loadManifest(refresh: boolean): Promise<ResourceManifest> {
  return requestCache.get(
    'manifest',
    manifestInterval,
    async () => {
      const response = await pageFetch(`${baseUrl}/manifest.json`, {
        cache: 'no-cache',
        credentials: 'omit'
      });

      if (!response.ok) throw new Error(`Resource manifest returned ${response.status}.`);
      return parseManifest(await response.json());
    },
    refresh
  );
}

function entryPath(entry?: ManifestEntry): string | undefined {
  return typeof entry === 'string'
    ? entry
    : (entry?.current_path ?? entry?.currentPath ?? entry?.url ?? entry?.href ?? entry?.path);
}

function entryFingerprint(entry?: ManifestEntry): string | undefined {
  return typeof entry === 'object'
    ? (entry.current_sha256 ?? entry.sha256 ?? entry.hash)
    : undefined;
}

function resolveResource(
  name: string,
  manifest: ResourceManifest,
  allowUnpublished = false
): { url: string; fingerprint?: string } | undefined {
  const candidates = [name, `${name}.json`, `${name}.json.gz`];
  const containers = [
    manifest.files,
    manifest.artifacts,
    manifest.resources,
    manifest.paths,
    manifest.entries
  ];

  for (const container of containers) {
    if (!container) continue;
    if (Array.isArray(container)) {
      for (const entry of container) {
        const path = entryPath(entry);
        const filename = path?.split(/[?#]/)[0]?.split('/').at(-1);
        if (
          path &&
          ((typeof entry === 'object' && entry.name && candidates.includes(entry.name)) ||
            (filename && candidates.includes(filename)))
        )
          return { url: resourceUrl(path), fingerprint: entryFingerprint(entry) };
      }
    } else {
      for (const candidate of candidates) {
        const entry = container[candidate];
        const path = entryPath(entry);
        if (path) return { url: resourceUrl(path), fingerprint: entryFingerprint(entry) };
      }
    }
  }

  if (
    allowUnpublished &&
    containers.some((container) => container && Object.keys(container).length > 0)
  )
    return undefined;
  const version =
    manifest.version ??
    manifest.resource_version ??
    manifest.current_version ??
    manifest.master_version;

  if (!version && allowUnpublished) return undefined;
  if (!version) throw new Error(`Resource ${name} is absent from the manifest.`);
  return { url: `${baseUrl}/${version}/${name}.json.gz` };
}

function resourceUrl(path: string): string {
  if (/^https?:\/\//i.test(path) || path.startsWith('/')) return path;
  return `${baseUrl}/${path.replace(/^\/+/, '')}`;
}

function revalidate(
  name: string,
  decode: (data: unknown) => unknown,
  unpublished?: () => unknown,
  refresh = false
): Promise<ResourceSnapshot> {
  return requestCache.get(
    `resource:${name}`,
    manifestInterval,
    () =>
      withPageRequest(async () => {
        const request = Symbol(name);
        latestRequests.set(name, request);
        const index = await loadManifest(refresh);
        const resource = resolveResource(name, index, Boolean(unpublished));
        if (!resource) {
          if (!unpublished) throw new Error(`Resource ${name} is absent from the manifest.`);
          return { data: unpublished() };
        }

        const previous = await readCachedSnapshot(name);
        const version =
          index.version ??
          index.resource_version ??
          index.current_version ??
          index.master_version ??
          'current';

        const url = resource.fingerprint
          ? `${resource.url}${resource.url.includes('?') ? '&' : '?'}v=${encodeURIComponent(resource.fingerprint)}`
          : resource.url;

        const unchanged =
          previous?.meta &&
          (resource.fingerprint
            ? previous.meta.fingerprint === resource.fingerprint
            : !refresh &&
              previous.meta.url === url &&
              previous.meta.version === version &&
              previous.meta.manifestGeneratedAt === index.generated_at);

        if (unchanged) {
          const expected = sha256(resource.fingerprint) ?? previous.meta?.checksum;
          const actual = await previous.checksum;
          if (!expected || !actual || expected === actual) {
            try {
              decode(previous.data);
              return previous;
            } catch {
              /* Replace corrupt cached data with a validated response. */
            }
          }
        }

        const response = await pageFetch(url, {
          credentials: 'omit',
          cache: refresh || unchanged ? 'reload' : 'default'
        });

        const copy = response.clone();
        const checksumResponse = response.clone();
        const data = await readJsonResponse<unknown>(response, url);
        decode(data);
        const checksum = await hashJsonResponse(checksumResponse);
        const expected = sha256(resource.fingerprint);
        if (expected && checksum && expected !== checksum)
          throw new Error(`Resource ${name} failed its integrity check.`);

        const meta: ResourceMeta = {
          url,
          version,
          cacheName: `${cachePrefix}${version}`,
          cachedAt: Date.now(),
          fingerprint: resource.fingerprint,
          manifestGeneratedAt: index.generated_at,
          checksum
        };

        const snapshot = { data, meta, checksum: Promise.resolve(checksum) };

        if (latestRequests.get(name) === request) {
          memorySnapshots.set(name, snapshot);
          if (previous) for (const listener of listeners) listener(name);
        }

        // Serialize persistent writes too, so a slow older refresh cannot replace newer data.
        const write = (pendingWrites.get(name) ?? Promise.resolve()).then(async () => {
          if (latestRequests.get(name) === request)
            await cacheResponse(name, meta, copy, previous?.meta);
        });

        pendingWrites.set(name, write);

        // Persistence is best effort; rendering fresh data must not wait for disk I/O.
        void write.finally(() => {
          if (pendingWrites.get(name) === write) pendingWrites.delete(name);
        });

        return snapshot;
      }),
    refresh
  );
}

export const resourceCache = {
  async readCached<T>(name: string): Promise<T | undefined> {
    return (await readCachedSnapshot(name))?.data as T | undefined;
  },

  async load<T>(
    name: string,
    refresh = false,
    decode: (data: unknown) => T = (data) => data as T,
    unpublished?: () => T
  ): Promise<T> {
    consumers.set(name, { decode, unpublished });
    const snapshot = await readCachedSnapshot(name);
    if (snapshot && !refresh) {
      try {
        const data = decode(snapshot.data);
        // A failed background refresh keeps the validated snapshot available to this caller.
        void revalidate(name, decode, unpublished).catch(() => snapshot);
        return data;
      } catch {
        /* Invalid disk data must not block a fresh load. */
      }
    }

    return decode((await revalidate(name, decode, unpublished, refresh)).data);
  },

  /** Where the current export's master database can be downloaded, when the manifest names one. */
  async masterDatabase(): Promise<MasterDatabaseLocation | undefined> {
    return (await loadManifest(false)).master;
  },

  /** Navigation checks share one manifest request and never block cached rendering. */
  async revalidate(): Promise<void> {
    await Promise.allSettled(
      [...consumers].map(([name, { decode, unpublished }]) => revalidate(name, decode, unpublished))
    );
  },

  onUpdate(listener: (name: string) => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  invalidate(name?: string): void {
    if (name) {
      requestCache.invalidate(`resource:${name}`);
      requestCache.invalidate(`stored:${name}`);
      memorySnapshots.delete(name);
      latestRequests.delete(name);
      consumers.delete(name);
    } else {
      requestCache.invalidate();
      memorySnapshots.clear();
      latestRequests.clear();
      consumers.clear();
    }
  }
};
