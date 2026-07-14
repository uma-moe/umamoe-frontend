import { getSkillName } from '../pages/profile/profile-helpers';
import { getSkillBySkillId, replaceSkillsData } from './skills.data';

describe('skill master data', () => {
  afterEach(() => {
    replaceSkillsData([]);
  });

  it('keeps bundled skills when an incremental resource is empty', () => {
    replaceSkillsData([]);

    expect(getSkillName(1003812)).toBe('#LookatCurren');
    expect(getSkillName(1004111)).toBe('Genius x Bakushin = Victory');
    expect(getSkillName(106112)).toBe('Call Me King');
    expect(getSkillName(9000211)).toBe('The View from the Lead Is Mine!');
    expect(getSkillName(9002711)).toBe("Let's Pump Some Iron!");
    expect(getSkillName(9000411)).toBe('Red Shift/LP1211-M');
  });

  it('merges incremental skill records over the bundled catalog', () => {
    const bundledIcon = getSkillBySkillId(100381)?.icon;

    replaceSkillsData({
      upserts: [{ skill_id: 100381, name: 'Updated Curren Skill' }],
    });

    expect(getSkillBySkillId(100381)?.name).toBe('Updated Curren Skill');
    expect(getSkillBySkillId(100381)?.icon).toBe(bundledIcon);
    expect(getSkillBySkillId(100411)?.name).toBe('Genius x Bakushin = Victory');
  });
});
