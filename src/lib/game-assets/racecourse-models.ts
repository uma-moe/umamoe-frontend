// Resolves the whole-course models the game art pipeline publishes, so the viewer can draw a
// racecourse without knowing the game's file layout.
//
// The model tree is not versioned like the artwork `game-assets.ts` names through the asset
// pointer: the pipeline writes the models and their record at fixed paths on the same host, so
// this module names that host once instead of reading the pointer.

import { trackName } from '@/lib/game-data/racing/courses';

const ART_ORIGIN = 'https://assets.uma.moe';
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

/** The records of a shard file, or nothing when the file is not the shape the pipeline writes. */
function shardRecords(record: unknown): Array<[string, unknown]> {
  if (typeof record !== 'object' || record === null) return [];
  const { files } = record as { files?: unknown };
  if (typeof files !== 'object' || files === null) return [];
  return Object.entries(files as Record<string, unknown>);
}

/** The model path of one record, which is the file the pipeline published for it. */
function modelPath(entry: unknown): string | undefined {
  if (typeof entry !== 'object' || entry === null) return undefined;
  const { outputs } = entry as { outputs?: unknown };
  if (!Array.isArray(outputs)) return undefined;
  return outputs.find(
    (output): output is string => typeof output === 'string' && output.endsWith('.glb')
  );
}

/** Turns a `racetracks.json` record into the courses this viewer can draw. */
export function racecourseModels(record: unknown): RacecourseModel[] {
  const models: RacecourseModel[] = [];
  for (const [source, entry] of shardRecords(record)) {
    const trackId = COURSE_SOURCE.exec(source)?.[1];
    const path = modelPath(entry);
    if (!trackId || !path) continue;
    const file = path.replace(/^\/+/, '').split('/').pop();
    if (!file) continue;
    models.push({
      trackId: Number(trackId),
      name: trackName(Number(trackId)),
      slug: file.replace(/\.glb$/, ''),
      url: `${ART_ORIGIN}/${path.replace(/^\/+/, '')}`
    });
  }
  return models.sort((left, right) => left.name.localeCompare(right.name));
}

/** Reads the published courses. Throws with the status when the record is not there yet. */
export async function loadRacecourseModels(
  fetchImpl: typeof fetch = fetch
): Promise<RacecourseModel[]> {
  const response = await fetchImpl(`${ART_ORIGIN}${RECORD_PATH}`, {
    headers: { accept: 'application/json' }
  });
  if (!response.ok) throw new Error(`Course models unavailable (${response.status})`);
  return racecourseModels(await response.json());
}
