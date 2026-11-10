import { prepareScreenshot } from './screenshot-image';
import { keepDarkText, type PreparedScreenshot } from './screenshot-image-prep';
import { inkGrade } from './screenshot-grades';
import {
  detailsCardArea,
  mostDigits,
  readScreenLayout,
  readStatValue,
  skillCell,
  skillColumns,
  type OcrLine,
  type ScreenLayout
} from './screenshot-layout';
import { pixelsImage, ScreenshotOcr } from './screenshot-ocr';
import {
  cropPixels,
  glyphCount,
  inkColours,
  markAfter,
  scaleBox,
  statsPanelAbove,
  type Box,
  type Pixels
} from './screenshot-pixels';
import { readSkillLines, type SkillChoice, type SkillLineReading } from './screenshot-skills';
import type { ScreenshotReading } from './screenshot-veteran';
import type { SkillNameIndex } from './skill-names';

const DIGITS = '0123456789';
/**
 * Ways to read a stat's digits, in order. Tesseract can drop a digit in any one of them, a different one in each, so
 * they're tried until a reading has as many digits as the number shows. Some captures draw the stats lighter than the
 * names, so the first cut is looser than the page's.
 */
const STAT_READINGS: { darkText: number; scale: number }[] = [
  { darkText: 185, scale: 1 },
  { darkText: 185, scale: 2 },
  { darkText: 200, scale: 2 },
  { darkText: 200, scale: 1 },
  { darkText: 170, scale: 1 },
  { darkText: 170, scale: 2 }
];
/** The rank badge fills the left of a stat's cell; its letters read as stray digits. */
const STAT_BADGE_SHARE = 0.4;

export class ScreenshotLayoutError extends Error {
  constructor() {
    super(
      'This doesn’t look like an Uma’s details screen. Use a screenshot that shows her stats, aptitudes and skills.'
    );
    this.name = 'ScreenshotLayoutError';
  }
}

/** A picture of one skill line, for the player to compare against the candidates. */
function lineImage(pixels: Pixels, box: Box): string | undefined {
  const crop = cropPixels(pixels, {
    x0: box.x0 - 6,
    y0: box.y0 - 4,
    x1: box.x1 + 6,
    y1: box.y1 + 4
  });
  if (!crop.width || !crop.height) return undefined;

  const canvas = document.createElement('canvas');
  canvas.width = crop.width;
  canvas.height = crop.height;
  canvas.getContext('2d')?.putImageData(new ImageData(crop.data, crop.width, crop.height), 0, 0);
  return canvas.toDataURL('image/png');
}

/** The part of a stat's cell right of its rank badge, where the number is. */
function statNumberRegion(cell: Box): Box {
  return { ...cell, x0: cell.x0 + (cell.x1 - cell.x0) * STAT_BADGE_SHARE };
}

/** The stat's number as black-on-white digits, cut and enlarged for one way of reading it. */
function statDigits(
  pixels: Pixels,
  number: Box,
  { darkText, scale }: (typeof STAT_READINGS)[number]
): Pixels {
  const crop = cropPixels(pixels, number, scale);
  keepDarkText(crop.data, darkText);
  return crop;
}

/** A stat from the first reading with as many digits as its number shows, or the longest reading when none has. */
async function readStat(ocr: ScreenshotOcr, pixels: Pixels, cell: Box) {
  const number = statNumberRegion(cell);
  const readings: (number | undefined)[] = [];
  let shownDigits: number | undefined;

  for (const reading of STAT_READINGS) {
    const digits = statDigits(pixels, number, reading);
    shownDigits ??= glyphCount(digits);

    const value = readStatValue(await ocr.readLine(await pixelsImage(digits), DIGITS));
    if (value !== undefined && String(value).length === shownDigits) return value;

    readings.push(value);
  }

  return mostDigits(readings);
}

/** Each stat from its own cell, falling back on what the page's own reading found there. */
async function readStats(
  ocr: ScreenshotOcr,
  pixels: Pixels,
  layout: ScreenLayout
): Promise<ScreenshotReading['stats']> {
  const stats: ScreenshotReading['stats'] = {};
  for (const { key, region, pageText } of layout.stats) {
    const value = (await readStat(ocr, pixels, region)) ?? readStatValue(pageText);
    if (value !== undefined) stats[key] = value;
  }

  return stats;
}

/** Each grade by its letter's colour: the game draws every grade in its own, and OCR misreads the drawn letters. */
function readAptitudes(pixels: Pixels, layout: ScreenLayout): ScreenshotReading['aptitudes'] {
  const aptitudes: ScreenshotReading['aptitudes'] = {};
  for (const { key, region } of layout.aptitudes) {
    const grade = inkGrade(inkColours(pixels, region));
    if (grade !== undefined) aptitudes[key] = grade;
  }

  return aptitudes;
}

/** A prepared screenshot with its text and the parts of the details screen found in it. */
interface ReadPage {
  prepared: PreparedScreenshot;
  lines: OcrLine[];
  layout: ScreenLayout;
}

async function readPage(ocr: ScreenshotOcr, prepared: PreparedScreenshot): Promise<ReadPage> {
  const lines = await ocr.readLines(prepared.page);
  const layout = readScreenLayout(lines, prepared.pixels.width, (aptitudes) =>
    statsPanelAbove(prepared.pixels, aptitudes)
  );
  return { prepared, lines, layout };
}

/**
 * The screenshot's text, read again from just the details card when the screenshot shows more around it, as a desktop
 * capture does: the card is then read at the size the reader works at, and nothing beside it gets in.
 */
async function readDetailsCard(
  ocr: ScreenshotOcr,
  file: Blob,
  prepared: PreparedScreenshot
): Promise<ReadPage> {
  const whole = await readPage(ocr, prepared);
  const card = detailsCardArea(whole.layout, whole.prepared.pixels);
  if (!card) return whole;

  const cardInScreenshot = scaleBox(card, 1 / whole.prepared.scale);
  return readPage(ocr, await prepareScreenshot(file, cardInScreenshot));
}

/**
 * The skills on the page. A line that names none is read again from its own cell, since the page's reading can run a
 * wrapped name's two lines together.
 */
async function readSkills(
  ocr: ScreenshotOcr,
  { prepared, lines, layout }: ReadPage,
  skillNames: SkillNameIndex
): Promise<Omit<SkillLineReading, 'unread'>> {
  const readMark = (box: Box) => markAfter(prepared.pixels, box);
  const page = readSkillLines(skillColumns(lines, layout.skillArea), skillNames, readMark);
  const skills = [...page.skills];
  const choices = [...page.choices];

  for (const line of page.unread) {
    const cellLines = await ocr.readLines(prepared.page, skillCell(line, layout.skillArea));
    const cell = readSkillLines(
      cellLines.map((cellLine) => ({ ...cellLine, column: line.column })),
      skillNames,
      readMark
    );

    for (const skill of cell.skills) {
      if (!skills.some((read) => read.skillId === skill.skillId)) skills.push(skill);
    }
    choices.push(...cell.choices);
  }

  return { skills, choices };
}

async function readScreenshot(
  ocr: ScreenshotOcr,
  page: ReadPage,
  skillNames: SkillNameIndex
): Promise<ScreenshotReading> {
  const { pixels } = page.prepared;
  const { layout } = page;
  const stats = await readStats(ocr, pixels, layout);
  const aptitudes = readAptitudes(pixels, layout);
  const { skills, choices } = await readSkills(ocr, page, skillNames);
  // A screenshot with neither the stats nor a single skill on it shows some other screen.
  if (layout.kind === 'skillList' && !skills.length && !choices.length)
    throw new ScreenshotLayoutError();

  return {
    stats,
    aptitudes,
    skills,
    choices: choices.map((choice): SkillChoice => ({
      ...choice,
      image: lineImage(pixels, choice.box)
    })),
    titleLines: layout.titleLines
  };
}

/** Reads screenshots of the Uma details screen one after another, on one Tesseract worker. */
export class ScreenshotReader {
  #ocr: Promise<ScreenshotOcr> | undefined;

  async read(file: Blob, skillNames: SkillNameIndex): Promise<ScreenshotReading> {
    this.#ocr ??= ScreenshotOcr.start().catch((reason: unknown) => {
      this.#ocr = undefined;
      throw reason;
    });

    const [ocr, prepared] = await Promise.all([this.#ocr, prepareScreenshot(file)]);
    return readScreenshot(ocr, await readDetailsCard(ocr, file, prepared), skillNames);
  }

  async stop(): Promise<void> {
    const ocr = this.#ocr;
    this.#ocr = undefined;
    await (await ocr?.catch(() => undefined))?.stop();
  }
}
