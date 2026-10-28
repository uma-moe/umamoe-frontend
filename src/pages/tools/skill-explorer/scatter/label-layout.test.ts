import { describe, expect, it } from 'vitest';
import { placeLabels } from './label-layout';

const options = { width: 400, height: 200, iconSize: 30, labelHeight: 18, gap: 3 };

describe('placeLabels', () => {
  it('names an icon to its right when there is room', () => {
    const labels = placeLabels([{ id: 1, x: 50, y: 100, labelWidth: 80 }], options);

    expect(labels).toEqual([{ id: 1, x: 68, y: 100, side: 'right' }]);
  });

  it('moves a name to the left at the plot edge', () => {
    const labels = placeLabels([{ id: 1, x: 370, y: 100, labelWidth: 80 }], options);

    expect(labels[0]?.side).toBe('left');
    expect(labels[0]!.x + 80).toBeLessThanOrEqual(352);
  });

  it('leaves out a name with no free side: one would cover the next icon, the other the plot edge', () => {
    const crowded = [
      { id: 1, x: 100, y: 100, labelWidth: 120 },
      { id: 2, x: 150, y: 100, labelWidth: 120 }
    ];

    const labels = placeLabels(crowded, options);

    expect(labels.map((label) => label.id)).toEqual([2]);
  });

  it('names more icons once they spread apart', () => {
    // Near the left edge the first icon has no room on its left, and its neighbour blocks its right.
    const close = [
      { id: 1, x: 40, y: 100, labelWidth: 60 },
      { id: 2, x: 80, y: 100, labelWidth: 60 }
    ];
    const spread = close.map((icon, index) => ({ ...icon, x: 60 + index * 200 }));

    expect(placeLabels(close, options)).toHaveLength(1);
    expect(placeLabels(spread, options)).toHaveLength(2);
  });
});
