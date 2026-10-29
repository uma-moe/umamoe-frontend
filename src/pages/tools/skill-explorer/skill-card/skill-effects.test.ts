import { expect, it } from 'vitest';
import { normalizeSkill } from '@/lib/game-data/skills/skills';
import { parseSkillEffects, releasedSkills, skillEffectDetails } from './skill-effects';

it('requires both a translated name and a Global mechanic entry to display a skill', () => {
  const names = new Map([
    [201271, normalizeSkill({ skill_id: 201271, name: 'Top Runner' })],
    [202601, normalizeSkill({ skill_id: 202601, name: 'Luminescence' })]
  ]);
  const mechanics = new Map([
    [201271, []],
    [999999, []]
  ]);

  expect([...releasedSkills(names, mechanics).keys()]).toEqual([201271]);
  expect(releasedSkills(names, new Map()).size).toBe(0);
});

function effects(duration: number, modifiers: Array<[number, number, number]>, scaling = 1) {
  return parseSkillEffects({
    skills: [
      {
        skill_id: 201271,
        alternatives: [
          {
            base_duration: duration,
            duration_scaling: scaling,
            effects: modifiers.map(([effect_type, modifier, target]) => ({
              effect_type,
              modifier,
              target
            }))
          }
        ]
      }
    ]
  }).get(201271);
}

it('shows Top Runner strength and its duration on a sprint course', () => {
  const topRunner = effects(30_000, [[27, 3500, 1]]);

  expect(skillEffectDetails(topRunner, 1200)).toEqual([
    { effects: ['Target speed +0.35 m/s'], duration: '3.6 s duration' }
  ]);
  expect(skillEffectDetails(topRunner)[0]?.duration).toBe('3 s base duration');
});

it('keeps acceleration, recovery and passive stat values in their own units', () => {
  expect(skillEffectDetails(effects(30_000, [[31, 2000, 1]]), 2000)[0]).toEqual({
    effects: ['Acceleration +0.2 m/s²'],
    duration: '6 s duration'
  });
  expect(skillEffectDetails(effects(0, [[9, 550, 1]]))[0]).toEqual({
    effects: ['HP +5.5% max HP'],
    duration: 'Instant'
  });
  expect(skillEffectDetails(effects(-1, [[1, 600_000, 1]]))[0]).toEqual({
    effects: ['Speed stat +60'],
    duration: 'Whole race'
  });
});

it('identifies opponent effects and labels a conditional duration as a base value', () => {
  expect(skillEffectDetails(effects(30_000, [[21, -1500, 9]], 2), 1200)[0]).toEqual({
    effects: ['Opponents: current speed -0.15 m/s'],
    duration: '3.6 s base duration'
  });
  expect(skillEffectDetails(undefined)).toEqual([]);
});

it('rejects malformed numeric mechanics instead of inventing a value', () => {
  expect(() =>
    parseSkillEffects({
      skills: [{ skill_id: 1, alternatives: [{ base_duration: '3', effects: [] }] }]
    })
  ).toThrow('duration');
});
