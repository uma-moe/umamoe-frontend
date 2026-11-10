import { describe, expect, it } from 'vitest';
import type { Box } from './screenshot-pixels';
import {
  detailsCardArea,
  mostDigits,
  readScreenLayout,
  readStatValue,
  skillCell,
  skillColumns,
  type OcrLine,
  type OcrWord
} from './screenshot-layout';

/** Words laid out on one row, 20 px tall, each starting at its x. */
function row(y: number, words: [string, number][]): OcrLine {
  const entries: OcrWord[] = words.map(([text, x]) => ({
    text,
    box: { x0: x, y0: y, x1: x + text.length * 10, y1: y + 20 }
  }));
  return {
    text: words.map(([text]) => text).join(' '),
    words: entries,
    box: {
      x0: entries[0]!.box.x0,
      y0: y,
      x1: entries.at(-1)!.box.x1,
      y1: y + 20
    }
  };
}

/** The dark text of a details screen; the stats' white labels and the light grade letters don't show on it. */
const detailsScreen: OcrLine[] = [
  row(40, [
    ['[Special', 100],
    ['Dreamer]', 200],
    ['Special', 300],
    ['Week', 380]
  ]),
  row(232, [
    ['©1150', 100],
    ['812', 300]
  ]),
  row(300, [
    ['Track', 60],
    ['Turf', 200],
    ['A', 250],
    ['Dirt', 500],
    ['G', 550]
  ]),
  row(340, [
    ['Distance', 60],
    ['Sprint', 200],
    ['Mile', 400],
    ['Medium', 600],
    ['Long', 800]
  ]),
  row(380, [
    ['Style', 60],
    ['Front', 200],
    ['Pace', 400],
    ['Late', 600],
    ['End', 800]
  ]),
  // The two skill columns on one OCR line, as Tesseract joins them where rows line up.
  row(500, [
    ['Shooting', 120],
    ['Star', 210],
    ['Lvl', 260],
    ['3', 300],
    ['Corner', 560],
    ['Recovery', 630],
    ['O', 720]
  ]),
  row(540, [
    ['Long', 120],
    ['Shot', 170]
  ])
];

/** The cells under the stats panel's green strip, as the pixels show them. */
const statsPanel = { x0: 50, y0: 225, x1: 1050, y1: 290 };

describe('readScreenLayout', () => {
  const layout = readScreenLayout(detailsScreen, 1100, () => statsPanel);

  it('splits the stats panel into five cells, left to right', () => {
    const cells = layout.stats.map((stat) => [stat.key, stat.region.x0, stat.region.x1]);

    expect(cells).toEqual([
      ['speed', 50, 250],
      ['stamina', 250, 450],
      ['power', 450, 650],
      ['guts', 650, 850],
      ['wiz', 850, 1050]
    ]);
  });

  it('keeps what the page OCR read in each stat cell', () => {
    expect(layout.stats.map((stat) => stat.pageText)).toEqual(['©1150', '812', '', '', '']);
  });

  it('looks for the stats panel right above the aptitude grid', () => {
    const asked: Box[] = [];

    readScreenLayout(detailsScreen, 1100, (aptitudes) => {
      asked.push(aptitudes);
      return undefined;
    });

    expect(asked).toEqual([{ x0: 200, y0: 300, x1: 840, y1: 400 }]);
  });

  it('finds all ten aptitudes and looks for each grade from the end of its label', () => {
    expect(layout.aptitudes).toHaveLength(10);

    const turf = layout.aptitudes.find((aptitude) => aptitude.key === 'proper_ground_turf');
    expect(turf?.region).toMatchObject({ x0: 240, x1: 300 });
  });

  it('reaches back over a label whose box took in its grade', () => {
    const swallowed = detailsScreen.map((line) =>
      line.text.startsWith('Distance')
        ? row(340, [
            ['Distance', 60],
            ['Sprint', 200],
            ['Mile', 400],
            ['Medium.', 600],
            ['Long', 800]
          ])
        : line
    );

    const grades = readScreenLayout(swallowed, 1100, () => statsPanel).aptitudes;
    const medium = grades.find((grade) => grade.key === 'proper_distance_middle');

    expect(medium?.region.x0).toBe(650);
  });

  it('lets a row’s last grade reach past where the next row starts', () => {
    const dirt = layout.aptitudes.find((aptitude) => aptitude.key === 'proper_ground_dirt')!;

    expect(dirt.region.x1).toBeGreaterThan(dirt.region.x0 + 40);
  });

  it('looks for the grade of a label OCR misread in the same column of another row', () => {
    const misread = detailsScreen.map((line) =>
      line.text.startsWith('Track')
        ? row(300, [
            ['Track', 60],
            ['Turf', 200],
            ['A', 250],
            ['pit', 500],
            ['G', 550]
          ])
        : line
    );

    const grades = readScreenLayout(misread, 1100, () => statsPanel).aptitudes;
    const dirt = grades.find((grade) => grade.key === 'proper_ground_dirt');
    const mile = grades.find((grade) => grade.key === 'proper_distance_mile');

    expect(dirt?.region.x0).toBe(mile?.region.x0);
    expect(dirt?.region.y0).toBeLessThan(320);
  });

  it('splits the skill columns and keeps aptitude words out of the skills', () => {
    const skillLines = skillColumns(detailsScreen, layout.skillArea);

    expect(skillLines.map((line) => [line.column, line.text])).toEqual([
      ['left', 'Shooting Star Lvl 3'],
      ['left', 'Long Shot'],
      ['right', 'Corner Recovery O']
    ]);
  });

  it('leaves the scrollbar, read as one tall bracket, out of a skill line', () => {
    const scrollbar: OcrWord = { text: ']', box: { x0: 1030, y0: 480, x1: 1040, y1: 900 } };
    const lines = detailsScreen.map((line) =>
      line.text.startsWith('Shooting') ? { ...line, words: [...line.words, scrollbar] } : line
    );

    const skillLines = skillColumns(
      lines,
      readScreenLayout(lines, 1100, () => statsPanel).skillArea
    );
    const right = skillLines.find((line) => line.column === 'right');

    expect(right?.text).toBe('Corner Recovery O');
    expect(right?.box.y1).toBe(520);
  });

  it('keeps words beside the stats panel’s width out of the skills', () => {
    const lines = detailsScreen.map((line) =>
      line.text.startsWith('Long Shot')
        ? row(540, [
            ['Long', 120],
            ['Shot', 170],
            ['Menu', 1070]
          ])
        : line
    );

    const skillLines = skillColumns(lines, layout.skillArea);

    expect(skillLines.map((line) => line.text)).toEqual([
      'Shooting Star Lvl 3',
      'Long Shot',
      'Corner Recovery O'
    ]);
  });

  it('keeps the title above the stats', () => {
    expect(layout.titleLines).toEqual(['[Special Dreamer] Special Week']);
  });

  it('reads a screenshot without the aptitudes as more of the skill list', () => {
    const skillList = readScreenLayout(detailsScreen.slice(5), 1100);

    expect(skillList.kind).toBe('skillList');
    expect(skillList.stats).toEqual([]);
    const skillLines = skillColumns(detailsScreen.slice(5), skillList.skillArea);
    expect(skillLines.map((line) => [line.column, line.text])).toEqual([
      ['left', 'Shooting Star Lvl 3'],
      ['left', 'Long Shot'],
      ['right', 'Corner Recovery O']
    ]);
  });
});

/** What Tesseract read on a Global details screen: white stat labels on green, drawn grade letters, icon noise. */
const globalScreen: OcrLine[] = [
  row(803, [
    ['Speed', 120],
    ['Stamina', 330],
    ['Power', 560],
    ['Guts', 790]
  ]),
  row(884, [
    ['Ug1607', 60],
    ['[8', 290],
    ['634', 370],
    ['UB1244', 500],
    ['(8', 730],
    ['656', 820],
    ['(Ug', 940],
    ['1202', 1040]
  ]),
  row(1000, [
    ['Track', 120],
    ['Turf', 330],
    ['A', 440],
    ['Dirt', 540],
    ['©', 650]
  ]),
  row(1070, [
    ['Distance', 90],
    ['Sprint', 310],
    ['[8', 440],
    ['Mile', 540],
    ['§', 650],
    ['Medium', 720],
    ['Long', 960],
    ['[E', 1080]
  ]),
  row(1140, [
    ['Style', 120],
    ['Front', 320],
    ['A', 440],
    ['Pace', 540],
    ['A', 650],
    ['Late', 760],
    ['©', 860],
    ['End', 960],
    ['©', 1080]
  ]),
  row(1180, [
    ['pian', 560],
    ['Careerinfo', 880]
  ]),
  row(1360, [
    ['&', 70],
    ['Hands', 150],
    ['in', 220],
    ['Ya', 400],
    ['Victoria', 700],
    ['por', 800]
  ])
];

describe('readScreenLayout on a Global details screen', () => {
  const layout = readScreenLayout(globalScreen, 1200);

  it('places the Wit label OCR missed a column right of Guts', () => {
    const wit = layout.stats.find((stat) => stat.key === 'wiz');

    expect(wit?.pageText).toBe('(Ug 1202');
  });

  it('splits the numbers above the aptitudes into the five stats when OCR missed every label', () => {
    const unlabelled = readScreenLayout(globalScreen.slice(1), 1200);

    expect(unlabelled.kind).toBe('details');
    expect(unlabelled.stats.map((stat) => [stat.key, stat.pageText])).toEqual([
      ['speed', 'Ug1607'],
      ['stamina', '[8 634'],
      ['power', 'UB1244'],
      ['guts', '(8 656'],
      ['wiz', '(Ug 1202']
    ]);
  });

  it('starts the skills below the tabs and splits the columns under the middle stat', () => {
    const skillLines = skillColumns(globalScreen, layout.skillArea);

    expect(skillLines.map((line) => [line.column, line.text])).toEqual([
      ['left', '& Hands in Ya'],
      ['right', 'Victoria por']
    ]);
  });
});

describe('detailsCardArea', () => {
  it('crops a desktop capture to the card around its stats panel', () => {
    const capture = { width: 2000, height: 1125 };
    const layout = readScreenLayout(detailsScreen, capture.width, () => statsPanel);

    expect(detailsCardArea(layout, capture)).toEqual({ x0: 20, y0: 0, x1: 1080, y1: 1125 });
  });

  it('leaves a screenshot of the card alone', () => {
    const screenshot = { width: 1100, height: 2000 };
    const layout = readScreenLayout(detailsScreen, screenshot.width, () => statsPanel);

    expect(detailsCardArea(layout, screenshot)).toBeUndefined();
  });
});

describe('skillCell', () => {
  const area = { top: 0, split: 550, x0: 50, x1: 1050 };

  it('reaches from just before a line to its column’s edge, a little above and below it', () => {
    const [left, right] = skillColumns(
      [
        row(540, [
          ['Long', 120],
          ['Shot', 170],
          ['Groundwork', 600]
        ])
      ],
      area
    );

    expect(skillCell(left!, area)).toEqual({ x0: 100, y0: 516, x1: 550, y1: 584 });
    expect(skillCell(right!, area)).toEqual({ x0: 580, y0: 516, x1: 1050, y1: 584 });
  });
});

describe('readStatValue', () => {
  it('reads the number and drops a rank badge read as digits', () => {
    expect(readStatValue('1150')).toBe(1150);
    expect(readStatValue('8 1150')).toBe(1150);
    expect(readStatValue('91150')).toBe(1150);
    expect(readStatValue('742')).toBe(742);
    expect(readStatValue('')).toBeUndefined();
  });

  it('turns down a number too low for a stat, so its column is read again', () => {
    expect(readStatValue('Ugie07')).toBeUndefined();
    expect(readStatValue('[8')).toBeUndefined();
    expect(readStatValue('034')).toBeUndefined();
  });

  it('reads a 1 OCR wrote as a thin letter beside the other digits', () => {
    expect(readStatValue('(gl202')).toBe(1202);
    expect(readStatValue('|634')).toBe(634);
  });
});

describe('mostDigits', () => {
  it('keeps the reading that didn’t drop a digit', () => {
    expect(mostDigits([98, 989])).toBe(989);
    expect(mostDigits([1331, 133])).toBe(1331);
  });

  it('keeps the first reading when they agree in length, and skips failed ones', () => {
    expect(mostDigits([650, 656])).toBe(650);
    expect(mostDigits([undefined, 581])).toBe(581);
    expect(mostDigits([undefined, undefined])).toBeUndefined();
  });
});
