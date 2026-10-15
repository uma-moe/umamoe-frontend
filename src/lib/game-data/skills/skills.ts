import { resourceCache } from '@/services/resources/resource-cache';

export interface SkillData {
  skill_id: number;
  name: string;
  rarity: number;
  icon: string;
  baseCost?: number;
  effect?: string;
  description?: string;
  conditions?: string;
  unique?: boolean;
  inherited?: boolean;
}

let skillsPromise: Promise<Map<number, SkillData>> | undefined;
resourceCache.onUpdate((name) => {
  if (name === 'skills') skillsPromise = undefined;
});

export function skillImage(icon: string | undefined): string | undefined {
  return icon ? `/assets/images/skills/${icon.replace(/\.png$/i, '.webp')}` : undefined;
}

export function normalizeSkill(entry: Record<string, unknown>): SkillData {
  const description = typeof entry.description === 'string' ? entry.description : '';
  return {
    skill_id: Number(entry.skill_id ?? 0),
    rarity: Number(entry.rarity ?? 0),
    name: typeof entry.name === 'string' ? entry.name : '',
    icon: typeof entry.icon === 'string' ? entry.icon : '',
    effect: typeof entry.effect === 'string' ? entry.effect : '',
    conditions: typeof entry.conditions === 'string' ? entry.conditions : '',
    description,
    baseCost:
      entry.base_cost != null &&
      Number.isFinite(Number(entry.base_cost)) &&
      Number(entry.base_cost) >= 0
        ? Number(entry.base_cost)
        : undefined,
    unique:
      entry.unique === true ||
      entry.unique === 'true' ||
      /Rarity:\s*(?:Upgraded\s+)?Unique/i.test(description) ||
      (/Rarity:/i.test(description) &&
        Array.isArray(entry.other_versions) &&
        entry.other_versions.some(
          (version) => typeof version === 'string' && /when inherited/i.test(version)
        )),
    inherited: entry.inherited === true || entry.inherited === 'true'
  };
}

export function skillRarity(
  skill: SkillData | undefined,
  inherited: boolean
): 'normal' | 'gold' | 'special' | 'unique-inherited' | 'unique-main' {
  if (skill?.unique || skill?.rarity === 4) return inherited ? 'unique-inherited' : 'unique-main';
  return skill?.rarity === 3 ? 'special' : skill?.rarity === 2 ? 'gold' : 'normal';
}

export function loadSkills(): Promise<Map<number, SkillData>> {
  skillsPromise ??= resourceCache
    .load<Record<string, unknown>[]>('skills')
    .then((data) => {
      const entries = data.map(normalizeSkill);
      return new Map(
        entries
          .filter((entry) => Number.isFinite(entry.skill_id) && entry.skill_id > 0)
          .map((entry) => [entry.skill_id, entry])
      );
    })
    .catch((error) => {
      skillsPromise = undefined;
      throw error;
    });

  return skillsPromise;
}

export function resolveEncodedSkill(
  skills: Map<number, SkillData>,
  encodedId: number
): { skill?: SkillData; level: number; inherited: boolean } {
  const direct = skills.get(encodedId);
  if (direct)
    return {
      skill: direct,
      level: Math.max(1, encodedId % 10 || 1),
      inherited: Boolean(direct.inherited)
    };

  const directInherited = encodedId >= 900000 && encodedId < 1000000;
  const baseId = directInherited ? encodedId : Math.floor(encodedId / 10);
  if (String(baseId).startsWith('9')) {
    const rest = String(baseId).slice(1);
    for (const prefix of ['1', '2', '3']) {
      const skill = skills.get(Number(prefix + rest));
      if (skill)
        return {
          skill,
          level: directInherited ? 1 : Math.max(1, encodedId % 10 || 1),
          inherited: true
        };
    }
  }

  const skill = skills.get(baseId);
  return { skill, level: Math.max(1, encodedId % 10 || 1), inherited: Boolean(skill?.inherited) };
}

export function sortEncodedSkills(skills: Map<number, SkillData>, ids: number[]): number[] {
  function bucket(skill: SkillData | undefined, inherited: boolean): number {
    if (!skill) return 99;
    if (skill.unique || skill.rarity === 4) return inherited ? 1 : 0;
    const text = [skill.name, skill.effect, skill.description, skill.conditions, skill.icon]
      .join(' ')
      .toLowerCase();

    const type =
      /speed down|decrease(?:s|d)? .*speed|lower(?:s|ed)? .*speed|slow(?:s|ed)?|hesitat|intimidat|disorient|drain|debuff|fatigue.*(?:opponent|enemy|rival)|(?:opponent|enemy|rival).*fatigue/.test(
        text
      )
        ? 2
        : /stamina recovery|recover(?:s|ed)? stamina|recover endurance|restore(?:s|d)? stamina|regain|decrease fatigue|reduce fatigue|harder to tire/.test(
              text
            )
          ? 1
          : /speed|velocity|target speed|current speed/.test(text)
            ? 0
            : 3;

    return (skill.rarity === 2 ? 2 : 6) + type;
  }

  return ids
    .map((id) => {
      const { skill, inherited } = resolveEncodedSkill(skills, id);
      return {
        id,
        bucket: bucket(skill, inherited),
        cost: inherited ? 200 : (skill?.baseCost ?? -1)
      };
    })
    .sort((a, b) => a.bucket - b.bucket || b.cost - a.cost)
    .map(({ id }) => id);
}

/** Base purchase cost, including prerequisite skills, before hint discounts. */
export function skillPointTotal(
  skills: Map<number, SkillData>,
  encodedIds: number[]
): number | null {
  const costs = new Map<number, number>();
  for (const encoded of encodedIds) {
    const { skill, inherited } = resolveEncodedSkill(skills, encoded);
    if (!skill) return null;
    if (skill.unique) {
      // Hakuraku's SingleModeSkillNeedPoint master data gives inherited uniques a 200 SP base cost.
      // https://github.com/ayaliz/hakuraku/blob/main/public/data/umdb.binarypb.gz
      if (inherited) costs.set(Number('9' + String(skill.skill_id).slice(1)), 200);
      continue;
    }

    if (skill.baseCost == null) return null;
    costs.set(skill.skill_id, skill.baseCost);
    const paired = skills.get(skill.skill_id % 10 === 1 ? skill.skill_id + 1 : skill.skill_id - 1);
    if (
      paired &&
      (skill.rarity === 2 ||
        (skill.rarity === 1 && skill.name.endsWith('◎') && paired.name.endsWith('○')))
    ) {
      if (paired.baseCost == null) return null;
      costs.set(paired.skill_id, paired.baseCost);
    }
  }

  return [...costs.values()].reduce((sum, cost) => sum + cost, 0);
}
