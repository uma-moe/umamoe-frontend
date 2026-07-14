import { getSkillName } from '../pages/profile/profile-helpers';
import { getAllSkills, getSkillBySkillId, replaceSkillsData } from './skills.data';

describe('skills master-data replacement', () => {
  const originalSkills = getAllSkills().map(skill => ({ ...skill }));

  afterEach(() => {
    replaceSkillsData(originalSkills);
  });

  it('keeps bundled skill lookups when a resource refresh is empty', () => {
    expect(getSkillName(1003812)).toBe('#LookatCurren');

    replaceSkillsData([]);

    expect(getSkillName(1003812)).toBe('#LookatCurren');
    expect(getSkillName(2006511)).toBe('Turbo Sprint');
  });

  it('uses resource entries without dropping bundled-only skills', () => {
    replaceSkillsData([{
      skill_id: 100381,
      name: 'Resource Curren Skill',
      rarity: 5,
      icon: 'utx_ico_skill_20013.webp',
    }]);

    expect(getSkillName(1003812)).toBe('Resource Curren Skill');
    expect(getSkillName(2006511)).toBe('Turbo Sprint');
    expect(getSkillBySkillId(200651)).toBeDefined();
  });
});
