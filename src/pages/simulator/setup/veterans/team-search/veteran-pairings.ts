import type { SimulatorUma } from '../../../simulator-uma';

const character = (uma: SimulatorUma) => uma.cardId ? String(Math.floor(uma.cardId / 100)) : uma.id;

/** Count combinations of three different characters, retaining every build variant. */
export function veteranTeamCount(umas: SimulatorUma[]): number {
  const counts = new Map<string, number>();
  for (const uma of umas) counts.set(character(uma), (counts.get(character(uma)) ?? 0) + 1);
  let singles = 0, pairs = 0, triples = 0;
  for (const count of counts.values()) { triples += pairs * count; pairs += singles * count; singles += count; }
  return triples;
}

/** Stream the entire collection without allocating n³ teams in browser memory. */
export function* veteranTeams(umas: SimulatorUma[]): Generator<SimulatorUma[]> {
  for (let a = 0; a < umas.length - 2; a++) for (let b = a + 1; b < umas.length - 1; b++) {
    if (character(umas[a]!) === character(umas[b]!)) continue;
    for (let c = b + 1; c < umas.length; c++) if (character(umas[a]!) !== character(umas[c]!) && character(umas[b]!) !== character(umas[c]!)) {
      yield [umas[a]!, umas[b]!, umas[c]!];
    }
  }
}

/** The same distinct signed seeds are used for every pairing. */
export const pairingSeeds = (seed: number, count: number) => Array.from({length:count}, (_, index) => (seed + Math.imul(index, 0x9e3779b9)) | 0);

/** Rotate through every pair of captured opponent teams, with stable source indices. */
export function benchmarkFields(teams: SimulatorUma[][]): SimulatorUma[][] {
  return teams.flatMap((team,index)=>teams.slice(index+1).map(other=>[...team,...other].map((uma,source)=>({...uma,teamId:source<3?2:3,frameOrder:undefined}))));
}

/** Every candidate sees the same shuffled gates for a given seed. */
export function pairingFrameOrders(seed: number, count: number): number[] {
  const orders = Array.from({length:count},(_,index)=>index+1);
  for (let index=count-1; index>0; index--) {
    seed = (Math.imul(seed,1664525)+1013904223) >>> 0;
    const other = Math.floor(seed / 4294967296 * (index+1));
    [orders[index],orders[other]] = [orders[other]!,orders[index]!];
  }
  return orders;
}
