// What in a loaded course model is course, what is racing surface, and what is sky.

import { Box3, Raycaster, Vector3, type Mesh, type Object3D } from 'three';
import { isSkyNode, isSurfaceMesh, isTrackPart } from './course-mesh';
import { isMesh } from './three-guards';

const DOWN = new Vector3(0, -1, 0);
/** Where the ray that measures the track starts, above the highest point of the course. */
const RAY_CEILING = 50;
/** The height the search starts at when the course box has no top yet. */
const NO_AREA_CEILING = 100;
/** How far above the facet it hit the band is laid, so it does not fight the surface for the depth. */
const BAND_LIFT = 0.6;
/** The height the band falls back to when there is no surface to measure. */
const NO_SURFACE_HEIGHT = 0.5;

/**
 * The course without its sky dome, and without the trees and stands: those reach further out than
 * the racing surface, and the model also carries a ring of distant scenery that would shrink the
 * ring the reader came to see. Only the track and turf parts decide the frame.
 */
export function courseBounds(model: Object3D): Box3 {
  // The racing surface itself, wherever it sits in the model: track and turf, track and dirt.
  const surface = new Box3();
  model.traverse((child) => {
    if (isSurfaceMesh(child)) surface.expandByObject(child);
  });
  if (!surface.isEmpty()) return surface;

  const parts = new Box3();
  for (const child of model.children)
    if (!isSkyNode(child) && isTrackPart(child)) parts.expandByObject(child);

  if (!parts.isEmpty()) return parts;
  for (const child of model.children) if (!isSkyNode(child)) parts.expandByObject(child);
  return parts.isEmpty() ? new Box3().setFromObject(model) : parts;
}

/** The sky domes the model ships, which follow the camera and never decide the framing. */
export function findSkyNodes(model: Object3D): Object3D[] {
  return [...model.children].filter((child) => isSkyNode(child));
}

/** The meshes a marked course is laid on: the racing surface, with geometry to draw. */
export function collectSurfaces(model: Object3D): Mesh[] {
  const surfaces: Mesh[] = [];
  model.traverse((child) => {
    if (!isSurfaceMesh(child) || !isMesh(child)) return;
    if (!child.geometry) return;
    surfaces.push(child);
  });
  return surfaces;
}

/**
 * Height of the track under a point, so a marked line sits on the surface rather than through it. A
 * point that misses the surface has no height, which is not the same as sitting at zero.
 *
 * The search starts above the course box; `ceiling` is its highest point, when there is one.
 */
export function createSurfaceQuery(
  surfaces: readonly Mesh[],
  ceiling: number | undefined
): (x: number, z: number) => number | undefined {
  if (surfaces.length === 0) return () => NO_SURFACE_HEIGHT;

  const targets = [...surfaces];
  const raycaster = new Raycaster();
  const origin = new Vector3();
  const top = (ceiling ?? NO_AREA_CEILING) + RAY_CEILING;

  return (x, z) => {
    raycaster.set(origin.set(x, top, z), DOWN);
    const hit = raycaster.intersectObjects(targets, false)[0];
    return hit ? hit.point.y + BAND_LIFT : undefined;
  };
}
