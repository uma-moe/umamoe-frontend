import { runnerColor } from '../simulation-report';
import type { SimulatorUma } from '../../simulator-uma';

export const person = (umas: SimulatorUma[], source: number) => ({
  name: umas[source]!.name,
  cardId: umas[source]!.cardId,
  color: runnerColor(source)
});
export const percent = (value: number) =>
  (value >= 99.95 || value <= 0.05 ? value.toFixed(0) : value.toFixed(1)) + '%';
export const racesLabel = (count: number, runs: number) =>
  count.toLocaleString('en-US') +
  ' race' +
  (count === 1 ? '' : 's') +
  ' (' +
  ((count / Math.max(1, runs)) * 100).toFixed(1) +
  '%)';
export const ordinal = (place: number) =>
  place +
  (place % 100 >= 11 && place % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][place % 10] ?? 'th'));
