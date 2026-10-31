import { describe, expect, it } from 'vitest';
import { createSimulatorUma, restoreSimulatorUma, simulatorBuildKey } from './simulator-uma';

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

describe('simulator build key', () => {
  const veteranBuild = () => ({
    ...createSimulatorUma('Sakura Bakushin O'),
    cardId: 100401,
    skills: [
      { skillId: 100401, level: 4 },
      { skillId: 200331, level: 1 }
    ]
  });

  it('matches a placed copy saved and restored under another name, mood and team', () => {
    const veteran = veteranBuild();
    const placed = restoreSimulatorUma(
      JSON.parse(
        JSON.stringify({
          ...veteran,
          id: 'placed',
          name: 'Sakura copy',
          teamId: 2,
          trainee: { ...veteran.trainee, motivation: '5' },
          skills: [...veteran.skills].reverse()
        })
      ),
      createSimulatorUma()
    );

    expect(simulatorBuildKey(placed)).toBe(simulatorBuildKey(veteran));
  });

  it('tells an edited build apart', () => {
    const veteran = veteranBuild();
    const edited = { ...veteran, trainee: { ...veteran.trainee, speed: '1201' } };

    expect(simulatorBuildKey(edited)).not.toBe(simulatorBuildKey(veteran));
  });
});
