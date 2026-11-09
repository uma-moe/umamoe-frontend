import type { Block, PSM, Worker as TesseractWorker } from 'tesseract.js';
import workerUrl from 'tesseract.js/dist/worker.min.js?url';
import lstmCoreUrl from 'tesseract.js-core/tesseract-core-lstm.wasm.js?url';
import relaxedSimdCoreUrl from 'tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js?url';
import simdCoreUrl from 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url';
import { relaxedSimd, simd } from 'wasm-feature-detect';
import type { OcrLine } from './screenshot-layout';
import englishModelUrl from './model/eng.traineddata.gz?url';
import { boxHeight, boxWidth, type Box, type Pixels } from './screenshot-pixels';

/** Tesseract's own page segmentation modes, by the values its API takes. */
const PAGE_MODE = {
  page: '3',
  line: '7'
} as const satisfies Record<string, `${PSM}`>;

/** The LSTM engine only; the English model shipped here has no data for the legacy one. */
const LSTM_ONLY = 1;

const absolute = (url: string) => new URL(url, location.href).href;

/** The fastest core this browser runs; each is the same engine built for a different level of SIMD support. */
async function coreUrl(): Promise<string> {
  if (await relaxedSimd()) return relaxedSimdCoreUrl;
  if (await simd()) return simdCoreUrl;

  return lstmCoreUrl;
}

/**
 * The folder holding the English model. Tesseract appends the model's own file name, which the build keeps; the
 * folder carries the content hash, so browsers cache the model for good.
 */
function englishModelFolder(): string {
  return absolute(englishModelUrl).replace(/\/[^/]*$/, '');
}

function pixelsCanvas(pixels: Pixels): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = pixels.width;
  canvas.height = pixels.height;
  canvas
    .getContext('2d')
    ?.putImageData(
      new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height),
      0,
      0
    );
  return canvas;
}

function linesFromBlocks(blocks: Block[] | null): OcrLine[] {
  return (blocks ?? [])
    .flatMap((block) => block.paragraphs)
    .flatMap((paragraph) => paragraph.lines)
    .map((line) => ({
      text: line.text.trim(),
      box: line.bbox,
      words: line.words
        .filter((word) => word.text.trim())
        .map((word) => ({ text: word.text.trim(), box: word.bbox }))
    }))
    .filter((line) => line.words.length > 0);
}

/**
 * Tesseract running in its own worker, with its engine and English model served from this site. One worker reads one
 * job at a time, which is all a phone has memory for.
 */
export class ScreenshotOcr {
  #worker: TesseractWorker;

  private constructor(worker: TesseractWorker) {
    this.#worker = worker;
  }

  static async start(): Promise<ScreenshotOcr> {
    const [{ createWorker }, corePath] = await Promise.all([import('tesseract.js'), coreUrl()]);
    const worker = await createWorker('eng', LSTM_ONLY, {
      workerPath: absolute(workerUrl),
      corePath: absolute(corePath),
      langPath: englishModelFolder(),
      workerBlobURL: false,
      cacheMethod: 'none'
    });

    return new ScreenshotOcr(worker);
  }

  /** Every line of text on the page, or in one area of it, with the boxes of its words in page pixels. */
  async readLines(page: Blob, area?: Box): Promise<OcrLine[]> {
    await this.#worker.setParameters({
      tessedit_pageseg_mode: PAGE_MODE.page as PSM,
      tessedit_char_whitelist: ''
    });
    const rectangle = area && {
      left: area.x0,
      top: area.y0,
      width: boxWidth(area),
      height: boxHeight(area)
    };
    const { data } = await this.#worker.recognize(
      page,
      { rectangle },
      { text: false, blocks: true }
    );
    return linesFromBlocks(data.blocks);
  }

  /** One line of text on its own, such as a stat's digits, limited to the given characters. */
  async readLine(pixels: Pixels, characters: string): Promise<string> {
    await this.#worker.setParameters({
      tessedit_pageseg_mode: PAGE_MODE.line as PSM,
      tessedit_char_whitelist: characters
    });
    const { data } = await this.#worker.recognize(pixelsCanvas(pixels), {}, { text: true });
    return data.text.trim();
  }

  async stop(): Promise<void> {
    await this.#worker.terminate();
  }
}
