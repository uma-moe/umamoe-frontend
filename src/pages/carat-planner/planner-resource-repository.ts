import type { PlannerDataBundle, PlannerGachaEvent, PlannerGachaEntry, PlannerGachaResource, PlannerIncomeResource, PlannerRewardResource, PlannerCoreResource } from '@/lib/timeline/carat-planner';
import { resolvePlannerGachaRates } from '@/lib/timeline/planner-gacha-rates';
import { applyGlobalRewardPrecedence } from '@/lib/timeline/planner-reward-precedence';
import { normalizePlannerIncomeRules } from '@/lib/timeline/planner-income-assumptions';
import { QueryCache } from '@/services/data/query-cache';
import { appHttp } from '@/services/http/app-http';
import { loadSupportCardRarities } from '@/lib/catalog/support-card-catalog';
import { jsonResponseHash, parseJsonResponse } from '@/lib/catalog/json-asset';
import { writable } from 'svelte/store';

type ManifestEntry = string | { name?: string; path?: string; current_path?: string; currentPath?: string; url?: string; href?: string; sha256?: string; current_sha256?: string; etag?: string };
interface PlannerManifest { files?: Record<string, ManifestEntry> | ManifestEntry[]; artifacts?: Record<string, ManifestEntry> | ManifestEntry[]; resources?: Record<string, ManifestEntry> | ManifestEntry[]; }

const cache = new QueryCache();
const normalizedRewards = new WeakMap<PlannerRewardResource, PlannerRewardResource>();
const manifestPath = '/resources/planner/manifest.json';
const gachaById = new Map<number, PlannerGachaEntry>();
const gachaByEvent = new Map<string, PlannerGachaEntry>();
let gachaGeneration = 0;
const diskCache = 'umamoe-carat-planner-v2';
const writes = new Map<string, Promise<void>>();
const requests = new Map<string, symbol>();
export const plannerUsingCache = writable(false);
let currentManifest: PlannerManifest | undefined;
let currentRewardPath = '';
let refreshTask: Promise<void> | undefined;
let lastRefresh = 0;
let offline = false;
const rewardListeners = new Set<(rewards: PlannerRewardResource) => void>();
let refreshTimer: ReturnType<typeof setInterval> | undefined;

async function cachedResponse(url: string): Promise<Response | undefined> {
  if (typeof caches === 'undefined') return undefined;
  try { await writes.get(url); return await (await caches.open(diskCache)).match(url); } catch { return undefined; }
}
async function parseResource<T>(response: Response, url: string): Promise<T> {
  const fingerprint = new URLSearchParams(url.split('?')[1]).get('v');
  const expected = /^[a-f0-9]{64}$/i.test(fingerprint ?? '') ? fingerprint!.toLowerCase() : undefined;
  const copy = expected ? response.clone() : undefined;
  const data = await parseJsonResponse<T>(response, url);
  const actual = copy ? await jsonResponseHash(copy) : undefined;
  if (expected && actual && expected !== actual) throw new Error('Planner resource failed its integrity check.');
  return data;
}
async function protectedResource<T>(url: string, refresh = false, isManifest = false): Promise<T> {
  const request = Symbol(); requests.set(url, request);
  try {
    const response = await appHttp.request<Response>(url, { browserProof: true, responseType: 'response', cache: isManifest ? 'no-store' : refresh ? 'reload' : 'default', query: isManifest ? { t: Date.now() } : undefined });
    const copy = response.clone();
    const data = await parseResource<T>(response, url);
    if (typeof caches !== 'undefined') {
      const write = (writes.get(url) ?? Promise.resolve()).then(async () => {
        if (requests.get(url) === request) await (await caches.open(diskCache)).put(url, copy);
      }).catch(() => {});
      writes.set(url, write);
      void write.finally(() => { if (writes.get(url) === write) writes.delete(url); });
    }
    if (isManifest) { offline = false; plannerUsingCache.set(false); }
    return data;
  } catch (error) {
    const cached = await cachedResponse(url);
    if (!cached) throw error;
    const data = await parseResource<T>(cached, url);
    offline = true; plannerUsingCache.set(true);
    return data;
  }
}

function entryPath(entry?: ManifestEntry): string | undefined {
  return typeof entry === 'string' ? entry : entry?.current_path ?? entry?.currentPath ?? entry?.url ?? entry?.href ?? entry?.path;
}
function absolute(path: string): string {
  if (/^https?:\/\//i.test(path) || path.startsWith('/')) return path;
  return `/resources/${path.startsWith('planner/') ? '' : 'planner/'}${path.replace(/^\/+/, '')}`;
}
function artifactPath(name: string, manifest: PlannerManifest): string {
  const base = name.replace(/\.json(?:\.gz)?$/, '');
  const candidates = [name, `${base}.json`, `${base}.json.gz`, base];
  for (const container of [manifest.files, manifest.artifacts, manifest.resources]) {
    if (!container) continue;
    if (Array.isArray(container)) {
      for (const entry of container) {
        const path = entryPath(entry);
        if (path && (candidates.some((candidate) => path.split('?')[0]!.endsWith(candidate)) || (typeof entry === 'object' && candidates.includes(entry.name ?? '')))) return versioned(path, entry);
      }
    } else {
      for (const candidate of candidates) {
        const path = entryPath(container[candidate]);
        if (path) return versioned(path, container[candidate]!);
      }
    }
  }
  throw new Error(`Planner resource ${name} is absent from the protected manifest.`);
}
function versioned(path: string, entry: ManifestEntry): string {
  const fingerprint = typeof entry === 'object' ? entry.current_sha256 ?? entry.sha256 ?? entry.etag : undefined;
  return absolute(path) + (fingerprint ? `${path.includes('?') ? '&' : '?'}v=${encodeURIComponent(fingerprint)}` : '');
}
async function manifest(refresh: boolean): Promise<PlannerManifest> {
  const result = await cache.get('planner:manifest', 5 * 60_000, () => protectedResource<PlannerManifest>(manifestPath, refresh, true), refresh);
  currentManifest = result;
  return result;
}
async function artifact<T>(name: string, refresh: boolean): Promise<T> {
  const index = await manifest(refresh);
  const path = artifactPath(name, index);
  const result = await cache.get(`planner:${path}`, 24 * 60 * 60_000, async () => {
    const stored = await cachedResponse(path);
    if (stored && /[?&]v=/.test(path)) {
      try { return await parseResource<T>(stored, path); } catch { refresh = true; /* Replace a damaged cached artifact, bypassing the HTTP cache too. */ }
    }
    return protectedResource<T>(path, refresh);
  }, refresh);
  if (name === 'planner_rewards.json') currentRewardPath = path;
  return result;
}
function refreshRewards(): Promise<void> {
  if (refreshTask) return refreshTask;
  if (document.hidden || !currentManifest || Date.now() - lastRefresh < (offline ? 30_000 : 60_000)) return Promise.resolve();
  lastRefresh = Date.now();
  refreshTask = (async () => {
    const recover = offline;
    const index = await manifest(true);
    if (!recover && artifactPath('planner_rewards.json', index) === currentRewardPath) return;
    const rewards = await plannerResourceRepository.rewards(true);
    for (const listener of rewardListeners) listener(rewards);
  })().catch(() => { /* Retain the last good rewards and retry on the next check. */ }).finally(() => { refreshTask = undefined; });
  return refreshTask;
}
const checkRewards = () => { void refreshRewards(); };
function storeGacha(entry: PlannerGachaEntry): void {
  if (!Number.isFinite(entry.gacha_id)) return;
  gachaById.set(entry.gacha_id, entry);
  if (entry.event_id) gachaByEvent.set(entry.event_id, entry);
}
function loaded(event: PlannerGachaEvent): PlannerGachaEntry | undefined {
  const ids = [event.gachaId, ...(event.gachaIds ?? [])].filter((id): id is number => id !== undefined);
  for (const id of ids) if (gachaById.has(id)) return gachaById.get(id);
  const byEvent = gachaByEvent.get(event.id);
  return byEvent && (!ids.length || ids.includes(byEvent.gacha_id)) ? byEvent : undefined;
}
function shardFor(event: PlannerGachaEvent, core: PlannerCoreResource): string | undefined {
  const byEvent = core.gacha_shard_by_event?.[event.id];
  if (byEvent) return byEvent;
  for (const id of [event.gachaId, ...(event.gachaIds ?? [])]) {
    if (id === undefined) continue;
    const shard = core.gacha_shard_by_id?.[String(id)];
    if (shard) return shard;
  }
  return undefined;
}
function synthetic(event: PlannerGachaEvent): PlannerGachaEntry | undefined {
  const bannerKind = event.eventType.includes('support') ? 'support' : event.eventType.includes('character') ? 'character' : undefined;
  if (!bannerKind || !event.date || !Number.isFinite(event.date.getTime())) return undefined;
  return {
    event_id: event.id,
    gacha_id: event.gachaId ?? event.gachaIds?.[0] ?? 0,
    gacha_type: event.gachaType,
    banner_kind: bannerKind,
    start_date: event.date.toISOString(),
    end_date: event.estimatedEndDate?.toISOString() ?? event.date.toISOString(),
    pickups: [], rarity_rates: [], provenance: 'jp_fallback', confidence: 'timeline_schedule_defaults'
  };
}

export const plannerResourceRepository = {
  watchRewards(listener: (rewards: PlannerRewardResource) => void): () => void {
    rewardListeners.add(listener);
    if (!refreshTimer) {
      refreshTimer = setInterval(checkRewards, 30_000);
      window.addEventListener('focus', checkRewards); window.addEventListener('online', checkRewards); document.addEventListener('visibilitychange', checkRewards);
    }
    return () => {
      rewardListeners.delete(listener);
      if (!rewardListeners.size) {
        clearInterval(refreshTimer); refreshTimer = undefined;
        window.removeEventListener('focus', checkRewards); window.removeEventListener('online', checkRewards); document.removeEventListener('visibilitychange', checkRewards);
      }
    };
  },
  prefetchManifest(): void { void manifest(false).catch(() => {}); },
  core(refresh = false): Promise<PlannerCoreResource> { return artifact<PlannerCoreResource>('planner_core.json', refresh); },
  async rewards(refresh = false): Promise<PlannerRewardResource> {
    const rewards = await artifact<PlannerRewardResource>('planner_rewards.json', refresh);
    const cached = normalizedRewards.get(rewards);
    if (cached) return cached;
    const normalized = applyGlobalRewardPrecedence({
      ...rewards,
      rewards: Array.isArray(rewards?.rewards) ? rewards.rewards : [],
      event_benefits: Array.isArray(rewards?.event_benefits) ? rewards.event_benefits : [],
      free_pull_campaigns: Array.isArray(rewards?.free_pull_campaigns) ? rewards.free_pull_campaigns : [],
      competitive_variants: Array.isArray(rewards?.competitive_variants) ? rewards.competitive_variants : []
    });
    normalizedRewards.set(rewards, normalized);
    return normalized;
  },
  async initial(refresh = false): Promise<PlannerDataBundle> {
    if (refresh) { gachaGeneration++; gachaById.clear(); gachaByEvent.clear(); }
    const [core, income, rewards, supportCardRarities] = await Promise.all([
      this.core(refresh),
      artifact<PlannerIncomeResource>('planner_income.json', refresh),
      this.rewards(refresh),
      loadSupportCardRarities(),
    ]);
    return {
      core: core ?? {},
      income: { ...income, rules: normalizePlannerIncomeRules(Array.isArray(income?.rules) ? income.rules : []) },
      rewards,
      supportCardRarities,
    };
  },
  async gachasFor(events: readonly PlannerGachaEvent[], core: PlannerCoreResource, refresh = false): Promise<PlannerGachaEntry[]> {
    const generation = refresh ? ++gachaGeneration : gachaGeneration;
    const fetched: PlannerGachaEntry[] = [];
    const shards = new Set(events.filter((event) => refresh || !loaded(event)).map((event) => shardFor(event, core)).filter((value): value is string => Boolean(value)));
    await Promise.all([...shards].map(async (shard) => {
      const normalized = shard.replace(/^planner_gacha_/, '').replace(/\.json(?:\.gz)?$/, '');
      const resource = await artifact<PlannerGachaResource>(`planner_gacha_${normalized}.json`, refresh);
      const entries = Array.isArray(resource?.gachas) ? resource.gachas : [];
      fetched.push(...entries);
      if (generation === gachaGeneration) for (const entry of entries) storeGacha(entry);
    }));
    return events.flatMap((event) => {
      const ids = [event.gachaId, ...(event.gachaIds ?? [])].filter((id): id is number => id !== undefined);
      const source = fetched.find(entry => ids.includes(entry.gacha_id)) ?? fetched.find(entry => entry.event_id === event.id && (!ids.length || ids.includes(entry.gacha_id))) ?? loaded(event) ?? synthetic(event);
      if (!source) throw new Error(`No protected gacha data was found for ${event.title}.`);
      const resolved = resolvePlannerGachaRates(source, { featuredPickupIds: event.pickupCardIds ?? [], gachaType: event.gachaType, eventType: event.eventType });
      const eventResolved = resolved.event_id === event.id ? resolved : { ...resolved, event_id: event.id };
      return [eventResolved];
    });
  },
  invalidate(): void { gachaGeneration++; cache.invalidate('planner:'); gachaById.clear(); gachaByEvent.clear(); requests.clear(); currentManifest = undefined; currentRewardPath = ''; lastRefresh = 0; }
};
