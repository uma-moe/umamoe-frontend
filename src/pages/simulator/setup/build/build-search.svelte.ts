import { OPTIMIZE_MODES, type OptimizeMode } from '../../requests/optimize-request';
import { createSimulatorUma, restoreSimulatorUma, type SimulatorUma } from '../../simulator-uma';
import { MAX_HINT, type SkillOffer } from './skill-offers';
import type { TeamTrialsMode } from './track-pool';

/**
 * Build search's own setup: the runner at the end of her career, the skills on offer with their hints, the SP budget,
 * what to optimize for and on which Team Trials tracks. Saved in this browser, so a reload keeps it.
 */
export interface BuildSearchState {
  uma: SimulatorUma;
  offers: SkillOffer[];
  budget: string;
  fastLearner: boolean;
  mode: OptimizeMode;
  /** The Team Trials tracks picked per distance, as course ids; a distance not here races its default pool. */
  tracks: Partial<Record<TeamTrialsMode, number[]>>;
  seed: string;
  /** HP debuffs she takes from other runners in every race, and how much of her max HP each one drains. */
  debuffs: { count: string; percent: string };
}

const STORAGE_KEY = 'uma.build-search.v1';

function defaults(): BuildSearchState {
  return {
    uma: createSimulatorUma('Your runner'),
    offers: [],
    budget: '1200',
    fastLearner: false,
    mode: 'cm',
    tracks: {},
    seed: String(Math.floor(Math.random() * 2 ** 31)),
    debuffs: { count: '0', percent: '1' }
  };
}

type Loose = Record<string, unknown>;
const record = (value: unknown): Loose | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Loose) : undefined;

const text = (value: unknown, fallback: string) =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : fallback;

/** A saved or imported setup over the defaults, keeping only fields of the right type. */
export function restoreBuildSearch(saved: unknown): BuildSearchState {
  const state = defaults();
  const data = record(saved);
  if (!data) return state;

  state.uma = restoreSimulatorUma(data.uma, state.uma);
  if (Array.isArray(data.offers))
    state.offers = data.offers.flatMap((item) => {
      const offer = record(item);
      const skillId = Number(offer?.skillId),
        hint = Number(offer?.hint);

      if (!Number.isInteger(skillId) || skillId <= 0) {
        return [];
      }

      return [
        {
          skillId,
          hint: Number.isInteger(hint) ? Math.min(MAX_HINT, Math.max(0, hint)) : 0,
          ...(offer?.locked === true ? { locked: true } : {})
        }
      ];
    });
  state.budget = text(data.budget, state.budget);
  state.fastLearner = data.fastLearner === true;
  state.mode = OPTIMIZE_MODES.find((mode) => mode === data.mode) ?? state.mode;
  const tracks = record(data.tracks);
  for (const mode of OPTIMIZE_MODES) {
    if (mode === 'cm') continue;
    const courses = tracks?.[mode];
    if (Array.isArray(courses))
      state.tracks[mode] = courses
        .map(Number)
        .filter((course) => Number.isInteger(course) && course > 0);
  }

  state.seed = text(data.seed, state.seed);
  const debuffs = record(data.debuffs);
  if (debuffs)
    state.debuffs = {
      count: text(debuffs.count, state.debuffs.count),
      percent: text(debuffs.percent, state.debuffs.percent)
    };

  return state;
}

function restore(): BuildSearchState {
  try {
    return restoreBuildSearch(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'));
  } catch {
    /* Storage can be unavailable or hold something else; start fresh then. */
    return defaults();
  }
}

export const buildSearch = $state<BuildSearchState>(restore());

/** Saves the setup in this browser; call it from an effect so every change is kept. */
export function saveBuildSearch(): void {
  const data = JSON.stringify(buildSearch);
  try {
    localStorage.setItem(STORAGE_KEY, data);
  } catch {
    /* Storage can be full or disabled; the setup still works for this visit. */
  }
}
