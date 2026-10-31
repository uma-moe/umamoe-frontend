import { describe, expect, it } from 'vitest';
import { restoreHpCalculator } from './hp-calculator.svelte';

describe('HP calculator setups from a code or this browser', () => {
  it('keeps her build, the HP plan and its race options', () => {
    const saved = {
      uma: { name: 'Mihono Bourbon', trainee: { stamina: '1104' }, skills: [] },
      plan: {
        recovery: { gold: 1, white: 2 },
        positionFight: { on: true, seconds: 8.8 },
        downhill: true
      },
      counted: 'her build',
      raceType: '14',
      fullSpurt: 'true'
    };

    const setup = restoreHpCalculator(saved);

    expect(setup.uma.trainee.stamina).toBe('1104');
    expect([setup.plan.recovery.gold, setup.plan.recovery.white]).toEqual([1, 2]);
    expect(setup.plan.positionFight).toEqual({ on: true, seconds: 8.8 });
    expect(setup.plan.downhill).toBe(true);
    expect([setup.counted, setup.raceType, setup.fullSpurt]).toEqual(['her build', '14', 'true']);
  });

  it('starts from the defaults for options it can’t read', () => {
    const setup = restoreHpCalculator({ fullSpurt: 'maybe', raceType: 5 });

    expect([setup.raceType, setup.fullSpurt]).toEqual(['0', 'false']);
  });

  it('reads retired race formats as the format that simulates the same race', () => {
    const restored = ['5', '7', '8', '99'].map(
      (raceType) => restoreHpCalculator({ raceType }).raceType
    );

    expect(restored).toEqual(['0', '6', '0', '0']);
  });
});
