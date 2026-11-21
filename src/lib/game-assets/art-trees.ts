import { runtimeConfig } from '@/services/runtime-config';

// Apart from art-links.ts so the base shell, which arms the JP retry, does not load every family.

/** Each region publishes its own tree in the bucket; the site shows Global's. */
const GLOBAL_ART_TREE = 'en';

/** JP's tree files the cards, outfits and skills Global has not released under the same keys. */
const JP_ART_TREE = 'jp';

/** Timeline banners are published in Global's tree only. */
export const TIMELINE_FOLDER = 'timeline/';

function artFolder(tree: string): string {
  return `${runtimeConfig.assetOrigin}/${tree}/art/`;
}

/** A file below Global's `art/` tree. */
export function artLink(key: string): string {
  return `${artFolder(GLOBAL_ART_TREE)}${key}`;
}

/** The same game-art file in JP's tree for a link into Global's; undefined for any other link. */
export function jpArtLink(link: string): string | undefined {
  const globalFolder = artFolder(GLOBAL_ART_TREE);
  if (!link.startsWith(globalFolder)) return undefined;

  const key = link.slice(globalFolder.length);
  if (key.startsWith(TIMELINE_FOLDER)) return undefined;

  return `${artFolder(JP_ART_TREE)}${key}`;
}
