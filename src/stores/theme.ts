import { get, writable } from 'svelte/store';

export type Theme = 'dark' | 'light';
const THEME_KEY = 'uma-color-mode';

function preferredTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  try {
    const saved = window.localStorage.getItem(THEME_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
    // Recover early Svelte-preview preferences without overriding Angular's key.
    const preview = window.localStorage.getItem('uma:theme');
    if (preview === 'dark' || preview === 'light') {
      try {
        window.localStorage.setItem(THEME_KEY, preview);
      } catch {
        /* Keep the chosen mode in memory. */
      }

      return preview;
    }
  } catch {
    /* Storage can be blocked; Angular defaults to dark in that case. */
  }

  return 'dark';
}

export const theme = writable<Theme>('dark');

export function initializeTheme(): void {
  const value = preferredTheme();
  theme.set(value);
  document.documentElement.dataset.theme = value;
}

export function setTheme(value: Theme): void {
  theme.set(value);
  document.documentElement.dataset.theme = value;
  try {
    window.localStorage.setItem(THEME_KEY, value);
  } catch {
    /* Theme changes still work when saving is unavailable. */
  }
}

export function toggleTheme(): void {
  setTheme(get(theme) === 'dark' ? 'light' : 'dark');
}
