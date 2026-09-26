import * as pako from 'pako';

export interface RaceHorseFrame {
  distance: number;
  lanePosition: number;
  speed: number;
  hp: number;
  temptationMode: number;
  blockFrontHorseIndex: number;
}

export interface RaceFrame {
  time: number;
  horses: RaceHorseFrame[];
}

export interface RaceHorseResult {
  finishOrder: number;
  finishTime: number;
  finishDiffTime: number;
  startDelayTime: number;
  lastSpurtStartDistance: number;
  runningStyle: number;
}

export interface RaceEvent {
  frameTime: number;
  type: number;
  params: number[];
}

export interface RaceRunner {
  index: number;
  cardId?: number;
  charaId?: number;
  trainedCharaId?: number;
  name: string;
  trainerName?: string;
  isPlayer: boolean;
  stats: { speed?: number; stamina?: number; power?: number; guts?: number; wit?: number };
  aptitudes: { surface?: number; distance?: number; style?: number };
  skillIds: number[];
  result?: RaceHorseResult;
  raw: Record<string, unknown>;
}

export interface ParsedRaceCapture {
  source: 'horseact' | 'api';
  fileName: string;
  courseId?: number;
  raceInstanceId?: number;
  /** Lateral lane width from the capture; never the race length. */
  laneDistanceMax?: number;
  /** Race length resolved from course metadata, in metres. */
  raceDistance?: number;
  raceType?: string;
  randomSeed?: number;
  horseActVersion?: string;
  track: { condition?: string; weather?: string; season?: string };
  runners: RaceRunner[];
  frames: RaceFrame[];
  events: RaceEvent[];
}

interface DecodedRace {
  frames: RaceFrame[];
  results: RaceHorseResult[];
  events: RaceEvent[];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function first(source: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) if (source[key] !== undefined && source[key] !== null) return source[key];
  return undefined;
}

function numeric(source: Record<string, unknown>, ...keys: string[]): number | undefined {
  const value = Number(first(source, ...keys));
  return Number.isFinite(value) ? value : undefined;
}

function text(source: Record<string, unknown>, ...keys: string[]): string | undefined {
  const value = first(source, ...keys);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizeInput(input: Record<string, unknown>): Record<string, unknown> {
  const replay = record(input.replay), race = record(input.race);
  if (Array.isArray(replay.raceHorseDataArray)) return normalizeInput({data:{
    ...race, race_horse_data_array:replay.raceHorseDataArray, race_scenario:replay.raceScenario,
    race_course_set:{id:race.courseId,lane_distance_max:race.laneDistanceMax},
    horseACT_version:replay.horseACTVersion
  }});
  const data = Object.keys(record(input.data)).length ? record(input.data) : input;
  const horses = first(data, 'race_horse_data_array', 'raceHorseDataArray');
  if (!Array.isArray(horses)) return input;
  const room = record(first(data, 'room_info', 'roomInfo'));
  return {
    ...data,
    horseACT_version: first(data, 'horseACT_version') ?? first(input, 'horseACT_version'),
    race_course_set: first(data, 'race_course_set', 'raceCourseSet') ?? first(room, 'race_course_set', 'raceCourseSet'),
    course_id: first(data, 'course_id', 'courseId') ?? first(room, 'course_id', 'courseId'),
    race_instance_id: first(data, 'race_instance_id', 'raceInstanceId', 'RaceInstanceId') ?? first(room, 'race_instance_id', 'raceInstanceId', 'RaceInstanceId'),
    race_scenario: first(data, 'race_scenario', 'raceScenario') ?? first(room, 'race_scenario', 'raceScenario'),
    race_type: first(data, 'race_type', 'raceType') ?? first(room, 'race_type', 'raceType'),
    ground_condition: first(data, 'ground_condition', 'groundCondition') ?? first(room, 'ground_condition', 'groundCondition'),
    weather: first(data, 'weather') ?? first(room, 'weather'),
    season: first(data, 'season') ?? first(room, 'season'),
    random_seed: first(data, 'random_seed', 'randomSeed') ?? first(room, 'random_seed', 'randomSeed') ?? first(input, 'random_seed', 'randomSeed')
  };
}

function playerIndices(source: Record<string, unknown>): Set<number> {
  const members = array(first(source, 'player_team_member_array', 'playerTeamMemberArray', 'PlayerTeamMemberArray', '<PlayerTeamMemberArray>k__BackingField'));
  const result = new Set<number>();
  for (const item of members) {
    const member = record(item);
    const index = numeric(member, 'horseIndex', 'horse_index');
    const frameOrder = numeric(member, 'frame_order', 'frameOrder');
    if (index !== undefined && index >= 0) result.add(index);
    else if (frameOrder !== undefined && frameOrder >= 1) result.add(frameOrder - 1);
  }
  return result;
}

function skillIds(source: Record<string, unknown>): number[] {
  const values = array(first(source, 'skill_array', 'skillArray', 'skill_data_array', 'skillDataArray', 'skills'));
  return values.map((value) => typeof value === 'number' ? value : numeric(record(value), 'skill_id', 'skillId', 'id')).filter((value): value is number => value !== undefined);
}

function normalizeRunner(rawValue: unknown, index: number, players: Set<number>, result?: RaceHorseResult): RaceRunner {
  const raw = record(rawValue);
  const charaId = numeric(raw, 'chara_id', 'charaId', 'character_id', 'characterId');
  const cardId = numeric(raw, 'card_id', 'cardId');
  const name = text(raw, 'chara_name', 'charaName', 'character_name', 'characterName', 'name') ?? `Runner ${index + 1}`;
  return {
    index,
    cardId,
    charaId,
    trainedCharaId: numeric(raw, 'trained_chara_id', 'trainedCharaId', 'owner_trained_chara_id', 'ownerTrainedCharaId'),
    name,
    trainerName: text(raw, 'trainer_name', 'trainerName', 'user_name', 'userName'),
    isPlayer: players.has(index),
    stats: {
      speed: numeric(raw, 'speed', 'speed_value', 'speedValue'),
      stamina: numeric(raw, 'stamina', 'stamina_value', 'staminaValue'),
      power: numeric(raw, 'power', 'pow', 'power_value', 'powerValue'),
      guts: numeric(raw, 'guts', 'guts_value', 'gutsValue'),
      wit: numeric(raw, 'wiz', 'wisdom', 'intelligence', 'wiz_value', 'wizValue')
    },
    aptitudes: {
      surface: numeric(raw, 'apt_ground', 'proper_ground_turf', 'properGroundTurf', 'surface_aptitude', 'surfaceAptitude'),
      distance: numeric(raw, 'apt_distance', 'proper_distance_middle', 'properDistanceMiddle', 'distance_aptitude', 'distanceAptitude'),
      style: numeric(raw, 'apt_style', 'proper_running_style_nige', 'properRunningStyleNige', 'style_aptitude', 'styleAptitude')
    },
    skillIds: skillIds(raw),
    result,
    raw
  };
}

function ensure(view: DataView, offset: number, size: number): void {
  if (offset < 0 || size < 0 || offset + size > view.byteLength) throw new Error('Race timeline ended unexpectedly.');
}

function horseFrame(view: DataView, offset: number): RaceHorseFrame {
  ensure(view, offset, 12);
  return {
    distance: view.getFloat32(offset, true),
    lanePosition: view.getUint16(offset + 4, true),
    speed: view.getUint16(offset + 6, true),
    hp: view.getUint16(offset + 8, true),
    temptationMode: view.getInt8(offset + 10),
    blockFrontHorseIndex: view.getInt8(offset + 11)
  };
}

function horseResult(view: DataView, offset: number): RaceHorseResult {
  ensure(view, offset, 31);
  return {
    finishOrder: view.getInt32(offset, true),
    finishTime: view.getFloat32(offset + 4, true),
    finishDiffTime: view.getFloat32(offset + 8, true),
    startDelayTime: view.getFloat32(offset + 12, true),
    lastSpurtStartDistance: view.getFloat32(offset + 18, true),
    runningStyle: view.getUint8(offset + 22)
  };
}

function decodeGlobal(bytes: Uint8Array): DecodedRace {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  ensure(view, 0, 8);
  const headerLength = view.getInt32(0, true);
  if (headerLength < 4 || headerLength > view.byteLength - 4) throw new Error('Invalid race timeline header.');
  let offset = 4 + headerLength;
  ensure(view, offset, 20);
  const horseCount = view.getInt32(offset + 4, true);
  const horseFrameSize = view.getInt32(offset + 8, true);
  const horseResultSize = view.getInt32(offset + 12, true);
  if (horseCount < 1 || horseCount > 30 || horseFrameSize < 12 || horseResultSize < 31) throw new Error('Invalid race timeline dimensions.');
  offset += 16;
  const paddingOne = view.getInt32(offset, true);
  offset += 4 + paddingOne;
  ensure(view, offset, 8);
  const frameCount = view.getInt32(offset, true);
  const frameSize = view.getInt32(offset + 4, true);
  if (frameCount < 1 || frameCount > 100_000 || frameSize < 4 + horseCount * horseFrameSize) throw new Error('Invalid frame index.');
  offset += 8;
  const frames: RaceFrame[] = [];
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    ensure(view, offset, frameSize);
    const horses: RaceHorseFrame[] = [];
    for (let horseIndex = 0; horseIndex < horseCount; horseIndex += 1) horses.push(horseFrame(view, offset + 4 + horseIndex * horseFrameSize));
    frames.push({ time: view.getFloat32(offset, true), horses });
    offset += frameSize;
  }
  ensure(view, offset, 4);
  const paddingTwo = view.getInt32(offset, true);
  offset += 4 + paddingTwo;
  const results: RaceHorseResult[] = [];
  for (let index = 0; index < horseCount; index += 1) {
    results.push(horseResult(view, offset));
    offset += horseResultSize;
  }
  ensure(view, offset, 4);
  const paddingThree = view.getInt32(offset, true);
  offset += 4 + paddingThree;
  ensure(view, offset, 4);
  const eventCount = view.getInt32(offset, true);
  offset += 4;
  const events: RaceEvent[] = [];
  for (let index = 0; index < eventCount; index += 1) {
    ensure(view, offset, 8);
    const eventSize = view.getInt16(offset, true);
    const eventOffset = offset + 2;
    const paramCount = view.getInt8(eventOffset + 5);
    ensure(view, eventOffset, 6 + Math.max(0, paramCount) * 4);
    const params = Array.from({ length: Math.max(0, paramCount) }, (_, paramIndex) => view.getInt32(eventOffset + 6 + paramIndex * 4, true));
    events.push({ frameTime: view.getFloat32(eventOffset, true), type: view.getInt8(eventOffset + 4), params });
    offset += 2 + eventSize;
  }
  return { frames, results, events };
}

const jpHorseFrameSize = 12;
const jpHorseResultCoreSize = 39;

function plausibleJpHorseFrame(view: DataView, offset: number): boolean {
  if (offset + jpHorseFrameSize > view.byteLength) return false;
  const distance = view.getFloat32(offset, true);
  return distance >= 0 && distance <= 10_000 && view.getUint16(offset + 4, true) <= 20_000 && view.getUint16(offset + 6, true) <= 10_000 && view.getUint16(offset + 8, true) <= 6_000;
}

function jpHorseFrame(view: DataView, offset: number): RaceHorseFrame {
  ensure(view, offset, jpHorseFrameSize);
  const packed = view.getUint16(offset + 10, true);
  const laneRaw = view.getUint16(offset + 4, true);
  const speedRaw = view.getUint16(offset + 6, true);
  return {
    distance: view.getFloat32(offset, true),
    lanePosition: Math.min(10_000, Math.max(0, Math.round(laneRaw))),
    speed: Math.max(0, Math.round(speedRaw)),
    hp: view.getUint16(offset + 8, true),
    temptationMode: packed & 0xff,
    blockFrontHorseIndex: (packed >> 8) > 127 ? (packed >> 8) - 256 : packed >> 8
  };
}

function validJpFrame(view: DataView, offset: number, horseCount: number): boolean {
  const frameSize = 4 + horseCount * jpHorseFrameSize;
  if (offset < 32 || offset + frameSize > view.byteLength) return false;
  const time = view.getFloat32(offset, true);
  if (time < 0 || time > 200) return false;
  for (let index = 0; index < horseCount; index += 1) if (!plausibleJpHorseFrame(view, offset + 4 + index * jpHorseFrameSize)) return false;
  return true;
}

function readJpFrame(view: DataView, offset: number, horseCount: number): RaceFrame {
  return { time: view.getFloat32(offset, true), horses: Array.from({ length: horseCount }, (_, index) => jpHorseFrame(view, offset + 4 + index * jpHorseFrameSize)) };
}

function nextJpFrameBlock(view: DataView, searchStart: number, horseCount: number, lastTime: number): number | null {
  const frameSize = 4 + horseCount * jpHorseFrameSize;
  for (let offset = searchStart; offset <= view.byteLength - frameSize; offset += 4) {
    if (!validJpFrame(view, offset, horseCount)) continue;
    const time = view.getFloat32(offset, true);
    if (time <= lastTime) continue;
    const next = offset + frameSize;
    if (validJpFrame(view, next, horseCount)) {
      const nextTime = view.getFloat32(next, true);
      if (time < nextTime && nextTime <= 200) return offset;
    }
    if (offset - frameSize < searchStart) return offset;
  }
  return null;
}

function jpFrames(view: DataView, horseCount: number): RaceFrame[] {
  const frameSize = 4 + horseCount * jpHorseFrameSize;
  const found: RaceFrame[] = [];
  let start = validJpFrame(view, 32, horseCount) ? 32 : nextJpFrameBlock(view, 32, horseCount, -1);
  let lastTime = -1;
  while (start !== null) {
    let offset = start;
    let count = 0;
    while (validJpFrame(view, offset, horseCount)) {
      const time = view.getFloat32(offset, true);
      if (time <= lastTime) break;
      found.push(readJpFrame(view, offset, horseCount));
      lastTime = time;
      offset += frameSize;
      count += 1;
    }
    if (!count) break;
    start = nextJpFrameBlock(view, offset, horseCount, lastTime);
  }
  found.sort((left, right) => left.time - right.time);
  const seen = new Set<number>();
  return found.filter((frame) => { const key = Math.round(frame.time * 1_000_000); if (seen.has(key)) return false; seen.add(key); return true; });
}

function readJpResult(view: DataView, offset: number): { result: RaceHorseResult; nextOffset: number } {
  ensure(view, offset, jpHorseResultCoreSize);
  const noActivateSkillCount = view.getInt32(offset + 35, true);
  if (noActivateSkillCount < 0 || noActivateSkillCount > 512) throw new Error('Invalid JP horse result payload.');
  const nextOffset = offset + jpHorseResultCoreSize + noActivateSkillCount * 5;
  ensure(view, offset, nextOffset - offset);
  const result = horseResult(view, offset);
  if (result.runningStyle < 1 || result.runningStyle > 4) result.runningStyle = 0;
  return { result, nextOffset };
}

function jpResultsNear(view: DataView, startGuess: number, horseCount: number): { results: RaceHorseResult[]; endOffset: number | null } {
  for (let start = startGuess; start < Math.min(startGuess + 128, view.byteLength - 1); start += 4) {
    const results: RaceHorseResult[] = [];
    let offset = start;
    try { for (let index = 0; index < horseCount; index += 1) { const parsed = readJpResult(view, offset); results.push(parsed.result); offset = parsed.nextOffset; } }
    catch { continue; }
    if (new Set(results.map((result) => result.finishOrder)).size === horseCount) return { results, endOffset: offset };
  }
  return { results: [], endOffset: null };
}

function findJpResults(view: DataView): RaceHorseResult[] {
  const byOrder = new Map<number, RaceHorseResult>();
  for (let offset = 32; offset <= view.byteLength - jpHorseResultCoreSize; offset += 1) {
    try { const result = readJpResult(view, offset).result; if (!byOrder.has(result.finishOrder)) byOrder.set(result.finishOrder, result); }
    catch { /* Continue scanning the binary payload. */ }
  }
  return [...byOrder.values()];
}

function jpEvents(view: DataView, resultsEnd: number | null): RaceEvent[] {
  if (resultsEnd === null || resultsEnd + 10 > view.byteLength) return [];
  const syncRoot = view.getInt32(resultsEnd, true);
  const count = view.getInt32(resultsEnd + 4, true);
  const version = view.getUint16(resultsEnd + 8, true);
  if (syncRoot < 0 || syncRoot > 1 || count < 0 || count > 5_000 || version > 10_000) return [];
  const events: RaceEvent[] = [];
  let offset = resultsEnd + 10;
  for (let index = 0; index < count; index += 1) {
    try {
      ensure(view, offset, 6);
      const frameTime = view.getFloat32(offset, true);
      const type = view.getUint8(offset + 4);
      const paramCount = view.getUint8(offset + 5);
      if (frameTime < 0 || frameTime > 1_000 || paramCount > 64) break;
      ensure(view, offset + 6, paramCount * 4 + 3);
      const params = Array.from({ length: paramCount }, (_, paramIndex) => view.getInt32(offset + 6 + paramIndex * 4, true));
      events.push({ frameTime, type, params });
      offset += 6 + paramCount * 4 + 3;
    } catch { break; }
  }
  return events;
}

function decodeJp(bytes: Uint8Array): DecodedRace {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  ensure(view, 0, 32);
  const headerLength = view.getInt32(0, true);
  const structOffset = 4 + headerLength;
  ensure(view, structOffset, 20);
  const horseCount = view.getInt32(structOffset + 4, true);
  if (horseCount < 1 || horseCount > 30) throw new Error('Invalid JP horse count.');
  const frames = jpFrames(view, horseCount);
  if (!frames.length) throw new Error('No JP frames found.');
  const postFrames = 32 + frames.length * (4 + horseCount * jpHorseFrameSize);
  let parsed = postFrames + 12 <= view.byteLength ? jpResultsNear(view, postFrames + 12, horseCount) : { results: [] as RaceHorseResult[], endOffset: null };
  if (!parsed.results.length) parsed = { results: findJpResults(view), endOffset: null };
  if (!parsed.results.length) throw new Error('No JP horse results found.');
  return { frames, results: parsed.results, events: jpEvents(view, parsed.endOffset) };
}

function decodeScenario(base64: string): DecodedRace {
  const compressed = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  const bytes = pako.inflate(compressed);
  try { return decodeGlobal(bytes); }
  catch (globalError) {
    try { return decodeJp(bytes); }
    catch (jpError) { throw new Error(`Failed to parse race timeline. Global: ${globalError instanceof Error ? globalError.message : String(globalError)} JP: ${jpError instanceof Error ? jpError.message : String(jpError)}`); }
  }
}

export function parseRaceCapture(value: unknown, fileName = 'capture.json'): ParsedRaceCapture {
  const input = normalizeInput(record(value));
  if (Array.isArray(first(input, 'race_start_params_array')) && Array.isArray(first(input, 'race_result_array'))) throw new Error('Team Trial captures belong in Multi-Race analysis.');
  const apiHorses = first(input, 'race_horse_data_array', 'raceHorseDataArray');
  const actMembers = first(input, '<RaceHorse>k__BackingField', 'raceHorse');
  const source = Array.isArray(apiHorses) ? 'api' : Array.isArray(actMembers) ? 'horseact' : undefined;
  if (!source) throw new Error('This file does not contain a supported race_horse_data_array or HorseACT raceHorse payload.');
  const rawRunners = source === 'api' ? array(apiHorses) : array(actMembers).map((member) => first(record(member), '_responseHorseData', 'responseHorseData')).filter(Boolean);
  const scenario = source === 'api' ? text(input, 'race_scenario', 'raceScenario') : text(input, '<SimDataBase64>k__BackingField', 'simDataBase64');
  if (!scenario) throw new Error('The capture does not include a compressed race scenario.');
  const decoded = decodeScenario(scenario);
  const players = playerIndices(input);
  const course = record(first(input, 'race_course_set', 'raceCourseSet', 'RaceCourseSet', '<RaceCourseSet>k__BackingField'));
  const runners = rawRunners.map((runner, index) => normalizeRunner(runner, index, players, decoded.results[index]));
  return {
    source,
    fileName,
    courseId: numeric(course, 'id', 'Id', '<Id>k__BackingField') ?? numeric(input, 'course_id', 'courseId', 'CourseId', '<CourseId>k__BackingField'),
    raceInstanceId: numeric(input, 'race_instance_id', 'raceInstanceId', 'RaceInstanceId', '<RaceInstanceId>k__BackingField') ?? (Number(fileName.match(/^(\d{6,9})_/)?.[1]) || undefined),
    laneDistanceMax: numeric(course, 'lane_distance_max', 'laneDistanceMax', 'LaneDistanceMax', '<LaneDistanceMax>k__BackingField') ?? numeric(input, 'lane_distance_max', 'laneDistanceMax', 'LaneDistanceMax', '<LaneDistanceMax>k__BackingField'),
    raceType: text(input, 'race_type', 'raceType', 'RaceType', '<RaceType>k__BackingField'),
    randomSeed: numeric(input, 'random_seed', 'randomSeed', 'RandomSeed', '<RandomSeed>k__BackingField'),
    horseActVersion: text(input, 'horseACT_version'),
    track: {
      condition: String(first(input, 'ground_condition', 'groundCondition', 'GroundCondition', '<GroundCondition>k__BackingField') ?? '') || undefined,
      weather: String(first(input, 'weather', 'Weather', '<Weather>k__BackingField') ?? '') || undefined,
      season: String(first(input, 'season', 'Season', '<Season>k__BackingField') ?? '') || undefined
    },
    runners,
    frames: decoded.frames,
    events: decoded.events
  };
}

export async function readRaceCaptureFile(file: File): Promise<ParsedRaceCapture> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let jsonText: string;
  if (file.name.toLowerCase().endsWith('.gz')) jsonText = new TextDecoder().decode(pako.ungzip(bytes));
  else jsonText = new TextDecoder().decode(bytes);
  let value: unknown;
  try { value = JSON.parse(jsonText); }
  catch { throw new Error('The selected file is not valid JSON or gzip-compressed JSON.'); }
  return parseRaceCapture(value, file.name);
}
