// Resolves the whole-course models the game art pipeline publishes, so the viewer can draw a
// racecourse without knowing the game's file layout.

import { trackName } from '@/lib/game-data/racing/courses';
import { artUrl, loadShard, shardOutput, shardRecords } from './game-art-shard';

const RECORD_PATH = '/_state/game-art/racetracks.json';
/** A course is published under its game folder: `3d/env/race/race10006`. */
const COURSE_SOURCE = /^3d\/env\/race\/race(\d{5})$/;

export interface RacecourseModel {
  /** `race_track_id` from the game's course master: 10006 is Tokyo. */
  trackId: number;
  /** The track's name, as the rest of the site writes it. */
  name: string;
  /** File name without extension; the page's `?track=` value. */
  slug: string;
  url: string;
}

/** Turns a `racetracks.json` record into the courses this viewer can draw. */
export function racecourseModels(record: unknown): RacecourseModel[] {
  const models: RacecourseModel[] = [];
  for (const [source, entry] of shardRecords(record)) {
    const trackId = COURSE_SOURCE.exec(source)?.[1];
    const path = shardOutput(entry, '.glb');
    if (!trackId || !path) continue;
    const file = path.replace(/^\/+/, '').split('/').pop();
    if (!file) continue;
    models.push({
      trackId: Number(trackId),
      name: trackName(Number(trackId)),
      slug: file.replace(/\.glb$/, ''),
      url: artUrl(path)
    });
  }
  return models.sort((left, right) => left.name.localeCompare(right.name));
}

/** Reads the published courses. */
export async function loadRacecourseModels(
  fetchImpl: typeof fetch = fetch
): Promise<RacecourseModel[]> {
  return racecourseModels(await loadShard(RECORD_PATH, fetchImpl));
}
