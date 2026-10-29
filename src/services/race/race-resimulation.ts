import { appHttp } from '../http/app-http';
import { applyResimulation, type ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
import { reportReplayMismatch } from './replay-mismatch';

export async function resimulateRace(
  capture: ParsedRaceCapture,
  courseId: number,
  options: { seed?: number; signal?: AbortSignal } = {}
): Promise<ParsedRaceCapture> {
  if (!capture.original) throw Error('Upload a race capture first.');
  if (!Number.isSafeInteger(courseId) || courseId <= 0)
    throw Error('Select the race course first.');
  if (
    options.seed !== undefined &&
    (!Number.isInteger(options.seed) || options.seed < -2147483648 || options.seed > 2147483647)
  )
    throw Error('Seed must be a signed 32-bit integer.');
  // `/race` compares the race with the capture's recording itself; raceInstanceId names the
  // race when the capture omits it, and source tags our requests in the simulator's archives.
  const raceInstanceId = capture.raceInstanceId;
  const body = {
    capture: {
      capture: capture.original,
      courseId,
      ...(Number.isSafeInteger(raceInstanceId) && raceInstanceId! > 0 ? { raceInstanceId } : {}),
      ...(options.seed !== undefined ? { seed: options.seed } : {}),
      source: 'uma.moe/race-analysis'
    }
  };

  if (new TextEncoder().encode(JSON.stringify(body)).length > 8 * 1024 * 1024)
    throw Error('This capture exceeds the simulator’s 8 MB request limit.');
  // Browser verification is required even when the account is signed in.
  const response = await appHttp.request<unknown>('/api/sim/race', {
    method: 'POST',
    body,
    signal: options.signal,
    browserProof: true,
    headers: { Accept: 'application/json' }
  });

  // Keep mismatch evidence even if the returned replay cannot be decoded for display.
  if (!options.signal?.aborted) void reportReplayMismatch({ ...capture, courseId }, response);
  return { ...applyResimulation(capture, response), courseId };
}
