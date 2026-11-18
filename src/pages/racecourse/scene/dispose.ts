// One place that frees what a course put on the GPU. Every path that drops a model goes through here:
// a course swap, a stale load, the marked course, the rail outline, leaving the page.
//
// Each resource is disposed exactly once even when several meshes share it.

import { Texture, type BufferGeometry, type Material, type Object3D } from 'three';
import { geometryOf, isShaderMaterial, materialsOf } from './three-guards';

/** The `userData` key that marks a texture as outliving any one model. */
const RETAINED = 'retained';

/**
 * Marks a texture as shared beyond the model that uses it, so no model's disposal frees it. The 1x1 white
 * fallback every rebuilt material shares is the one such texture.
 */
export function retain<T extends Texture>(texture: T): T {
  texture.userData[RETAINED] = true;
  return texture;
}

/** The textures a material holds: its own, and the samplers a shader keeps in its uniforms. */
function texturesOf(material: Material): Texture[] {
  const textures: Texture[] = [];
  for (const value of Object.values(material)) if (value instanceof Texture) textures.push(value);

  if (!isShaderMaterial(material)) return textures;
  for (const uniform of Object.values(material.uniforms)) {
    const value = uniform?.value;
    if (value instanceof Texture) textures.push(value);
  }
  return textures;
}

/** Frees the geometry, materials and textures of one or more detached node trees. */
export function disposeObjects(...roots: readonly Object3D[]): void {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();

  for (const root of roots) {
    root.traverse((child) => {
      const geometry = geometryOf(child);
      if (geometry) geometries.add(geometry);

      for (const material of materialsOf(child)) {
        materials.add(material);
        for (const texture of texturesOf(material)) textures.add(texture);
      }
    });
  }

  for (const texture of textures) if (texture.userData[RETAINED] !== true) texture.dispose();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}
