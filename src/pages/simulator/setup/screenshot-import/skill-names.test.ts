import { describe, expect, it } from 'vitest';
import type { SkillData } from '@/lib/game-data/skills/skills';
import { buildSkillNameIndex, matchSkillLine, readSkillText } from './skill-names';

const skill = (skill_id: number, name: string, overrides: Partial<SkillData> = {}): SkillData => ({
  skill_id,
  name,
  rarity: 1,
  icon: '',
  ...overrides
});

const skills = new Map(
  [
    skill(200011, 'Right-Handed ○'),
    skill(200012, 'Right-Handed ◎'),
    skill(200013, 'Right-Handed ×'),
    skill(201351, 'Corner Recovery ○'),
    skill(200331, 'Professor of Curvature', { rarity: 2 }),
    skill(100011, 'Shooting Star', { rarity: 5, unique: true }),
    skill(900011, 'Shooting Star', { inherited: true }),
    skill(201601, 'Swinging Maestro', { rarity: 2 }),
    skill(201602, 'Swinging Master', { rarity: 2 })
  ].map((entry) => [entry.skill_id, entry])
);
const index = buildSkillNameIndex(skills);

describe('readSkillText', () => {
  it('splits off a unique’s level and a trailing mark', () => {
    expect(readSkillText('Shooting Star Lvl 3')).toEqual({
      key: 'shootingstar',
      level: 3,
      mark: undefined
    });
    expect(readSkillText('Right-Handed O').mark).toBe('circle');
    expect(readSkillText('Right-Handed ◎').mark).toBe('◎');
    expect(readSkillText('Right-Handed x').mark).toBe('×');
  });

  it('keeps a level suffix OCR mangled', () => {
    expect(readSkillText('Shooting Star Lv| 4').level).toBe(4);
    expect(readSkillText('Shooting Star Lol 4').level).toBe(4);
    expect(readSkillText('Shooting Star Wl 4').level).toBe(4);
    expect(readSkillText('Shooting Star Lyl 6').level).toBe(6);
    expect(readSkillText('Shooting Star Lvl4').level).toBe(4);
  });

  it('finds the level where a wrapped name puts it mid-line', () => {
    expect(readSkillText('Shooting Lvl 4 Star')).toMatchObject({ key: 'shootingstar', level: 4 });
  });

  it('reads a ring OCR wrote as two letters as a circle', () => {
    expect(readSkillText('Right-Handed Oo').mark).toBe('circle');
  });
});

describe('matchSkillLine', () => {
  it('reads a close match as the skill', () => {
    expect(matchSkillLine(index, 'Professor of Curvalure')).toMatchObject({
      kind: 'skill',
      skillId: 200331
    });
  });

  it('uses the mark read from the glyph’s pixels', () => {
    expect(matchSkillLine(index, 'Right-Handed O', () => '◎')).toMatchObject({ skillId: 200012 });
    expect(matchSkillLine(index, 'Right-Handed O', () => '○')).toMatchObject({ skillId: 200011 });
  });

  it('asks when OCR saw a circle but its pixels didn’t say which', () => {
    const match = matchSkillLine(index, 'Right-Handed O');

    expect(match.kind).toBe('choice');
    expect(match.kind === 'choice' && match.candidates.slice(0, 2)).toEqual([200011, 200012]);
  });

  it('reads a unique with its level as her own, and without it as the inherited copy', () => {
    expect(matchSkillLine(index, 'Shooting Star Lvl 3')).toEqual({
      kind: 'skill',
      skillId: 100011,
      level: 3,
      score: 1
    });
    expect(matchSkillLine(index, 'Shooting Star')).toMatchObject({ skillId: 900011, level: 1 });
  });

  it('offers the nearest names for a loose match', () => {
    const match = matchSkillLine(index, 'Swinging Mast');

    expect(match.kind).toBe('choice');
    expect(match.kind === 'choice' && match.candidates).toEqual(
      expect.arrayContaining([201601, 201602])
    );
  });

  it('drops skill icons and card frames OCR read around the name', () => {
    expect(matchSkillLine(index, '£3 Professor of Curvature ]')).toMatchObject({ skillId: 200331 });
    expect(matchSkillLine(index, '| [] ween 3 Professor of Curvature')).toMatchObject({
      skillId: 200331
    });
  });

  it('reads the ring from the mark’s own word when stray words follow it', () => {
    const asked: number[] = [];
    const match = matchSkillLine(index, '] @ Right-Handed O J', (word) => {
      asked.push(word);
      return '○';
    });

    expect(match).toMatchObject({ skillId: 200011 });
    expect(asked).toEqual([3]);
  });

  it('ignores text that names no skill', () => {
    expect(matchSkillLine(index, 'Inspiration').kind).toBe('none');
    expect(matchSkillLine(index, 'OK').kind).toBe('none');
    const short = buildSkillNameIndex(new Map([[200999, skill(200999, 'Win Q.E.D.')]]));
    expect(matchSkillLine(short, 'wind').kind).toBe('none');
  });

  it('leaves out skills not released on Global', () => {
    const released = buildSkillNameIndex(skills, new Set([201601]));

    expect(matchSkillLine(released, 'Swinging Mast')).toMatchObject({
      kind: 'choice',
      candidates: [201601]
    });
  });
});
