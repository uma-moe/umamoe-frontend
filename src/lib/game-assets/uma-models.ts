// Resolves the T-pose uma models the game art pipeline publishes, one per outfit.
//
// A record's key is the game's body folder (`3d/chara/body/bdy1001_00`) and its output is named after
// the character and the outfit in master.mdb, so the readable label comes from the file name rather
// than a separate table.

import { artUrl, loadShard, shardOutput, shardRecords } from './game-art-shard';

const RECORD_PATH = '/_state/game-art/umas.json';
const BODY_SOURCE = /^3d\/chara\/body\/bdy\d{4}_\d{2}$/;

export interface UmaModel {
  /** `<character>/<outfit>` as the pipeline names the file: the viewer's URL value. */
  slug: string;
  character: string;
  outfit: string;
  url: string;
}

function label(slug: string): string {
  return slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/** Turns a `umas.json` record into the outfits the viewer can draw. */
export function umaModels(record: unknown): UmaModel[] {
  const models: UmaModel[] = [];
  for (const [source, entry] of shardRecords(record)) {
    if (!BODY_SOURCE.test(source)) continue;
    const glb = shardOutput(entry, '.glb');
    if (!glb) continue;

    const [character, outfit] = glb
      .replace(/^.*\/umas\//, '')
      .replace(/\.glb$/, '')
      .split('/');
    if (!character) continue;
    models.push({
      slug: outfit ? `${character}/${outfit}` : character,
      character: label(character),
      outfit: label(outfit ?? character),
      url: artUrl(glb)
    });
  }
  return models.sort((left, right) =>
    `${left.character} ${left.outfit}`.localeCompare(`${right.character} ${right.outfit}`)
  );
}

/** Reads the published outfits. */
export async function loadUmaModels(fetchImpl: typeof fetch = fetch): Promise<UmaModel[]> {
  return umaModels(await loadShard(RECORD_PATH, fetchImpl));
}
