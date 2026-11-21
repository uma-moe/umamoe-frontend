import { describe, expect, it } from 'vitest';
import {
  CAMERA_FOV,
  FRAME_MARGIN,
  PORTRAIT_DIRECTION,
  OPENING_DIRECTION,
  farFor,
  fitDistance,
  topDownDistance,
  zoomStep
} from './framing';

const tanHalfFov = Math.tan((CAMERA_FOV * Math.PI) / 360);

describe('fitDistance', () => {
  it('stands the camera where the box silhouette just fits, plus the margin', () => {
    // Looking from 45 degrees above, along -z: the view is upright, so the vertical extent includes the
    // box's height and depth and the lateral extent is its width.
    const distance = fitDistance({
      size: { x: 10, y: 4, z: 6 },
      direction: { x: 0, y: Math.SQRT1_2, z: Math.SQRT1_2 },
      aspect: 2,
      fov: CAMERA_FOV
    });

    const halfVertical = (4 * Math.SQRT1_2 + 6 * Math.SQRT1_2) / 2;
    const halfLateral = 10 / 2;
    const expected =
      Math.max(halfLateral / (tanHalfFov * 2), halfVertical / tanHalfFov) * FRAME_MARGIN;

    expect(distance).toBeCloseTo(expected, 6);
  });

  it('moves back for a bigger course, and for a stage too narrow to use the width', () => {
    const base = { direction: OPENING_DIRECTION, fov: CAMERA_FOV };
    const size = { x: 100, y: 20, z: 60 };
    const small = fitDistance({ ...base, size, aspect: 2 });
    const large = fitDistance({ ...base, size: { x: 1000, y: 200, z: 600 }, aspect: 2 });
    const narrow = fitDistance({ ...base, size, aspect: 1 });

    expect(large).toBeCloseTo(small * 10, 6);
    expect(narrow).toBeGreaterThan(small);
  });

  it('frames a phone from further back than a desktop, which is why portrait looks down more', () => {
    const size = { x: 1000, y: 60, z: 700 };
    const landscape = fitDistance({
      size,
      direction: OPENING_DIRECTION,
      aspect: 2,
      fov: CAMERA_FOV
    });
    const portrait = fitDistance({
      size,
      direction: PORTRAIT_DIRECTION,
      aspect: 0.5,
      fov: CAMERA_FOV
    });

    expect(portrait).toBeGreaterThan(landscape);
  });

  it('has no distance to give for a direction with no right vector', () => {
    const distance = fitDistance({
      size: { x: 10, y: 4, z: 6 },
      direction: { x: 0, y: 1, z: 0 },
      aspect: 2,
      fov: CAMERA_FOV
    });

    expect(Number.isFinite(distance)).toBe(true);
    expect(distance).toBe(0);
  });
});

describe('topDownDistance', () => {
  it('fits the north-south span into the vertical field of view', () => {
    expect(
      topDownDistance({ size: { x: 20, y: 1, z: 20 }, aspect: 2, fov: CAMERA_FOV })
    ).toBeCloseTo((10 / tanHalfFov) * FRAME_MARGIN, 6);
  });

  it('fits the east-west span into the horizontal field of view on a wide stage', () => {
    expect(
      topDownDistance({ size: { x: 200, y: 1, z: 10 }, aspect: 2, fov: CAMERA_FOV })
    ).toBeCloseTo((100 / (tanHalfFov * 2)) * FRAME_MARGIN, 6);
  });
});

it('puts the far plane past the frame by four course radii', () => {
  expect(farFor(800, 500)).toBe(2800);
});

it('zooms a quarter of the way, and never less than four metres', () => {
  expect(zoomStep(1000, 1)).toBe(250);
  expect(zoomStep(1000, -1)).toBe(-250);
  expect(zoomStep(4, 1)).toBe(4);
});
