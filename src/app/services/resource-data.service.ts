import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, ReplaySubject } from 'rxjs';
import { environment } from '../../environments/environment';
import { TurnstileService } from './turnstile.service';

type ManifestEntry = string | {
  name?: string;
  path?: string;
  current_path?: string;
  currentPath?: string;
  url?: string;
  href?: string;
  sha256?: string;
  current_sha256?: string;
  currentSha256?: string;
  checksum?: string;
  digest?: string;
  hash?: string;
};

interface ResourceManifest {
  version?: string;
  resource_version?: string;
  master_version?: string;
  current_version?: string;
  generated_at?: string;
  generatedAt?: string;
  files?: Record<string, ManifestEntry> | ManifestEntry[];
  artifacts?: Record<string, ManifestEntry> | ManifestEntry[];
  resources?: Record<string, ManifestEntry> | ManifestEntry[];
  paths?: Record<string, ManifestEntry> | ManifestEntry[];
  entries?: Record<string, ManifestEntry> | ManifestEntry[];
}

interface ResolvedResource {
  url: string;
  fingerprint?: string;
}

interface ResourceCacheMeta {
  url: string;
  version: string;
  cacheName: string;
  cachedAt: number;
  manifestGeneratedAt?: string;
  fingerprint?: string;
}

export interface ResourceLoadError {
  resourceName: string;
  message: string;
  attempt: number;
  occurredAt: string;
  url?: string;
}

class ResourceHttpError extends Error {
  constructor(
    message: string,
    readonly url: string,
  ) {
    super(message);
    this.name = 'ResourceHttpError';
  }
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
  private static readonly RETRY_DELAYS_MS = [1000, 3000, 7000, 15000, 30000];
  private static jsonParseWorkerUrl: string | null = null;

  private subjects = new Map<string, ReplaySubject<unknown>>();
  private loadStarted = new Set<string>();
  private manifest: ResourceManifest | null = null;
  private manifestPromise: Promise<ResourceManifest> | null = null;
  private resourcePendingSubjects = new Map<string, BehaviorSubject<boolean>>();
  private resourceErrorSubjects = new Map<string, BehaviorSubject<ResourceLoadError | null>>();
  private retryAttempts = new Map<string, number>();
  private retryTimers = new Map<string, ReturnType<typeof setTimeout>>();

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

  resourcePending(resourceName: string): Observable<boolean> {
    return this.getResourcePendingSubject(resourceName).asObservable();
  }

  resourceError(resourceName: string): Observable<ResourceLoadError | null> {
    return this.getResourceErrorSubject(resourceName).asObservable();
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
    this.setResourcePending(resourceName, true);
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
      const version = this.getManifestVersion(manifest);
      const manifestGeneratedAt = this.getManifestGeneratedAt(manifest);
      const resource = this.resolveResource(resourceName, manifest);
      if (!version || !resource) {
        this.clearResourceRetry(resourceName);
        this.setResourcePending(resourceName, false);
        this.setResourceError(resourceName, null);
        return;
      }

      const meta = this.readCacheMeta(resourceName);
      if (emittedCached && this.isCacheFresh(meta, version, resource, manifestGeneratedAt)) {
        this.clearResourceRetry(resourceName);
        this.setResourcePending(resourceName, false);
        this.setResourceError(resourceName, null);
        return;
      }

      await this.waitForBrowserProofBeforeResourceFetch();
      const data = await this.fetchAndCacheResource<T>(resourceName, resource, version, manifestGeneratedAt);
      subject.next(data);
      this.clearResourceRetry(resourceName);
      this.setResourcePending(resourceName, false);
      this.setResourceError(resourceName, null);
      void this.cleanupOldCaches(version);
    } catch (error) {
      console.warn(`Failed to refresh resource ${resourceName}:`, error);
      this.setResourcePending(resourceName, true);
      this.setResourceError(resourceName, this.toResourceLoadError(resourceName, error));
      this.scheduleResourceRetry(resourceName, subject);
    }
  }

  private async waitForBrowserProofBeforeResourceFetch(): Promise<void> {
    if (!environment.turnstile.enabled) {
      return;
    }

    if (this.turnstileService.getCachedProofToken(environment.turnstile.action)) {
      return;
    }

    await this.turnstileService.ensureBrowserProof(environment.turnstile.action);
  }

  private async fetchManifest(): Promise<ResourceManifest> {
    if (this.manifest) {
      return this.manifest;
    }

    if (!this.manifestPromise) {
      const manifestUrl = this.withCacheBuster(`${this.resourceBaseUrl}/manifest.json`, Date.now().toString());
      this.manifestPromise = this.fetchJsonWithBrowserProof<ResourceManifest>(manifestUrl);
    }

    try {
      const manifest = await this.manifestPromise;
      if (!manifest) {
        throw new Error('Resource manifest response was empty');
      }

      this.manifest = manifest;
      return manifest;
    } finally {
      this.manifestPromise = null;
    }
  }

  private scheduleResourceRetry<T>(resourceName: string, subject: ReplaySubject<T>): void {
    if (this.retryTimers.has(resourceName)) {
      return;
    }

    const attempt = this.retryAttempts.get(resourceName) ?? 0;
    const delay = ResourceDataService.RETRY_DELAYS_MS[
      Math.min(attempt, ResourceDataService.RETRY_DELAYS_MS.length - 1)
    ];

    this.retryAttempts.set(resourceName, attempt + 1);
    const timer = setTimeout(() => {
      this.retryTimers.delete(resourceName);
      void this.loadResource(resourceName, subject);
    }, delay);

    this.retryTimers.set(resourceName, timer);
  }

  private clearResourceRetry(resourceName: string): void {
    const timer = this.retryTimers.get(resourceName);
    if (timer) {
      clearTimeout(timer);
      this.retryTimers.delete(resourceName);
    }

    this.retryAttempts.delete(resourceName);
  }

  private getResourcePendingSubject(resourceName: string): BehaviorSubject<boolean> {
    let subject = this.resourcePendingSubjects.get(resourceName);
    if (!subject) {
      subject = new BehaviorSubject<boolean>(false);
      this.resourcePendingSubjects.set(resourceName, subject);
    }

    return subject;
  }

  private setResourcePending(resourceName: string, pending: boolean): void {
    const subject = this.getResourcePendingSubject(resourceName);
    if (subject.value !== pending) {
      subject.next(pending);
    }
  }

  private getResourceErrorSubject(resourceName: string): BehaviorSubject<ResourceLoadError | null> {
    let subject = this.resourceErrorSubjects.get(resourceName);
    if (!subject) {
      subject = new BehaviorSubject<ResourceLoadError | null>(null);
      this.resourceErrorSubjects.set(resourceName, subject);
    }

    return subject;
  }

  private setResourceError(resourceName: string, error: ResourceLoadError | null): void {
    this.getResourceErrorSubject(resourceName).next(error);
  }

  private toResourceLoadError(resourceName: string, error: unknown): ResourceLoadError {
    const attempt = (this.retryAttempts.get(resourceName) ?? 0) + 1;
    const base = {
      resourceName,
      attempt,
      occurredAt: new Date().toISOString(),
    };

    if (error instanceof ResourceHttpError) {
      return { ...base, message: error.message, url: error.url };
    }

    if (error instanceof Error) {
      return { ...base, message: error.message || error.name };
    }

    return { ...base, message: String(error) };
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

  private getManifestGeneratedAt(manifest: ResourceManifest): string | null {
    return manifest.generated_at || manifest.generatedAt || null;
  }

  private resolveResource(resourceName: string, manifest: ResourceManifest): ResolvedResource | null {
    const manifestEntry = this.findManifestEntry(resourceName, manifest);
    if (manifestEntry) {
      const url = this.toAbsoluteResourceUrl(manifestEntry.path);
      return {
        url: this.withCacheBuster(url, manifestEntry.fingerprint),
        fingerprint: manifestEntry.fingerprint,
      };
    }

    if (this.manifestHasExplicitEntries(manifest)) {
      return null;
    }

    const version = this.getManifestVersion(manifest);
    return version ? { url: `${this.resourceBaseUrl}/${version}/${resourceName}.json.gz` } : null;
  }

  private findManifestEntry(resourceName: string, manifest: ResourceManifest): { path: string; fingerprint?: string } | null {
    const candidates = [resourceName, `${resourceName}.json`, `${resourceName}.json.gz`];
    const containers = [manifest.files, manifest.artifacts, manifest.resources, manifest.paths, manifest.entries];

    for (const container of containers) {
      if (!container) {
        continue;
      }

      if (Array.isArray(container)) {
        for (const entry of container) {
          const match = this.findMatchingEntry(entry, candidates);
          if (match) {
            return match;
          }
        }
        continue;
      }

      for (const candidate of candidates) {
        const entry = container[candidate];
        const path = this.entryToPath(entry);
        if (path) {
          return { path, fingerprint: this.entryToFingerprint(entry) ?? undefined };
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

  private entryToFingerprint(entry: ManifestEntry | undefined): string | null {
    if (!entry || typeof entry === 'string') {
      return null;
    }

    return entry.current_sha256
      || entry.currentSha256
      || entry.sha256
      || entry.checksum
      || entry.digest
      || entry.hash
      || null;
  }

  private findMatchingEntry(entry: ManifestEntry | undefined, candidates: string[]): { path: string; fingerprint?: string } | null {
    if (!entry) {
      return null;
    }

    if (typeof entry === 'string') {
      return candidates.some(candidate => entry.endsWith(candidate)) ? { path: entry } : null;
    }

    const entryName = entry.name;
    const path = this.entryToPath(entry);
    if (entryName && candidates.includes(entryName)) {
      return path ? { path, fingerprint: this.entryToFingerprint(entry) ?? undefined } : null;
    }

    return path && candidates.some(candidate => path.endsWith(candidate))
      ? { path, fingerprint: this.entryToFingerprint(entry) ?? undefined }
      : null;
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

  private withCacheBuster(url: string, value?: string): string {
    if (!value) {
      return url;
    }

    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}v=${encodeURIComponent(value)}`;
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

  private async fetchAndCacheResource<T>(
    resourceName: string,
    resource: ResolvedResource,
    version: string,
    manifestGeneratedAt: string | null,
  ): Promise<T> {
    const url = resource.url;
    const response = await this.fetchWithBrowserProof(url, { cache: 'no-cache' });
    if (!response.ok) {
      throw new ResourceHttpError(`${response.status} ${response.statusText || 'HTTP error'}`, url);
    }

    const cacheName = this.getCacheName(version);
    if (this.canUseCacheStorage()) {
      const cache = await caches.open(cacheName);
      await cache.put(url, response.clone());
      this.writeCacheMeta(resourceName, {
        url,
        version,
        cacheName,
        cachedAt: Date.now(),
        manifestGeneratedAt: manifestGeneratedAt ?? undefined,
        fingerprint: resource.fingerprint,
      });
    }

    return this.parseJsonResponse<T>(response, url);
  }

  private isCacheFresh(
    meta: ResourceCacheMeta | null,
    version: string,
    resource: ResolvedResource,
    manifestGeneratedAt: string | null,
  ): boolean {
    if (!meta || meta.version !== version || meta.url !== resource.url) {
      return false;
    }

    if (resource.fingerprint) {
      return meta.fingerprint === resource.fingerprint;
    }

    if (this.isManifestNewer(manifestGeneratedAt, meta.manifestGeneratedAt)) {
      return false;
    }

    return true;
  }

  private isManifestNewer(currentGeneratedAt: string | null, cachedGeneratedAt?: string): boolean {
    if (!currentGeneratedAt || !cachedGeneratedAt) {
      return !!currentGeneratedAt && !cachedGeneratedAt;
    }

    const currentTime = this.parseManifestTimestamp(currentGeneratedAt);
    const cachedTime = this.parseManifestTimestamp(cachedGeneratedAt);
    if (currentTime === null || cachedTime === null) {
      return currentGeneratedAt !== cachedGeneratedAt;
    }

    return currentTime > cachedTime;
  }

  private parseManifestTimestamp(value: string): number | null {
    const normalizedValue = value.replace(/(\.\d{3})\d+(?=(?:Z|[+-]\d{2}:?\d{2})?$)/i, '$1');
    const time = Date.parse(normalizedValue);
    return Number.isNaN(time) ? null : time;
  }

  private async fetchJsonWithBrowserProof<T>(url: string): Promise<T> {
    const response = await this.fetchWithBrowserProof(url, { cache: 'no-cache' });
    if (!response.ok) {
      throw new ResourceHttpError(`${response.status} ${response.statusText || 'HTTP error'}`, url);
    }

    return response.json() as Promise<T>;
  }

  private async fetchWithBrowserProof(url: string, init: RequestInit): Promise<Response> {
    const response = await this.performFetchWithBrowserProof(url, init, false);
    if (await this.shouldRetryWithFreshProof(response)) {
      this.turnstileService.invalidateBrowserProof();

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
    headers.set('Accept', headers.get('Accept') ?? 'application/json');

    const proofToken = forceRefresh
      ? await this.turnstileService.ensureBrowserProof(environment.turnstile.action, true)
      : this.turnstileService.getCachedProofToken(environment.turnstile.action);

    if (!proofToken && !forceRefresh) {
      this.turnstileService.prime();
    }

    if (proofToken) {
      headers.set(this.turnstileService.proofHeaderName, proofToken);
    }

    return fetch(url, {
      ...init,
      headers,
      credentials: init.credentials ?? 'include',
    });
  }

  private captureBrowserProof(response: Response): void {
    const proofToken = response.headers.get(this.turnstileService.proofHeaderName)?.trim() ?? '';
    const ttlSeconds = Number(response.headers.get(this.turnstileService.proofTtlHeaderName) ?? '0');
    const source = response.headers.get(this.turnstileService.proofSourceHeaderName)?.trim() ?? 'turnstile';
    this.turnstileService.storeBrowserProof(proofToken, ttlSeconds, environment.turnstile.action, source);
  }

  private async shouldRetryWithFreshProof(response: Response): Promise<boolean> {
    if (response.status !== 403) {
      return false;
    }

    const errorCode = await this.extractErrorCode(response);
    return errorCode === 'browser_proof_required'
      || errorCode === 'turnstile_invalid'
      || errorCode === 'browser_context_mismatch'
      || errorCode === 'invalid_browser_proof';
  }

  private async extractErrorCode(response: Response): Promise<string | null> {
    try {
      const contentType = response.headers.get('Content-Type') ?? '';
      if (contentType.includes('application/json')) {
        const body = await response.clone().json() as { error?: unknown; code?: unknown };
        const errorCode = body?.error ?? body?.code;
        return typeof errorCode === 'string' ? errorCode : null;
      }

      const body = await response.clone().text();
      if (body.includes('browser_proof_required')) {
        return 'browser_proof_required';
      }

      if (body.includes('turnstile_invalid')) {
        return 'turnstile_invalid';
      }

      if (body.includes('browser_context_mismatch')) {
        return 'browser_context_mismatch';
      }

      if (body.includes('invalid_browser_proof')) {
        return 'invalid_browser_proof';
      }
    } catch {}

    return null;
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
