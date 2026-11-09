import { describe, expect, it } from 'vitest';
import { colourGrade, inkGrade } from './screenshot-grades';

describe('colourGrade', () => {
  it('names each grade by the tint measured from a Global details screen', () => {
    const measured = [
      { red: 210, green: 179, blue: 93 },
      { red: 218, green: 153, blue: 102 },
      { red: 217, green: 132, blue: 160 },
      { red: 141, green: 198, blue: 121 },
      { red: 191, green: 132, blue: 207 },
      { red: 160, green: 160, blue: 162 }
    ];

    const grades = measured.map(colourGrade);

    expect(grades).toEqual([8, 7, 6, 5, 3, 1]);
  });

  it('names D and F by the game’s palette', () => {
    expect(colourGrade({ red: 99, green: 186, blue: 247 })).toBe(4);
    expect(colourGrade({ red: 173, green: 151, blue: 252 })).toBe(2);
  });
});

describe('inkGrade', () => {
  const pink = { red: 217, green: 132, blue: 160 };
  const labelEdge = { red: 205, green: 165, blue: 140 };

  it('lets the letter’s own colour outvote the label edges beside it', () => {
    const colours = [
      ...Array<typeof pink>(40).fill(pink),
      ...Array<typeof pink>(12).fill(labelEdge)
    ];

    expect(inkGrade(colours)).toBe(6);
  });

  it('reads nothing from a few stray pixels', () => {
    expect(inkGrade([pink, pink])).toBeUndefined();
  });
});
