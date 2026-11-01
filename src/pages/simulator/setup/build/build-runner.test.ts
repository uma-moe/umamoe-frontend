import { describe, expect, it } from 'vitest';
import { normalizeSkill } from '@/lib/game-data/skills/skills';
import { createSimulatorUma, type SimulatorUma } from '../../simulator-uma';
import { offerPurchases } from './skill-offers';
import { BUILD_RUNNER_SOURCE, buildRunner } from './build-runner';

const catalog = new Map(
  [
    // Concentration upgrades the Focus she owns; Groundwork upgrades nothing.
    { skill_id: 200431, name: 'Concentration', rarity: 2, base_cost: 140 },
    { skill_id: 200432, name: 'Focus', rarity: 1, base_cost: 140 },
    { skill_id: 201601, name: 'Groundwork', rarity: 1, base_cost: 160 }
  ].map((entry) => [entry.skill_id, normalizeSkill(entry)])
);

/** Purchases: 0 Concentration (replaces her owned Focus), 1 Groundwork. */
const { priced: offers, purchases } = offerPurchases(
  [
    { skillId: 200431, hint: 0 },
    { skillId: 201601, hint: 0 }
  ],
  [200432],
  catalog
);

const her: SimulatorUma = {
  ...createSimulatorUma('Dantsu Flame'),
  skills: [{ skillId: 200432, level: 1 }]
};

describe('her build as a racer', () => {
  it('buys the build’s skills and keeps the ones she owns', () => {
    const runner = buildRunner({
      uma: her,
      offers,
      purchases,
      held: [1],
      label: 'Pick'
    });

    expect(runner.skills).toEqual([
      { skillId: 200432, level: 1 },
      { skillId: 201601, level: 1 }
    ]);
    expect(runner.name).toBe('Dantsu Flame · Pick');
  });

  it('drops the skill an upgrade replaces', () => {
    const runner = buildRunner({ uma: her, offers, purchases, held: [0] });

    expect(runner.skills).toEqual([{ skillId: 200431, level: 1 }]);
  });

  it('arrives as a runner of her own, unteamed and with no name label', () => {
    const runner = buildRunner({ uma: her, offers, purchases, held: [] });

    expect(runner.id).not.toBe(her.id);
    expect(runner.name).toBe('Dantsu Flame');
    expect(runner.source).toBe(BUILD_RUNNER_SOURCE);
    expect(runner.teamId).toBeUndefined();
    expect(runner.frameOrder).toBeUndefined();
    expect(runner.trainee).not.toBe(her.trainee);
    expect(runner.trainee.speed).toBe(her.trainee.speed);
  });

  it('skips a purchase the offers no longer hold', () => {
    const runner = buildRunner({ uma: her, offers, purchases, held: [1, 9] });

    expect(runner.skills.map((skill) => skill.skillId)).toEqual([200432, 201601]);
  });
});
