import { expect, it } from 'vitest';
import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
import type { HorseDiagnostics } from '@/lib/race/capture/race-diagnostics';
import { skillRows } from './diagnostics-format';

it('labels a missed skill with the simulator reason, and keeps the old label without one', () => {
  const reason = 'order>=3 (place 3-5), order_rate<=40 (place 1-2): no place fits among 5 runners';
  const decision = (skillId: number, passed: boolean, miss: unknown) => ({
    skillId,
    required: true,
    passed,
    roll: 0,
    threshold: 0,
    activated: false,
    miss
  });
  const horse = {
    horseIndex: 0,
    spans: [],
    skillActivationDecisions: [
      decision(1, false, { kind: 'impossible', reasons: [reason] }),
      decision(2, true, { kind: 'preconditionNeverMet', reasons: [] }),
      decision(3, true, null)
    ]
  } as HorseDiagnostics;

  const rows = skillRows({ events: [] } as unknown as ParsedRaceCapture, 0, horse, undefined);
  expect(rows.map(({ status, reason }) => [status, reason])).toEqual([
    ['Impossible in this race', reason],
    ['Precondition never met', ''],
    ['Passed wit check, failed condition', '']
  ]);
});
