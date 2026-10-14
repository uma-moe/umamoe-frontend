import type { ParsedRaceCapture } from '@/lib/race/race-capture-parser';
import type { DetailedReplay } from '@/lib/race/race-diagnostics';
import { gzip } from 'pako';

let sdk: Promise<typeof import('@sentry/browser')> | undefined;
const credential = /^(authorization|cookie|set-cookie|x-api-key|api[_-]?key|access[_-]?token|refresh[_-]?token|auth[_-]?token|jwt|token|(?:x[_-]?)?browser[_-]?proof|x[_-]?turnstile[_-]?token)$/i;
const json = (value: unknown) => JSON.stringify(value, (key, entry) => credential.test(key) ? '[redacted]' : entry);

export async function reportReplayMismatch(capture: ParsedRaceCapture, response: DetailedReplay): Promise<string | undefined> {
  const validation = response.validation as { status?: string; firstMismatch?: { section?: string; field?: string }; framesMatch?: boolean; resultsMatch?: boolean } | undefined;
  if (validation?.status !== 'mismatch') return;
  const mismatch = validation.firstMismatch;
  const type = mismatch ? [mismatch.section, mismatch.field].filter(Boolean).join('.') || 'unknown' : validation.framesMatch === false ? 'frames' : validation.resultsMatch === false ? 'results' : 'unknown';
  try {
    const Sentry = await (sdk ??= import('@sentry/browser'));
    if (!Sentry.getClient()) Sentry.init({
      dsn: import.meta.env.VITE_SENTRY_DSN ?? 'https://687e943c7781beb086ec5b91eaea7569@o4512181830877184.ingest.de.sentry.io/4512181871378512',
      environment: __APP_ENVIRONMENT__, defaultIntegrations: false
    });
    return Sentry.withScope(scope => {
      scope.setTag('feature', 'replay-resimulation');
      scope.setTag('mismatch_type', type);
      scope.setTag('engine_build', response.engineBuild);
      scope.setFingerprint(['replay-resimulation-mismatch', type]);
      scope.setContext('resimulation', { courseId: capture.courseId, seed: response.seed, validation });
      for (const [filename, value] of [
        ['1-original-replay.json.gz', capture.original],
        ['2-returned-replay.json.gz', response],
        ['3-mismatch.json', validation]
      ] as const) scope.addAttachment({ filename, data: filename.endsWith('.gz') ? gzip(json(value)) : json(value), contentType: filename.endsWith('.gz') ? 'application/gzip' : 'application/json' });
      return Sentry.captureException(new Error('Replay resimulation mismatch: ' + type));
    });
  } catch {
    // Reporting must not discard a usable replay or turn a simulation into a failure.
    return undefined;
  }
}
