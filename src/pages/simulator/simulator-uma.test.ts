import { describe, expect, it } from 'vitest';
import { createSimulatorUma, restoreSimulatorUma } from './simulator-uma';

describe('saved simulator runner', () => {
  it('restores the supported fields of a trained runner', () => {
    const runner = {
      ...createSimulatorUma('Your runner'),
      cardId: 100101,
      teamId: 0,
      fanCount: 0,
      skills: [{ skillId: 100101, level: 6 }, { skillId: 200101 }],
      capturedAptitudes: ['S', 'A', 'A']
    };

    expect(restoreSimulatorUma(JSON.parse(JSON.stringify(runner)), createSimulatorUma())).toEqual(
      runner
    );
  });

  it('keeps valid falsy input and replaces malformed nested fields with defaults', () => {
    const fallback = createSimulatorUma();
    const runner = restoreSimulatorUma(
      {
        name: '',
        fanCount: 0,
        teamId: 0,
        trainee: { speed: 0, stamina: null, groundAptitudes: ['S', {}], styleAptitudes: 'A' },
        skills: [null, {}, { skillId: '100101' }, { skillId: 200101, level: 99 }]
      },
      fallback
    );

    expect(runner).toMatchObject({
      name: '',
      fanCount: 0,
      teamId: 0,
      trainee: {
        speed: '0',
        stamina: '900',
        groundAptitudes: ['S', 'A'],
        styleAptitudes: ['A', 'A', 'A', 'A']
      },
      skills: [{ skillId: 200101, level: 1 }]
    });

    expect(restoreSimulatorUma({ name: 'broken', trainee: null }, fallback)).toBe(fallback);
  });
});
