// Reads the records the game art pipeline publishes under `_state/game-art/`.
//
// A shard is `{ files: { "<game file>": { outputs: [<bucket key>], ... } } }`, one record per game file
// it converted. The model tree is not versioned like the artwork `game-assets.ts` names through the
// asset pointer: models and their records live at fixed paths on the same host.

export const ART_ORIGIN = 'https://assets.uma.moe';

/** The records of a shard, or nothing when the file is not the shape the pipeline writes. */
export function shardRecords(record: unknown): Array<[string, unknown]> {
  if (typeof record !== 'object' || record === null) return [];
  const { files } = record as { files?: unknown };
  if (typeof files !== 'object' || files === null) return [];
  return Object.entries(files as Record<string, unknown>);
}

/** The published file of one record with that extension, as a bucket key. */
export function shardOutput(entry: unknown, extension: string): string | undefined {
  if (typeof entry !== 'object' || entry === null) return undefined;
  const { outputs } = entry as { outputs?: unknown };
  if (!Array.isArray(outputs)) return undefined;
  return outputs.find(
    (output): output is string => typeof output === 'string' && output.endsWith(extension)
  );
}

/** Absolute URL of a bucket key. */
export function artUrl(key: string): string {
  return `${ART_ORIGIN}/${key.replace(/^\/+/, '')}`;
}

/** Reads one shard. Throws with the status when it is not there. */
export async function loadShard(path: string, fetchImpl: typeof fetch = fetch): Promise<unknown> {
  const response = await fetchImpl(`${ART_ORIGIN}${path}`, {
    headers: { accept: 'application/json' }
  });
  if (!response.ok) throw new Error(`Game art record unavailable (${response.status})`);
  return response.json();
}
