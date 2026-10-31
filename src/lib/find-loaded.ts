import { writable } from 'svelte/store';

export interface FindSource {
  host: HTMLElement;
  count: () => number;
  text: (index: number) => string;
  reveal: (index: number) => Promise<HTMLElement | undefined>;
}

export const findSources = writable<FindSource[]>([]);
export const findRequested = writable(0);

export function registerFindSource(source: FindSource) {
  findSources.update((sources) => [...sources, source]);
  return {
    update: () => findSources.update((sources) => [...sources]),
    destroy: () => findSources.update((sources) => sources.filter((item) => item !== source))
  };
}

export function availableFindSources(sources: FindSource[]): FindSource[] {
  return sources.filter(
    (source) =>
      source.count() > 0 &&
      source.host.isConnected &&
      source.host.getClientRects().length &&
      !source.host.closest('dialog, [popover], [inert]')
  );
}

/** Ctrl+F or Cmd+F, which opens the find bar over the loaded results in place of the browser's own find. */
export function isFindShortcut(event: KeyboardEvent): boolean {
  return (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'f';
}
