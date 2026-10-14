import { loadSkillCatalog, skillImage } from './skill-catalog';
import { SvelteMap } from 'svelte/reactivity';
import { loadRaceFactorImages, normalizeRaceName } from './race-catalog';
import { scenarios } from './scenario-catalog';
import { get, writable } from 'svelte/store';
import { resourceRepository } from './resource-repository';

export type FactorCategory = 'stats' | 'aptitude' | 'unique' | 'skills-races';
export interface FactorMetadata { id: string; text: string; type: number; }

const metadata = new SvelteMap<number, FactorMetadata>();
const skillIcons = new SvelteMap<string, string>();
const raceImages = new SvelteMap<string, string>();
let artworkLoading: Promise<void> | undefined;
export const factorCatalogState = writable({ loading: false, cached: false, error: '' });
let loading: Promise<void> | undefined;
let loaded = false, consumers = 0, retryAttempt = 0;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
resourceRepository.onUpdate(name => {
  if (name === 'factors') { loaded = false; if (consumers) void loadFactorCatalog(); }
  if ((name === 'skills' || name === 'race_to_saddle_mapping') && artworkLoading) {
    artworkLoading = undefined;
    void loadFactorArtwork().catch(() => {});
  }
});

function normalizeFactors(data: unknown): FactorMetadata[] {
  const rows = Array.isArray(data) ? data : (data as { default?: unknown } | null)?.default;
  if (!Array.isArray(rows) || !rows.length) throw new Error('Invalid factor catalog.');
  const ids = new Set<string>();
  return rows.map((row: unknown) => {
    const factor = row as Partial<FactorMetadata> | null;
    const id = String(factor?.id ?? '');
    if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) <= 0
      || typeof factor?.text !== 'string' || !factor.text.trim()
      || !Number.isInteger(factor.type) || factor.type! < -1 || factor.type! > 5 || ids.has(String(Number(id)))) {
      throw new Error('Invalid factor record.');
    }
    ids.add(String(Number(id)));
    return { id: String(Number(id)), text: factor.text, type: factor.type! };
  });
}

function replaceFactors(factors: FactorMetadata[]): void {
  metadata.clear();
  for (const factor of factors) metadata.set(Number(factor.id), factor);
}

/** Persisted cache and live resource, shared by every factor consumer. */
export function loadFactorCatalog(refresh = false): Promise<void> {
  if (loading) return loading;
  if (loaded && !refresh) return Promise.resolve();
  clearTimeout(retryTimer);
  factorCatalogState.update(state => ({ ...state, loading: true }));
  loading = (async () => {
    if (!loaded && !get(factorCatalogState).cached) {
      try {
        const cached = await resourceRepository.readCached<unknown>('factors');
        if (cached !== undefined) {
          replaceFactors(normalizeFactors(cached));
          factorCatalogState.update(state => ({ ...state, cached: true }));
        }
      } catch { /* Invalid cached data must not be used. */ }
    }
    try {
      const factors = await resourceRepository.load('factors', refresh, normalizeFactors);
      replaceFactors(factors);
      loaded = true; retryAttempt = 0;
      factorCatalogState.set({ loading: false, cached: false, error: '' });
    } catch (reason) {
      const cached = loaded || get(factorCatalogState).cached;
      factorCatalogState.set({ loading: !cached, cached, error: cached ? '' : reason instanceof Error ? reason.message : 'Factor data could not be loaded.' });
      if (consumers) {
        const delay = [1000, 3000, 7000, 15000, 30000][Math.min(retryAttempt++, 4)]!;
        retryTimer = setTimeout(() => { void loadFactorCatalog(true); }, delay);
      }
    }
  })().finally(() => { loading = undefined; });
  return loading;
}

/** Retry only while a route using factors is mounted; keep the catalog across navigation. */
export function watchFactorCatalog(): () => void {
  consumers++;
  void loadFactorCatalog();
  return () => { if (--consumers === 0) clearTimeout(retryTimer); };
}

/** Shares the demand-loaded race mapping; opening a factor picker never fetches its own catalog. */
export function loadFactorArtwork(): Promise<void> {
  return artworkLoading ??= Promise.all([loadRaceFactorImages(), loadSkillCatalog()]).then(([images, skills]) => {
    skillIcons.clear(); raceImages.clear();
    for (const skill of skills.values()) if (skill.icon) skillIcons.set(skill.name.normalize('NFKC').toLowerCase().trim(), skill.icon);
    for (const [name, image] of images) raceImages.set(name, image);
  }).catch((error) => { artworkLoading = undefined; throw error; });
}

export function factorMetadata(id: number): FactorMetadata | undefined {
  return metadata.get(id);
}

export function factorCategory(id: number): FactorCategory {
  const type = metadata.get(id)?.type;
  if (type === 0) return 'stats';
  if (type === 1) return 'aptitude';
  if (type === 5) return 'unique';
  return 'skills-races';
}

export interface DecodedFactor { id: number; name: string; level: number; type: number; category: FactorCategory; }

/** API search results append the star level to the factor id (for example 10 + 3 => 103). */
export function decodeFactor(encodedId: number): DecodedFactor {
  const baseId = Math.floor(Math.abs(encodedId) / 10);
  const entry = metadata.get(baseId);
  return {
    id: baseId,
    name: entry?.text ?? `Unknown Factor ${baseId}`,
    level: Math.abs(encodedId) % 10,
    type: entry?.type ?? -1,
    category: factorCategory(baseId)
  };
}

/** Base IDs end in zero; exported IDs append the star level. Decode before catalogs arrive too. */
export function decodeFactorEntry(factorId: number, level?: number): DecodedFactor {
  const decoded = decodeFactor(factorId);
  return factorId % 10 === 0 && level !== undefined
    ? decodeFactor(factorId * 10 + level) : decoded;
}

export function factorOptions(category?: FactorCategory): FactorMetadata[] {
  return [...metadata.values()].filter((entry) => !category || factorCategory(Number(entry.id)) === category);
}

export function factorImage(id: number): string | undefined {
  const factor = metadata.get(id);
  if (factor?.type === 2 && raceImages.has(normalizeRaceName(factor.text))) return raceImages.get(normalizeRaceName(factor.text));
  if (factor?.type === 4) {
    let scenarioId = ({ 300010: 1, 300020: 2, 300030: 4, 300040: 3, 300050: 5, 300060: 6 } as Record<number, number>)[id];
    if (id >= 310010 && id <= 310100) scenarioId = 6;
    else if (id >= 310110 && id <= 310140) scenarioId = 7;
    else if (id >= 310150 && id <= 310200) scenarioId = 8;
    else if (id >= 310210 && id <= 310250) scenarioId = 9;
    else if (id >= 310260 && id <= 310290 && id % 10 === 0) scenarioId = 10 + (id - 310260) / 10;
    const image = scenarios.find((scenario) => scenario.id === scenarioId)?.image;
    if (image) return image;
  }
  return skillImage(skillIcons.get(factor?.text.normalize('NFKC').toLowerCase().trim() ?? ''))
    ?? (factor?.type === 3 ? skillImage(`utx_ico_skill_${id === 202160 ? '10051' : '10011'}.webp`)
      : factor?.type === 5 ? skillImage('utx_ico_skill_20011.webp') : undefined);
}
