import { appHttp } from '../http/app-http';
import { createRequestPacer } from '../http/request-pacer';
import { applyResimulation, type ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
import { reportReplayMismatch } from './replay-mismatch';

const MAX_REQUEST_BYTES = 8 * 1024 * 1024;

// The API allows each browser 30 writes a minute; pacing a session to 25 leaves the rest of the site room.
const simulatorRequests = createRequestPacer({ limit: 25, windowMs: 60_000 });

/** Settings a race simulated from a capture can change; anything left out stays as recorded. */
export interface CaptureRaceSettings {
  seed?: number;
  /** One gate per runner in capture order, replacing the recorded gates. */
  gates?: number[];
  /** One mood per runner in capture order, replacing the recorded moods. */
  moods?: number[];
}

/**
 * The `capture` body `/race` and `/monte-carlo` both take. `/race` compares the race with the capture's recording
 * unless a setting was changed; raceInstanceId names the race when the capture omits it, and source tags our requests
 * in the simulator's archives.
 */
export function captureRaceRequest(
  capture: ParsedRaceCapture,
  courseId: number,
  settings: CaptureRaceSettings = {}
) {
  if (!capture.original) throw Error('Upload a race capture first.');
  if (!Number.isSafeInteger(courseId) || courseId <= 0)
    throw Error('Select the race course first.');
  if (
    settings.seed !== undefined &&
    (!Number.isInteger(settings.seed) || settings.seed < -2147483648 || settings.seed > 2147483647)
  )
    throw Error('Seed must be a signed 32-bit integer.');
  if (settings.gates !== undefined && settings.gates.length !== capture.runners.length)
    throw Error('Gates must list one gate per runner.');
  if (settings.moods !== undefined && settings.moods.length !== capture.runners.length)
    throw Error('Moods must list one mood per runner.');

  const raceInstanceId = capture.raceInstanceId;
  const request = {
    capture: capture.original,
    courseId,
    ...(Number.isSafeInteger(raceInstanceId) && raceInstanceId! > 0 ? { raceInstanceId } : {}),
    ...(settings.seed !== undefined ? { seed: settings.seed } : {}),
    ...(settings.gates !== undefined ? { gates: settings.gates } : {}),
    ...(settings.moods !== undefined ? { moods: settings.moods } : {}),
    source: 'uma.moe/race-analysis'
  };

  if (new TextEncoder().encode(JSON.stringify(request)).length > MAX_REQUEST_BYTES)
    throw Error('This capture exceeds the simulator’s 8 MB request limit.');
  return request;
}

/** Runs the race again from its capture: as recorded, or on another seed, gates or moods. */
export async function resimulateRace(
  capture: ParsedRaceCapture,
  courseId: number,
  options: CaptureRaceSettings & { signal?: AbortSignal } = {}
): Promise<ParsedRaceCapture> {
  const body = { capture: captureRaceRequest(capture, courseId, options) };
  // Browser verification is required even when the account is signed in.
  const response = await simulatorRequests.send(
    () =>
      appHttp.request<unknown>('/api/sim/race', {
        method: 'POST',
        body,
        signal: options.signal,
        browserProof: true,
        headers: { Accept: 'application/json' }
      }),
    options.signal
  );

  // Keep mismatch evidence even if the returned replay cannot be decoded for display.
  if (!options.signal?.aborted) void reportReplayMismatch({ ...capture, courseId }, response);
  return { ...applyResimulation(capture, response), courseId };
}
