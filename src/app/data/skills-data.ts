import { Skill } from '../models/skill.model';
import {
  SKILLS,
  getAllSkills,
  getSkillBySkillId,
  getSkillsByCharacter,
  getUniqueSkills,
  replaceSkillsData
} from './skills.data';

export { SKILLS, getAllSkills, getSkillsByCharacter, getUniqueSkills, replaceSkillsData };

export function getSkillById(skillId: number): Skill | undefined {
  return getSkillBySkillId(skillId);
}

export function getSkillsByCardId(cardId: string): Skill[] {
  return SKILLS.filter(skill => skill.card_id === cardId);
}

export function searchSkills(query: string): Skill[] {
  const lowercaseQuery = query.toLowerCase();
  return SKILLS.filter(skill =>
    skill.name.toLowerCase().includes(lowercaseQuery) ||
    skill.description.toLowerCase().includes(lowercaseQuery) ||
    skill.effect.toLowerCase().includes(lowercaseQuery)
  );
}

export function searchUniqueSkills(query: string): Skill[] {
  const lowercaseQuery = query.toLowerCase();
  return SKILLS.filter(skill =>
    skill.unique === 'true' &&
    (skill.name.toLowerCase().includes(lowercaseQuery) ||
     skill.description.toLowerCase().includes(lowercaseQuery) ||
     skill.effect.toLowerCase().includes(lowercaseQuery))
  );
}
