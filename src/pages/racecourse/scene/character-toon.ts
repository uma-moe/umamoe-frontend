// Draws a uma the way the game's character shader does: a computed cel step over the baked texture
// plus a per-texel shadow tint.
//
// Read from the shipped shader `Gallop/3D/Chara/Toon/TSER` (DXBC disassembly, pass 0). The step is
// arithmetic, not a lookup:
//
//   halfLambert = N·L * 0.5 + 0.5
//   shadow      = saturate(((step - feather) - halfLambert) / feather + 1)
//   tinted      = albedo * toonMap                    (a 2-D shadow-colour mask, sampled at UV0)
//   out         = mix(albedo, tinted, shadow)
//
// `_ToonStep` is 0.4 and `_ToonFeather` 0.001 on the shipped body material, which makes the transition
// one texel wide, i.e. a hard cel edge.
//
// The light comes from the camera instead of from a fixed sun: the viewer orbits, and the game's light
// is whatever the scene sets. It keeps the cel edge readable from any angle.
//
// Not ported, and why: the per-region tint masks (`_TripleMaskMap` / `_OptionMaskMap`), the rim and
// specular terms, the dirt and emissive layers, and the outline pass. Those need the slot-to-uniform
// mapping the export could not pin down (the shader samples seven textures but Unity's serialized
// parameter table names only `_MainTex`), and they change detail, not the cel step this proves.

import {
  Color,
  DataTexture,
  FrontSide,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
  type BufferGeometry,
  type Material,
  type Mesh,
  type Object3D,
  type Texture
} from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';

interface UnitySlot {
  index: number;
}

interface UnityMaterial {
  textures?: Record<string, UnitySlot>;
  floats?: Record<string, number>;
  colors?: Record<string, number[]>;
}

/** Stands in for a material that binds no texture of its own. */
const WHITE = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
WHITE.needsUpdate = true;

const vertexShader = /* glsl */ `
  attribute vec4 aUnityColor;

  varying vec2 vUv;
  varying vec3 vNormalWorld;
  varying vec4 vColor;

  void main() {
    vUv = uv;
    vColor = aUnityColor;
    vNormalWorld = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uMainTex;
  uniform sampler2D uToonMap;
  uniform float uToonStep;
  uniform float uToonFeather;
  uniform float uCutoff;
  uniform vec3 uLightDirection;
  uniform vec3 uLightColor;
  uniform vec3 uCharaColor;

  varying vec2 vUv;
  varying vec3 vNormalWorld;
  varying vec4 vColor;

  void main() {
    vec4 main = texture2D(uMainTex, vUv);
    if (uCutoff > 0.0 && main.a < uCutoff) discard;

    vec3 albedo = main.rgb * uCharaColor * uLightColor;

    float halfLambert = dot(normalize(vNormalWorld), uLightDirection) * 0.5 + 0.5;
    float shadow = uToonFeather > 0.0
      ? clamp(((uToonStep - uToonFeather) - halfLambert) / uToonFeather + 1.0, 0.0, 1.0)
      : 0.0;

    vec3 tinted = albedo * texture2D(uToonMap, vUv).rgb;
    vec3 color = mix(albedo, tinted, shadow);

    gl_FragColor = vec4(color, main.a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function unityOf(material: Material): UnityMaterial | undefined {
  return (material.userData as { unity?: UnityMaterial } | undefined)?.unity;
}

function linearColor(value: number[] | undefined, fallback: Color): Color {
  if (!value || value.length < 3) return fallback.clone();
  return new Color().setRGB(value[0]!, value[1]!, value[2]!, SRGBColorSpace);
}

/** The game's vertex colour attribute, under a name three will not touch. */
function ensureVertexColor(geometry: BufferGeometry): void {
  if (geometry.getAttribute('aUnityColor')) return;
  const source = geometry.getAttribute('_UNITY_COLOR');
  if (source) geometry.setAttribute('aUnityColor', source);
}

/**
 * Rebuilds the outfit's materials with the character toon, and returns the materials whose light
 * direction follows the camera. Textures come through the glTF parser so the shadow mask loads even
 * though no material references it as a PBR map.
 */
export async function applyCharacterMaterials(gltf: GLTF): Promise<ShaderMaterial[]> {
  const meshes: Mesh[] = [];
  gltf.scene.traverse((child: Object3D) => {
    const mesh = child as Mesh;
    if (mesh.isMesh) meshes.push(mesh);
  });

  const wanted = new Set<number>();
  for (const mesh of meshes)
    for (const material of [mesh.material].flat())
      for (const slot of Object.values(unityOf(material)?.textures ?? {})) wanted.add(slot.index);

  const textures = new Map<number, Texture>();
  await Promise.all(
    [...wanted].map(async (index) => {
      const texture = (await gltf.parser.getDependency('texture', index)) as Texture;
      texture.colorSpace = SRGBColorSpace;
      textures.set(index, texture);
    })
  );

  const rebuilt = new Map<Material, ShaderMaterial>();
  const convert = (source: Material): ShaderMaterial => {
    const cached = rebuilt.get(source);
    if (cached) return cached;

    const unity = unityOf(source);
    const slot = (name: string) => {
      const index = unity?.textures?.[name]?.index;
      return index === undefined ? undefined : textures.get(index);
    };

    const material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      side: FrontSide,
      uniforms: {
        uMainTex: { value: slot('_MainTex') ?? WHITE },
        uToonMap: { value: slot('_ToonMap') ?? WHITE },
        uToonStep: { value: unity?.floats?._ToonStep ?? 0.4 },
        uToonFeather: { value: unity?.floats?._ToonFeather ?? 0.001 },
        uCutoff: { value: source.alphaTest > 0 ? (unity?.floats?._Cutoff ?? source.alphaTest) : 0 },
        uLightDirection: { value: new Vector3(0, 1, 0) },
        uLightColor: { value: new Color(1, 1, 1) },
        uCharaColor: { value: linearColor(unity?.colors?._CharaColor, new Color(1, 1, 1)) }
      }
    });

    rebuilt.set(source, material);
    return material;
  };

  const materials = new Set<ShaderMaterial>();
  for (const mesh of meshes) {
    ensureVertexColor(mesh.geometry);
    const converted = [mesh.material].flat().map(convert);
    mesh.material = Array.isArray(mesh.material) ? converted : converted[0]!;
    for (const material of converted) materials.add(material);
    // A skinned mesh's bounds are in bind pose; the viewer moves the whole outfit instead.
    mesh.frustumCulled = false;
  }

  return [...materials];
}

/** Points the character light from the camera, so the cel edge stays readable while orbiting. */
export function aimCharacterLight(
  materials: ShaderMaterial[],
  cameraPosition: Vector3,
  subjectPosition: Vector3
): void {
  const direction = cameraPosition
    .clone()
    .sub(subjectPosition)
    .setY(0)
    .normalize()
    .add(new Vector3(0, 1.1, 0))
    .normalize();
  for (const material of materials) material.uniforms.uLightDirection!.value = direction.clone();
}
