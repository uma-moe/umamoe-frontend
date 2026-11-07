import { expect, it } from 'vitest';
import { cameraMatrix, projectPoint, screenPoints } from './screen-projection';

it('puts the camera position on the centre and turns course directions by the camera angle', () => {
  const camera = { x: 100, y: 50, scale: 4, angle: Math.PI / 2 };
  const matrix = cameraMatrix(camera, { x: 300, y: 200 });

  const atCamera = projectPoint(matrix, { x: 100, y: 50 });
  const oneUnitAlong = projectPoint(matrix, { x: 101, y: 50 });

  expect(atCamera.x).toBeCloseTo(300);
  expect(atCamera.y).toBeCloseTo(200);
  expect(oneUnitAlong.x).toBeCloseTo(300);
  expect(oneUnitAlong.y).toBeCloseTo(204);
});

it('writes projected points as SVG points rounded to a tenth of a pixel', () => {
  const matrix = cameraMatrix({ x: 0, y: 0, scale: 1, angle: 0 }, { x: 10, y: 20 });

  const points = screenPoints(matrix, [
    { x: 0.123, y: 0 },
    { x: 5, y: -2.468 }
  ]);

  expect(points).toBe('10.1,20 15,17.5');
});
