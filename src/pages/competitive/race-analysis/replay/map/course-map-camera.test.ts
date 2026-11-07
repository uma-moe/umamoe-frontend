import { expect, test } from 'vitest';
import { CourseMapCamera } from './course-map-camera.svelte';

const INNER_Y = 100;

test.each([
  { infieldEdge: 'bottom' as const, outerY: 90, aimOutsideY: 40 },
  { infieldEdge: 'top' as const, outerY: 110, aimOutsideY: 160 }
])(
  'follow zoom keeps the inner edge at the $infieldEdge infield edge',
  async ({ infieldEdge, outerY, aimOutsideY }) => {
    const framing = [0, 100].flatMap((distance) => [
      { x: distance, y: INNER_Y, distance },
      { x: distance, y: outerY, distance }
    ]);

    const camera = new CourseMapCamera({
      framing: () => framing,
      inset: () => 0,
      centreShift: () => 0,
      infieldEdge: () => infieldEdge
    });

    camera.width = 800;
    camera.height = 300;
    await camera.motion.set({ x: 50, y: aimOutsideY, scale: 32, angle: 0 }, { instant: true });

    const innerEdge = { x: 50, y: INNER_Y };
    const settled = camera.project(innerEdge);
    camera.zoom(1.5);
    const zoomed = camera.project(innerEdge);

    expect(settled.y).toBeCloseTo(camera.infieldY);
    expect(zoomed.y).toBeCloseTo(camera.infieldY);
  }
);
