/** An icon's true point on the plot, in pixels from its top-left corner. */
export interface IconTarget {
  id: number;
  x: number;
  y: number;
}

/** Where an icon is drawn, beside the point it stands for. */
export interface PlacedIcon {
  id: number;
  x: number;
  y: number;
  anchorX: number;
  anchorY: number;
  /** Drawn away from its point, so a leader line shows where it belongs. */
  moved: boolean;
}

export interface IconLayoutOptions {
  width: number;
  height: number;
  /** Icon edge and the space kept between icons, in pixels. */
  size: number;
  gap: number;
  /** How far an icon may move from its point, in icon footprints; defaults to one. */
  reach?: number;
}

/** Candidate offsets in grid steps, nearest first; moving up or down costs more because height is the value. */
function offsetsWithin(rings: number): { dx: number; dy: number }[] {
  const offsets: { dx: number; dy: number; cost: number }[] = [];
  for (let dx = -rings; dx <= rings; dx++) {
    for (let dy = -rings; dy <= rings; dy++) {
      offsets.push({ dx, dy, cost: dx * dx + 4 * dy * dy });
    }
  }

  return offsets.sort((left, right) => left.cost - right.cost);
}

const GRID_STEPS_PER_ICON = 4;

/**
 * Earlier icons keep their point; later ones take a nearby free spot, preferring sideways moves. Crowded icons with
 * no free spot in reach stack at their point instead of pushing farther away.
 */
export function placeIcons(targets: IconTarget[], options: IconLayoutOptions): PlacedIcon[] {
  const { width, height, size, gap, reach = 1 } = options;
  const footprint = size + gap;
  const half = size / 2;
  const step = footprint / GRID_STEPS_PER_ICON;
  const offsets = offsetsWithin(Math.ceil(reach * GRID_STEPS_PER_ICON));

  // Placed icons by grid cell of one footprint, so a spot is checked against its neighbours only.
  const cells = new Map<string, PlacedIcon[]>();
  const cellKey = (column: number, row: number) => `${column}:${row}`;

  function overlaps(x: number, y: number): boolean {
    const column = Math.floor(x / footprint);
    const row = Math.floor(y / footprint);
    for (let dc = -1; dc <= 1; dc++) {
      for (let dr = -1; dr <= 1; dr++) {
        const neighbours = cells.get(cellKey(column + dc, row + dr)) ?? [];
        const touching = neighbours.some(
          (icon) => Math.abs(icon.x - x) < footprint && Math.abs(icon.y - y) < footprint
        );
        if (touching) return true;
      }
    }

    return false;
  }

  function inside(x: number, y: number): boolean {
    return x >= half && x <= width - half && y >= half && y <= height - half;
  }

  const placed: PlacedIcon[] = [];
  for (const target of targets) {
    const anchorX = Math.min(Math.max(target.x, half), width - half);
    const anchorY = Math.min(Math.max(target.y, half), height - half);
    let x = anchorX;
    let y = anchorY;
    for (const offset of offsets) {
      const spotX = anchorX + offset.dx * step;
      const spotY = anchorY + offset.dy * step;
      if (inside(spotX, spotY) && !overlaps(spotX, spotY)) {
        x = spotX;
        y = spotY;
        break;
      }
    }

    const icon: PlacedIcon = {
      id: target.id,
      x,
      y,
      anchorX: target.x,
      anchorY: target.y,
      moved: Math.hypot(x - target.x, y - target.y) > size / 4
    };
    const key = cellKey(Math.floor(x / footprint), Math.floor(y / footprint));
    const cell = cells.get(key);
    if (cell === undefined) cells.set(key, [icon]);
    else cell.push(icon);

    placed.push(icon);
  }

  return placed;
}
