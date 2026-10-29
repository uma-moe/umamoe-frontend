import { loadSkills, skillImage } from '../skills/skills';
import { SvelteMap } from 'svelte/reactivity';
import { loadRaceFactorImages, normalizeRaceName } from '../racing/races';
import { scenarios } from '../scenarios';
import { get, writable } from 'svelte/store';
import { resourceCache } from '@/services/resources/resource-cache';

export type FactorCategory = 'stats' | 'aptitude' | 'unique' | 'skills-races';
export interface FactorMetadata {
  id: string;
  text: string;
  type: number;
}

const metadata = new SvelteMap<number, FactorMetadata>();
const skillIcons = new SvelteMap<string, string>();
const raceImages = new SvelteMap<string, string>();
let artworkLoading: Promise<void> | undefined;
export const factorLoadingState = writable({ loading: false, cached: false, error: '' });
let loading: Promise<void> | undefined;
let loaded = false,
  consumers = 0,
  retryAttempt = 0;

let retryTimer: ReturnType<typeof setTimeout> | undefined;
resourceCache.onUpdate((name) => {
  if (name === 'factors') {
    loaded = false;
    if (consumers) void loadFactors();
  }

  if ((name === 'skills' || name === 'race_to_saddle_mapping') && artworkLoading) {
    artworkLoading = undefined;
    void loadFactorArtwork().catch(() => {});
  }
});

function normalizeFactors(data: unknown): FactorMetadata[] {
  const rows = Array.isArray(data)
    ? data
    : data !== null && typeof data === 'object' && 'default' in data
      ? data.default
      : undefined;

  if (!Array.isArray(rows) || !rows.length) throw new Error('Invalid factor data.');
  const ids = new Set<string>();
  return rows.map((row: unknown) => {
    if (
      row === null ||
      typeof row !== 'object' ||
      !('id' in row) ||
      !('text' in row) ||
      !('type' in row)
    ) {
      throw new Error('Invalid factor record.');
    }

    const id = String(row.id ?? '');
    const { text, type } = row;
    if (
      !/^\d+$/.test(id) ||
      !Number.isSafeInteger(Number(id)) ||
      Number(id) <= 0 ||
      typeof text !== 'string' ||
      !text.trim() ||
      typeof type !== 'number' ||
      !Number.isInteger(type) ||
      type < -1 ||
      type > 5 ||
      ids.has(String(Number(id)))
    ) {
      throw new Error('Invalid factor record.');
    }

    ids.add(String(Number(id)));
    return { id: String(Number(id)), text, type };
  });
}

function replaceFactors(factors: FactorMetadata[]): void {
  metadata.clear();
  for (const factor of factors) metadata.set(Number(factor.id), factor);
}

/** Persisted cache and live resource, shared by every factor consumer. */
export function loadFactors(refresh = false): Promise<void> {
  if (loading) return loading;
  if (loaded && !refresh) return Promise.resolve();
  clearTimeout(retryTimer);
  factorLoadingState.update((state) => ({ ...state, loading: true }));
  loading = (async () => {
    if (!loaded && !get(factorLoadingState).cached) {
      try {
        const cached = await resourceCache.readCached<unknown>('factors');
        if (cached !== undefined) {
          replaceFactors(normalizeFactors(cached));
          factorLoadingState.update((state) => ({ ...state, cached: true }));
        }
      } catch {
        /* Invalid cached data must not be used. */
      }
    }

    try {
      const factors = await resourceCache.load('factors', refresh, normalizeFactors);
      replaceFactors(factors);
      loaded = true;
      retryAttempt = 0;
      factorLoadingState.set({ loading: false, cached: false, error: '' });
    } catch (reason) {
      const cached = loaded || get(factorLoadingState).cached;
      const message = reason instanceof Error ? reason.message : 'Factor data could not be loaded.';
      factorLoadingState.set({
        loading: !cached,
        cached,
        error: cached ? '' : message
      });

      if (consumers) {
        const delay = [1000, 3000, 7000, 15000, 30000][Math.min(retryAttempt++, 4)]!;
        retryTimer = setTimeout(() => {
          void loadFactors(true);
        }, delay);
      }
    }
  })().finally(() => {
    loading = undefined;
  });

  return loading;
}

/** Retry only while a route using factors is mounted; keep the data across navigation. */
export function watchFactors(): () => void {
  consumers++;
  void loadFactors();
  return () => {
    if (--consumers === 0) clearTimeout(retryTimer);
  };
}

/** Shares the demand-loaded race mapping; opening a factor picker never fetches its own data. */
export function loadFactorArtwork(): Promise<void> {
  return (artworkLoading ??= Promise.all([loadRaceFactorImages(), loadSkills()])
    .then(([images, skills]) => {
      skillIcons.clear();
      raceImages.clear();
      for (const skill of skills.values())
        if (skill.icon)
          skillIcons.set(skill.name.normalize('NFKC').toLowerCase().trim(), skill.icon);
      for (const [name, image] of images) raceImages.set(name, image);
    })
    .catch((error) => {
      artworkLoading = undefined;
      throw error;
    }));
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

export interface DecodedFactor {
  id: number;
  name: string;
  level: number;
  type: number;
  category: FactorCategory;
}

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

/** Base IDs end in zero; exported IDs append the star level. Decode before resource data arrives too. */
export function decodeFactorEntry(factorId: number, level?: number): DecodedFactor {
  const decoded = decodeFactor(factorId);
  return factorId % 10 === 0 && level !== undefined ? decodeFactor(factorId * 10 + level) : decoded;
}

export function factorOptions(category?: FactorCategory): FactorMetadata[] {
  return [...metadata.values()].filter(
    (entry) => !category || factorCategory(Number(entry.id)) === category
  );
}

export function factorImage(id: number): string | undefined {
  const factor = metadata.get(id);
  if (factor?.type === 2 && raceImages.has(normalizeRaceName(factor.text)))
    return raceImages.get(normalizeRaceName(factor.text));
  if (factor?.type === 4) {
    let scenarioId = (
      { 300010: 1, 300020: 2, 300030: 4, 300040: 3, 300050: 5, 300060: 6 } as Record<number, number>
    )[id];

    if (id >= 310010 && id <= 310100) scenarioId = 6;
    else if (id >= 310110 && id <= 310140) scenarioId = 7;
    else if (id >= 310150 && id <= 310200) scenarioId = 8;
    else if (id >= 310210 && id <= 310250) scenarioId = 9;
    else if (id >= 310260 && id <= 310290 && id % 10 === 0) scenarioId = 10 + (id - 310260) / 10;
    const image = scenarios.find((scenario) => scenario.id === scenarioId)?.image;
    if (image) return image;
  }

  const icon = skillImage(
    skillIcons.get(factor?.text.normalize('NFKC').toLowerCase().trim() ?? '')
  );

  if (icon != null) return icon;
  if (factor?.type === 3)
    return skillImage(`utx_ico_skill_${id === 202160 ? '10051' : '10011'}.webp`);
  if (factor?.type === 5) return skillImage('utx_ico_skill_20011.webp');
  return undefined;
}
