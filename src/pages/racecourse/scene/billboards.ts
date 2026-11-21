// The trees standing in the course. They are flat quads, so they only read as trees when they face the
// camera; the game turns them the same way.

import { Box3, Vector3, type Object3D } from 'three';
import { isTreeMesh } from './course-mesh';

/**
 * The widest a single tree quad gets, in metres. Some courses also bake a whole tree line into one mesh
 * (`tree_alpha` on Longchamp is 1.5 km across); turning that would swing every tree at once.
 */
const TREE_SPAN = 40;
/** How far past the course box a tree still counts as part of the course, in metres. */
const TREE_REACH = 20;

export interface Billboard {
  node: Object3D;
  /** Where the quad turns, in world space. */
  x: number;
  z: number;
}

/**
 * Collects the trees standing in the course, with the position their quad turns around. The course box
 * decides that, not the infield footprint: the footprint floods through gaps in the surface and calls
 * most of the infield outside, so nothing in there would ever be turned.
 */
export function collectBillboards(model: Object3D, area: Box3 | undefined): Billboard[] {
  const trees: Billboard[] = [];
  if (!area) return trees;

  const reach = area.clone().expandByScalar(TREE_REACH);
  const position = new Vector3();
  const box = new Box3();
  model.traverse((child) => {
    if (!isTreeMesh(child)) return;
    // One tree, not a merged layer of them: those have no single angle to turn to.
    box.setFromObject(child);
    if (Math.max(box.max.x - box.min.x, box.max.z - box.min.z) > TREE_SPAN) return;
    child.getWorldPosition(position);
    if (position.x < reach.min.x || position.x > reach.max.x) return;
    if (position.z < reach.min.z || position.z > reach.max.z) return;
    trees.push({ node: child, x: position.x, z: position.z });
  });
  return trees;
}

/**
 * The angle that turns a tree towards a camera, or undefined when the camera stands on top of it: looking
 * straight down gives no direction to turn to, and jittering there would read as flicker.
 */
export function facingAngle(
  tree: { x: number; z: number },
  camera: { x: number; z: number }
): number | undefined {
  const dx = camera.x - tree.x;
  const dz = camera.z - tree.z;
  if (dx * dx + dz * dz < 1) return undefined;
  return Math.atan2(dx, dz);
}

/** Turns each infield tree to face the camera, keeping it upright the way the game draws them. */
export function faceBillboards(
  trees: readonly Billboard[],
  camera: { x: number; z: number }
): void {
  for (const tree of trees) {
    const angle = facingAngle(tree, camera);
    if (angle === undefined) continue;
    tree.node.rotation.y = angle;
  }
}
