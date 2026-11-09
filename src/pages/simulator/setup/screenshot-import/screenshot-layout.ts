import { boxHeight, type Box } from './screenshot-pixels';
import { similarity, textKey } from './skill-names';

export interface OcrWord {
  text: string;
  box: Box;
}

export interface OcrLine {
  text: string;
  box: Box;
  words: OcrWord[];
}

export type StatKey = 'speed' | 'stamina' | 'power' | 'guts' | 'wiz';

export type AptitudeKey =
  | 'proper_ground_turf'
  | 'proper_ground_dirt'
  | 'proper_distance_short'
  | 'proper_distance_mile'
  | 'proper_distance_middle'
  | 'proper_distance_long'
  | 'proper_running_style_nige'
  | 'proper_running_style_senko'
  | 'proper_running_style_sashi'
  | 'proper_running_style_oikomi';

interface Label<Key> {
  key: Key;
  /** The words the game prints for it; any one of them finds the label. */
  words: string[];
}

/** The stats in the order the details screen shows them, left to right. */
export const STAT_KEYS: StatKey[] = ['speed', 'stamina', 'power', 'guts', 'wiz'];

const TRACK_LABELS: Label<AptitudeKey>[] = [
  { key: 'proper_ground_turf', words: ['turf'] },
  { key: 'proper_ground_dirt', words: ['dirt'] }
];

const DISTANCE_LABELS: Label<AptitudeKey>[] = [
  { key: 'proper_distance_short', words: ['sprint', 'short'] },
  { key: 'proper_distance_mile', words: ['mile'] },
  { key: 'proper_distance_middle', words: ['medium', 'middle'] },
  { key: 'proper_distance_long', words: ['long'] }
];

const STYLE_LABELS: Label<AptitudeKey>[] = [
  { key: 'proper_running_style_nige', words: ['front', 'runner'] },
  { key: 'proper_running_style_senko', words: ['pace', 'chaser'] },
  { key: 'proper_running_style_sashi', words: ['late', 'surger'] },
  { key: 'proper_running_style_oikomi', words: ['end', 'closer'] }
];

/** The tabs between the aptitudes and the skill list. */
const TAB_LABELS: Label<string>[] = [
  { key: 'skills', words: ['skills'] },
  { key: 'inspiration', words: ['inspiration'] },
  { key: 'career', words: ['career', 'careerinfo'] }
];

/** The details screen's three aptitude rows, top to bottom. */
export const APTITUDE_ROWS = [TRACK_LABELS, DISTANCE_LABELS, STYLE_LABELS];

export interface LabelledRegion<Key> {
  key: Key;
  /** The stat's cell in the stats panel. */
  region: Box;
  /** What the page's own OCR read there, which usually settles the value without reading it again. */
  pageText: string;
}

export interface GradeRegion {
  key: AptitudeKey;
  region: Box;
}

export interface SkillLine {
  text: string;
  box: Box;
  words: OcrWord[];
  column: 'left' | 'right';
}

/** Where the skill list sits: below `top`, its two columns either side of `split`. */
export interface SkillArea {
  top: number;
  split: number;
}

export interface ScreenLayout {
  /** The top of the details screen, or a screenshot further down its skill list with only skills on it. */
  kind: 'details' | 'skillList';
  stats: LabelledRegion<StatKey>[];
  aptitudes: GradeRegion[];
  skillArea: SkillArea;
  /** Text above the stats, where the screen names the Uma and her outfit. */
  titleLines: string[];
}

/** A grade letter and the gap before it span about this many label heights. */
const GRADE_WIDTH_HEIGHTS = 4;
const GRADE_OVERLAP_HEIGHTS = 1;
/** A grade letter stands a little taller than its label; the next row's letters start not much further away. */
const GRADE_HALF_HEIGHTS = 1;
/** The tabs sit right under the aptitudes, within this many label heights. */
const TAB_SEARCH_HEIGHTS = 4;
/** Two aptitude rows are enough to tell the details screen. */
const MIN_APTITUDE_ROWS = 2;
/** No trained Uma has a stat this low; a lower number is a rank badge or a misread. */
const MIN_STAT_VALUE = 30;
const MAX_STAT_VALUE = 2000;
/** A word this many times taller than the rest of its line isn't text. */
const MAX_WORD_HEIGHTS = 2;
/** Label words may be a letter off. */
const LABEL_SIMILARITY = 0.75;

interface FoundLabel<Key> {
  key: Key;
  box: Box;
}

interface LabelRow<Key> {
  found: FoundLabel<Key>[];
  words: OcrWord[];
}

function centreX(box: Box): number {
  return (box.x0 + box.x1) / 2;
}

function centreY(box: Box): number {
  return (box.y0 + box.y1) / 2;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function isLabelWord(text: string, label: Label<unknown>): boolean {
  const key = textKey(text);
  if (!key) return false;

  return label.words.some((word) =>
    word.length <= 4 ? key === word : similarity(key, word) >= LABEL_SIMILARITY
  );
}

/** Words that share a row: their middles sit within half a word height of each other. */
function wordRows(lines: OcrLine[]): OcrWord[][] {
  const words = lines
    .flatMap((line) => line.words)
    .filter((word) => textKey(word.text))
    .sort((a, b) => centreY(a.box) - centreY(b.box));
  const rows: OcrWord[][] = [];

  for (const word of words) {
    const row = rows.at(-1);
    const rowCentre = row ? median(row.map((entry) => centreY(entry.box))) : 0;
    if (row && Math.abs(centreY(word.box) - rowCentre) <= boxHeight(word.box) / 2) row.push(word);
    else rows.push([word]);
  }

  return rows.map((row) => row.sort((a, b) => a.box.x0 - b.box.x0));
}

/** The labels found in a row, left to right as the screen prints them, or none when the order breaks. */
function labelsInRow<Key>(row: OcrWord[], labels: Label<Key>[]): FoundLabel<Key>[] {
  const found: FoundLabel<Key>[] = [];
  let next = 0;

  for (const word of row) {
    const index = labels.findIndex(
      (label, position) => position >= next && isLabelWord(word.text, label)
    );
    if (index < 0) continue;

    found.push({ key: labels[index]!.key, box: word.box });
    next = index + 1;
  }

  return found;
}

/** The first row between `below` and `above` that holds at least `minimum` of the labels in order. */
function findLabelRow<Key>(
  rows: OcrWord[][],
  labels: Label<Key>[],
  { minimum, below, above = Infinity }: { minimum: number; below: number; above?: number }
): LabelRow<Key> | undefined {
  for (const row of rows) {
    const middle = centreY(row[0]!.box);
    if (middle <= below || middle >= above) continue;

    const found = labelsInRow(row, labels);
    if (found.length >= minimum) return { found, words: row };
  }

  return undefined;
}

const rowTop = (row: LabelRow<unknown>) => Math.min(...row.found.map((label) => label.box.y0));
const rowBottom = (row: LabelRow<unknown>) => Math.max(...row.found.map((label) => label.box.y1));

function wordsIn(words: OcrWord[], region: Box): string {
  return words
    .filter((word) => {
      const x = centreX(word.box);
      const y = centreY(word.box);
      return x >= region.x0 && x < region.x1 && y >= region.y0 && y < region.y1;
    })
    .map((word) => word.text)
    .join(' ');
}

interface AptitudeRow {
  labels: Label<AptitudeKey>[];
  row: LabelRow<AptitudeKey>;
}

/** Where a grade letter sits: right of its label, short of the next one. */
function regionRightOf(
  label: FoundLabel<AptitudeKey>,
  next: FoundLabel<AptitudeKey> | undefined
): Box {
  const height = boxHeight(label.box);
  // OCR's box for a label can swallow a grade printed tight against it, as Medium's is.
  const start = label.box.x1 - height * GRADE_OVERLAP_HEIGHTS;

  return {
    x0: start,
    x1: Math.min(start + height * GRADE_WIDTH_HEIGHTS, next?.box.x0 ?? Infinity),
    y0: centreY(label.box) - height * GRADE_HALF_HEIGHTS,
    y1: centreY(label.box) + height * GRADE_HALF_HEIGHTS
  };
}

/**
 * The grade letters' regions, right of each aptitude label. The rows' cells line up, so the grade of a label OCR
 * missed is looked for in the same column as another row's.
 */
function aptitudeRegions(rows: AptitudeRow[]): GradeRegion[] {
  const regions = rows.map(({ labels, row }) =>
    labels.map(({ key }) => {
      const position = row.found.findIndex((label) => label.key === key);
      return position < 0
        ? undefined
        : regionRightOf(row.found[position]!, row.found[position + 1]);
    })
  );
  const columns: (Box | undefined)[] = [];
  for (const rowRegions of regions) {
    rowRegions.forEach((region, index) => {
      columns[index] ??= region;
    });
  }

  return rows.flatMap(({ labels, row }, rowIndex) => {
    const middle = median(row.found.map((label) => centreY(label.box)));

    return labels.flatMap(({ key }, index): GradeRegion[] => {
      const region = regions[rowIndex]![index];
      if (region) return [{ key, region }];

      const column = columns[index];
      if (!column) return [];

      const half = boxHeight(column) / 2;
      return [{ key, region: { ...column, y0: middle - half, y1: middle + half } }];
    });
  });
}

/** A line's words on one side of the split, joined back into a line. */
function columnLine(lineWords: OcrWord[], column: SkillLine['column']): SkillLine | undefined {
  // The list's scrollbar reads as a bracket as tall as the list; it would stretch the line over the ones below.
  const height = median(lineWords.map((word) => boxHeight(word.box)));
  const words = lineWords.filter((word) => boxHeight(word.box) <= height * MAX_WORD_HEIGHTS);
  if (!words.length) return undefined;

  return {
    text: words.map((word) => word.text).join(' '),
    words,
    column,
    box: {
      x0: Math.min(...words.map((word) => word.box.x0)),
      y0: Math.min(...words.map((word) => word.box.y0)),
      x1: Math.max(...words.map((word) => word.box.x1)),
      y1: Math.max(...words.map((word) => word.box.y1))
    }
  };
}

/**
 * The skill list's lines, left column first. Tesseract can join the two columns into one line where their rows line
 * up, so each line is split at the middle of the card by its words.
 */
export function skillColumns(lines: OcrLine[], { top, split }: SkillArea): SkillLine[] {
  const columns: Record<SkillLine['column'], SkillLine[]> = { left: [], right: [] };

  for (const line of lines) {
    if (centreY(line.box) <= top) continue;

    const left = columnLine(
      line.words.filter((word) => centreX(word.box) < split),
      'left'
    );
    const right = columnLine(
      line.words.filter((word) => centreX(word.box) >= split),
      'right'
    );
    if (left) columns.left.push(left);
    if (right) columns.right.push(right);
  }

  const byTop = (a: SkillLine, b: SkillLine) => a.box.y0 - b.box.y0;
  return [...columns.left.sort(byTop), ...columns.right.sort(byTop)];
}

/** The aptitude rows below `below`: Track, Distance and Style, each found by its grade labels. */
function findAptitudeRows(rows: OcrWord[][], below: number): AptitudeRow[] {
  const distance = findLabelRow(rows, DISTANCE_LABELS, { minimum: 2, below });
  // Turf and Dirt are only two words, so one is enough between the stats and the distances.
  const track = findLabelRow(rows, TRACK_LABELS, {
    minimum: distance ? 1 : 2,
    below,
    above: distance ? rowTop(distance) : Infinity
  });
  const style = findLabelRow(rows, STYLE_LABELS, {
    minimum: 2,
    below: distance ? rowBottom(distance) : below
  });

  return [
    { labels: TRACK_LABELS, row: track },
    { labels: DISTANCE_LABELS, row: distance },
    { labels: STYLE_LABELS, row: style }
  ].filter((entry): entry is AptitudeRow => entry.row !== undefined);
}

/**
 * The panel the stats' numbers sit in when the screenshot's pixels didn't show it: the row of digits right above the
 * aptitudes, as far as OCR read it.
 */
function numbersPanel(rows: OcrWord[][], aptitudesTop: number): Box | undefined {
  const numbersRow = rows
    .filter((row) => centreY(row[0]!.box) < aptitudesTop)
    .findLast((row) => row.some((word) => /\d/.test(word.text)));
  if (!numbersRow) return undefined;

  return {
    x0: Math.min(...numbersRow.map((word) => word.box.x0)),
    y0: Math.min(...numbersRow.map((word) => word.box.y0)),
    x1: Math.max(...numbersRow.map((word) => word.box.x1)),
    y1: Math.max(...numbersRow.map((word) => word.box.y1))
  };
}

/** The panel's five equal cells, one per stat, with the words OCR read in each. */
function statCells(rows: OcrWord[][], panel: Box): LabelledRegion<StatKey>[] {
  const words = rows.flat();
  const column = (panel.x1 - panel.x0) / STAT_KEYS.length;

  return STAT_KEYS.map((key, index) => {
    const region = { ...panel, x0: panel.x0 + column * index, x1: panel.x0 + column * (index + 1) };
    return { key, region, pageText: wordsIn(words, region) };
  });
}

/** Finds the stats panel above the aptitudes from the screenshot's pixels. */
export type StatsPanelFinder = (aptitudesTop: number) => Box | undefined;

/**
 * Finds the parts of the Uma details screen in its OCR text: the three aptitude rows by their labels, the stats panel
 * above them, and the skill list under the tabs. The stats' labels are white on green and don't survive the dark-text
 * page, so the panel comes from the pixels when `findStatsPanel` sees it, and from the row of numbers otherwise.
 * Without aptitudes the screenshot is read as the skill list scrolled further down, split at its middle.
 */
export function readScreenLayout(
  lines: OcrLine[],
  width: number,
  findStatsPanel?: StatsPanelFinder
): ScreenLayout {
  const rows = wordRows(lines);
  const aptitudes = findAptitudeRows(rows, -Infinity);
  if (aptitudes.length < MIN_APTITUDE_ROWS) {
    return {
      kind: 'skillList',
      stats: [],
      aptitudes: [],
      skillArea: { top: 0, split: width / 2 },
      titleLines: []
    };
  }

  const aptitudesTop = Math.min(...aptitudes.map(({ row }) => rowTop(row)));
  const aptitudesBottom = Math.max(...aptitudes.map(({ row }) => rowBottom(row)));
  const labelHeight = median(
    aptitudes.flatMap(({ row }) => row.found.map((label) => boxHeight(label.box)))
  );
  const panel = findStatsPanel?.(aptitudesTop) ?? numbersPanel(rows, aptitudesTop);
  const tabs = findLabelRow(rows, TAB_LABELS, {
    minimum: 1,
    below: aptitudesBottom,
    above: aptitudesBottom + labelHeight * TAB_SEARCH_HEIGHTS
  });
  const skillsTop = tabs ? Math.max(...tabs.words.map((word) => word.box.y1)) : aptitudesBottom;
  const statsTop = panel?.y0 ?? aptitudesTop;

  return {
    kind: 'details',
    stats: panel ? statCells(rows, panel) : [],
    aptitudes: aptitudeRegions(aptitudes),
    // The skill columns split under the middle of the stats, wherever the card sits in the screenshot.
    skillArea: { top: skillsTop, split: panel ? centreX(panel) : width / 2 },
    titleLines: lines.filter((line) => line.box.y1 <= statsTop).map((line) => line.text)
  };
}

/** A stat from the digits read in its cell; a rank badge read as digits can stick to the front. */
export function readStatValue(text: string): number | undefined {
  // OCR writes a 1 against other digits as a thin letter: `gl202` is 1202. A bar is the cell's divider instead.
  const groups = text.replace(/[lI](?=\d)|(?<=\d)[lI]/g, '1').match(/\d+/g);
  if (!groups) return undefined;

  const digits = groups.reduce((longest, group) =>
    group.length > longest.length ? group : longest
  );
  // No stat starts with 0; one read that way lost a digit, so its cell is read again.
  if (digits.startsWith('0')) return undefined;
  for (const length of [4, 3, 2]) {
    if (digits.length < length) continue;

    const value = Number(digits.slice(-length));
    if (value >= MIN_STAT_VALUE && value <= MAX_STAT_VALUE) return value;
  }

  return undefined;
}

/**
 * The stat from several readings of its cell. Tesseract drops a digit far more often than it adds one, and a badge
 * read as an extra digit is already stripped by `readStatValue`, so the reading with the most digits wins.
 */
export function mostDigits(readings: (number | undefined)[]): number | undefined {
  return readings.reduce<number | undefined>((best, reading) => {
    if (reading === undefined) return best;
    if (best === undefined) return reading;

    return String(reading).length > String(best).length ? reading : best;
  }, undefined);
}
