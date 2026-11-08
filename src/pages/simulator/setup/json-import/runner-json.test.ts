import { describe, expect, it } from 'vitest';
import type { PotentialSkills } from '@/lib/game-data/cards/potential-skills';
import { buildCodeGoal, buildCodeUma } from '../build/code/build-code';
import { readRunnerJson } from './runner-json';

const noPotentialSkills = () => Promise.resolve<PotentialSkills>(new Map());
const read = (value: unknown) =>
  readRunnerJson(JSON.stringify(value), new Map(), noPotentialSkills);

/** One trained Uma as umadump saves her in trained_chara_data.json and veteran.json, trimmed to what a race reads. */
const trainedUma = {
  trained_chara_id: 412,
  card_id: 100601,
  speed: 1201,
  stamina: 902,
  power: 1003,
  guts: 604,
  wiz: 805,
  fans: 250000,
  rank_score: 15800,
  scenario_id: 4,
  running_style: 3,
  proper_ground_turf: 7,
  proper_ground_dirt: 2,
  proper_distance_short: 3,
  proper_distance_mile: 6,
  proper_distance_middle: 7,
  proper_distance_long: 8,
  proper_running_style_nige: 2,
  proper_running_style_senko: 5,
  proper_running_style_sashi: 7,
  proper_running_style_oikomi: 4,
  skill_array: [
    { skill_id: 100061, level: 4 },
    { skill_id: 200332, level: 1 }
  ],
  create_time: '2026-11-01 12:00:00'
};

const careerState = {
  card_id: 100601,
  speed: 1588,
  stamina: 435,
  power: 1217,
  wiz: 1259,
  guts: 682,
  motivation: 5,
  skill_point: 2984,
  race_running_style: 2,
  proper_distance_short: 8,
  proper_distance_mile: 7,
  proper_distance_middle: 7,
  proper_distance_long: 6,
  proper_running_style_nige: 2,
  proper_running_style_senko: 7,
  proper_running_style_sashi: 7,
  proper_running_style_oikomi: 4,
  proper_ground_turf: 7,
  proper_ground_dirt: 6,
  skill_array: [{ skill_id: 100061, level: 5 }],
  skill_tips_array: []
};

/** The game API's envelope: what umadump's capture of a response keeps around its data. */
const dataHeaders = { result_code: 1, servertime: 1762700000 };

describe('runner JSON', () => {
  it('reads an umadump career turn as her final turn with her skill points', async () => {
    const result = await read({ single_mode_load_common: { chara_info: careerState } });

    expect(result.kind).toBe('career-turn');
    if (result.kind !== 'career-turn') return;
    expect(buildCodeGoal(result.code).sp).toBe(2984);
  });

  it('reads veteran.json as her build, with nothing to spend', async () => {
    const result = await read(trainedUma);

    expect(result.kind).toBe('veteran');
    if (result.kind !== 'veteran') return;
    const { uma } = buildCodeUma(result.code.uma1!);
    expect(uma.cardId).toBe(100601);
    expect(uma.fanCount).toBe(250000);
    expect(uma.trainee).toMatchObject({
      speed: '1201',
      wisdom: '805',
      runningStyle: 'Sashi',
      motivation: '3',
      distanceAptitudes: ['E', 'B', 'A', 'S'],
      styleAptitudes: ['F', 'C', 'A', 'D'],
      groundAptitudes: ['A', 'F']
    });
    expect(uma.skills).toEqual([
      { skillId: 100061, level: 4 },
      { skillId: 200332, level: 1 }
    ]);
    expect(result.code.uma1?.sp).toBeUndefined();
  });

  it('lists the Veterans of an export to choose from, counting those that can’t race', async () => {
    const second = { ...trainedUma, trained_chara_id: 413, card_id: 100701 };
    const withoutStats = { trained_chara_id: 414, card_id: 100801, skill_array: [] };

    const result = await read([trainedUma, second, withoutStats]);

    expect(result.kind).toBe('veterans');
    if (result.kind !== 'veterans') return;
    expect(result.veterans.map((veteran) => veteran.trained_chara_id)).toEqual([412, 413]);
    expect(result.veterans[0]?.create_time).toBe('2026-11-01 12:00:00');
    expect(result.unraceable).toBe(1);
  });

  it('reads the game API’s career responses as her final turn', async () => {
    const loadResponse = {
      data_headers: dataHeaders,
      data: { single_mode_load_common: { chara_info: careerState } }
    };
    const commandResponse = { data_headers: dataHeaders, data: { chara_info: careerState } };

    const fromLoad = await read(loadResponse);
    const fromCommand = await read(commandResponse);

    expect(fromLoad.kind).toBe('career-turn');
    expect(fromCommand.kind).toBe('career-turn');
  });

  it('reads one trained Uma from the game API as her build', async () => {
    const result = await read({ data_headers: dataHeaders, data: trainedUma });

    expect(result.kind).toBe('veteran');
  });

  it('lists the game API’s trained Uma to choose from', async () => {
    const second = { ...trainedUma, trained_chara_id: 413 };

    const result = await read({
      data_headers: dataHeaders,
      data: { trained_chara_array: [trainedUma, second] }
    });

    expect(result.kind).toBe('veterans');
  });

  it('loads an export with one Veteran as her build', async () => {
    const result = await read({ data: { trained_chara_array: [trainedUma] } });

    expect(result.kind).toBe('veteran');
  });

  it('says so when none of an export’s Veterans can race', async () => {
    await expect(read([{ card_id: 100601, speed: 1200, wiz: 800 }])).rejects.toThrow(
      'None of these Veterans'
    );
  });

  it('leaves build codes to their own input', async () => {
    const buildCodeJson = { version: 1, uma1: { outfitId: '100601', speed: 1300 } };

    await expect(read(buildCodeJson)).rejects.toThrow('isn’t a career turn or Veterans');
  });

  it('points race files to Race analysis', async () => {
    await expect(read({ race_horse_data_array: [], race_scenario: '' })).rejects.toThrow(
      'race file'
    );
    await expect(read({ raceHorse: [], simDataBase64: '' })).rejects.toThrow('race file');
  });

  it('names what it reads when the JSON is none of them', async () => {
    await expect(read({ data: {} })).rejects.toThrow('isn’t a career turn or Veterans');
    await expect(
      readRunnerJson('{"single_mode_load_common":', new Map(), noPotentialSkills)
    ).rejects.toThrow('isn’t JSON');
  });
});
