import { describe, expect, it } from 'vitest';
import { inkColours, inkMask, ringMark, statsPanelAbove, type Pixels } from './screenshot-pixels';

/** A white square with dark rings of the given radii around its middle. */
function rings(radii: number[], size = 41): Pixels {
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  const middle = (size - 1) / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const distance = Math.hypot(x - middle, y - middle);
      if (!radii.some((radius) => Math.abs(distance - radius) <= 1.2)) continue;

      const offset = (y * size + x) * 4;
      data[offset] = 60;
      data[offset + 1] = 40;
      data[offset + 2] = 30;
    }
  }

  return { width: size, height: size, data };
}

const whole = { x0: 0, y0: 0, x1: 41, y1: 41 };

describe('ringMark', () => {
  it('tells a single ring from a double ring', () => {
    expect(ringMark(inkMask(rings([16]), whole))).toBe('○');
    expect(ringMark(inkMask(rings([16, 9]), whole))).toBe('◎');
  });

  it('reads nothing from a blank box', () => {
    expect(ringMark(inkMask(rings([]), whole))).toBeUndefined();
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
  const width = 100;

  function panelPixels(...strips: [y0: number, y1: number, x0: number, x1: number][]): Pixels {
    const pixels: Pixels = {
      width,
      height: 60,
      data: new Uint8ClampedArray(width * 60 * 4).fill(255)
    };
    for (const [y0, y1, x0, x1] of strips) {
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) pixels.data.set([120, 200, 40, 255], (y * width + x) * 4);
    }

    return pixels;
  }

  it('finds the cells under the nearest green strip above the aptitudes', () => {
    const pixels = panelPixels([2, 6, 0, 100], [20, 26, 10, 90]);

    const panel = statsPanelAbove(pixels, 50);

    expect(panel).toEqual({ x0: 10, y0: 26, x1: 90, y1: 50 });
  });

  it('passes over the panel’s thin green outline below its cells', () => {
    const pixels = panelPixels([20, 26, 10, 90], [40, 41, 10, 90]);

    const panel = statsPanelAbove(pixels, 50);

    expect(panel).toEqual({ x0: 10, y0: 26, x1: 90, y1: 50 });
  });

  it('finds nothing without a green strip', () => {
    expect(statsPanelAbove(rings([]), 30)).toBeUndefined();
  });
});
