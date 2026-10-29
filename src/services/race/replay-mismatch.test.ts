import { describe, expect, it, vi } from 'vitest';
import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
import type { DetailedReplay } from '@/lib/race/capture/race-diagnostics';
import { reportReplayMismatch } from './replay-mismatch';
import { resimulateRace } from './race-resimulation';
import { ungzip } from 'pako';

const sentry = vi.hoisted(() => ({
  getClient: vi.fn(() => true),
  captureException: vi.fn(() => 'event-id'),
  setTag: vi.fn(),
  setFingerprint: vi.fn(),
  setContext: vi.fn(),
  addAttachment: vi.fn()
}));

vi.mock('@sentry/browser', () => ({
  ...sentry,
  withScope: (fn: (scope: typeof sentry) => unknown) => fn(sentry)
}));

const http = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../http/app-http', () => ({ appHttp: http }));
const capture = {
  original: {
    race_scenario: 'original-binary',
    jwt: 'secret',
    api_key: 'secret',
    headers: { 'X-Browser-Proof': 'secret', 'X-Turnstile-Token': 'secret' }
  },
  courseId: 10606
} as unknown as ParsedRaceCapture;

const response = {
  engineBuild: 'test',
  seed: 42,
  replay: { data: 'returned-binary' },
  validation: {
    status: 'mismatch',
    firstMismatch: { section: 'frames', field: 'distance', expected: 14, actual: 15 }
  }
} as unknown as DetailedReplay;

describe('replay mismatch reporting', () => {
  it('attaches both replays and mismatch details without credentials', async () => {
    expect(await reportReplayMismatch(capture, response)).toBe('event-id');
    expect(sentry.setTag).toHaveBeenCalledWith('mismatch_type', 'frames.distance');
    expect(sentry.setFingerprint).toHaveBeenCalledWith([
      'replay-resimulation-mismatch',
      'frames.distance'
    ]);
    const attachments = sentry.addAttachment.mock.calls.map(([attachment]) => attachment);
    expect(attachments.map((a) => a.filename)).toEqual([
      '1-original-replay.json.gz',
      '2-returned-replay.json.gz',
      '3-mismatch.json'
    ]);
    expect(JSON.parse(new TextDecoder().decode(ungzip(attachments[0].data)))).toEqual({
      race_scenario: 'original-binary',
      jwt: '[redacted]',
      api_key: '[redacted]',
      headers: { 'X-Browser-Proof': '[redacted]', 'X-Turnstile-Token': '[redacted]' }
    });

    expect(JSON.parse(new TextDecoder().decode(ungzip(attachments[1].data))).replay.data).toBe(
      'returned-binary'
    );
    expect(JSON.parse(attachments[2].data).firstMismatch).toMatchObject({
      expected: 14,
      actual: 15
    });
  });

  it('only reports returned mismatches, not matches or unavailable comparisons', async () => {
    sentry.captureException.mockClear();
    for (const status of ['matched', 'not_checked', 'input_conflict', 'unsupported'])
      await reportReplayMismatch(capture, { ...response, validation: { status } });
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it('does not turn an unavailable reporting service into a replay failure', async () => {
    sentry.captureException.mockImplementationOnce(() => {
      throw new Error('Sentry unavailable');
    });

    expect(await reportReplayMismatch(capture, response)).toBeUndefined();
  });

  it('reports a returned mismatch even when its replay cannot be opened', async () => {
    sentry.captureException.mockClear();
    http.request.mockResolvedValueOnce(response);
    localStorage.setItem('auth_token', 'signed-in-account');
    try {
      await expect(resimulateRace({ ...capture, runners: [] }, 10606)).rejects.toThrow(
        'Invalid detailed simulator response'
      );

      expect(http.request).toHaveBeenLastCalledWith(
        '/api/sim/race',
        expect.objectContaining({
          browserProof: true,
          headers: { Accept: 'application/json' },
          body: {
            capture: expect.objectContaining({ courseId: 10606, source: 'uma.moe/race-analysis' })
          }
        })
      );
    } finally {
      localStorage.removeItem('auth_token');
    }

    await vi.waitFor(() => expect(sentry.captureException).toHaveBeenCalledOnce());
  });
});
