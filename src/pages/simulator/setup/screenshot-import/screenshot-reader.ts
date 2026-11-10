import { prepareScreenshot } from './screenshot-image';
import { keepDarkText, type PreparedScreenshot } from './screenshot-image-prep';
import { inkGrade } from './screenshot-grades';
import {
  mostDigits,
  readScreenLayout,
  readStatValue,
  skillColumns,
  type ScreenLayout
} from './screenshot-layout';
import { pixelsImage, ScreenshotOcr } from './screenshot-ocr';
import {
  cropPixels,
  inkColours,
  inkMask,
  ringMark,
  statsPanelAbove,
  type Box,
  type Pixels
} from './screenshot-pixels';
import { readSkillLines, type SkillChoice } from './screenshot-skills';
import type { ScreenshotReading } from './screenshot-veteran';
import type { SkillNameIndex } from './skill-names';

const DIGITS = '0123456789';
/** A stat is read at these sizes; each reading can drop a digit the other keeps. */
const STAT_SCALES = [1, 2];
/** Some captures draw the stats lighter than the names; a looser cut keeps their strokes whole. */
const STAT_DARK_TEXT = 185;
/** The rank badge fills the left of a stat's cell; its letters read as stray digits. */
const STAT_BADGE_SHARE = 0.4;
/** A round glyph's box is padded so its edge pixels are background. */
const RING_PADDING = 3;

export class ScreenshotLayoutError extends Error {
  constructor() {
    super(
      'This doesn’t look like an Uma’s details screen. Use a screenshot that shows her stats, aptitudes and skills.'
    );
    this.name = 'ScreenshotLayoutError';
  }
}

function readCircle(pixels: Pixels, box: Box): '○' | '◎' | undefined {
  return ringMark(
    inkMask(pixels, {
      x0: box.x0 - RING_PADDING,
      y0: box.y0 - RING_PADDING,
      x1: box.x1 + RING_PADDING,
      y1: box.y1 + RING_PADDING
    })
  );
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

/** One reading of a stat's number, from its own crop at `scale`. */
async function readStatAt(ocr: ScreenshotOcr, pixels: Pixels, region: Box, scale: number) {
  const crop = cropPixels(pixels, region, scale);
  keepDarkText(crop.data, STAT_DARK_TEXT);
  return readStatValue(await ocr.readLine(await pixelsImage(crop), DIGITS));
}

/** Each stat from readings of its number at a few sizes, falling back on what the page's own reading found. */
async function readStats(
  ocr: ScreenshotOcr,
  pixels: Pixels,
  layout: ScreenLayout
): Promise<ScreenshotReading['stats']> {
  const stats: ScreenshotReading['stats'] = {};
  for (const { key, region, pageText } of layout.stats) {
    const number = statNumberRegion(region);
    const readings: (number | undefined)[] = [];
    for (const scale of STAT_SCALES) readings.push(await readStatAt(ocr, pixels, number, scale));

    const value = mostDigits(readings) ?? readStatValue(pageText);
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

async function readPreparedScreenshot(
  ocr: ScreenshotOcr,
  { page, pixels }: PreparedScreenshot,
  skillNames: SkillNameIndex
): Promise<ScreenshotReading> {
  const lines = await ocr.readLines(page);
  const layout = readScreenLayout(lines, pixels.width, (aptitudesTop) =>
    statsPanelAbove(pixels, aptitudesTop)
  );
  const stats = await readStats(ocr, pixels, layout);
  const aptitudes = readAptitudes(pixels, layout);
  const { skills, choices } = readSkillLines(
    skillColumns(lines, layout.skillArea),
    skillNames,
    (box) => readCircle(pixels, box)
  );
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
    return readPreparedScreenshot(ocr, prepared, skillNames);
  }

  async stop(): Promise<void> {
    const ocr = this.#ocr;
    this.#ocr = undefined;
    await (await ocr?.catch(() => undefined))?.stop();
  }
}
