import { describe, expect, it } from 'vitest';
import { placeIcons } from './icon-layout';

const plot = { width: 400, height: 300, size: 20, gap: 2 };

function overlapping(left: { x: number; y: number }, right: { x: number; y: number }): boolean {
  const footprint = plot.size + plot.gap;
  return Math.abs(left.x - right.x) < footprint && Math.abs(left.y - right.y) < footprint;
}

describe('icon layout', () => {
  it('keeps the first icon on its point and moves a stacked one sideways', () => {
    const targets = [
      { id: 1, x: 200, y: 150 },
      { id: 2, x: 200, y: 150 }
    ];

    const [first, second] = placeIcons(targets, plot);

    expect(first).toMatchObject({ x: 200, y: 150, moved: false });
    expect(second!.moved).toBe(true);
    expect(second!.y).toBe(150);
    expect(overlapping(first!, second!)).toBe(false);
  });

  it('places a crowd without overlaps and remembers each true point', () => {
    const crowd = Array.from({ length: 12 }, (_, index) => ({ id: index, x: 100, y: 100 }));

    const placed = placeIcons(crowd, { ...plot, reach: 3 });

    const clashes = placed.filter((icon, index) =>
      placed.slice(index + 1).some((other) => overlapping(icon, other))
    );
    expect(clashes).toEqual([]);
    expect(placed.every((icon) => icon.anchorX === 100 && icon.anchorY === 100)).toBe(true);
  });

  it('keeps icons inside the plot', () => {
    const [corner] = placeIcons([{ id: 1, x: 0, y: 300 }], plot);

    expect(corner).toMatchObject({ x: 10, y: 290 });
  });

  it('limits the default crowd displacement to one icon footprint', () => {
    const crowd = Array.from({ length: 24 }, (_, id) => ({ id, x: 200, y: 150 }));
    const placed = placeIcons(crowd, plot);

    expect(placed.every((icon) => Math.abs(icon.x - 200) <= plot.size + plot.gap)).toBe(true);
    expect(placed.every((icon) => Math.abs(icon.y - 150) <= plot.size + plot.gap)).toBe(true);
  });
});
