// Resolves the race motion clips the game art pipeline publishes.
//
// One record per game clip, but several clips share a published file (the left- and right-handed
// variants collapse into the same motion), so the list is deduplicated by file. Each clip is a GLB
// with no meshes: only animation channels, bound to the bone names the outfits also carry.

import { artUrl, loadShard, shardOutput, shardRecords } from './game-art-shard';

const RECORD_PATH = '/_state/game-art/uma-motions.json';

export interface UmaMotion {
  /** File name without extension: the viewer's URL value. */
  slug: string;
  /** What the clip shows, from the pipeline's own file name. */
  name: string;
  url: string;
}

function label(slug: string): string {
  const words = slug.split('-');
  return [words[0]?.charAt(0).toUpperCase() + (words[0]?.slice(1) ?? ''), ...words.slice(1)].join(
    ' '
  );
}

/** Turns a `uma-motions.json` record into the clips the viewer can play. */
export function umaMotions(record: unknown): UmaMotion[] {
  const bySlug = new Map<string, UmaMotion>();
  for (const [, entry] of shardRecords(record)) {
    const glb = shardOutput(entry, '.glb');
    if (!glb) continue;
    const slug = glb.replace(/^.*\//, '').replace(/\.glb$/, '');
    // Several game clips collapse into one published file, so the same name arrives many times.
    if (bySlug.has(slug)) continue;
    bySlug.set(slug, { slug, name: label(slug), url: artUrl(glb) });
  }
  return [...bySlug.values()].sort((left, right) => left.name.localeCompare(right.name));
}

/** Reads the published clips. */
export async function loadUmaMotions(fetchImpl: typeof fetch = fetch): Promise<UmaMotion[]> {
  return umaMotions(await loadShard(RECORD_PATH, fetchImpl));
}
