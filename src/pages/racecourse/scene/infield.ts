// Which part of a course is inside the oval.
//
// The racing surface is the only boundary the model gives us, so the infield is whatever that surface
// encloses: rasterise the surface points onto a coarse grid, grow it so gaps between vertices do not
// leak, then flood in from the border. Anything the flood cannot reach is inside.

export interface Footprint {
  /** Whether a point on the ground lies inside the oval. */
  inside(x: number, z: number): boolean;
}

/** Grid resolution in metres. Fine enough for a tree, coarse enough to be free at load. */
const CELL = 6;
/** How many cells the surface is grown by, to close the gaps between its vertices. */
const GROWTH = 2;
/** Room around the surface so the flood always has a border to start from. */
const MARGIN = 4;

/** Builds the infield test from the XZ points of the racing surface. */
export function infieldFootprint(points: readonly (readonly [number, number])[]): Footprint {
  if (points.length === 0) return { inside: () => false };

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  const originX = minX - CELL * MARGIN;
  const originZ = minZ - CELL * MARGIN;
  const columns = Math.ceil((maxX - originX) / CELL) + MARGIN;
  const rows = Math.ceil((maxZ - originZ) / CELL) + MARGIN;
  const at = (column: number, row: number) => row * columns + column;
  const cellX = (x: number) => Math.floor((x - originX) / CELL);
  const cellZ = (z: number) => Math.floor((z - originZ) / CELL);

  const surface = new Uint8Array(columns * rows);
  for (const [x, z] of points) {
    const column = cellX(x);
    const row = cellZ(z);
    if (column < 0 || row < 0 || column >= columns || row >= rows) continue;
    surface[at(column, row)] = 1;
  }

  for (let pass = 0; pass < GROWTH; pass += 1) {
    const grown = surface.slice();
    for (let row = 1; row < rows - 1; row += 1)
      for (let column = 1; column < columns - 1; column += 1) {
        if (!surface[at(column, row)]) continue;
        for (let dz = -1; dz <= 1; dz += 1)
          for (let dx = -1; dx <= 1; dx += 1) grown[at(column + dx, row + dz)] = 1;
      }
    surface.set(grown);
  }

  const outside = new Uint8Array(columns * rows);
  const queue: number[] = [];
  const seed = (column: number, row: number) => {
    const cell = at(column, row);
    if (surface[cell] || outside[cell]) return;
    outside[cell] = 1;
    queue.push(cell);
  };
  for (let column = 0; column < columns; column += 1) {
    seed(column, 0);
    seed(column, rows - 1);
  }
  for (let row = 0; row < rows; row += 1) {
    seed(0, row);
    seed(columns - 1, row);
  }

  while (queue.length > 0) {
    const cell = queue.pop() as number;
    const column = cell % columns;
    const row = (cell - column) / columns;
    if (column > 0) seed(column - 1, row);
    if (column < columns - 1) seed(column + 1, row);
    if (row > 0) seed(column, row - 1);
    if (row < rows - 1) seed(column, row + 1);
  }

  return {
    inside(x: number, z: number) {
      const column = cellX(x);
      const row = cellZ(z);
      if (column < 0 || row < 0 || column >= columns || row >= rows) return false;
      const cell = at(column, row);
      return !surface[cell] && !outside[cell];
    }
  };
}
