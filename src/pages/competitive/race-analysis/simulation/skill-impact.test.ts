import { describe, expect, it } from 'vitest';
import type { RaceSkillImpact } from '@/services/race/race-skill-impact';
import { capture, runner, simulated } from './race-simulation-fixtures';
import { seatedCapture } from './race-simulation';
import { fieldSkills, recordedImpactRace, runnerSkillGains } from './skill-impact';

/** Gates 1 and 2 hold capture positions 1 and 0: the recorded replay lists runners by gate. */
function gateOrdered() {
  return capture([
    { ...runner(0, { sourceIndex: 1 }), skillIds: [200331, 200331, 201351] },
    { ...runner(1, { sourceIndex: 0 }), skillIds: [910071] }
  ]);
}

describe('the field one skill impact request measures', () => {
  it('lists every runner’s skills once, by capture position', () => {
    const skills = fieldSkills(gateOrdered());

    expect(skills).toEqual([
      { runner: 0, skillId: 910071 },
      { runner: 1, skillId: 200331 },
      { runner: 1, skillId: 201351 }
    ]);
  });
});

describe('a recorded race to measure', () => {
  it('is measured as the simulator raced it', () => {
    const race = simulated(gateOrdered());

    expect(recordedImpactRace(race)).toEqual({ shown: race, recorded: race });
  });

  it('waits until the simulator has raced it', () => {
    const recording = { ...gateOrdered(), original: {} };

    expect(recordedImpactRace(recording)).toBeUndefined();
  });
});

describe('a runner’s skill gains', () => {
  const impact: RaceSkillImpact = {
    finishOrder: [1, 0],
    skills: [
      {
        runner: 0,
        skillId: 910071,
        secondsGained: [0, 0],
        lengthsGained: [0, 0],
        finishOrder: [1, 0]
      },
      {
        runner: 1,
        skillId: 201351,
        secondsGained: [-0.1, 0.4],
        lengthsGained: [-0.8, 3.2],
        finishOrder: [0, 1]
      }
    ]
  };

  it('reads her own gain and the place she would have finished without the skill', () => {
    const gains = runnerSkillGains(gateOrdered(), impact, 0);

    expect([...gains.keys()]).toEqual([201351]);
    expect(gains.get(201351)).toEqual({ lengths: 3.2, seconds: 0.4, place: 1, placeWithout: 2 });
  });

  it('finds her by capture position after a rerun seats her in another gate', () => {
    const seated = seatedCapture(gateOrdered(), { gates: [2, 1] });
    const her = seated.runners.find((entry) => entry.sourceIndex === 1)!;

    const gains = runnerSkillGains(seated, impact, her.index);

    expect(gains.get(201351)?.lengths).toBe(3.2);
  });
});
