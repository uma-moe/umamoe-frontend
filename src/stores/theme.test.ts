import { afterEach, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { initializeTheme, setTheme, theme } from './theme';

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

it('preserves Angular preferences, recovers preview-only choices and writes only the original key', () => {
  for (const [angular, preview, expected] of [
    ['light', 'dark', 'light'], ['dark', 'light', 'dark'], [null, 'light', 'light'], ['invalid', 'invalid', 'dark'], [null, null, 'dark']
  ] as const) {
    localStorage.clear();
    if (angular) localStorage.setItem('uma-color-mode', angular);
    if (preview) localStorage.setItem('uma:theme', preview);
    initializeTheme();
    expect(get(theme)).toBe(expected);
    expect(document.documentElement.dataset.theme).toBe(expected);
    if (!angular && preview === 'light') expect(localStorage.getItem('uma-color-mode')).toBe('light');
    setTheme('light');
    expect(localStorage.getItem('uma-color-mode')).toBe('light');
    expect(localStorage.getItem('uma:theme')).toBe(preview);
  }
});

it('keeps theme initialization and toggling usable when browser storage rejects reads or writes', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
  expect(() => initializeTheme()).not.toThrow();
  expect(get(theme)).toBe('dark');
  expect(() => setTheme('light')).not.toThrow();
  expect(get(theme)).toBe('light');
  expect(document.documentElement.dataset.theme).toBe('light');
});
