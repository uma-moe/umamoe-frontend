import { writable } from 'svelte/store';

const KEY = 'uma-virtual-scrolling';
function savedPreference(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'false';
  } catch {
    return true;
  }
}

export const virtualScrolling = writable(savedPreference());
export function setVirtualScrolling(enabled: boolean): void {
  virtualScrolling.set(enabled);
  try {
    localStorage.setItem(KEY, String(enabled));
  } catch {
    /* Keep the preference for this session. */
  }
}

if (typeof window !== 'undefined')
  window.addEventListener('storage', (event) => {
    if (event.key === KEY || event.key === null) virtualScrolling.set(savedPreference());
  });
