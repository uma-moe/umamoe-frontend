import { describe, expect, it } from 'vitest';
import type { SkillData } from '@/lib/game-data/skills/skills';
import type { SkillLine } from './screenshot-layout';
import { readSkillLines } from './screenshot-skills';
import { buildSkillNameIndex } from './skill-names';

const skills = new Map<number, SkillData>(
  [
    { skill_id: 202051, name: 'Unrestrained Front Runner Straightaways', rarity: 2, icon: '' },
    { skill_id: 200331, name: 'Professor of Curvature', rarity: 2, icon: '' },
    {
      skill_id: 100651,
      name: "Hands in the Air Like Ya Don't Care!",
      rarity: 5,
      unique: true,
      icon: ''
    }
  ].map((entry) => [entry.skill_id, entry])
);
const index = buildSkillNameIndex(skills);

function line(text: string, y: number, column: SkillLine['column'] = 'left'): SkillLine {
  const box = { x0: 0, y0: y, x1: text.length * 10, y1: y + 20 };
  return { text, box, column, words: [{ text, box }] };
}

const noCircle = () => undefined;

describe('readSkillLines', () => {
  it('joins a name that wraps onto a second line', () => {
    const lines = [
      line('Unrestrained Front Runner', 0),
      line('Straightaways', 24),
      line('Professor of Curvature', 80)
    ];

    const reading = readSkillLines(lines, index, noCircle);

    expect(reading.skills.map((skill) => skill.skillId)).toEqual([202051, 200331]);
  });

  it('joins a wrapped unique whose level reads as a line between its halves', () => {
    const lines = [
      line('Hands in the Air Like Ya', 0),
      line('Lvl 4', 12),
      line("Don't Care!", 24),
      line('Professor of Curvature', 120)
    ];

    const reading = readSkillLines(lines, index, noCircle);

    expect(reading.skills).toEqual([
      { skillId: 100651, level: 4 },
      { skillId: 200331, level: 1 }
    ]);
  });

  it('doesn’t join lines from different columns', () => {
    const lines = [line('Unrestrained Front Runner', 0), line('Straightaways', 24, 'right')];

    const reading = readSkillLines(lines, index, noCircle);

    expect(reading.skills).toEqual([]);
    expect(reading.choices[0]?.candidates[0]).toBe(202051);
  });

  it('doesn’t join a line whose skill the next line names by itself', () => {
    const lines = [
      line('Unrestrained Front Runner', 0, 'right'),
      line('Professor of Curvature', 24, 'right')
    ];

    const reading = readSkillLines(lines, index, noCircle);

    expect(reading.skills.map((skill) => skill.skillId)).toEqual([200331]);
    expect(reading.choices[0]?.candidates[0]).toBe(202051);
  });

  it('reads a skill shown twice only once', () => {
    const lines = [line('Professor of Curvature', 0), line('Professor of Curvature', 200, 'right')];

    expect(readSkillLines(lines, index, noCircle).skills).toHaveLength(1);
  });
});
