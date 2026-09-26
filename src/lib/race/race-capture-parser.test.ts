import * as pako from 'pako';
import { describe, expect, it } from 'vitest';
import { parseRaceCapture } from './race-capture-parser';

function scenario(): string {
  const bytes = new Uint8Array(127);
  const view = new DataView(bytes.buffer);
  view.setInt32(0, 4, true);
  view.setInt32(4, 1, true);
  view.setFloat32(8, 20, true);
  view.setInt32(12, 1, true);
  view.setInt32(16, 12, true);
  view.setInt32(20, 31, true);
  view.setInt32(24, 0, true);
  view.setInt32(28, 2, true);
  view.setInt32(32, 16, true);
  view.setFloat32(36, 0, true);
  view.setFloat32(40, 0, true);
  view.setUint16(44, 5000, true);
  view.setUint16(46, 1400, true);
  view.setUint16(48, 1000, true);
  view.setFloat32(52, 1, true);
  view.setFloat32(56, 14, true);
  view.setUint16(60, 5000, true);
  view.setUint16(62, 1600, true);
  view.setUint16(64, 900, true);
  view.setInt32(68, 0, true);
  view.setInt32(72, 1, true);
  view.setFloat32(76, 118.42, true);
  view.setFloat32(80, 0, true);
  view.setFloat32(84, .12, true);
  view.setFloat32(90, 1780, true);
  view.setUint8(94, 2);
  view.setInt32(103, 0, true);
  view.setInt32(107, 1, true);
  view.setInt16(111, 14, true);
  view.setFloat32(113, .5, true);
  view.setInt8(117, 3);
  view.setInt8(118, 2);
  view.setInt32(119, 0, true);
  view.setInt32(123, 200001, true);
  const compressed = pako.deflate(bytes);
  let binary = '';
  for (const byte of compressed) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function jpScenario(): string {
  const bytes = new Uint8Array(142);
  const view = new DataView(bytes.buffer);
  view.setInt32(0, 4, true); view.setInt32(4, 1, true);
  view.setFloat32(8, 20, true); view.setInt32(12, 1, true); view.setInt32(16, 12, true); view.setInt32(20, 39, true);
  view.setInt32(24, 4, true);
  view.setFloat32(32, 0, true); view.setFloat32(36, 0, true); view.setUint16(40, 5000, true); view.setUint16(42, 1400, true); view.setUint16(44, 1000, true);
  view.setFloat32(48, 1, true); view.setFloat32(52, 14, true); view.setUint16(56, 5000, true); view.setUint16(58, 1600, true); view.setUint16(60, 900, true);
  view.setInt32(76, 1, true); view.setFloat32(80, 118.42, true); view.setFloat32(84, 0, true); view.setFloat32(88, .12, true); view.setFloat32(94, 1780, true); view.setUint8(98, 2); view.setInt32(111, 0, true);
  view.setInt32(115, 0, true); view.setInt32(119, 1, true); view.setUint16(123, 1, true);
  view.setFloat32(125, .5, true); view.setUint8(129, 3); view.setUint8(130, 2); view.setInt32(131, 0, true); view.setInt32(135, 200001, true);
  const compressed = pako.deflate(bytes);
  let binary = '';
  for (const byte of compressed) binary += String.fromCharCode(byte);
  return btoa(binary);
}

describe('race capture parser', () => {
  it('normalizes packet wrappers and decodes the global timeline format', () => {
    const parsed = parseRaceCapture({ data: {
      race_horse_data_array: [{ card_id: 101101, chara_name: 'Special Week', speed: 1200, skill_array: [{ skill_id: 200001 }] }],
      race_scenario: scenario(),
      player_team_member_array: [{ horse_index: 0 }],
      race_course_set: { id: 10101, lane_distance_max: 15.1875 }
    } }, 'race.json');
    expect(parsed.source).toBe('api');
    expect(parsed).toMatchObject({courseId:10101,laneDistanceMax:15.1875});
    expect(parsed.frames).toHaveLength(2);
    expect(parsed.frames[1]?.horses[0]?.speed).toBe(1600);
    expect(parsed.runners[0]?.result?.finishOrder).toBe(1);
    expect(parsed.runners[0]?.isPlayer).toBe(true);
    expect(parsed.events[0]).toMatchObject({ type: 3, params: [0, 200001] });
  });

  it('retains course IDs from top-level and room captures', () => {
    const payload = {race_horse_data_array:[{chara_name:'Special Week'}],race_scenario:scenario()};
    expect(parseRaceCapture({...payload,course_id:10606}).courseId).toBe(10606);
    expect(parseRaceCapture({data:{...payload,room_info:{race_course_set:{id:10606,lane_distance_max:16.875}}}}))
      .toMatchObject({courseId:10606,laneDistanceMax:16.875});
  });

  it('retains race-instance IDs from room packets, filenames and archived replays',()=>{
    const horses=[{chara_name:'Special Week'}],race_scenario=scenario();
    expect(parseRaceCapture({race_horse_data_array:horses,race_scenario,room_info:{race_instance_id:800023}}).raceInstanceId).toBe(800023);
    expect(parseRaceCapture({data:{race_horse_data_array:horses,race_scenario,room_info:{raceInstanceId:800023}}}).raceInstanceId).toBe(800023);
    expect(parseRaceCapture({race_horse_data_array:horses,race_scenario},'800023_2026-09-26.json.gz').raceInstanceId).toBe(800023);
    expect(parseRaceCapture({race_horse_data_array:horses,race_scenario,race_instance_id:800024},'800023_2026.json').raceInstanceId).toBe(800024);
    expect(parseRaceCapture({race:{courseId:10606},replay:{raceHorseDataArray:horses,raceScenario:race_scenario}}).courseId).toBe(10606);
  });

  it('rejects unrelated JSON', () => {
    expect(() => parseRaceCapture({ hello: 'world' })).toThrow(/supported/);
  });

  it('falls back to the JP timeline layout', () => {
    const parsed = parseRaceCapture({ race_horse_data_array: [{ chara_name: 'Special Week' }], race_scenario: jpScenario() });
    expect(parsed.frames).toHaveLength(2);
    expect(parsed.runners[0]?.result?.finishOrder).toBe(1);
    expect(parsed.events[0]).toMatchObject({ type: 3, params: [0, 200001] });
  });

  it('hydrates compact archived replay fields without a second parser', () => {
    const parsed = parseRaceCapture({
      race_horse_data_array: [{ card_id: 101101, speed: 1200, stamina: 900, pow: 1100, guts: 800, wiz: 1000, apt_ground: 7, apt_distance: 8, apt_style: 6, skill_array: [200001] }],
      race_scenario: scenario(),
      race_course_set: { id: 10101, lane_distance_max: 15.1875 }
    }, 'Replay abc');
    expect(parsed.runners[0]?.stats).toMatchObject({ power: 1100, wit: 1000 });
    expect(parsed.runners[0]?.aptitudes).toEqual({ surface: 7, distance: 8, style: 6 });
    expect(parsed.runners[0]?.skillIds).toEqual([200001]);
  });
});
