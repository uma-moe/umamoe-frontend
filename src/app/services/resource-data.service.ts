import { Injectable } from '@angular/core';
import { Observable, ReplaySubject } from 'rxjs';
import { environment } from '../../environments/environment';
import { TurnstileService } from './turnstile.service';

type ManifestEntry = string | {
  name?: string;
  path?: string;
  current_path?: string;
  currentPath?: string;
  url?: string;
  href?: string;
};

interface ResourceManifest {
  version?: string;
  resource_version?: string;
  master_version?: string;
  current_version?: string;
  files?: Record<string, ManifestEntry> | ManifestEntry[];
  artifacts?: Record<string, ManifestEntry> | ManifestEntry[];
  resources?: Record<string, ManifestEntry> | ManifestEntry[];
  paths?: Record<string, ManifestEntry> | ManifestEntry[];
  entries?: Record<string, ManifestEntry> | ManifestEntry[];
}

interface ResourceCacheMeta {
  url: string;
  version: string;
  cacheName: string;
  cachedAt: number;
}

export const NON_BANNER_RESOURCE_NAMES = [
  'affinity',
  'aptitudes',
  'campaigns',
  'card-events',
  'cards',
  'champions_meeting',
  'character',
  'character_names',
  'factors',
  'legend_races',
  'race_program',
  'race_to_saddle_mapping',
  'reduced_cards',
  'skills',
  'story_events',
  'support-cards-db',
  'supports'
] as const;

@Injectable({ providedIn: 'root' })
export class ResourceDataService {
  private static readonly CACHE_PREFIX = 'umamoe-resource-data';
  private static readonly META_PREFIX = 'umamoe_resource_meta_v1:';
  private static jsonParseWorkerUrl: string | null = null;

  private subjects = new Map<string, ReplaySubject<unknown>>();
  private loadStarted = new Set<string>();
  private manifest: ResourceManifest | null = null;
  private manifestPromise: Promise<ResourceManifest | null> | null = null;

  constructor(private turnstileService: TurnstileService) {}

  watchResource<T>(resourceName: string, fallback: T): Observable<T> {
    let subject = this.subjects.get(resourceName) as ReplaySubject<T> | undefined;
    if (!subject) {
      subject = new ReplaySubject<T>(1);
      this.subjects.set(resourceName, subject as ReplaySubject<unknown>);
    }

    if (!this.loadStarted.has(resourceName)) {
      this.loadStarted.add(resourceName);
      subject.next(fallback);
      void this.loadResource(resourceName, subject);
    }

    return subject.asObservable();
  }

  preloadResource(resourceName: string): void {
    if (this.loadStarted.has(resourceName)) {
      return;
    }

    this.loadStarted.add(resourceName);
    const subject = new ReplaySubject<unknown>(1);
    this.subjects.set(resourceName, subject);
    void this.loadResource(resourceName, subject);
  }

  private async loadResource<T>(resourceName: string, subject: ReplaySubject<T>): Promise<void> {
    let emittedCached = false;

    try {
      const cached = await this.readCachedResource<T>(resourceName);
      if (cached !== null) {
        emittedCached = true;
        subject.next(cached);
      }
    } catch (error) {
      console.warn(`Failed to read cached resource ${resourceName}:`, error);
    }

    try {
      const manifest = await this.fetchManifest();
      if (!manifest) {
        return;
      }

      const version = this.getManifestVersion(manifest);
      const url = this.resolveResourceUrl(resourceName, manifest);
      if (!version || !url) {
        return;
      }

      const meta = this.readCacheMeta(resourceName);
      if (emittedCached && meta?.version === version && meta.url === url) {
        return;
      }

      const data = await this.fetchAndCacheResource<T>(resourceName, url, version);
      subject.next(data);
      void this.cleanupOldCaches(version);
    } catch (error) {
      console.warn(`Failed to refresh resource ${resourceName}:`, error);
    }
  }

  private async fetchManifest(): Promise<ResourceManifest | null> {
    if (this.manifest) {
      return this.manifest;
    }

    if (!this.manifestPromise) {
      const manifestRequest = this.fetchJsonWithBrowserProof<ResourceManifest>(`${this.resourceBaseUrl}/manifest.json`)
        .catch(() => null);

      this.manifestPromise = manifestRequest;
    }

    const manifest = await this.manifestPromise;
    if (manifest) {
      this.manifest = manifest;
    }

    this.manifestPromise = null;
    return manifest;
  }

  private get resourceBaseUrl(): string {
    const configured = (environment as any).resourceUrl as string | undefined;
    if (configured) {
      return configured.replace(/\/+$/, '');
    }

    const apiUrl = (environment.apiUrl || '').replace(/\/+$/, '');
    return `${apiUrl}/resources`;
  }

  private getManifestVersion(manifest: ResourceManifest): string | null {
    return manifest.version
      || manifest.resource_version
      || manifest.current_version
      || manifest.master_version
      || null;
  }

  private resolveResourceUrl(resourceName: string, manifest: ResourceManifest): string | null {
    const manifestPath = this.findManifestPath(resourceName, manifest);
    if (manifestPath) {
      return this.toAbsoluteResourceUrl(manifestPath);
    }

    if (this.manifestHasExplicitEntries(manifest)) {
      return null;
    }

    const version = this.getManifestVersion(manifest);
    return version ? `${this.resourceBaseUrl}/${version}/${resourceName}.json.gz` : null;
  }

  private findManifestPath(resourceName: string, manifest: ResourceManifest): string | null {
    const candidates = [resourceName, `${resourceName}.json`, `${resourceName}.json.gz`];
    const containers = [manifest.files, manifest.artifacts, manifest.resources, manifest.paths, manifest.entries];

    for (const container of containers) {
      if (!container) {
        continue;
      }

      if (Array.isArray(container)) {
        for (const entry of container) {
          const path = this.findMatchingEntryPath(entry, candidates);
          if (path) {
            return path;
          }
        }
        continue;
      }

      for (const candidate of candidates) {
        const entry = container[candidate];
        const path = this.entryToPath(entry);
        if (path) {
          return path;
        }
      }
    }

    return null;
  }

  private manifestHasExplicitEntries(manifest: ResourceManifest): boolean {
    return [manifest.files, manifest.artifacts, manifest.resources, manifest.paths, manifest.entries]
      .some(container => Array.isArray(container) ? container.length > 0 : !!container && Object.keys(container).length > 0);
  }

  private entryToPath(entry: ManifestEntry | undefined): string | null {
    if (!entry) {
      return null;
    }

    if (typeof entry === 'string') {
      return entry;
    }

    return entry.current_path || entry.currentPath || entry.url || entry.href || entry.path || null;
  }

  private findMatchingEntryPath(entry: ManifestEntry | undefined, candidates: string[]): string | null {
    if (!entry) {
      return null;
    }

    if (typeof entry === 'string') {
      return candidates.some(candidate => entry.endsWith(candidate)) ? entry : null;
    }

    const entryName = entry.name;
    if (entryName && candidates.includes(entryName)) {
      return this.entryToPath(entry);
    }

    const path = this.entryToPath(entry);
    return path && candidates.some(candidate => path.endsWith(candidate)) ? path : null;
  }

  private toAbsoluteResourceUrl(path: string): string {
    if (/^https?:\/\//i.test(path)) {
      return path;
    }

    if (path.startsWith('/')) {
      return path;
    }

    return `${this.resourceBaseUrl}/${path.replace(/^\/+/, '')}`;
  }

  private async readCachedResource<T>(resourceName: string): Promise<T | null> {
    const meta = this.readCacheMeta(resourceName);
    if (!meta || !this.canUseCacheStorage()) {
      return null;
    }

    const cache = await caches.open(meta.cacheName);
    const cachedResponse = await cache.match(meta.url);
    if (!cachedResponse) {
      return null;
    }

    return this.parseJsonResponse<T>(cachedResponse, meta.url);
  }

  private async fetchAndCacheResource<T>(resourceName: string, url: string, version: string): Promise<T> {
    const response = await this.fetchWithBrowserProof(url, { cache: 'no-cache' });
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    const cacheName = this.getCacheName(version);
    if (this.canUseCacheStorage()) {
      const cache = await caches.open(cacheName);
      await cache.put(url, response.clone());
      this.writeCacheMeta(resourceName, { url, version, cacheName, cachedAt: Date.now() });
    }

    return this.parseJsonResponse<T>(response, url);
  }

  private async fetchJsonWithBrowserProof<T>(url: string): Promise<T> {
    const response = await this.fetchWithBrowserProof(url, { cache: 'no-cache' });
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  private async fetchWithBrowserProof(url: string, init: RequestInit): Promise<Response> {
    const response = await this.performFetchWithBrowserProof(url, init, false);
    if (response.status === 403) {
      const failedProofToken = this.getProofTokenFromHeaders(init.headers) ?? undefined;
      this.turnstileService.invalidateBrowserProof(failedProofToken);

      const retryResponse = await this.performFetchWithBrowserProof(url, init, true);
      this.captureBrowserProof(retryResponse);
      return retryResponse;
    }

    this.captureBrowserProof(response);
    return response;
  }

  private async performFetchWithBrowserProof(
    url: string,
    init: RequestInit,
    forceRefresh: boolean,
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    const proofToken = await this.getProofToken(forceRefresh);
    if (proofToken) {
      headers.set(this.turnstileService.proofHeaderName, proofToken);
    }

    return fetch(url, {
      ...init,
      headers,
      credentials: init.credentials ?? 'include',
    });
  }

  private async getProofToken(forceRefresh: boolean): Promise<string> {
    if (!this.turnstileService.enabled) {
      return '';
    }

    const action = environment.turnstile.action;
    const cachedProofToken = forceRefresh ? '' : this.turnstileService.getCachedProofToken(action);
    if (cachedProofToken) {
      return cachedProofToken;
    }

    return this.turnstileService.getProofToken(action, forceRefresh);
  }

  private getProofTokenFromHeaders(headersInit?: HeadersInit): string | null {
    if (!headersInit) {
      return null;
    }

    return new Headers(headersInit).get(this.turnstileService.proofHeaderName)?.trim() ?? null;
  }

  private captureBrowserProof(response: Response): void {
    const proofToken = response.headers.get(this.turnstileService.proofHeaderName)?.trim() ?? '';
    const ttlSeconds = Number(response.headers.get(this.turnstileService.proofTtlHeaderName) ?? '0');
    this.turnstileService.storeBrowserProof(proofToken, ttlSeconds, environment.turnstile.action);
  }

  private async parseJsonResponse<T>(response: Response, url: string): Promise<T> {
    const buffer = await response.arrayBuffer();
    return this.parseJsonBuffer<T>(buffer, url);
  }

  private async parseJsonBuffer<T>(buffer: ArrayBuffer, url: string): Promise<T> {
    if (this.canUseJsonParseWorker()) {
      try {
        return await this.parseJsonBufferInWorker<T>(buffer, url);
      } catch (error) {
        console.warn(`Falling back to main-thread resource parsing for ${url}:`, error);
      }
    }

    const text = await this.decodeJsonBuffer(buffer, url);
    return JSON.parse(text) as T;
  }

  private canUseJsonParseWorker(): boolean {
    return typeof Worker !== 'undefined'
      && typeof URL !== 'undefined'
      && typeof URL.createObjectURL === 'function'
      && typeof Blob !== 'undefined';
  }

  private parseJsonBufferInWorker<T>(buffer: ArrayBuffer, url: string): Promise<T> {
    const worker = this.createJsonParseWorker();

    return new Promise<T>((resolve, reject) => {
      const cleanup = () => {
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
        worker.terminate();
      };

      const onMessage = (event: MessageEvent<{ ok: boolean; json?: T; error?: string }>) => {
        cleanup();
        if (event.data?.ok) {
          resolve(event.data.json as T);
          return;
        }

        reject(new Error(event.data?.error || `Failed to parse resource asset: ${url}`));
      };

      const onError = (event: ErrorEvent) => {
        cleanup();
        reject(new Error(event.message || `Failed to parse resource asset: ${url}`));
      };

      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onError);
      worker.postMessage({ buffer, url });
    });
  }

  private createJsonParseWorker(): Worker {
    if (!ResourceDataService.jsonParseWorkerUrl) {
      const workerSource = `
const decodeJsonBuffer = async (buffer, url) => {
  const bytes = new Uint8Array(buffer);
  const isGzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;

  if (!isGzip) {
    return new TextDecoder('utf-8').decode(buffer);
  }

  const DecompressionStreamConstructor = self.DecompressionStream;
  if (!DecompressionStreamConstructor) {
    throw new Error('This browser cannot decode gzip resource asset: ' + url);
  }

  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStreamConstructor('gzip'));
  return new Response(stream).text();
};

self.onmessage = async (event) => {
  const { buffer, url } = event.data;

  try {
    const text = await decodeJsonBuffer(buffer, url);
    const json = JSON.parse(text);
    self.postMessage({ ok: true, json });
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};`;

      ResourceDataService.jsonParseWorkerUrl = URL.createObjectURL(
        new Blob([workerSource], { type: 'application/javascript' })
      );
    }

    return new Worker(ResourceDataService.jsonParseWorkerUrl);
  }

  private async decodeJsonBuffer(buffer: ArrayBuffer, url: string): Promise<string> {
    const bytes = new Uint8Array(buffer);
    const isGzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;

    if (!isGzip) {
      return new TextDecoder('utf-8').decode(buffer);
    }

    const DecompressionStreamConstructor = (globalThis as any).DecompressionStream;
    if (!DecompressionStreamConstructor) {
      throw new Error(`This browser cannot decode gzip resource asset: ${url}`);
    }

    const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStreamConstructor('gzip'));
    return new Response(stream).text();
  }

  private readCacheMeta(resourceName: string): ResourceCacheMeta | null {
    try {
      const raw = localStorage.getItem(`${ResourceDataService.META_PREFIX}${resourceName}`);
      return raw ? JSON.parse(raw) as ResourceCacheMeta : null;
    } catch {
      return null;
    }
  }

  private writeCacheMeta(resourceName: string, meta: ResourceCacheMeta): void {
    try {
      localStorage.setItem(`${ResourceDataService.META_PREFIX}${resourceName}`, JSON.stringify(meta));
    } catch {}
  }

  private getCacheName(version: string): string {
    return `${ResourceDataService.CACHE_PREFIX}-${version}`;
  }

  private canUseCacheStorage(): boolean {
    return typeof caches !== 'undefined';
  }

  private async cleanupOldCaches(currentVersion: string): Promise<void> {
    if (!this.canUseCacheStorage()) {
      return;
    }

    const currentCacheName = this.getCacheName(currentVersion);
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter(name => name.startsWith(ResourceDataService.CACHE_PREFIX) && name !== currentCacheName)
        .map(name => caches.delete(name))
    );
  }
}