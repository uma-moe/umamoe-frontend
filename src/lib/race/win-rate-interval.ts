/** Wilson 95% interval of a win rate, in percent like the displayed rate. */
export function winRateInterval(wins: number, races: number): [number, number] {
  if (!races) return [0, 100];
  const z2 = 1.96 ** 2,
    rate = wins / races,
    denominator = 1 + z2 / races;

  const centre = (rate + z2 / (2 * races)) / denominator;
  const margin =
    (1.96 * Math.sqrt((rate * (1 - rate)) / races + z2 / (4 * races ** 2))) / denominator;

  return [Math.max(0, centre - margin) * 100, Math.min(1, centre + margin) * 100];
}
