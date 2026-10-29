/** A race day as the game's conditions number it. */
export interface RaceDay {
  season: number;
  weather: number;
  ground: number;
}

/**
 * Whether a skill's conditions can hold on `day`: some alternative (split by `@`) whose season, weather and ground
 * terms (joined by `&`) all match. Terms about anything else are left to the race.
 */
export function dayAllows(conditions: string | undefined, day: RaceDay): boolean {
  if (conditions === undefined || conditions.trim() === '') return true;

  const actual: Record<string, number> = {
    season: day.season,
    weather: day.weather,
    ground_condition: day.ground
  };
  return conditions.split('@').some((alternative) =>
    alternative.split('&').every((term) => {
      const match = /^(season|weather|ground_condition)(==|!=)(\d+)$/.exec(term.trim());
      if (match === null) return true;

      const [, key, operator, expected] = match;
      const holds = actual[key!] === Number(expected);
      return operator === '==' ? holds : !holds;
    })
  );
}
