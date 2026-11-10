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
/** The stats panel reaches past the aptitude grid by less than half the grid's width on either side. */
const PANEL_SEARCH_SHARE = 0.5;
/** The strip's white labels, icons and dividers break its green for less than this share of the grid's width. */
const STRIP_GAP_SHARE = 0.08;
/** The header strip is about 5% of the grid's width tall; the panel's green outline is a row or two. */
const MIN_STRIP_HEIGHT_SHARE = 0.015;
/** A digit stands at least half its line's height; dots and the bottoms of other glyphs don't. */
const MIN_GLYPH_HEIGHT_SHARE = 0.5;
/** Even a 1 is wider than this share of its line's height; a cell's divider isn't. */
const MIN_GLYPH_WIDTH_SHARE = 0.12;
/** A skill's mark follows its name within this many of the name's line heights, past a small gap. */
const MARK_REACH_HEIGHTS = 2;
const MARK_GAP_HEIGHTS = 0.1;
/** The mark is centred on the name's line and reaches this far above and below its middle, in line heights. */
const MARK_HALF_HEIGHTS = 0.8;
/** Closer than this in RGB to the background, nothing is drawn after the name. */
const MIN_MARK_CONTRAST = 60;
/** A pixel is the mark's ink when it's at least this share as far from the background as the mark's darkest. */
const MARK_INK_SHARE = 0.5;
/** A ring is about as wide as it is tall, and nearly as tall as the name's letters. */
const MIN_RING_ASPECT = 0.7;
const MAX_RING_ASPECT = 1.4;
const MIN_RING_HEIGHT_SHARE = 0.5;
/** Rows through a ring's middle, as fractions of its height. */
const RING_ROWS = [0.4, 0.45, 0.5, 0.55, 0.6];
/** Across its middle a single ring is open for about 80% of its width; a double ring's inner ring closes that to half. */
const SINGLE_RING_HOLE_SHARE = 0.6;

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

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/** How far each pixel of the area is from its background, the median colour of its top and bottom rows. */
function backgroundDistances(pixels: Pixels, area: Box): Float32Array {
  const width = boxWidth(area);
  const height = boxHeight(area);
  const offset = (x: number, y: number) => (y * pixels.width + x) * 4;

  const edge: number[] = [];
  for (let x = area.x0; x < area.x1; x++) edge.push(offset(x, area.y0), offset(x, area.y1 - 1));
  const background = [0, 1, 2].map((channel) =>
    median(edge.map((start) => pixels.data[start + channel]!))
  );

  const distances = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = offset(area.x0 + x, area.y0 + y);
      distances[y * width + x] = Math.hypot(
        pixels.data[start]! - background[0]!,
        pixels.data[start + 1]! - background[1]!,
        pixels.data[start + 2]! - background[2]!
      );
    }
  }

  return distances;
}

function columnHasInk(mask: InkMask, x: number): boolean {
  for (let y = 0; y < mask.height; y++) if (mask.ink[y * mask.width + x] === 1) return true;
  return false;
}

/** The leftmost glyph in the mask: its run of inked columns and the rows those columns reach. */
function firstGlyph(mask: InkMask): Box | undefined {
  let x0 = 0;
  while (x0 < mask.width && !columnHasInk(mask, x0)) x0++;
  if (x0 === mask.width) return undefined;

  let x1 = x0;
  while (x1 < mask.width && columnHasInk(mask, x1)) x1++;

  let y0 = mask.height;
  let y1 = 0;
  for (let y = 0; y < mask.height; y++) {
    for (let x = x0; x < x1; x++) {
      if (mask.ink[y * mask.width + x] !== 1) continue;

      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y + 1);
    }
  }

  return { x0, y0, x1, y1 };
}

function isMaskInk(mask: InkMask, x: number, y: number): boolean {
  return mask.ink[y * mask.width + x] === 1;
}

function isRingShaped(glyph: Box, lineHeight: number): boolean {
  const aspect = boxWidth(glyph) / boxHeight(glyph);
  const tallEnough = boxHeight(glyph) >= lineHeight * MIN_RING_HEIGHT_SHARE;
  return tallEnough && aspect >= MIN_RING_ASPECT && aspect <= MAX_RING_ASPECT;
}

/** Whether ink sits within a pixel of the glyph's centre. */
function hasInkedCentre(mask: InkMask, glyph: Box): boolean {
  const centreX = Math.floor((glyph.x0 + glyph.x1) / 2);
  const centreY = Math.floor((glyph.y0 + glyph.y1) / 2);

  for (let y = centreY - 1; y <= centreY + 1; y++) {
    for (let x = centreX - 1; x <= centreX + 1; x++) if (isMaskInk(mask, x, y)) return true;
  }

  return false;
}

/** How much of a ring's width is open around its centre, across the rows through its middle. */
function holeShare(mask: InkMask, ring: Box): number {
  const centre = Math.floor((ring.x0 + ring.x1) / 2);
  const isInk = (x: number, y: number) => isMaskInk(mask, x, y);

  const holes = RING_ROWS.map((fraction) => {
    const y = ring.y0 + Math.floor(boxHeight(ring) * fraction);
    if (isInk(centre, y)) return 0;

    let left = centre;
    while (left > ring.x0 && !isInk(left - 1, y)) left--;

    let right = centre + 1;
    while (right < ring.x1 && !isInk(right, y)) right++;

    return right - left;
  });

  return median(holes) / boxWidth(ring);
}

/**
 * ○ or ◎ from the glyph right after a skill name's last word, which OCR reads as any round letter or symbol. The
 * double ring's inner ring is what tells them apart, so the glyph is told by how open its middle is.
 */
export function markAfter(pixels: Pixels, nameEnd: Box): '○' | '◎' | undefined {
  const lineHeight = boxHeight(nameEnd);
  const middle = (nameEnd.y0 + nameEnd.y1) / 2;
  const area = clampBox(
    {
      x0: nameEnd.x1 + lineHeight * MARK_GAP_HEIGHTS,
      y0: middle - lineHeight * MARK_HALF_HEIGHTS,
      x1: nameEnd.x1 + lineHeight * MARK_REACH_HEIGHTS,
      y1: middle + lineHeight * MARK_HALF_HEIGHTS
    },
    pixels
  );
  if (boxWidth(area) < 2 || boxHeight(area) < 2) return undefined;

  const distances = backgroundDistances(pixels, area);
  const darkest = distances.reduce((most, distance) => Math.max(most, distance), 0);
  if (darkest < MIN_MARK_CONTRAST) return undefined;

  const ink = new Uint8Array(distances.length);
  distances.forEach((distance, position) => {
    if (distance > darkest * MARK_INK_SHARE) ink[position] = 1;
  });

  const mask: InkMask = { width: boxWidth(area), height: boxHeight(area), ink };
  const glyph = firstGlyph(mask);
  if (!glyph || !isRingShaped(glyph, lineHeight)) return undefined;
  // A ×'s strokes cross in its middle, which both rings leave open.
  if (hasInkedCentre(mask, glyph)) return undefined;

  return holeShare(mask, glyph) < SINGLE_RING_HOLE_SHARE ? '◎' : '○';
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

interface Span {
  x0: number;
  x1: number;
}

/** The longest stretch of panel green on row `y` inside `window`, bridging gaps up to `maxGap` wide. */
function greenSpan(pixels: Pixels, y: number, window: Span, maxGap: number): Span | undefined {
  let longest: Span | undefined;
  let start = -1;
  let lastGreen = -Infinity;

  for (let x = window.x0; x < window.x1; x++) {
    if (!isPanelGreen(pixels.data, (y * pixels.width + x) * 4)) continue;

    if (x - lastGreen - 1 > maxGap) start = x;
    lastGreen = x;
    if (!longest || x + 1 - start > longest.x1 - longest.x0) longest = { x0: start, x1: x + 1 };
  }

  return longest;
}

/**
 * The stats panel's cells, under its green header strip: the nearest band above the aptitude grid that is green across
 * at least the grid's width and tall enough to be the strip, as wide as that band, down to the grid. Green is only
 * looked for around the grid, so the rest of a desktop capture — its menus have green bars too — stays out of it.
 * Undefined when no such band is there.
 */
export function statsPanelAbove(pixels: Pixels, aptitudes: Box): Box | undefined {
  const gridWidth = boxWidth(aptitudes);
  const reach = gridWidth * PANEL_SEARCH_SHARE;
  const window = {
    x0: Math.max(0, Math.floor(aptitudes.x0 - reach)),
    x1: Math.min(pixels.width, Math.ceil(aptitudes.x1 + reach))
  };
  const maxGap = gridWidth * STRIP_GAP_SHARE;
  const stripSpan = (y: number) => {
    const span = greenSpan(pixels, y, window, maxGap);
    return span && span.x1 - span.x0 >= gridWidth ? span : undefined;
  };

  const minStripHeight = gridWidth * MIN_STRIP_HEIGHT_SHARE;
  let band: Span[] = [];

  // Upwards from the grid; the row past the top closes the last band.
  for (let y = Math.min(pixels.height, Math.floor(aptitudes.y0)) - 1; y >= -1; y--) {
    const span = y >= 0 ? stripSpan(y) : undefined;
    if (span) {
      band.push(span);
      continue;
    }

    const middle = band[Math.floor(band.length / 2)];
    if (middle && band.length >= minStripHeight) {
      const stripBottom = y + 1 + band.length;
      return { x0: middle.x0, y0: stripBottom, x1: middle.x1, y1: aptitudes.y0 };
    }

    band = [];
  }

  return undefined;
}

/** The rows of the tallest stretch of consecutive rows that hold ink, in a black-on-white crop. */
function tallestInkBand(text: Pixels): { y0: number; y1: number } | undefined {
  let tallest: { y0: number; y1: number } | undefined;
  let start = -1;

  for (let y = 0; y <= text.height; y++) {
    const inked = y < text.height && rowHasInk(text, y);
    if (inked && start < 0) start = y;
    if (inked || start < 0) continue;

    if (!tallest || y - start > tallest.y1 - tallest.y0) tallest = { y0: start, y1: y };
    start = -1;
  }

  return tallest;
}

function isBlack(text: Pixels, x: number, y: number): boolean {
  return text.data[(y * text.width + x) * 4] === 0;
}

function rowHasInk(text: Pixels, y: number): boolean {
  for (let x = 0; x < text.width; x++) if (isBlack(text, x, y)) return true;
  return false;
}

/**
 * How many glyphs stand side by side in a black-on-white crop of one line, such as a stat's digits: the stretches of
 * columns with ink, within the line's own rows so a border line below it can't join them. Thin rules and specks
 * aren't glyphs.
 */
export function glyphCount(text: Pixels): number {
  const band = tallestInkBand(text);
  if (!band) return 0;

  const lineHeight = band.y1 - band.y0;
  let count = 0;
  let glyph: { x0: number; top: number; bottom: number } | undefined;

  const close = (x1: number) => {
    if (!glyph) return;

    const tallEnough = glyph.bottom - glyph.top >= lineHeight * MIN_GLYPH_HEIGHT_SHARE;
    const wideEnough = x1 - glyph.x0 >= lineHeight * MIN_GLYPH_WIDTH_SHARE;
    if (tallEnough && wideEnough) count++;
    glyph = undefined;
  };

  for (let x = 0; x < text.width; x++) {
    let top = -1;
    let bottom = -1;
    for (let y = band.y0; y < band.y1; y++) {
      if (!isBlack(text, x, y)) continue;

      if (top < 0) top = y;
      bottom = y + 1;
    }

    if (top < 0) {
      close(x);
      continue;
    }

    glyph ??= { x0: x, top, bottom };
    glyph.top = Math.min(glyph.top, top);
    glyph.bottom = Math.max(glyph.bottom, bottom);
  }

  close(text.width);
  return count;
}

/** A box measured at another scale, such as working pixels back in the screenshot's own. */
export function scaleBox(box: Box, factor: number): Box {
  return {
    x0: box.x0 * factor,
    y0: box.y0 * factor,
    x1: box.x1 * factor,
    y1: box.y1 * factor
  };
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
