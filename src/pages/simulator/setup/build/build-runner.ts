/**
 * One of the optimizer's builds as a racer the Race sim can add to its field.
 *
 * A build is the purchases the search chose, indices into what was on offer, on top of her own skills: a purchase adds
 * its skill, and an upgrade removes the skill it replaces, which she may already own. Pure: no Svelte and no network,
 * so the page converts a build without touching the roster.
 */

import type { MonteCarloSkillInput } from '../../requests/race-sim-request';
import type { SimulatorUma } from '../../simulator-uma';
import type { PricedOffer } from './skill-offers';

/** What the Race sim shows as where a runner came from. */
export const BUILD_RUNNER_SOURCE = 'Build optimizer';

/**
 * Writes `held` as a runner of her own: a fresh id and name, so sending the same build twice gives two entries, and her
 * build's end skills. She keeps her trainee as it is, since the search never changed her stats, and arrives unteamed.
 */
export function buildRunner({
  uma,
  offers,
  purchases,
  held,
  label
}: {
  uma: SimulatorUma;
  /** The offers the search ran with, in purchase order: `purchases[i]` buys `offers[i]`. */
  offers: PricedOffer[];
  /** The purchases the search ran with, as its request held them: only what an upgrade replaces matters here. */
  purchases: ReadonlyArray<{ replaces?: ReadonlyArray<number> }>;
  /** Indices of `offers` this build buys. */
  held: number[];
  /** What the field calls her, such as the pick. */
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

  // A purchase can only replace a skill of the same group, so nothing bought is also replaced unless a build held both.
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
