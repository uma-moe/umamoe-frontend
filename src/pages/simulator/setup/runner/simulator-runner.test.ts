import { describe, expect, it } from 'vitest';
import { migrateTabRunners, runnerFromSetup } from './simulator-runner.svelte';

const bourbon = {
  name: 'Mihono Bourbon',
  cardId: 102601,
  trainee: { speed: '1564', runningStyle: 'Nige' },
  skills: [{ skillId: 100261, level: 2 }]
};

describe('the runner the HP calculator and Build optimizer share', () => {
  it('reads her from a whole-tab code setup', () => {
    const runner = runnerFromSetup({ uma: bourbon, offers: [] });

    expect(runner?.name).toBe('Mihono Bourbon');
    expect(runner?.cardId).toBe(102601);
    expect(runner?.trainee.speed).toBe('1564');
    expect(runner?.skills).toEqual([{ skillId: 100261, level: 2 }]);
  });

  it('leaves a setup without a valid runner to the one already picked', () => {
    const setups = [undefined, 'nothing', { uma: { name: 'No trainee' } }];

    expect(setups.map(runnerFromSetup)).toEqual([undefined, undefined, undefined]);
  });

  it('keeps the older tab runner that has an Uma picked', () => {
    const typedOnly = { uma: { name: 'Your runner', trainee: { speed: '900' }, skills: [] } };

    const runner = migrateTabRunners([typedOnly, { uma: bourbon }]);

    expect(runner?.name).toBe('Mihono Bourbon');
  });

  it('keeps the first older runner when neither has an Uma picked', () => {
    const optimizer = { uma: { name: 'Your runner', trainee: { speed: '900' }, skills: [] } };
    const calculator = { uma: { name: 'Your runner', trainee: { speed: '700' }, skills: [] } };

    const runner = migrateTabRunners([optimizer, calculator]);

    expect(runner?.trainee.speed).toBe('900');
  });
});
