import { isPlatformBrowser } from '@angular/common';
import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  CaratPlannerDataBundle,
  CaratPlannerTimelineEvent,
  PlannerCoreResource,
  PlannerGachaEntry,
  PlannerGachaResource,
  PlannerIncomeResource,
  PlannerRewardResource,
} from '../models/carat-planner.model';
import { TurnstileService } from './turnstile.service';
import { resolvePlannerGachaRates } from './carat-planner-gacha-rates';

type PlannerManifestEntry = string | {
  path?: string;
  current_path?: string;
  currentPath?: string;
  url?: string;
  href?: string;
  name?: string;
  sha256?: string;
  current_sha256?: string;
};

interface PlannerManifest {
  version?: string;
  resource_version?: string;
  files?: Record<string, PlannerManifestEntry> | PlannerManifestEntry[];
  artifacts?: Record<string, PlannerManifestEntry> | PlannerManifestEntry[];
  resources?: Record<string, PlannerManifestEntry> | PlannerManifestEntry[];
}

export interface CaratPlannerResourceState {
  loading: boolean;
  ready: boolean;
  usingCache: boolean;
  error: string | null;
}

const EMPTY_BUNDLE: CaratPlannerDataBundle = {
  core: {},
  income: { rules: [] },
  rewards: { rewards: [], event_benefits: [], free_pull_campaigns: [] },
};

@Injectable({ providedIn: 'root' })
export class CaratPlannerResourceService {
  private static readonly CACHE_NAME = 'umamoe-carat-planner-v2';
  private static jsonParseWorkerUrl: string | null = null;
  private readonly isBrowser: boolean;
  private manifest: PlannerManifest | null = null;
  private manifestPromise: Promise<PlannerManifest> | null = null;
  private initialPromise: Promise<CaratPlannerDataBundle> | null = null;
  private rewardsPromise: Promise<PlannerRewardResource> | null = null;
  private bundle: CaratPlannerDataBundle = EMPTY_BUNDLE;
  private readonly shardPromises = new Map<string, Promise<PlannerGachaEntry[]>>();
  private readonly gachaById = new Map<number, PlannerGachaEntry>();
  private readonly gachaByEventId = new Map<string, PlannerGachaEntry>();
  private readonly resolvedGachaByEventId = new Map<string, PlannerGachaEntry>();
  private detailLoadCount = 0;
  private detailRequest = 0;
  private detailError: string | null = null;
  private readonly stateSubject = new BehaviorSubject<CaratPlannerResourceState>({
    loading: false,
    ready: false,
    usingCache: false,
    error: null,
  });

  readonly state$ = this.stateSubject.asObservable();

  constructor(
    private readonly turnstileService: TurnstileService,
    @Inject(PLATFORM_ID) platformId: object,
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  get currentBundle(): CaratPlannerDataBundle {
    return this.bundle;
  }

  get loadedGachas(): PlannerGachaEntry[] {
    return [...this.resolvedGachaByEventId.values(), ...this.gachaById.values()];
  }

  prefetchManifest(): void {
    if (!this.isBrowser) {
      return;
    }
    this.turnstileService.prime();
    void this.loadManifest().catch(() => undefined);
  }

  loadInitial(): Promise<CaratPlannerDataBundle> {
    if (this.initialPromise) {
      return this.initialPromise;
    }
    this.stateSubject.next({ loading: true, ready: false, usingCache: false, error: null });
    this.initialPromise = this.loadInitialInner()
      .then(bundle => {
        this.bundle = bundle;
        this.stateSubject.next({ ...this.stateSubject.value, loading: false, ready: true, error: null });
        return bundle;
      })
      .catch(error => {
        const message = error instanceof Error ? error.message : String(error);
        this.stateSubject.next({ ...this.stateSubject.value, loading: false, ready: false, error: message });
        this.initialPromise = null;
        throw error;
      });
    return this.initialPromise;
  }

  loadRewards(): Promise<PlannerRewardResource> {
    if (this.rewardsPromise) return this.rewardsPromise;
    this.rewardsPromise = this.loadArtifact<PlannerRewardResource>('planner_rewards.json')
      .then(rewards => {
        const normalized: PlannerRewardResource = {
          ...rewards,
          rewards: Array.isArray(rewards?.rewards) ? rewards.rewards : [],
          event_benefits: Array.isArray(rewards?.event_benefits) ? rewards.event_benefits : [],
          free_pull_campaigns: Array.isArray(rewards?.free_pull_campaigns) ? rewards.free_pull_campaigns : [],
          competitive_variants: Array.isArray(rewards?.competitive_variants) ? rewards.competitive_variants : [],
        };
        this.bundle = { ...this.bundle, rewards: normalized };
        return normalized;
      })
      .catch(error => {
        this.rewardsPromise = null;
        throw error;
      });
    return this.rewardsPromise;
  }

  async loadGachasForEvents(events: readonly CaratPlannerTimelineEvent[]): Promise<PlannerGachaEntry[]> {
    await this.loadInitial();
    if (events.length === 0) {
      this.clearDetailError();
      return [];
    }

    const shards = new Set<string>();
    for (const event of events) {
      const known = this.findLoadedGacha(event);
      if (known) {
        continue;
      }
      const shard = this.resolveShard(event);
      if (shard) {
        shards.add(shard);
      }
    }

    const request = this.beginDetailLoad();
    try {
      await Promise.all([...shards].map(shard => this.loadGachaShard(shard)));
      const entries = events.map(event => {
        const source = this.findLoadedGacha(event) ?? this.syntheticStandardGacha(event);
        if (!source) return undefined;
        const resolved = resolvePlannerGachaRates(source, {
          featuredPickupIds: event.pickupCardIds ?? [],
          gachaType: event.gachaType,
          eventType: event.type,
        });
        const eventResolved = resolved.event_id === event.id ? resolved : { ...resolved, event_id: event.id };
        this.resolvedGachaByEventId.set(event.id, eventResolved);
        return eventResolved;
      });
      const missing = events.filter((_event, index) => !entries[index]);
      if (missing.length > 0) {
        const labels = missing.slice(0, 3).map(event => event.title || event.id).join(', ');
        throw new Error(`No protected gacha data was found for ${labels}.`);
      }
      this.finishDetailLoad(request);
      return entries.filter((entry): entry is PlannerGachaEntry => !!entry);
    } catch (error) {
      this.finishDetailLoad(request, error);
      throw error;
    }
  }

  loadGachaShard(shard: string): Promise<PlannerGachaEntry[]> {
    const normalized = shard.replace(/^planner_gacha_/, '').replace(/\.json(?:\.gz)?$/, '');
    const existing = this.shardPromises.get(normalized);
    if (existing) {
      return existing;
    }
    const promise = this.loadArtifact<PlannerGachaResource>(`planner_gacha_${normalized}.json`)
      .then(resource => {
        const entries = Array.isArray(resource?.gachas) ? resource.gachas : [];
        for (const entry of entries) {
          if (!Number.isFinite(entry.gacha_id)) {
            continue;
          }
          this.storeGacha(entry);
        }
        return entries;
      })
      .catch(error => {
        this.shardPromises.delete(normalized);
        throw error;
      });
    this.shardPromises.set(normalized, promise);
    return promise;
  }

  private async loadInitialInner(): Promise<CaratPlannerDataBundle> {
    await this.loadManifest();
    const [core, income, rewards] = await Promise.all([
      this.loadArtifact<PlannerCoreResource>('planner_core.json'),
      this.loadArtifact<PlannerIncomeResource>('planner_income.json'),
      this.loadRewards(),
    ]);
    return {
      core: core ?? {},
      income: { ...income, rules: Array.isArray(income?.rules) ? income.rules : [] },
      rewards,
    };
  }

  private async loadManifest(): Promise<PlannerManifest> {
    if (this.manifest) {
      return this.manifest;
    }
    if (this.manifestPromise) {
      return this.manifestPromise;
    }
    if (!this.isBrowser) {
      throw new Error('Planner resources are only available in the browser.');
    }

    const url = `${this.resourceBaseUrl}/planner/manifest.json`;
    this.manifestPromise = this.fetchManifest(url)
      .then(manifest => {
        this.manifest = manifest;
        return manifest;
      })
      .finally(() => {
        this.manifestPromise = null;
      });
    return this.manifestPromise;
  }

  private async fetchManifest(url: string): Promise<PlannerManifest> {
    // Always validate this small index before resolving content-addressed
    // artifacts. Returning a stale manifest for the first render can pin a
    // newly deployed planner schema until the user manually reloads.
    return this.refreshManifest(url);
  }

  private async refreshManifest(url: string): Promise<PlannerManifest> {
    try {
      const response = await this.fetchWithProof(`${url}?t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Planner manifest request failed (${response.status}).`);
      }
      const manifest = await response.clone().json() as PlannerManifest;
      await this.putCache(url, response);
      return manifest;
    } catch (error) {
      const cachedFallback = await this.matchCache(url);
      if (cachedFallback) {
        this.stateSubject.next({ ...this.stateSubject.value, usingCache: true });
        return cachedFallback.json() as Promise<PlannerManifest>;
      }
      throw error;
    }
  }

  private async loadArtifact<T>(logicalName: string): Promise<T> {
    const manifest = await this.loadManifest();
    const path = this.resolveArtifactPath(logicalName, manifest);
    if (!path) {
      throw new Error(`Planner resource ${logicalName} is missing from the protected manifest.`);
    }
    const url = this.absoluteUrl(path);
    const cached = await this.matchCache(url);
    if (cached) {
      this.stateSubject.next({ ...this.stateSubject.value, usingCache: true });
      return this.parseResponse<T>(cached, url);
    }

    const response = await this.fetchWithProof(url, { cache: 'no-cache' });
    if (!response.ok) {
      throw new Error(`Planner resource ${logicalName} failed (${response.status}).`);
    }
    await this.putCache(url, response.clone());
    return this.parseResponse<T>(response, url);
  }

  private resolveArtifactPath(logicalName: string, manifest: PlannerManifest): string | null {
    const base = logicalName.replace(/\.json(?:\.gz)?$/, '');
    const candidates = new Set([logicalName, `${base}.json`, `${base}.json.gz`, base]);
    for (const container of [manifest.files, manifest.artifacts, manifest.resources]) {
      if (!container) {
        continue;
      }
      if (Array.isArray(container)) {
        for (const entry of container) {
          const path = this.entryPath(entry);
          const name = typeof entry === 'object' ? entry.name : undefined;
          if (path && [...candidates].some(candidate => path.endsWith(candidate) || name === candidate)) {
            return path;
          }
        }
      } else {
        for (const candidate of candidates) {
          const path = this.entryPath(container[candidate]);
          if (path) {
            return path;
          }
        }
      }
    }
    return null;
  }

  private entryPath(entry: PlannerManifestEntry | undefined): string | null {
    if (!entry) {
      return null;
    }
    return typeof entry === 'string'
      ? entry
      : entry.path ?? entry.current_path ?? entry.currentPath ?? entry.url ?? entry.href ?? null;
  }

  private resolveShard(event: CaratPlannerTimelineEvent): string | null {
    const byEvent = this.bundle.core.gacha_shard_by_event?.[event.id];
    if (byEvent) {
      return byEvent;
    }
    for (const id of [event.gachaId, ...(event.gachaIds ?? [])]) {
      if (id !== undefined) {
        const byId = this.bundle.core.gacha_shard_by_id?.[String(id)];
        if (byId) {
          return byId;
        }
      }
    }
    // The protected core index is authoritative. Guessing a shard from the
    // event year makes unreleased banners fail before standard rates can be
    // inferred, and can also request files that do not exist yet.
    return null;
  }

  private findLoadedGacha(event: CaratPlannerTimelineEvent): PlannerGachaEntry | undefined {
    const resolved = this.resolvedGachaByEventId.get(event.id);
    if (resolved) return resolved;
    for (const id of [event.gachaId, ...(event.gachaIds ?? [])]) {
      if (id !== undefined) {
        const match = this.gachaById.get(id);
        if (match) {
          return match;
        }
      }
    }
    return this.gachaByEventId.get(event.id);
  }

  private syntheticStandardGacha(event: CaratPlannerTimelineEvent): PlannerGachaEntry | undefined {
    const bannerKind = event.type?.includes('support')
      ? 'support'
      : event.type?.includes('character')
        ? 'character'
        : undefined;
    if (!bannerKind) return undefined;
    const start = this.isoDate(event.globalReleaseDate ?? event.estimatedGlobalDate ?? event.jpReleaseDate);
    if (!start) return undefined;
    return {
      event_id: event.id,
      gacha_id: event.gachaId ?? event.gachaIds?.[0] ?? 0,
      gacha_type: event.gachaType,
      banner_kind: bannerKind,
      start_date: start,
      end_date: this.isoDate(event.estimatedEndDate) ?? start,
      pickups: [],
      rarity_rates: [],
      provenance: 'jp_fallback',
      confidence: 'timeline_schedule_defaults',
    };
  }

  private isoDate(value: Date | string | undefined): string | undefined {
    if (!value) return undefined;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }

  private storeGacha(entry: PlannerGachaEntry): void {
    this.gachaById.set(entry.gacha_id, entry);
    if (entry.event_id) this.gachaByEventId.set(entry.event_id, entry);
  }

  private async fetchWithProof(url: string, init: RequestInit): Promise<Response> {
    const initialProof = this.turnstileService.getCachedProofToken(environment.turnstile.action, { includeWarmup: true });
    let response = await this.performFetch(url, init, initialProof);
    this.captureProof(response);
    if (!await this.needsFreshProof(response, !!initialProof)) {
      return response;
    }
    this.turnstileService.invalidateBrowserProof(initialProof || undefined);
    const freshProof = await this.turnstileService.ensureBrowserProof(environment.turnstile.action, true);
    response = await this.performFetch(url, init, freshProof);
    this.captureProof(response);
    return response;
  }

  private performFetch(url: string, init: RequestInit, proof: string): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    if (proof) {
      headers.set(this.turnstileService.proofHeaderName, proof);
    } else {
      this.turnstileService.prime();
    }
    return fetch(url, { ...init, headers, credentials: 'omit' });
  }

  private captureProof(response: Response): void {
    const token = response.headers.get(this.turnstileService.proofHeaderName)?.trim() ?? '';
    const ttl = Number(response.headers.get(this.turnstileService.proofTtlHeaderName) ?? 0);
    const source = response.headers.get(this.turnstileService.proofSourceHeaderName)?.trim() ?? 'turnstile';
    this.turnstileService.storeBrowserProof(token, ttl, environment.turnstile.action, source);
  }

  private async needsFreshProof(response: Response, sentProof: boolean): Promise<boolean> {
    if (response.status !== 403 && !(response.status === 429 && !sentProof)) {
      return false;
    }
    try {
      const body = await response.clone().text();
      return ['browser_proof_required', 'turnstile_invalid', 'browser_context_mismatch', 'invalid_browser_proof', 'rate_limited']
        .some(code => body.includes(code));
    } catch {
      return response.status === 403;
    }
  }

  private async parseResponse<T>(response: Response, url: string): Promise<T> {
    const buffer = await response.arrayBuffer();
    if (this.canUseParseWorker()) {
      try {
        return await this.parseInWorker<T>(buffer, url);
      } catch (error) {
        console.warn(`Falling back to main-thread planner parsing for ${url}.`, error);
      }
    }
    return JSON.parse(await this.decodeBuffer(buffer, url)) as T;
  }

  private canUseParseWorker(): boolean {
    return typeof Worker !== 'undefined'
      && typeof URL !== 'undefined'
      && typeof URL.createObjectURL === 'function'
      && typeof Blob !== 'undefined';
  }

  private parseInWorker<T>(buffer: ArrayBuffer, url: string): Promise<T> {
    const worker = this.createParseWorker();
    return new Promise<T>((resolve, reject) => {
      const cleanup = () => worker.terminate();
      worker.onmessage = (event: MessageEvent<{ ok: boolean; json?: T; error?: string }>) => {
        cleanup();
        event.data?.ok
          ? resolve(event.data.json as T)
          : reject(new Error(event.data?.error || `Unable to parse ${url}.`));
      };
      worker.onerror = event => {
        cleanup();
        reject(new Error(event.message || `Unable to parse ${url}.`));
      };
      worker.postMessage({ buffer, url }, [buffer]);
    });
  }

  private createParseWorker(): Worker {
    if (!CaratPlannerResourceService.jsonParseWorkerUrl) {
      const source = `
const decode = async (buffer, url) => {
  const bytes = new Uint8Array(buffer);
  if (!(bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b)) {
    return new TextDecoder('utf-8').decode(buffer);
  }
  if (!self.DecompressionStream) throw new Error('This browser cannot decode ' + url + '.');
  const stream = new Blob([buffer]).stream().pipeThrough(new self.DecompressionStream('gzip'));
  return new Response(stream).text();
};
self.onmessage = async event => {
  try {
    const json = JSON.parse(await decode(event.data.buffer, event.data.url));
    self.postMessage({ ok: true, json });
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};`;
      CaratPlannerResourceService.jsonParseWorkerUrl = URL.createObjectURL(new Blob([source], { type: 'application/javascript' }));
    }
    return new Worker(CaratPlannerResourceService.jsonParseWorkerUrl);
  }

  private async decodeBuffer(buffer: ArrayBuffer, url: string): Promise<string> {
    const bytes = new Uint8Array(buffer);
    if (!(bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b)) {
      return new TextDecoder('utf-8').decode(buffer);
    }
    const Decompressor = (globalThis as any).DecompressionStream;
    if (!Decompressor) {
      throw new Error(`This browser cannot decode ${url}.`);
    }
    const stream = new Blob([buffer]).stream().pipeThrough(new Decompressor('gzip'));
    return new Response(stream).text();
  }

  private async matchCache(url: string): Promise<Response | undefined> {
    if (!this.canCache()) {
      return undefined;
    }
    try {
      return await caches.open(CaratPlannerResourceService.CACHE_NAME).then(cache => cache.match(url));
    } catch {
      return undefined;
    }
  }

  private async putCache(url: string, response: Response): Promise<void> {
    if (!this.canCache()) {
      return;
    }
    try {
      await caches.open(CaratPlannerResourceService.CACHE_NAME).then(cache => cache.put(url, response));
    } catch (error) {
      console.warn('Unable to cache planner resource.', error);
    }
  }

  private canCache(): boolean {
    return this.isBrowser && typeof caches !== 'undefined';
  }

  private beginDetailLoad(): number {
    const request = ++this.detailRequest;
    this.detailError = null;
    this.detailLoadCount++;
    this.stateSubject.next({ ...this.stateSubject.value, loading: true, error: null });
    return request;
  }

  private finishDetailLoad(request: number, error?: unknown): void {
    this.detailLoadCount = Math.max(0, this.detailLoadCount - 1);
    if (request === this.detailRequest) {
      this.detailError = error ? this.detailErrorMessage(error) : null;
    }
    this.stateSubject.next({
      ...this.stateSubject.value,
      loading: this.detailLoadCount > 0,
      error: this.detailError,
    });
  }

  private clearDetailError(): void {
    this.detailRequest++;
    this.detailError = null;
    this.stateSubject.next({
      ...this.stateSubject.value,
      loading: this.detailLoadCount > 0,
      error: null,
    });
  }

  private detailErrorMessage(error: unknown): string {
    const detail = error instanceof Error ? error.message : String(error);
    return detail ? `Banner rate data could not be loaded: ${detail}` : 'Banner rate data could not be loaded.';
  }

  private absoluteUrl(path: string): string {
    if (/^https?:\/\//i.test(path)) {
      return path;
    }
    if (path.startsWith('/')) {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
      return new URL(path, origin).toString();
    }
    const normalized = path.replace(/^\/+/, '');
    if (normalized.startsWith('planner/')) {
      return `${this.resourceBaseUrl}/${normalized}`;
    }
    return `${this.resourceBaseUrl}/planner/${normalized}`;
  }

  private get resourceBaseUrl(): string {
    const configured = (environment as any).resourceUrl as string | undefined;
    if (configured) {
      return configured.replace(/\/+$/, '');
    }
    return `${(environment.apiUrl || '').replace(/\/+$/, '')}/resources`;
  }
}
