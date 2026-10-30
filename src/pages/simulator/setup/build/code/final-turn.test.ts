import { readFileSync } from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import { describe, expect, it } from 'vitest';
import type { SkillData } from '@/lib/game-data/skills/skills';
import type { PotentialSkills } from '@/lib/game-data/cards/potential-skills';
import { buildCodeGoal, buildCodeOffers, buildCodeUma } from './build-code';
import { decodeBuildImport, finalTurnCharaInfo } from './final-turn';

const skill = (skill_id: number, name: string, rarity = 1): SkillData => ({
  skill_id,
  name,
  rarity,
  icon: '',
  baseCost: 170
});

const catalog = new Map(
  [
    skill(200331, 'Professor of Curvature', 2),
    skill(200332, 'Corner Adept ○'),
    skill(200333, 'Corner Adept ×'),
    skill(200041, 'Nakayama Racecourse ◎'),
    skill(200042, 'Nakayama Racecourse ○'),
    skill(201661, "Playtime's Over!"),
    skill(201662, 'See Ya Later!', 2),
    skill(900371, 'Schwarzes Schwert'),
    skill(200512, 'Straightaway Adept'),
    skill(200162, 'Firm Conditions ○'),
    skill(201351, 'Shake It Out'),
    skill(100061, 'Unique', 3)
  ].map((entry) => [entry.skill_id, entry])
);

/** Her state on the final turn as both tools export it, trimmed to what a build reads. */
const charaInfo = {
  card_id: 100601,
  speed: 1588,
  stamina: 435,
  power: 1217,
  wiz: 1259,
  guts: 682,
  motivation: 5,
  fans: 301830,
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
  skill_array: [
    { skill_id: 100061, level: 5 },
    { skill_id: 200042, level: 1 }
  ],
  skill_tips_array: [
    { group_id: 20033, rarity: 2, level: 3 },
    { group_id: 20033, rarity: 1, level: 2 },
    { group_id: 20004, rarity: 1, level: 4 },
    { group_id: 20166, rarity: 2, level: 1 },
    { group_id: 90037, rarity: 1, level: 5 }
  ]
};

/** Her card's potential skills: two starting skills, one she was also hinted, and one each at levels 2 and 4. */
const potentialSkills: PotentialSkills = new Map([
  [
    100601,
    [
      { level: 1, skillId: 200512 },
      { level: 1, skillId: 200041 },
      { level: 2, skillId: 200162 },
      { level: 4, skillId: 201351 }
    ]
  ]
]);
const loadPotentialSkills = () => Promise.resolve(potentialSkills);
const noPotentialSkills = () => Promise.resolve<PotentialSkills>(new Map());

const readContract = (name: string) =>
  JSON.parse(readFileSync(path.join(process.cwd(), 'contracts', name), 'utf8'));

const ajv = new Ajv2020({ strict: false });
const validate = ajv.compile(readContract('build-code.schema.json'));
const validateFinalTurn = ajv.compile(readContract('final-turn.schema.json'));

const honseAct = { single_mode_load_common: { chara_info: charaInfo } };
const umaExporter = { response_code: 1, data: { chara_info: charaInfo } };

describe('final turns', () => {
  it('documents both tools’ final turns in the contract', () => {
    expect(validateFinalTurn(honseAct), JSON.stringify(validateFinalTurn.errors)).toBe(true);
    expect(validateFinalTurn(umaExporter), JSON.stringify(validateFinalTurn.errors)).toBe(true);
    expect(validateFinalTurn({ data: { chara_info: { card_id: 100601 } } })).toBe(false);
  });

  it('finds her career state in a honse_act turn and in an UmaExporter response', () => {
    expect(finalTurnCharaInfo(honseAct)?.card_id).toBe(100601);
    expect(finalTurnCharaInfo(umaExporter)?.card_id).toBe(100601);
    expect(finalTurnCharaInfo({ data: { chara_info: { card_id: 1 } } })).toBeUndefined();
  });

  it('reads her as the runner with her skill points', async () => {
    const code = await decodeBuildImport(JSON.stringify(honseAct), catalog, noPotentialSkills);

    const { uma } = buildCodeUma(code.uma1!);
    const goal = buildCodeGoal(code);

    expect(validate(code), JSON.stringify(validate.errors)).toBe(true);
    expect(uma.cardId).toBe(100601);
    expect(uma.fanCount).toBe(301830);
    expect(uma.trainee).toMatchObject({
      speed: '1588',
      wisdom: '1259',
      runningStyle: 'Senko',
      motivation: '5',
      distanceAptitudes: ['S', 'A', 'A', 'B'],
      styleAptitudes: ['F', 'A', 'A', 'D'],
      groundAptitudes: ['A', 'B']
    });
    expect(uma.skills).toEqual([
      { skillId: 100061, level: 5 },
      { skillId: 200042, level: 1 }
    ]);
    expect(goal.sp).toBe(2984);
  });

  it('offers every hinted skill at its hint level, but none she owns and no negative rank', async () => {
    const code = await decodeBuildImport(JSON.stringify(umaExporter), catalog, noPotentialSkills);

    const offers = buildCodeOffers(code, [100061, 200042]);

    expect(offers).toEqual([
      { skillId: 200041, hint: 4 },
      { skillId: 200331, hint: 3 },
      { skillId: 200332, hint: 2 },
      { skillId: 201662, hint: 1 },
      { skillId: 900371, hint: 5 }
    ]);
  });

  it('loads a final turn without hints or fans as her build with nothing on offer', async () => {
    const { fans: _fans, skill_tips_array: _hints, ...bare } = charaInfo;

    const code = await decodeBuildImport(
      JSON.stringify({ data: { chara_info: bare } }),
      catalog,
      noPotentialSkills
    );

    expect(validate(code), JSON.stringify(validate.errors)).toBe(true);
    expect(code.uma1?.fans).toBeUndefined();
    expect(code.uma1?.sp).toBe(2984);
    expect(buildCodeOffers(code, [100061, 200042])).toEqual([]);
  });

  it('offers the skills her potential level unlocks, without a hint unless she has one', async () => {
    const atLevelTwo = { data: { chara_info: { ...charaInfo, talent_level: 2 } } };

    const code = await decodeBuildImport(JSON.stringify(atLevelTwo), catalog, loadPotentialSkills);
    const offers = buildCodeOffers(code, [100061, 200042]);

    expect(validateFinalTurn(atLevelTwo), JSON.stringify(validateFinalTurn.errors)).toBe(true);
    expect(offers).toContainEqual({ skillId: 200512, hint: 0 });
    expect(offers).toContainEqual({ skillId: 200162, hint: 0 });
    expect(offers).toContainEqual({ skillId: 200041, hint: 4 });
    expect(offers.map((offer) => offer.skillId)).not.toContain(201351);
  });

  it('offers her card’s starting skills when the turn names no potential level', async () => {
    const code = await decodeBuildImport(JSON.stringify(umaExporter), catalog, loadPotentialSkills);

    const offered = buildCodeOffers(code, [100061, 200042]).map((offer) => offer.skillId);

    expect(offered).toContain(200512);
    expect(offered).not.toContain(200162);
  });

  it('reads anything else as a build code', async () => {
    await expect(decodeBuildImport('{"data":{}}', catalog)).rejects.toThrow('no runner');
    await expect(decodeBuildImport('{"chara_info":', catalog)).rejects.toThrow('cut off');
  });
});
