import type { TrackCamera } from '../replay-track';

/** A 2D affine map from course coordinates to map pixels, in SVG matrix order. */
export type ScreenMatrix = { a: number; b: number; c: number; d: number; e: number; f: number };

type Point = { x: number; y: number };

/** Rotates and scales the course around the camera position, which lands on the given centre. */
export function cameraMatrix(camera: TrackCamera, centre: Point): ScreenMatrix {
  const { x, y, scale, angle } = camera;
  const a = Math.cos(angle) * scale,
    b = Math.sin(angle) * scale;

  return { a, b, c: -b, d: a, e: centre.x - (a * x - b * y), f: centre.y - (b * x + a * y) };
}

export function projectPoint(m: ScreenMatrix, p: Point): Point {
  return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
}

// The map draws course geometry in pixels rather than under a moving SVG transform: Firefox treats a
// transform that changes every frame as an animation and stretches a cached, blurred raster of it.
export function screenPoints(m: ScreenMatrix, points: Point[]): string {
  let text = '';
  for (const p of points) {
    const x = m.a * p.x + m.c * p.y + m.e,
      y = m.b * p.x + m.d * p.y + m.f;

    text += (text ? ' ' : '') + Math.round(x * 10) / 10 + ',' + Math.round(y * 10) / 10;
  }

  return text;
}
