import raceToSaddleData from '../../data/race_to_saddle_mapping.json';

export interface RaceSaddleMapping {
  races: any[];
  [key: string]: any;
}

function normalizeRaceSaddleData(data: unknown): RaceSaddleMapping {
  const source = ((data as any)?.default || data || {}) as RaceSaddleMapping;
  return {
    ...source,
    races: Array.isArray(source.races) ? source.races : []
  };
}

export const RACE_SADDLE_DATA: RaceSaddleMapping = normalizeRaceSaddleData(raceToSaddleData);

export function replaceRaceSaddleData(data: unknown): RaceSaddleMapping {
  const next = normalizeRaceSaddleData(data);
  Object.keys(RACE_SADDLE_DATA).forEach(key => delete RACE_SADDLE_DATA[key]);
  Object.assign(RACE_SADDLE_DATA, next);
  return RACE_SADDLE_DATA;
}

export function getRaceSaddleData(): RaceSaddleMapping {
  return RACE_SADDLE_DATA;
}
