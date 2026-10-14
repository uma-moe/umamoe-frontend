import { writable, get } from 'svelte/store';

export const tourStepId = writable('');
export const interactiveTourSteps = new Set(['filter-add-factor', 'filter-blue-factor-slider', 'filter-limit-break']);
export function completeTourInteraction(stepId: string): void {
  if (get(tourStepId) === stepId) window.dispatchEvent(new CustomEvent('umamoe:tour-interaction', { detail: stepId }));
}

export const TOUR_AUDIENCE_KEY = 'page-introduction-audience-v1';
export const TOUR_SEEN_PREFIX = 'page-introduction-seen-v1:';
const establishedKeys = ["auth_token","cookie-consent","privacy-notice-accepted","lastSeenUpdateVersion","database-filter-state-v2","database-filter-mode-v1","database-filter-presets-v1","lineage-planner-state-v1","lineage-planner-saves-v1","manual-veteran-entries-v1","partner-lookup-history-v1","vote-protection-votes","reported-trainers","circle_details_config"];
const establishedPrefixes = [TOUR_SEEN_PREFIX, 'resource-meta:', 'umamoe-fuse-'];
export function tourAudience(storage?: Storage): 'new' | 'existing' {
  let audience: 'new' | 'existing' = 'new';
  try {
    storage ??= localStorage;
    const saved = storage;
    const stored = storage.getItem(TOUR_AUDIENCE_KEY);
    if (stored === 'new' || stored === 'existing') return stored;
    const keys = Array.from({ length: saved.length }, (_, i) => saved.key(i) ?? '');
    if (establishedKeys.some(key => saved.getItem(key) !== null) || keys.some(key => establishedPrefixes.some(prefix => key.startsWith(prefix)))) audience = 'existing';
  } catch { /* A restricted browser still supports a manual tour. */ }
  try { storage?.setItem(TOUR_AUDIENCE_KEY, audience); } catch {}
  return audience;
}
export function hasSeenTour(page: string): boolean {
  try { return localStorage.getItem(TOUR_SEEN_PREFIX + page) === 'true'; } catch { return false; }
}
export function markTourSeen(page: string): void {
  try { localStorage.setItem(TOUR_SEEN_PREFIX + page, 'true'); } catch {}
}
