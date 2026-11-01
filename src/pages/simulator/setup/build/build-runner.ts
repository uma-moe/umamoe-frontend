import type { MonteCarloSkillInput } from '../../requests/race-sim-request';
import type { SimulatorUma } from '../../simulator-uma';
import type { PricedOffer } from './skill-offers';

export const BUILD_RUNNER_SOURCE = 'Build optimizer';

/** A fresh id, so the same build sent twice adds two runners. Her stats stay: the search only picks skills. */
export function buildRunner({
  uma,
  offers,
  purchases,
  held,
  label
}: {
  uma: SimulatorUma;
  /** In purchase order: `purchases[i]` buys `offers[i]`. */
  offers: PricedOffer[];
  purchases: ReadonlyArray<{ replaces?: ReadonlyArray<number> }>;
  /** Indices of `offers` this build buys. */
  held: number[];
  label?: string;
}): SimulatorUma {
  const replaced = new Set<number>();
  const bought = new Map<number, MonteCarloSkillInput>();

  for (const index of held) {
    const offer = offers[index];
    if (!offer) continue;

    bought.set(offer.skillId, { skillId: offer.skillId, level: 1 });
    for (const skillId of purchases[index]?.replaces ?? []) replaced.add(skillId);
  }

  // A build holding two ranks of one group keeps only the upper one, which replaces the lower.
  const skills = uma.skills.filter((skill) => !replaced.has(skill.skillId));
  for (const skill of bought.values()) {
    if (!replaced.has(skill.skillId)) skills.push(skill);
  }

  return {
    ...uma,
    id: crypto.randomUUID(),
    name: label ? uma.name + ' · ' + label : uma.name,
    source: BUILD_RUNNER_SOURCE,
    trainee: {
      ...uma.trainee,
      distanceAptitudes: [...uma.trainee.distanceAptitudes],
      styleAptitudes: [...uma.trainee.styleAptitudes],
      groundAptitudes: [...uma.trainee.groundAptitudes]
    },
    skills
  };
}
