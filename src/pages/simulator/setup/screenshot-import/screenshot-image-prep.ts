import type { Pixels } from './screenshot-pixels';

export interface ScreenshotImageRequest {
  file: Blob;
}

/** A screenshot at the size the reader works at: its colours for grades and marks, and its text for Tesseract. */
export interface PreparedScreenshot {
  pixels: Pixels;
  /**
   * Only the game's dark text, black on white. Gradient cards, portraits and light grade letters drop out, so
   * Tesseract reads the names cleanly and has far less of the page to lay out.
   */
  page: Blob;
}

/** Wide enough for skill names to stay legible to Tesseract (they break up at 800), small enough to read quickly. */
const WORKING_WIDTH = 1000;
/** Small screenshots are enlarged at most this much; beyond it the text only blurs. */
const MAX_ENLARGEMENT = 2;
const MAX_PIXELS = 40_000_000;
/** The game's brown text stays below this in every channel; its cards and highlights rise above it. */
const DARK_TEXT = 170;

export function workingScale(width: number): number {
  return Math.min(MAX_ENLARGEMENT, WORKING_WIDTH / width);
}

/** Runs in the worker: decodes, scales and thresholds the screenshot off the page's thread. */
export async function prepareScreenshotImage(file: Blob): Promise<PreparedScreenshot> {
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

    const scale = workingScale(bitmap.width);
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('This browser can’t read screenshots.');

    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, width, height);
    const colour = context.getImageData(0, 0, width, height);

    const text = new ImageData(new Uint8ClampedArray(colour.data), width, height);
    for (let offset = 0; offset < text.data.length; offset += 4) {
      const brightest = Math.max(
        colour.data[offset]!,
        colour.data[offset + 1]!,
        colour.data[offset + 2]!
      );
      text.data.fill(brightest < DARK_TEXT ? 0 : 255, offset, offset + 3);
    }

    context.putImageData(text, 0, 0);
    const page = await canvas.convertToBlob({ type: 'image/png' });

    return { pixels: { width, height, data: colour.data }, page };
  } finally {
    bitmap.close();
  }
}
