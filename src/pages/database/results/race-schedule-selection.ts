export type EncodedRaceSelection = [number, number, number, number];

export function raceSelectionKey(selection: EncodedRaceSelection): string {
  const [year, month, half, raceId] = selection;
  return `${['junior', 'classic', 'senior'][year] ?? year}-${month}-${half}:${raceId}`;
}

export function toggleRaceSelection(selection: EncodedRaceSelection[], next: EncodedRaceSelection): EncodedRaceSelection[] {
  const [year, month, half, raceId] = next;
  const current = selection.find((entry) => entry[0] === year && entry[1] === month && entry[2] === half);
  if (current?.[3] === raceId) return selection.filter((entry) => entry !== current);
  return [...selection.filter((entry) => entry[0] !== year || entry[1] !== month || entry[2] !== half), next]
    .sort((left, right) => left[0] - right[0] || left[1] - right[1] || left[2] - right[2]);
}

export function selectedRaceSaddles(selection: EncodedRaceSelection[], saddleIndex: ReadonlyMap<number, number[]>): number[] {
  return [...new Set(selection.flatMap(([, , , raceId]) => saddleIndex.get(raceId) ?? []))].sort((left, right) => left - right);
}
