// Type narrowing for three's object graph. A traversal hands back `Object3D`, but only the renderable
// children carry geometry and materials; these predicates say which, so callers never reach for
// `Object3D & { geometry?: ... }` themselves.

import { LineSegments, Mesh, type BufferGeometry, type Material, type Object3D } from 'three';
import type { ShaderMaterial } from 'three';

/** Whether this node is drawn as a mesh, rather than being a group, a light or the scene root. */
export function isMesh(object: Object3D): object is Mesh {
  return (object as Partial<Mesh>).isMesh === true;
}

/** Whether this node draws line segments, which is how the rail outline is built. */
export function isLineSegments(object: Object3D): object is LineSegments {
  return (object as Partial<LineSegments>).isLineSegments === true;
}

/** The geometry a drawn node owns, if the node draws anything at all. */
export function geometryOf(object: Object3D): BufferGeometry | undefined {
  if (isMesh(object) || isLineSegments(object)) return object.geometry;
  return undefined;
}

interface CarriesMaterial {
  material?: Material | Material[];
}

/**
 * A node's materials, always as a list. Groups and scenes have none. This is the one place that reads
 * `material` off a node without knowing which three object it is.
 */
export function materialsOf(object: Object3D): Material[] {
  const { material } = object as CarriesMaterial;
  if (!material) return [];
  return Array.isArray(material) ? material : [material];
}

/** Whether this material is a `ShaderMaterial`, whose textures live in its uniforms. */
export function isShaderMaterial(material: Material): material is ShaderMaterial {
  return (material as Partial<ShaderMaterial>).isShaderMaterial === true;
}
