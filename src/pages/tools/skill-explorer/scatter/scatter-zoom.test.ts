import { describe, expect, it } from 'vitest';
import { MAX_ZOOM, WHOLE_PLOT, inView, isZoomed, panBy, zoomAt, zoomOf } from './scatter-zoom';

describe('zoomAt', () => {
  it('keeps the point under the cursor in place', () => {
    const focus = { x: 0.25, y: 0.75 };

    const zoomed = zoomAt(WHOLE_PLOT, focus, 2);

    expect(zoomOf(zoomed)).toBeCloseTo(2);
    expect(zoomed.left + focus.x * (zoomed.right - zoomed.left)).toBeCloseTo(0.25);
    expect(zoomed.top + focus.y * (zoomed.bottom - zoomed.top)).toBeCloseTo(0.75);
  });

  it('stays inside the plot when zooming in near an edge', () => {
    const zoomed = zoomAt(WHOLE_PLOT, { x: 1, y: 0 }, 4);

    expect(zoomed.right).toBeCloseTo(1);
    expect(zoomed.top).toBeCloseTo(0);
    expect(zoomed.left).toBeCloseTo(0.75);
  });

  it('neither zooms past the deepest zoom nor out past the whole plot', () => {
    const deep = zoomAt(WHOLE_PLOT, { x: 0.5, y: 0.5 }, 100);
    const out = zoomAt(deep, { x: 0.5, y: 0.5 }, 0.001);

    expect(zoomOf(deep)).toBeCloseTo(MAX_ZOOM);
    expect(out).toEqual(WHOLE_PLOT);
    expect(isZoomed(out)).toBe(false);
  });
});

describe('panBy', () => {
  it('moves the window against the drag and stops at the plot edge', () => {
    const zoomed = zoomAt(WHOLE_PLOT, { x: 0.5, y: 0.5 }, 2);

    const dragged = panBy(zoomed, { x: 0.1, y: 0 });
    const pastEdge = panBy(zoomed, { x: 5, y: 0 });

    expect(dragged.left).toBeCloseTo(zoomed.left - 0.05);
    expect(pastEdge.left).toBe(0);
    expect(pastEdge.right - pastEdge.left).toBeCloseTo(0.5);
  });
});

describe('inView', () => {
  it('places a share of the plot within the window', () => {
    expect(inView(0.5, 0.25, 0.75)).toBeCloseTo(0.5);
    expect(inView(0.1, 0.25, 0.75)).toBeLessThan(0);
  });
});
