import { expect, it, vi } from 'vitest';
import { defaultReplayToggles } from './replay-display';
import { loadReplaySettings, saveReplaySettings, REPLAY_SETTINGS_KEY } from './replay-settings';

it('restores all replay preferences from the shared storage key', () => {
  const saved = {
    layout: 'map',
    laneScaleMode: 'automatic',
    windowMeters: 160,
    playbackSpeed: '4',
    toggles: { ...defaultReplayToggles(), hpBars: true, skills: false }
  };
  const setItem = vi.fn();
  saveReplaySettings(saved, { setItem });
  expect(setItem).toHaveBeenCalledWith(REPLAY_SETTINGS_KEY, JSON.stringify(saved));
  expect(loadReplaySettings({ getItem: () => setItem.mock.calls[0]![1] })).toEqual(saved);
});

it('keeps defaults for absent, malformed or invalid fields without losing valid false toggles', () => {
  const defaults = loadReplaySettings({ getItem: () => null });
  expect(defaults).toMatchObject({
    layout: 'positions',
    laneScaleMode: 'fixed',
    windowMeters: 80,
    toggles: { hpBars: false, skillTimers: true, cone: false }
  });
  for (const value of ['{bad json', 'null', '[]']) {
    expect(loadReplaySettings({ getItem: () => value })).toEqual(defaults);
  }
  expect(
    loadReplaySettings({
      getItem: () =>
        JSON.stringify({
          layout: 'unknown',
          laneScaleMode: 'unknown',
          windowMeters: '80',
          playbackSpeed: '99',
          toggles: { skills: false, hpBars: 'true', unknown: true }
        })
    })
  ).toEqual({ ...defaults, toggles: { ...defaults.toggles, skills: false } });
});

it('adds defaults for newly introduced toggles and limits the saved viewing distance', () => {
  const old = loadReplaySettings({
    getItem: () => JSON.stringify({ windowMeters: 900, toggles: { skills: false } })
  });
  expect(old.windowMeters).toBe(400);
  expect(old.toggles).toEqual({ ...defaultReplayToggles(), skills: false });
  expect(loadReplaySettings({ getItem: () => '{"windowMeters":0}' }).windowMeters).toBe(20);
});

it('falls back safely when storage cannot be read or written', () => {
  const denied = () => {
    throw new Error('Storage blocked');
  };
  expect(loadReplaySettings({ getItem: denied })).toEqual(
    loadReplaySettings({ getItem: () => null })
  );
  expect(() => saveReplaySettings({}, { setItem: denied })).not.toThrow();
});

it('saves preferences without race-specific or playback-session data', () => {
  const setItem = vi.fn();
  saveReplaySettings(
    {
      layout: 'map',
      time: 12,
      playing: true,
      selected: '5',
      trackOverride: '10001',
      capture: { privateData: 'race' }
    },
    { setItem }
  );
  const saved = JSON.parse(setItem.mock.calls[0]![1]);
  expect(saved.layout).toBe('map');
  for (const key of ['time', 'playing', 'selected', 'trackOverride', 'capture'])
    expect(saved).not.toHaveProperty(key);
});
