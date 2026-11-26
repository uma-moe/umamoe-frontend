// The rail the marked course follows: the racing surface's own edges, drawn so the fit can be checked.

import { EdgesGeometry, Group, LineBasicMaterial, LineSegments, type Mesh } from 'three';

/** The colour the rail outline is drawn in: neither the band nor the track can hide it. */
const RAIL_OUTLINE = 0xff3ea5;
/**
 * How sharp a crease in the racing surface has to be to count as a rail, in degrees. The fence is a step
 * in the mesh rather than a free edge, so this is what both the outline and the band go by.
 */
const RAIL_EDGE_ANGLE = 20;

/**
 * Draws the racing surface's own edges: the two rails, and the ends of the ribbon. A marked course is
 * laid against one of them, so seeing them is how that fit gets checked.
 */
export function createRailOutline(surfaces: readonly Mesh[]): Group {
  const group = new Group();
  for (const surface of surfaces) {
    if (!surface.geometry) continue;
    const edges = new LineSegments(
      new EdgesGeometry(surface.geometry, RAIL_EDGE_ANGLE),
      new LineBasicMaterial({
        color: RAIL_OUTLINE,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4
      })
    );
    // The geometry is in the mesh's own frame, so the line takes the mesh's place in the world.
    surface.updateWorldMatrix(true, false);
    edges.applyMatrix4(surface.matrixWorld);
    edges.renderOrder = 3;
    group.add(edges);
  }
  return group;
}
