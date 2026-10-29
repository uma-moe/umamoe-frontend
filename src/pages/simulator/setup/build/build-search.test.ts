import { describe, expect, it } from 'vitest';
import { restoreBuildSearch } from './build-search.svelte';

describe('Build optimizer setups from a code or this browser', () => {
  it('keeps what she can buy with hints and locks, the goal and the HP debuffs', () => {
    const saved = {
      uma: { name: 'Mihono Bourbon', trainee: { speed: '1564', runningStyle: 'Nige' }, skills: [] },
      offers: [
        { skillId: 200162, hint: 3, locked: true },
        { skillId: 201662, hint: 9 },
        { skillId: -1, hint: 1 }
      ],
      budget: 2703,
      fastLearner: true,
      mode: 'tt_long',
      tracks: { tt_long: [10506, 'x', 0] },
      seed: '7',
      debuffs: { count: '2', percent: '3' }
    };

    const setup = restoreBuildSearch(saved);

    expect(setup.uma.name).toBe('Mihono Bourbon');
    expect(setup.uma.trainee.speed).toBe('1564');
    expect(setup.offers).toEqual([
      { skillId: 200162, hint: 3, locked: true },
      { skillId: 201662, hint: 5 }
    ]);
    expect([setup.budget, setup.fastLearner, setup.mode, setup.seed]).toEqual([
      '2703',
      true,
      'tt_long',
      '7'
    ]);
    expect(setup.tracks).toEqual({ tt_long: [10506] });
    expect(setup.debuffs).toEqual({ count: '2', percent: '3' });
  });

  it('starts from the defaults for anything it can’t read', () => {
    const setup = restoreBuildSearch('nothing');

    expect(setup.offers).toEqual([]);
    expect(setup.budget).toBe('1200');
  });
});
