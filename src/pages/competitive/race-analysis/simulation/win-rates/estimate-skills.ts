import type { MonteCarloResult } from '@/pages/simulator/simulator-repository';

export interface SkillActivationRate {
  skillId: number;
  /** The share of races the skill activated in, as a percentage. */
  rate: number;
}

/**
 * How often each of a runner's skills activated over the estimate's races, most reliable first: the skills she knows
 * and any other the simulator reports for her. Undefined when the estimate carries no skill activations.
 */
export function skillActivationRates(
  result: MonteCarloResult,
  source: number,
  knownSkillIds: number[]
): SkillActivationRate[] | undefined {
  if (!result.skills) return undefined;

  const rates = new Map<number, number>(knownSkillIds.map((skillId) => [skillId, 0]));
  for (const skill of result.skills) {
    if (skill.source_input_index !== source) continue;

    rates.set(skill.skill_id, result.runs ? (skill.runs_triggered / result.runs) * 100 : 0);
  }

  return [...rates]
    .map(([skillId, rate]) => ({ skillId, rate }))
    .sort((a, b) => b.rate - a.rate || a.skillId - b.skillId);
}
