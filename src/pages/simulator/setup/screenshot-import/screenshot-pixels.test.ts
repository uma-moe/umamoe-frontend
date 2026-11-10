import { describe, expect, it } from 'vitest';
import {
  glyphCount,
  inkColours,
  inkMask,
  markAfter,
  statsPanelAbove,
  type Box,
  type Pixels
} from './screenshot-pixels';

const DARK_INK = [60, 40, 30, 255];

function whitePixels(width: number, height: number): Pixels {
  return { width, height, data: new Uint8ClampedArray(width * height * 4).fill(255) };
}

function paint(pixels: Pixels, box: Box, colour = DARK_INK) {
  for (let y = box.y0; y < box.y1; y++)
    for (let x = box.x0; x < box.x1; x++) pixels.data.set(colour, (y * pixels.width + x) * 4);
}

function drawRings(pixels: Pixels, centre: { x: number; y: number }, radii: number[]) {
  for (let y = 0; y < pixels.height; y++) {
    for (let x = 0; x < pixels.width; x++) {
      const distance = Math.hypot(x - centre.x, y - centre.y);
      if (radii.some((radius) => Math.abs(distance - radius) <= 1.2))
        pixels.data.set(DARK_INK, (y * pixels.width + x) * 4);
    }
  }
}

/** A white square with dark rings of the given radii around its middle. */
function rings(radii: number[], size = 41): Pixels {
  const pixels = whitePixels(size, size);
  drawRings(pixels, { x: (size - 1) / 2, y: (size - 1) / 2 }, radii);
  return pixels;
}

const whole = { x0: 0, y0: 0, x1: 41, y1: 41 };

describe('markAfter', () => {
  /** A skill name's last word as a dark block, 20 px tall, with what follows it drawn by `draw`. */
  function nameLine(draw: (pixels: Pixels) => void = () => {}) {
    const pixels = whitePixels(80, 40);
    const word = { x0: 0, y0: 10, x1: 20, y1: 30 };
    paint(pixels, word);
    draw(pixels);
    return { pixels, word };
  }

  it('reads a single ring after the name as ○', () => {
    const { pixels, word } = nameLine((line) => drawRings(line, { x: 35, y: 20 }, [8]));

    expect(markAfter(pixels, word)).toBe('○');
  });

  it('reads a double ring as ◎ by its closed-in middle', () => {
    const { pixels, word } = nameLine((line) => drawRings(line, { x: 35, y: 20 }, [8, 4]));

    expect(markAfter(pixels, word)).toBe('◎');
  });

  it('reads nothing when no mark follows the name', () => {
    const { pixels, word } = nameLine();

    expect(markAfter(pixels, word)).toBeUndefined();
  });

  it('reads nothing from a ×, round as its outline is', () => {
    const { pixels, word } = nameLine((line) => {
      for (let step = 0; step <= 16; step++) {
        paint(line, { x0: 27 + step, y0: 12 + step, x1: 29 + step, y1: 14 + step });
        paint(line, { x0: 43 - step, y0: 12 + step, x1: 45 - step, y1: 14 + step });
      }
    });

    expect(markAfter(pixels, word)).toBeUndefined();
  });

  it('reads nothing from a glyph that isn’t round', () => {
    const { pixels, word } = nameLine((line) => paint(line, { x0: 30, y0: 11, x1: 33, y1: 29 }));

    expect(markAfter(pixels, word)).toBeUndefined();
  });
});

describe('inkMask', () => {
  it('marks tinted ink on a plain cell, whatever its colour', () => {
    const pixels = rings([]);
    pixels.data.set([240, 180, 20, 255], (20 * 41 + 20) * 4);

    const mask = inkMask(pixels, whole);

    expect(mask.ink[20 * 41 + 20]).toBe(1);
    expect(mask.ink[0]).toBe(0);
  });
});

describe('inkColours', () => {
  it('keeps the bright tinted ink and leaves dark text out', () => {
    const pixels = rings([16]);
    pixels.data.set([250, 136, 54, 255], (10 * 41 + 20) * 4);

    const colours = inkColours(pixels, whole);

    expect(colours).toEqual([{ red: 250, green: 136, blue: 54 }]);
  });
});

describe('statsPanelAbove', () => {
  const aptitudes = { x0: 200, y0: 100, x1: 400, y1: 160 };

  function panelPixels(...strips: [y0: number, y1: number, x0: number, x1: number][]): Pixels {
    const pixels = whitePixels(900, 160);
    for (const [y0, y1, x0, x1] of strips) paint(pixels, { x0, y0, x1, y1 }, [120, 200, 40, 255]);

    return pixels;
  }

  it('finds the cells under the nearest green strip above the aptitudes', () => {
    const pixels = panelPixels([10, 16, 0, 900], [40, 46, 180, 420]);

    const panel = statsPanelAbove(pixels, aptitudes);

    expect(panel).toEqual({ x0: 180, y0: 46, x1: 420, y1: 100 });
  });

  it('passes over the panel’s thin green outline below its cells', () => {
    const pixels = panelPixels([40, 46, 180, 420], [90, 91, 180, 420]);

    const panel = statsPanelAbove(pixels, aptitudes);

    expect(panel).toEqual({ x0: 180, y0: 46, x1: 420, y1: 100 });
  });

  it('keeps a desktop menu bar’s longer green beside the panel out of it', () => {
    const pixels = panelPixels([40, 46, 180, 420], [40, 46, 440, 900]);

    const panel = statsPanelAbove(pixels, aptitudes);

    expect(panel).toEqual({ x0: 180, y0: 46, x1: 420, y1: 100 });
  });

  it('passes over green narrower than the aptitudes', () => {
    expect(statsPanelAbove(panelPixels([40, 46, 250, 350]), aptitudes)).toBeUndefined();
  });

  it('finds nothing without a green strip', () => {
    expect(statsPanelAbove(panelPixels(), aptitudes)).toBeUndefined();
  });
});

describe('glyphCount', () => {
  /** Three black digits, 6 px wide and 14 px tall, on white. */
  function digits(): Pixels {
    const text = whitePixels(40, 24);
    for (const x0 of [2, 11, 20]) paint(text, { x0, y0: 3, x1: x0 + 6, y1: 17 }, [0, 0, 0, 255]);

    return text;
  }

  it('counts the digits and leaves a cell’s thin divider out', () => {
    const text = digits();
    paint(text, { x0: 34, y0: 0, x1: 35, y1: 24 }, [0, 0, 0, 255]);

    expect(glyphCount(text)).toBe(3);
  });

  it('keeps a border line under the digits out of them', () => {
    const text = digits();
    paint(text, { x0: 0, y0: 20, x1: 40, y1: 21 }, [0, 0, 0, 255]);

    expect(glyphCount(text)).toBe(3);
  });
});
