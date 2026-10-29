import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
import { gzip } from 'pako';

let sdk: Promise<typeof import('@sentry/browser')> | undefined;
const credential =
  /^(authorization|cookie|set-cookie|x-api-key|api[_-]?key|access[_-]?token|refresh[_-]?token|auth[_-]?token|jwt|token|(?:x[_-]?)?browser[_-]?proof|x[_-]?turnstile[_-]?token)$/i;

const json = (value: unknown) =>
  JSON.stringify(value, (key, entry) => (credential.test(key) ? '[redacted]' : entry));

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function mismatchType(validation: Record<string, unknown>): string {
  const mismatch = validation.firstMismatch;
  if (isRecord(mismatch))
    return (
      [mismatch.section, mismatch.field]
        .filter((value) => typeof value === 'string' && value)
        .join('.') || 'unknown'
    );
  if (validation.framesMatch === false) return 'frames';
  if (validation.resultsMatch === false) return 'results';
  return 'unknown';
}

export async function reportReplayMismatch(
  capture: ParsedRaceCapture,
  response: unknown
): Promise<string | undefined> {
  if (
    !isRecord(response) ||
    !isRecord(response.validation) ||
    response.validation.status !== 'mismatch'
  )
    return;
  const validation = response.validation;
  const type = mismatchType(validation);
  try {
    const Sentry = await (sdk ??= import('@sentry/browser'));
    if (!Sentry.getClient())
      Sentry.init({
        dsn:
          import.meta.env.VITE_SENTRY_DSN ??
          'https://687e943c7781beb086ec5b91eaea7569@o4512181830877184.ingest.de.sentry.io/4512181871378512',
        environment: __APP_ENVIRONMENT__,
        defaultIntegrations: false
      });
    return Sentry.withScope((scope) => {
      scope.setTag('feature', 'replay-resimulation');
      scope.setTag('mismatch_type', type);
      if (typeof response.engineBuild === 'string')
        scope.setTag('engine_build', response.engineBuild);
      scope.setFingerprint(['replay-resimulation-mismatch', type]);
      scope.setContext('resimulation', {
        courseId: capture.courseId,
        seed: response.seed,
        validation
      });

      for (const [filename, value] of [
        ['1-original-replay.json.gz', capture.original],
        ['2-returned-replay.json.gz', response],
        ['3-mismatch.json', validation]
      ] as const)
        scope.addAttachment({
          filename,
          data: filename.endsWith('.gz') ? gzip(json(value)) : json(value),
          contentType: filename.endsWith('.gz') ? 'application/gzip' : 'application/json'
        });
      return Sentry.captureException(new Error('Replay resimulation mismatch: ' + type));
    });
  } catch {
    // Reporting must not discard a usable replay or turn a simulation into a failure.
    return undefined;
  }
}
