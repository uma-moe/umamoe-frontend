import { describe, expect, it } from 'vitest';
import {
  cropPixels,
  dragCrop,
  fitCropAspect,
  FULL_CROP,
  layerPlacement,
  MIN_CROP_PIXELS
} from './clip-crop';

const stage = { width: 1000, height: 500 };
const centre = { x: 0.2, y: 0.2, width: 0.4, height: 0.4 };

describe('dragCrop', () => {
  it('moves the window and keeps it on the stage', () => {
    const moved = dragCrop({ start: centre, handle: 'move', dx: 900, dy: -50, stage });

    expect(cropPixels(moved, stage)).toEqual({ x: 600, y: 50, width: 400, height: 200 });
  });

  it('drags a corner freely, stopping at the stage edge', () => {
    const dragged = dragCrop({ start: centre, handle: 'se', dx: 100, dy: 1000, stage });

    expect(cropPixels(dragged, stage)).toEqual({ x: 200, y: 100, width: 500, height: 400 });
  });

  it('keeps the smallest window when an edge crosses the opposite one', () => {
    const dragged = dragCrop({ start: centre, handle: 'w', dx: 800, dy: 0, stage });
    const box = cropPixels(dragged, stage);

    expect(box.width).toBeCloseTo(MIN_CROP_PIXELS);
    expect(box.x + box.width).toBeCloseTo(600);
  });

  it('holds the aspect from a corner, anchored at the opposite corner', () => {
    const dragged = dragCrop({ start: centre, handle: 'nw', dx: -100, dy: 0, stage, aspect: 1 });
    const box = cropPixels(dragged, stage);

    expect(box.width).toBeCloseTo(500);
    expect(box.height).toBeCloseTo(500);
    expect(box.x + box.width).toBeCloseTo(600);
    expect(box.y).toBeCloseTo(0);
  });

  it('holds the aspect from an edge, centred across it', () => {
    const dragged = dragCrop({ start: centre, handle: 's', dx: 0, dy: 50, stage, aspect: 2 });
    const box = cropPixels(dragged, stage);

    expect(box.height).toBeCloseTo(250);
    expect(box.width).toBeCloseTo(500);
    expect(box.x).toBeCloseTo(150);
  });
});

describe('fitCropAspect', () => {
  it('fits the largest window of the aspect on the stage', () => {
    const fitted = cropPixels(fitCropAspect(FULL_CROP, 16 / 9, stage), stage);

    expect(fitted.height).toBeCloseTo(500);
    expect(fitted.width).toBeCloseTo((500 * 16) / 9);
    expect(fitted.x).toBeCloseTo((1000 - (500 * 16) / 9) / 2);
  });

  it('centres on the current window as far as the stage allows', () => {
    const nearLeft = { x: 0, y: 0, width: 0.2, height: 0.4 };

    const fitted = cropPixels(fitCropAspect(nearLeft, 1, stage), stage);

    expect(fitted).toEqual({ x: 0, y: 0, width: 500, height: 500 });
  });
});

describe('layerPlacement', () => {
  const region = { x: 100, y: 50, width: 400, height: 200 };
  const frame = { width: 800, height: 400 };

  it('draws the part of a layer inside the crop, scaled to the frame', () => {
    const overlay = { x: 400, y: 0, width: 300, height: 100 };

    const placement = layerPlacement({ layer: overlay, region, frame });

    expect(placement).toEqual({
      view: { x: 0, y: 50, width: 100, height: 50 },
      target: { x: 600, y: 0, width: 200, height: 100 }
    });
  });

  it('skips a layer outside the crop', () => {
    const outside = { x: 600, y: 0, width: 100, height: 100 };

    expect(layerPlacement({ layer: outside, region, frame })).toBeUndefined();
  });
});
