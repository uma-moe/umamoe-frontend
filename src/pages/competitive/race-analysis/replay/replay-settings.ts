import { defaultReplayToggles, type ReplayToggle, type ReplayToggles } from './replay-display';

export const REPLAY_SETTINGS_KEY = 'replay_settings';

export interface ReplaySettings {
  layout: 'positions' | 'map';
  laneScaleMode: 'automatic' | 'fixed';
  windowMeters: number;
  playbackSpeed: string;
  toggles: ReplayToggles;
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeSettings(value: unknown): ReplaySettings {
  const saved = object(value);
  const savedToggles = object(saved.toggles);
  const toggles = defaultReplayToggles();
  for (const key of Object.keys(toggles) as ReplayToggle[]) {
    if (typeof savedToggles[key] === 'boolean') toggles[key] = savedToggles[key];
  }

  return {
    layout: saved.layout === 'map' ? 'map' : 'positions',
    laneScaleMode: saved.laneScaleMode === 'automatic' ? 'automatic' : 'fixed',
    windowMeters:
      typeof saved.windowMeters === 'number' && Number.isFinite(saved.windowMeters)
        ? Math.max(20, Math.min(400, saved.windowMeters))
        : 80,
    playbackSpeed:
      typeof saved.playbackSpeed === 'string' &&
      ['0.5', '1', '2', '4', '8'].includes(saved.playbackSpeed)
        ? saved.playbackSpeed
        : '1',
    toggles
  };
}

export function loadReplaySettings(storage?: Pick<Storage, 'getItem'>): ReplaySettings {
  try {
    const saved = (storage ?? globalThis.localStorage).getItem(REPLAY_SETTINGS_KEY);
    return normalizeSettings(saved === null ? undefined : JSON.parse(saved));
  } catch {
    return normalizeSettings(undefined);
  }
}

export function saveReplaySettings(value: unknown, storage?: Pick<Storage, 'setItem'>): void {
  try {
    (storage ?? globalThis.localStorage).setItem(
      REPLAY_SETTINGS_KEY,
      JSON.stringify(normalizeSettings(value))
    );
  } catch {
    // Replay controls remain usable when browser storage is blocked or full.
  }
}
