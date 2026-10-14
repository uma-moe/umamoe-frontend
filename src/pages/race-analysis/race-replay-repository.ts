import { parseRaceCapture, type ParsedRaceCapture } from '@/lib/race/race-capture-parser';
import { QueryCache } from '@/services/data/query-cache';
import { appHttp } from '@/services/http/app-http';
import { umaLogsApi } from '@/services/http/service-endpoints';

interface ReplayPayload {
  race: {
    raceUid: string;
    courseId: number | null;
    raceType?: string | null;
    groundCondition?: string | null;
    weather?: string | null;
    season?: string | null;
    laneDistanceMax?: number | null;
  };
  replay: {
    horseACTVersion?: string;
    raceScenario: string;
    raceHorseDataArray: Record<string, unknown>[];
  };
}

interface SharedRacePayload {
  raceHorseInfo: string | Record<string, unknown>[];
  raceScenario: string;
  detectedCourseId?: number;
  laneDistanceMax?: number;
  randomSeed?: number;
  raceType?: string;
  trackDetails?: { condition?: string; weather?: string; season?: string };
}

const cache = new QueryCache();

function capture(payload: ReplayPayload, label: string): ParsedRaceCapture {
  if (!payload?.race || !payload?.replay || !Array.isArray(payload.replay.raceHorseDataArray) || !payload.replay.raceScenario) {
    throw new Error('The archived replay response is incomplete.');
  }
  return parseRaceCapture({
    race_horse_data_array: payload.replay.raceHorseDataArray,
    race_scenario: payload.replay.raceScenario,
    race_course_set: { id: payload.race.courseId, lane_distance_max: payload.race.laneDistanceMax },
    race_type: payload.race.raceType,
    ground_condition: payload.race.groundCondition,
    weather: payload.race.weather,
    season: payload.race.season,
    horseACT_version: payload.replay.horseACTVersion
  }, label);
}

function sharedCapture(payload: SharedRacePayload, key: string): ParsedRaceCapture {
  const horses = typeof payload.raceHorseInfo === 'string' ? JSON.parse(payload.raceHorseInfo) as unknown : payload.raceHorseInfo;
  return parseRaceCapture({
    race_horse_data_array: Array.isArray(horses) ? horses : [horses],
    race_scenario: payload.raceScenario,
    race_course_set: { id: payload.detectedCourseId, lane_distance_max: payload.laneDistanceMax },
    race_type: payload.raceType,
    random_seed: payload.randomSeed,
    ground_condition: payload.trackDetails?.condition,
    weather: payload.trackDetails?.weather,
    season: payload.trackDetails?.season
  }, `Shared race ${key}`);
}

export const raceReplayRepository = {
  replay(raceUid: string, refresh = false): Promise<ParsedRaceCapture> {
    return cache.get(`race-replay:${raceUid}`, 5 * 60_000, async () => capture(await appHttp.request<ReplayPayload>(umaLogsApi(`/api/races/${encodeURIComponent(raceUid)}/replay`)), `Replay ${raceUid}`), refresh);
  },
  shared(key: string, refresh = false): Promise<ParsedRaceCapture> {
    return cache.get(`race-share:${key}`, 5 * 60_000, async () => sharedCapture(await appHttp.request<SharedRacePayload>(`/api/share/${encodeURIComponent(key)}`), key), refresh);
  }
};
