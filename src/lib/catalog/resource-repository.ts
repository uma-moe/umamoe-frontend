import { QueryCache } from '@/services/data/query-cache';
import { pageFetch, withPageRequest } from '@/services/http/page-request';
import { jsonResponseHash, parseJsonResponse } from './json-asset';

type ManifestEntry = string | { name?: string; path?: string; current_path?: string; currentPath?: string; url?: string; href?: string; sha256?: string; current_sha256?: string; hash?: string };
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
}

const cache = new QueryCache();
const baseUrl = '/resources';
const cachePrefix = 'umamoe-resource-data-';
const metaPrefix = 'umamoe_resource_meta_v1:';
const requests = new Map<string, symbol>();
const writes = new Map<string, Promise<void>>();
interface ResourceMeta { url: string; version: string; cacheName: string; cachedAt: number; fingerprint?: string; manifestGeneratedAt?: string; checksum?: string; }
interface ResourceSnapshot { data: unknown; meta?: ResourceMeta; checksum?: Promise<string | undefined>; }
const snapshots = new Map<string, ResourceSnapshot>();
const consumers = new Map<string, { decode: (data: unknown) => unknown; unpublished?: () => unknown }>();
const listeners = new Set<(name: string) => void>();
const manifestInterval = 60_000;
function sha256(value?: string): string | undefined { return /^[a-f0-9]{64}$/i.test(value ?? '') ? value!.toLowerCase() : undefined; }

async function cacheResponse(name: string, meta: ResourceMeta, response: Response, previous?: ResourceMeta): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    await (await caches.open(meta.cacheName)).put(meta.url, response);
    localStorage.setItem(`${metaPrefix}${name}`, JSON.stringify(meta));
    if (previous && (previous.cacheName !== meta.cacheName || previous.url !== meta.url)) await (await caches.open(previous.cacheName)).delete(previous.url);
  } catch { /* Cache quota/privacy failures must not discard a successful resource response. */ }
}

async function stored(name: string): Promise<ResourceSnapshot | undefined> {
  if (typeof caches === 'undefined') return undefined;
  try {
    await writes.get(name);
    const meta = JSON.parse(localStorage.getItem(`${metaPrefix}${name}`) ?? 'null') as ResourceMeta | null;
    if (typeof meta?.url !== 'string' || typeof meta.cacheName !== 'string' || !meta.cacheName.startsWith(cachePrefix)) return undefined;
    const response = await (await caches.open(meta.cacheName)).match(meta.url);
    if (!response) return undefined;
    const copy = response.clone();
    const data = await parseJsonResponse<unknown>(response, meta.url);
    // Rendering uses parsed data immediately; the background manifest check awaits this hash.
    return { data, meta, checksum: jsonResponseHash(copy).catch(() => undefined) };
  } catch { return undefined; }
}

async function cached(name: string): Promise<ResourceSnapshot | undefined> {
  const snapshot = snapshots.get(name) ?? await cache.get(`stored:${name}`, Infinity, () => stored(name));
  // A disk read must not replace a newer network response.
  if (snapshot && !snapshots.has(name)) snapshots.set(name, snapshot);
  return snapshots.get(name);
}

function manifest(refresh: boolean): Promise<ResourceManifest> {
  return cache.get('manifest', manifestInterval, async () => {
    const response = await pageFetch(`${baseUrl}/manifest.json`, { cache: 'no-cache', credentials: 'omit' });
    if (!response.ok) throw new Error(`Resource manifest returned ${response.status}.`);
    const data = await response.json();
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid resource manifest.');
    return data as ResourceManifest;
  }, refresh);
}

function entryPath(entry?: ManifestEntry): string | undefined {
  return typeof entry === 'string' ? entry : entry?.current_path ?? entry?.currentPath ?? entry?.url ?? entry?.href ?? entry?.path;
}
function entryFingerprint(entry?: ManifestEntry): string | undefined {
  return typeof entry === 'object' ? entry.current_sha256 ?? entry.sha256 ?? entry.hash : undefined;
}
function resolve(name: string, manifest: ResourceManifest, allowUnpublished = false): { url: string; fingerprint?: string } | undefined {
  const candidates = [name, `${name}.json`, `${name}.json.gz`];
  const containers = [manifest.files, manifest.artifacts, manifest.resources, manifest.paths, manifest.entries];
  for (const container of containers) {
    if (!container) continue;
    if (Array.isArray(container)) {
      for (const entry of container) {
        const path = entryPath(entry);
        const filename = path?.split(/[?#]/)[0]?.split('/').at(-1);
        if (path && ((typeof entry === 'object' && entry.name && candidates.includes(entry.name)) || (filename && candidates.includes(filename)))) return { url: absolute(path), fingerprint: entryFingerprint(entry) };
      }
    } else {
      for (const candidate of candidates) {
        const entry = container[candidate];
        const path = entryPath(entry);
        if (path) return { url: absolute(path), fingerprint: entryFingerprint(entry) };
      }
    }
  }
  if (allowUnpublished && containers.some(container => container && Object.keys(container).length > 0)) return undefined;
  const version = manifest.version ?? manifest.resource_version ?? manifest.current_version ?? manifest.master_version;
  if (!version && allowUnpublished) return undefined;
  if (!version) throw new Error(`Resource ${name} is absent from the manifest.`);
  return { url: `${baseUrl}/${version}/${name}.json.gz` };
}
function absolute(path: string): string {
  if (/^https?:\/\//i.test(path) || path.startsWith('/')) return path;
  return `${baseUrl}/${path.replace(/^\/+/, '')}`;
}
function revalidate(name: string, decode: (data: unknown) => unknown, unpublished?: () => unknown, refresh = false): Promise<ResourceSnapshot> {
  return cache.get(`resource:${name}`, manifestInterval, () => withPageRequest(async () => {
      const request = Symbol(name);
      requests.set(name, request);
      const index = await manifest(refresh);
      const resource = resolve(name, index, Boolean(unpublished));
      if (!resource) return { data: unpublished!() };
      const previous = await cached(name);
      const version = index.version ?? index.resource_version ?? index.current_version ?? index.master_version ?? 'current';
      const url = resource.fingerprint ? `${resource.url}${resource.url.includes('?') ? '&' : '?'}v=${encodeURIComponent(resource.fingerprint)}` : resource.url;
      const unchanged = previous?.meta && (resource.fingerprint
        ? previous.meta.fingerprint === resource.fingerprint
        : !refresh && previous.meta.url === url && previous.meta.version === version && previous.meta.manifestGeneratedAt === index.generated_at);
      if (unchanged) {
        const expected = sha256(resource.fingerprint) ?? previous.meta?.checksum;
        const actual = await previous.checksum;
        if (!expected || !actual || expected === actual) {
          try { decode(previous.data); return previous; } catch { /* Replace corrupt cached data with a validated response. */ }
        }
      }
      const response = await pageFetch(url, { credentials: 'omit', cache: refresh || unchanged ? 'reload' : 'default' });
      const copy = response.clone();
      const checksumResponse = response.clone();
      const data = await parseJsonResponse<unknown>(response, url);
      decode(data);
      const checksum = await jsonResponseHash(checksumResponse);
      const expected = sha256(resource.fingerprint);
      if (expected && checksum && expected !== checksum) throw new Error(`Resource ${name} failed its integrity check.`);
      const meta: ResourceMeta = { url, version, cacheName: `${cachePrefix}${version}`, cachedAt: Date.now(), fingerprint: resource.fingerprint, manifestGeneratedAt: index.generated_at, checksum };
      const snapshot = { data, meta, checksum: Promise.resolve(checksum) };
      if (requests.get(name) === request) {
        snapshots.set(name, snapshot);
        if (previous) for (const listener of listeners) listener(name);
      }
      // Serialize persistent writes too, so a slow older refresh cannot replace newer data.
      const write = (writes.get(name) ?? Promise.resolve()).then(async () => {
        if (requests.get(name) === request) await cacheResponse(name, meta, copy, previous?.meta);
      });
      writes.set(name, write);
      // Persistence is best effort; rendering fresh data must not wait for disk I/O.
      void write.finally(() => { if (writes.get(name) === write) writes.delete(name); });
      return snapshot;
    }), refresh);
}

export const resourceRepository = {
  async readCached<T>(name: string): Promise<T | undefined> {
    return (await cached(name))?.data as T | undefined;
  },
  async load<T>(name: string, refresh = false, decode: (data: unknown) => T = data => data as T, unpublished?: () => T): Promise<T> {
    consumers.set(name, { decode, unpublished });
    const snapshot = await cached(name);
    if (snapshot && !refresh) {
      try {
        const data = decode(snapshot.data);
        void revalidate(name, decode, unpublished).catch(() => {});
        return data;
      } catch { /* Invalid disk data must not block a fresh load. */ }
    }
    return decode((await revalidate(name, decode, unpublished, refresh)).data);
  },
  /** Navigation checks share one manifest request and never block cached rendering. */
  async revalidate(): Promise<void> {
    await Promise.all([...consumers].map(([name, { decode, unpublished }]) => revalidate(name, decode, unpublished).catch(() => {})));
  },
  onUpdate(listener: (name: string) => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  invalidate(name?: string): void {
    if (name) { cache.invalidate(`resource:${name}`); cache.invalidate(`stored:${name}`); snapshots.delete(name); requests.delete(name); consumers.delete(name); }
    else { cache.invalidate(); snapshots.clear(); requests.clear(); consumers.clear(); }
  }
};
