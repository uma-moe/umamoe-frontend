export type EncodedRaceSelection = [number, number, number, number];

export interface RaceAgendaEntry {
  raceName: string;
  grade: string;
  year: string;
  turn: string;
}

export function decodeRaceAgenda(value: unknown): RaceAgendaEntry[] {
  if (!Array.isArray(value)) throw new Error('Invalid race agenda schedule.');
  return value.map((entry: unknown) => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry))
      throw new Error('Invalid race agenda schedule.');
    if (!('raceName' in entry) || typeof entry.raceName !== 'string')
      throw new Error('Invalid race agenda schedule.');
    if (!('year' in entry) || typeof entry.year !== 'string')
      throw new Error('Invalid race agenda schedule.');
    if (!('turn' in entry) || typeof entry.turn !== 'string')
      throw new Error('Invalid race agenda schedule.');
    return {
      raceName: entry.raceName,
      grade: 'grade' in entry && typeof entry.grade === 'string' ? entry.grade : '',
      year: entry.year,
      turn: entry.turn
    };
  });
}

export function raceSelectionKey(selection: EncodedRaceSelection): string {
  const [year, month, half, raceId] = selection;
  return `${['junior', 'classic', 'senior'][year] ?? year}-${month}-${half}:${raceId}`;
}

export function toggleRaceSelection(
  selection: EncodedRaceSelection[],
  next: EncodedRaceSelection
): EncodedRaceSelection[] {
  const [year, month, half, raceId] = next;
  const current = selection.find(
    (entry) => entry[0] === year && entry[1] === month && entry[2] === half
  );

  if (current?.[3] === raceId) return selection.filter((entry) => entry !== current);
  return [
    ...selection.filter((entry) => entry[0] !== year || entry[1] !== month || entry[2] !== half),
    next
  ].sort((left, right) => left[0] - right[0] || left[1] - right[1] || left[2] - right[2]);
}

export function selectedRaceSaddles(
  selection: EncodedRaceSelection[],
  saddleIndex: ReadonlyMap<number, number[]>
): number[] {
  return [...new Set(selection.flatMap(([, , , raceId]) => saddleIndex.get(raceId) ?? []))].sort(
    (left, right) => left - right
  );
}
