/** RGBA pixels row by row, as `ImageData` holds them. */
export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray<ArrayBuffer>;
}

/** A rectangle in pixels: `x0`/`y0` inside it, `x1`/`y1` just outside. */
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Colour {
  red: number;
  green: number;
  blue: number;
}

/** One byte per pixel, 1 where the pixel stands out from its surroundings. */
export interface InkMask {
  width: number;
  height: number;
  ink: Uint8Array;
}

/** How far, in RGB, a pixel must sit from the background to count as ink. */
const INK_DISTANCE = 72;
/** Grade letters are drawn in light tints; the labels' dark text stays below this channel value. */
const BRIGHT_INK = 130;
/** The stats panel's header strip is green across most of its width, around its white labels and icons. */
const GREEN_ROW_SHARE = 0.4;
/** Rows sampled through a glyph, as fractions of its height. */
const RING_ROWS = [0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65];

export function clampBox(box: Box, size: { width: number; height: number }): Box {
  return {
    x0: Math.max(0, Math.min(size.width, Math.round(box.x0))),
    y0: Math.max(0, Math.min(size.height, Math.round(box.y0))),
    x1: Math.max(0, Math.min(size.width, Math.round(box.x1))),
    y1: Math.max(0, Math.min(size.height, Math.round(box.y1)))
  };
}

export function boxWidth(box: Box): number {
  return box.x1 - box.x0;
}

export function boxHeight(box: Box): number {
  return box.y1 - box.y0;
}

/** The mean colour of the box's outermost pixels, where a cell's fill shows around what it holds. */
function edgeColour(pixels: Pixels, box: Box): [number, number, number] {
  const total = [0, 0, 0];
  let count = 0;

  const add = (x: number, y: number) => {
    const offset = (y * pixels.width + x) * 4;
    total[0]! += pixels.data[offset]!;
    total[1]! += pixels.data[offset + 1]!;
    total[2]! += pixels.data[offset + 2]!;
    count++;
  };

  for (let x = box.x0; x < box.x1; x++) {
    add(x, box.y0);
    add(x, box.y1 - 1);
  }

  for (let y = box.y0 + 1; y < box.y1 - 1; y++) {
    add(box.x0, y);
    add(box.x1 - 1, y);
  }

  return [total[0]! / count, total[1]! / count, total[2]! / count];
}

/**
 * The pixels in a box that differ from its background, whatever their colour: grade letters are tinted, skill text is
 * dark, and both sit on a plain cell.
 */
export function inkMask(pixels: Pixels, area: Box): InkMask {
  const box = clampBox(area, pixels);
  const width = boxWidth(box);
  const height = boxHeight(box);
  const ink = new Uint8Array(Math.max(0, width * height));
  if (width < 2 || height < 2)
    return { width: Math.max(0, width), height: Math.max(0, height), ink };

  const [red, green, blue] = edgeColour(pixels, box);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = ((box.y0 + y) * pixels.width + box.x0 + x) * 4;
      const distance = Math.hypot(
        pixels.data[offset]! - red,
        pixels.data[offset + 1]! - green,
        pixels.data[offset + 2]! - blue
      );
      if (distance > INK_DISTANCE) ink[y * width + x] = 1;
    }
  }

  return { width, height, ink };
}

/** How many separate stretches of ink one row of the mask crosses. */
function inkRuns(mask: InkMask, y: number): number {
  let runs = 0;
  let inInk = false;
  for (let x = 0; x < mask.width; x++) {
    const ink = mask.ink[y * mask.width + x] === 1;
    if (ink && !inInk) runs++;
    inInk = ink;
  }

  return runs;
}

/**
 * ○ or ◎ from the glyph's pixels, which OCR can't tell apart: a row through the middle crosses one ring twice and a
 * double ring four times. A thin ring can break on a row but never gains crossings, so the most crossings wins.
 */
export function ringMark(mask: InkMask): '○' | '◎' | undefined {
  if (mask.height < 5) return undefined;

  const crossings = Math.max(
    ...RING_ROWS.map((fraction) => inkRuns(mask, Math.floor(mask.height * fraction)))
  );
  if (crossings >= 3) return '◎';
  if (crossings === 2) return '○';

  return undefined;
}

/** The colours of a box's bright ink, which is a grade letter's tint; dark text stays out of it. */
export function inkColours(pixels: Pixels, area: Box): Colour[] {
  const box = clampBox(area, pixels);
  const mask = inkMask(pixels, box);
  const colours: Colour[] = [];

  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      if (mask.ink[y * mask.width + x] !== 1) continue;

      const offset = ((box.y0 + y) * pixels.width + box.x0 + x) * 4;
      const red = pixels.data[offset]!;
      const green = pixels.data[offset + 1]!;
      const blue = pixels.data[offset + 2]!;
      if (Math.max(red, green, blue) >= BRIGHT_INK) colours.push({ red, green, blue });
    }
  }

  return colours;
}

function isPanelGreen(data: Uint8ClampedArray, offset: number): boolean {
  const red = data[offset]!;
  const green = data[offset + 1]!;
  const blue = data[offset + 2]!;
  return green >= 150 && green - red >= 40 && green - blue >= 60;
}

function greenRun(pixels: Pixels, y: number): { x0: number; x1: number; count: number } {
  let x0 = -1;
  let x1 = -1;
  let count = 0;
  for (let x = 0; x < pixels.width; x++) {
    if (!isPanelGreen(pixels.data, (y * pixels.width + x) * 4)) continue;

    if (x0 < 0) x0 = x;
    x1 = x + 1;
    count++;
  }

  return { x0, x1, count };
}

/**
 * The stats panel's cells, under its green header strip: the nearest band of mostly green rows above `bottom`, as
 * wide as that strip, down to `bottom`. Undefined when no such band is there.
 */
export function statsPanelAbove(pixels: Pixels, bottom: number): Box | undefined {
  const isGreenRow = (y: number) => greenRun(pixels, y).count >= pixels.width * GREEN_ROW_SHARE;

  let y = Math.min(pixels.height, Math.floor(bottom)) - 1;
  while (y >= 0 && !isGreenRow(y)) y--;
  if (y < 0) return undefined;

  const stripBottom = y + 1;
  while (y >= 0 && isGreenRow(y)) y--;
  const stripTop = y + 1;
  const { x0, x1 } = greenRun(pixels, Math.floor((stripTop + stripBottom) / 2));

  return { x0, y0: stripBottom, x1, y1: bottom };
}

/** A copy of one box of the screenshot, enlarged, for reading a stat's digits on their own. */
export function cropPixels(pixels: Pixels, area: Box, scale = 1): Pixels {
  const box = clampBox(area, pixels);
  const width = boxWidth(box) * scale;
  const height = boxHeight(box) * scale;
  const data = new Uint8ClampedArray(Math.max(0, width * height * 4));

  for (let y = 0; y < height; y++) {
    const sourceRow = (box.y0 + Math.floor(y / scale)) * pixels.width;
    for (let x = 0; x < width; x++) {
      const source = (sourceRow + box.x0 + Math.floor(x / scale)) * 4;
      data.set(pixels.data.subarray(source, source + 4), (y * width + x) * 4);
    }
  }

  return { width, height, data };
}
