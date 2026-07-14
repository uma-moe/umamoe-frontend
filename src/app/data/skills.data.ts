// Skills master data
// This file contains all skill information bundled with the application
// Data is imported at build time, so it doesn't appear in network requests
import skillsData from '../../data/skills.json';
import { Skill } from '../models/skill.model';

type SkillRecord = Partial<Skill> & Record<string, unknown>;

const INCREMENTAL_SKILL_COLLECTION_KEYS = [
  'skills',
  'data',
  'items',
  'records',
  'upserts',
  'added',
  'updated',
  'changed',
] as const;

function normalizeBooleanFlag(value: unknown): boolean {
  return value === true || value === 'true';
}

export function hasUniqueFlag(skill: Pick<Skill, 'unique'>): boolean {
  return skill.unique === true;
}

export function hasInheritedFlag(skill: Pick<Skill, 'inherited'>): boolean {
  return skill.inherited === true;
}

function isUniqueSkill(skill: SkillRecord): boolean {
  if (normalizeBooleanFlag(skill.unique)) return true;

  const description = skill.description ?? '';
  if (typeof description === 'string' && /Rarity:\s*(?:Upgraded\s+)?Unique/i.test(description)) return true;

  return Array.isArray(skill.other_versions)
    ? skill.other_versions.some(version => typeof version === 'string' && /when inherited/i.test(version)) && typeof description === 'string' && /Rarity:/i.test(description)
    : false;
}

function normalizeSkill(skill: SkillRecord): Skill {
  const normalized: Skill = {
    ...skill,
    id: typeof skill.id === 'string' ? skill.id : null,
    skill_id: typeof skill.skill_id === 'number' ? skill.skill_id : Number(skill.skill_id ?? 0),
    card_id: typeof skill.card_id === 'string' ? skill.card_id : null,
    rarity: typeof skill.rarity === 'number' ? skill.rarity : Number(skill.rarity ?? 0),
    name: typeof skill.name === 'string' ? skill.name : '',
    description: typeof skill.description === 'string' ? skill.description : '',
    activation: typeof skill.activation === 'string' ? skill.activation : '',
    base_cost: typeof skill.base_cost === 'number' ? skill.base_cost : Number(skill.base_cost ?? 0),
    base_duration: typeof skill.base_duration === 'string' ? skill.base_duration : '',
    effect: typeof skill.effect === 'string' ? skill.effect : '',
    conditions: typeof skill.conditions === 'string' ? skill.conditions : '',
    other_versions: Array.isArray(skill.other_versions) ? skill.other_versions.filter((version): version is string => typeof version === 'string') : [],
    support_card_ids: Array.isArray(skill.support_card_ids) ? skill.support_card_ids.filter((id): id is number => typeof id === 'number') : undefined,
    character_id: typeof skill.character_id === 'number' ? skill.character_id : undefined,
    icon: typeof skill.icon === 'string' ? skill.icon : '',
    unique: isUniqueSkill(skill),
    inherited: normalizeBooleanFlag(skill.inherited),
  };

  return normalized;
}

function normalizeSkillRecords(data: unknown): SkillRecord[] {
  if (Array.isArray(data)) {
    return data.filter(isSkillRecord);
  }

  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    const nestedRecords: SkillRecord[] = [];
    let foundCollection = false;

    for (const key of ['default', ...INCREMENTAL_SKILL_COLLECTION_KEYS]) {
      if (!(key in record)) {
        continue;
      }

      foundCollection = true;
      nestedRecords.push(...normalizeSkillRecords(record[key]));
    }

    if (foundCollection) {
      return nestedRecords;
    }

    return Object.values(record).filter(isSkillRecord);
  }

  return [];
}

function isSkillRecord(value: unknown): value is SkillRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

// Export the skills data with proper typing
function normalizeSkillsData(data: unknown): Skill[] {
  return normalizeSkillRecords(data)
    .map(normalizeSkill)
    .filter(skill => Number.isFinite(skill.skill_id) && skill.skill_id > 0);
}

const BUNDLED_SKILLS = normalizeSkillsData(skillsData);

export const SKILLS: Skill[] = [...BUNDLED_SKILLS];

// Pre-built lookup maps for O(1) access
const SKILL_BY_SKILL_ID = new Map<number, Skill>();
const SKILL_BY_ID = new Map<string, Skill>();

function rebuildSkillMaps(): void {
  SKILL_BY_SKILL_ID.clear();
  SKILL_BY_ID.clear();
  for (const skill of SKILLS) {
    SKILL_BY_SKILL_ID.set(skill.skill_id, skill);
    if (skill.id) SKILL_BY_ID.set(skill.id, skill);
  }
}

rebuildSkillMaps();

export function replaceSkillsData(data: unknown): Skill[] {
  const mergedById = new Map<number, Skill>();
  const skillOrder: number[] = [];

  for (const skill of BUNDLED_SKILLS) {
    mergedById.set(skill.skill_id, { ...skill });
    skillOrder.push(skill.skill_id);
  }

  for (const record of normalizeSkillRecords(data)) {
    const skillId = typeof record.skill_id === 'number'
      ? record.skill_id
      : Number(record.skill_id ?? 0);
    if (!Number.isFinite(skillId) || skillId <= 0) {
      continue;
    }

    const existing = mergedById.get(skillId);
    const normalized = normalizeSkill(existing ? { ...existing, ...record } : record);
    if (!mergedById.has(skillId)) {
      skillOrder.push(skillId);
    }
    mergedById.set(skillId, normalized);
  }

  SKILLS.splice(
    0,
    SKILLS.length,
    ...skillOrder.map(skillId => mergedById.get(skillId)!),
  );
  rebuildSkillMaps();
  return SKILLS;
}

// Export individual getters for convenience
export function getAllSkills(): Skill[] {
  return SKILLS;
}
export function getSkillById(id: string): Skill | undefined {
  return SKILL_BY_ID.get(id);
}
export function getSkillBySkillId(skillId: number): Skill | undefined {
  return SKILL_BY_SKILL_ID.get(skillId);
}
export function getSkillsByName(name: string): Skill[] {
  return SKILLS.filter(skill => 
    skill.name.toLowerCase().includes(name.toLowerCase())
  );
}
export function getSkillsByCharacter(characterId: number): Skill[] {
  return SKILLS.filter(skill => skill.character_id === characterId);
}
export function getUniqueSkills(): Skill[] {
  return SKILLS.filter(hasUniqueFlag);
}
