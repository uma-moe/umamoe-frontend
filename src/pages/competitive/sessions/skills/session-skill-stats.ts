import type { MultiRaceHorseEntry } from '@/lib/race/multi-race-analysis';
import { rate } from '../../analysis-view';
import { isSmallSample } from '../session-insights';

/** How the runners that learned a skill used it. */
export interface SkillUse {
  /** Runners that carried the skill. */
  learned: number;
  /** Runners whose skill activated at least once. */
  activated: number;
  /** Races won by a runner whose skill activated. */
  activatedWins: number;
  /** Races won by a runner that carried the skill without activating it. */
  idleWins: number;
  /** Runners whose skill activated at least twice in one race. */
  doubleProcs: number;
  /** Course position of every activation, in metres. */
  distances: number[];
}

/** A learned skill across the session and within each running style. */
export interface SessionSkill {
  skillId: number;
  all: SkillUse;
  byStyle: Map<number, SkillUse>;
}

/** Where on the course the middle half of a skill's activations fell. */
export interface ActivationSpread {
  low: number;
  median: number;
  high: number;
}

const emptyUse = (): SkillUse => ({
  learned: 0,
  activated: 0,
  activatedWins: 0,
  idleWins: 0,
  doubleProcs: 0,
  distances: []
});

function addLearner(use: SkillUse, positions: number[], won: boolean) {
  use.learned++;
  use.distances.push(...positions);

  if (positions.length === 0) {
    use.idleWins += Number(won);
    return;
  }

  use.activated++;
  use.activatedWins += Number(won);
  use.doubleProcs += Number(positions.length >= 2);
}

/** Every learned skill in the entries, most learned first. */
export function sessionSkills(entries: MultiRaceHorseEntry[]): SessionSkill[] {
  const skills = new Map<number, SessionSkill>();

  for (const entry of entries) {
    const won = entry.finishOrder === 1;

    for (const skillId of new Set(entry.learnedSkillIds)) {
      const positions = entry.skillActivations
        .filter((activation) => activation.id === skillId)
        .map((activation) => activation.distance);

      const skill = skills.get(skillId) ?? { skillId, all: emptyUse(), byStyle: new Map() };
      const styleUse = skill.byStyle.get(entry.strategy) ?? emptyUse();

      addLearner(skill.all, positions, won);
      addLearner(styleUse, positions, won);
      skill.byStyle.set(entry.strategy, styleUse);
      skills.set(skillId, skill);
    }
  }

  return [...skills.values()].sort(
    (a, b) => b.all.learned - a.all.learned || b.all.activated - a.all.activated
  );
}

/**
 * Win rate of the runners that learned the skill minus the rate of those that did not, in points.
 * Both groups need enough entries; the gap is a correlation, not the skill's effect.
 */
export function learnerWinGap(use: SkillUse, totals: { entries: number; wins: number }) {
  const without = totals.entries - use.learned;
  if (isSmallSample(use.learned) || isSmallSample(without)) return undefined;

  const learnerWins = use.activatedWins + use.idleWins;
  return rate(learnerWins, use.learned) - rate(totals.wins - learnerWins, without);
}

function quantile(sorted: number[], fraction: number) {
  const position = (sorted.length - 1) * fraction;
  const below = Math.floor(position);
  const above = Math.ceil(position);
  const lower = sorted[below] ?? 0;

  return lower + ((sorted[above] ?? lower) - lower) * (position - below);
}

export function activationSpread(distances: number[]): ActivationSpread | undefined {
  if (distances.length === 0) return undefined;

  const sorted = [...distances].sort((a, b) => a - b);
  return {
    low: quantile(sorted, 0.25),
    median: quantile(sorted, 0.5),
    high: quantile(sorted, 0.75)
  };
}
