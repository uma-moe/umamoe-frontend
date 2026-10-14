import type { MonteCarloResult } from '../../simulator-repository';
import type { SimulatorUma } from '../../simulator-uma';
import { skillDistributions, type SkillDistributionRow } from './skill-distributions';

export interface ActivationCell {
  source: number;
  row: SkillDistributionRow;
}
export interface ActivationRow {
  id: number;
  /** Every runner shown who learned the skill, in the order the runners are shown. */
  cells: Map<number, ActivationCell>;
  /** Lowest activation rate among the owners. */
  lowest: number;
}

/** One row per skill learned by any of `sources`, least reliable first: the lowest activation rate among its owners. */
export function activationRows(result: MonteCarloResult, umas: SimulatorUma[], sources: number[]): ActivationRow[] {
  const rows = new Map<number, ActivationRow>();
  for (const source of sources) {
    const learned = umas[source]?.skills.map(skill => skill.skillId) ?? [];
    for (const row of skillDistributions(result, source, learned).rows.filter(item => learned.includes(item.id))) {
      const entry = rows.get(row.id) ?? { id: row.id, cells: new Map(), lowest: 100 };
      entry.cells.set(source, { source, row });
      entry.lowest = Math.min(entry.lowest, row.rate);
      rows.set(row.id, entry);
    }
  }
  return [...rows.values()].sort((a, b) => a.lowest - b.lowest || a.id - b.id);
}
