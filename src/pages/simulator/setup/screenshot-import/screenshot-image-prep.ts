import { boxHeight, boxWidth, clampBox, type Box, type Pixels } from './screenshot-pixels';

export interface ScreenshotImageRequest {
  file: Blob;
  /** The part of the screenshot to prepare, in its own pixels; all of it when left out. */
  area?: Box;
}

/** A screenshot at the size the reader works at: its colours for grades and marks, and its text for Tesseract. */
export interface PreparedScreenshot {
  pixels: Pixels;
  /**
   * Only the game's dark text, black on white. Gradient cards, portraits and light grade letters drop out, so
   * Tesseract reads the names cleanly and has far less of the page to lay out.
   */
  page: Blob;
  /** Working pixels per pixel of the screenshot. */
  scale: number;
}

/** Narrower screenshots are enlarged to this width; skill names break up for Tesseract much below it. */
const MIN_WORKING_WIDTH = 1000;
/** Small screenshots are enlarged at most this much; beyond it the text only blurs. */
const MAX_ENLARGEMENT = 2;
const MAX_PIXELS = 40_000_000;
/** The game's brown text stays below this in every channel; its cards and highlights rise above it. */
const DARK_TEXT = 170;

/** Turns RGBA pixels, in place, into dark text: black below `limit` in every channel, white elsewhere. */
export function keepDarkText(data: Uint8ClampedArray, limit = DARK_TEXT): void {
  for (let offset = 0; offset < data.length; offset += 4) {
    const brightest = Math.max(data[offset]!, data[offset + 1]!, data[offset + 2]!);
    data.fill(brightest < limit ? 0 : 255, offset, offset + 3);
  }
}

/** Large screenshots are read at their own size: shrinking them resamples the text and costs digits. */
export function workingScale(width: number): number {
  return Math.max(1, Math.min(MAX_ENLARGEMENT, MIN_WORKING_WIDTH / width));
}

/** Runs in the worker: decodes, crops, scales and thresholds the screenshot off the page's thread. */
export async function prepareScreenshotImage({
  file,
  area
}: ScreenshotImageRequest): Promise<PreparedScreenshot> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(
      'This file isn’t an image this browser can open. Use a PNG or JPEG screenshot.'
    );
  }

  try {
    if (bitmap.width * bitmap.height > MAX_PIXELS)
      throw new Error('This image is too large. Use a plain screenshot.');

    const source = clampBox(area ?? { x0: 0, y0: 0, x1: bitmap.width, y1: bitmap.height }, bitmap);
    if (!boxWidth(source) || !boxHeight(source)) throw new Error('This screenshot is empty.');

    const scale = workingScale(boxWidth(source));
    const width = Math.round(boxWidth(source) * scale);
    const height = Math.round(boxHeight(source) * scale);
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('This browser can’t read screenshots.');

    context.imageSmoothingQuality = 'high';
    context.drawImage(
      bitmap,
      source.x0,
      source.y0,
      boxWidth(source),
      boxHeight(source),
      0,
      0,
      width,
      height
    );
    const colour = context.getImageData(0, 0, width, height);

    const text = new ImageData(new Uint8ClampedArray(colour.data), width, height);
    keepDarkText(text.data);

    context.putImageData(text, 0, 0);
    const page = await canvas.convertToBlob({ type: 'image/png' });

    return { pixels: { width, height, data: colour.data }, page, scale };
  } finally {
    bitmap.close();
  }
}
