import { describe, expect, it } from 'vitest';
import { startOutcome } from './start-outcome';

const result = (startDelayTime?: number) => ({
  finishOrder: 1,
  finishTime: 120,
  finishDiffTime: 0,
  runningStyle: 2,
  startDelayTime
});

describe('start outcome', () => {
  it('calls a quick start normal and reports its delay in milliseconds', () => {
    const start = startOutcome({ lostStartAccelerationFrame: false }, result(0.0559));

    expect(start).toMatchObject({ label: 'Normal', late: false, lostAccelerationFrame: false });
    expect(start.delayMs).toBeCloseTo(55.9);
  });

  it('calls a start late from an 80 ms delay', () => {
    expect(startOutcome({}, result(0.08)).label).toBe('Late');
    expect(startOutcome({}, result(0.079)).label).toBe('Normal');
  });

  it('calls a start late when it lost its first acceleration frame, whatever the delay', () => {
    const start = startOutcome({ lostStartAccelerationFrame: true }, result(0.07));

    expect(start).toMatchObject({ label: 'Late', late: true, lostAccelerationFrame: true });
  });

  it('says when neither the delay nor the acceleration frame was recorded', () => {
    const start = startOutcome({}, result());

    expect(start).toEqual({
      label: 'Not recorded',
      late: false,
      delayMs: undefined,
      lostAccelerationFrame: false
    });
  });
});
