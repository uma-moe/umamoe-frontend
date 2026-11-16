// A ground height field for the course, so characters stand on the track instead of sinking into it.
//
// The game rails its characters: they are animated along a path, so nothing in the outfit or the
// course provides collision. The course models are the only source of truth, and raycasting 200k
// triangles every frame is not affordable, so the vertices of the track and turf meshes are splatted
// into a grid once per course load. Each cell keeps the highest surface it saw, which is what a hoof
// should stand on; a cell with nothing in it is filled from its neighbours.

import { Box3, Vector3, type Mesh } from 'three';

export interface HeightField {
  /** Ground height under that world position, or `undefined` outside the course. */
  sample(x: number, z: number): number | undefined;
}

/** Cells across the longest side of the course: ~8 m per cell on a 1000 m course. */
const RESOLUTION = 128;

export function buildHeightField(meshes: Mesh[], area: Box3): HeightField {
  const size = area.getSize(new Vector3());
  const step = Math.max(size.x, size.z) / RESOLUTION;
  const columns = Math.max(Math.ceil(size.x / step), 1) + 1;
  const rows = Math.max(Math.ceil(size.z / step), 1) + 1;
  const heights = new Float32Array(columns * rows).fill(Number.NEGATIVE_INFINITY);

  const vertex = new Vector3();
  for (const mesh of meshes) {
    mesh.updateWorldMatrix(true, false);
    const position = mesh.geometry.getAttribute('position');
    if (!position) continue;
    for (let i = 0; i < position.count; i += 1) {
      vertex.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      const column = Math.round((vertex.x - area.min.x) / step);
      const row = Math.round((vertex.z - area.min.z) / step);
      if (column < 0 || row < 0 || column >= columns || row >= rows) continue;
      const index = row * columns + column;
      if (vertex.y > heights[index]!) heights[index] = vertex.y;
    }
  }

  /** Fills the holes the mesh leaves — the grid is coarser than the geometry. */
  function nearest(column: number, row: number): number | undefined {
    for (let radius = 1; radius <= 3; radius += 1) {
      for (let dc = -radius; dc <= radius; dc += 1) {
        for (let dr = -radius; dr <= radius; dr += 1) {
          const c = column + dc;
          const r = row + dr;
          if (c < 0 || r < 0 || c >= columns || r >= rows) continue;
          const value = heights[r * columns + c]!;
          if (Number.isFinite(value)) return value;
        }
      }
    }
    return undefined;
  }

  return {
    sample(x, z) {
      const column = Math.round((x - area.min.x) / step);
      const row = Math.round((z - area.min.z) / step);
      if (column < 0 || row < 0 || column >= columns || row >= rows) return undefined;
      const value = heights[row * columns + column]!;
      return Number.isFinite(value) ? value : nearest(column, row);
    }
  };
}
