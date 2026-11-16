// Draws an outfit with the game's own character shader.
//
// Ported from the shader the site publishes at
// `game-assets/shaders/gallop/3d/chara/toon/tser.json` (`Gallop/3D/Chara/Toon/TSER`, pass `Toon`,
// fragment source). The per-texel masks and the uniforms come from the model's `extras.unity`, so the
// same values the game uses drive it.
//
// Exact, from that source:
//
//   halfLambert = N·L * 0.5 + 0.5
//   shadow      = clamp(((_ToonStep - _ToonFeather) - triMask.r * halfLambert) / _ToonFeather + 1)
//   brightness  = 1 - (1 - vColor.a) * _VertexColorToonPower * (min(halfLambert - 0.5, 0) + 0.5)
//   side(base, c) = base * (brightness * on * (c.rgb - 1) + 1) + brightness * (1 - on) * c.rgb
//                   with on = 1 when c.a <= 0.5   (`.w` is an enable flag, not opacity)
//   lit         = side(_MainTex * _LightColor0, _ToonBrightColor)
//   dark        = side(_ToonMap * _LightColor0 * _GlobalToonColor, _ToonDarkColor)
//   out         = mix(lit, dark, shadow) + specular
//   specular    = pow(max(dot(N, V), 0), _SpecularPower * 10 + 1) * triMask.g * _SpecularColor
//   out         = out * _CharaColor * _LightProbeColor
//   out         = mix(luma(out), out * _Saturation, 1 - _Saturation)
//
// `_TripleMaskMap.r` is the per-texel toon mask and `.g` the specular mask; `_ToonMap` is a 2D
// shadow-colour mask. There is no ramp LUT anywhere.
//
// Approximated or left out, with the reason:
//   * Rim: the source skews the view vector by `_RimHorizonOffset` / `_RimVerticalOffset` in view
//     space. A plain Fresnel term stands in; the colour and the step are the same, the falloff shape
//     differs.
//   * Environment reflection, dirt, emissive and the highlight overlay are omitted: their textures
//     are not part of the published outfit and their weights are 0 on the shipped materials.
//   * Fog is omitted; the viewer draws none.

import {
  Color,
  DataTexture,
  FrontSide,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
  Vector4,
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

/** Unity's declared defaults for a material that binds no texture of its own. */
const WHITE = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
WHITE.needsUpdate = true;

const vertexShader = /* glsl */ `
  attribute vec4 aUnityColor;

  varying vec2 vUv;
  varying vec3 vNormalView;
  varying vec3 vPositionView;
  varying vec4 vColor;

  void main() {
    vUv = uv;
    vColor = aUnityColor;
    // View space: the camera is a fixed +Z direction there, which is what a skinned outfit needs —
    // its object matrix is not what carries the bind pose.
    vNormalView = normalize(normalMatrix * normal);
    vPositionView = (modelViewMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uMainTex;
  uniform sampler2D uTripleMaskMap;
  uniform sampler2D uToonMap;
  uniform float uToonStep;
  uniform float uToonFeather;
  uniform float uCutoff;
  uniform float uVertexColorToonPower;
  uniform float uSaturation;
  uniform float uSpecularPower;
  uniform vec3 uLightDirection;
  uniform vec3 uLightColor;
  uniform vec3 uGlobalToonColor;
  uniform vec3 uCharaColor;
  uniform vec3 uLightProbeColor;
  uniform vec3 uSpecularColor;
  uniform vec4 uToonBrightColor;
  uniform vec4 uToonDarkColor;
  uniform vec4 uRimColor;

  varying vec2 vUv;
  varying vec3 vNormalView;
  varying vec3 vPositionView;
  varying vec4 vColor;

  /** One toon side. The colour's alpha is an enable flag in the game's shader, not opacity. */
  vec3 toonSide(vec3 base, vec4 colour, float weight) {
    float enabled = colour.a <= 0.5 ? 1.0 : 0.0;
    vec3 multiply = weight * enabled * (colour.rgb - 1.0) + 1.0;
    vec3 add = weight * (1.0 - enabled) * colour.rgb;
    return base * multiply + add;
  }

  void main() {
    // The published outfits carry normals that point the wrong way on some meshes: the converter
    // mirrors X to undo Unity's handedness, and the meshes are not all mirrored the same. Orienting
    // every normal towards the viewer is the stable answer for a viewer, and it costs nothing while
    // the light sits behind the camera's shoulder.
    vec3 normal = normalize(vNormalView);
    if (normal.z < 0.0) normal = -normal;
    vec3 toView = normalize(-vPositionView);

    vec3 triMask = texture2D(uTripleMaskMap, vUv).rgb;
    if (uCutoff > 0.0 && triMask.b < uCutoff) discard;

    vec4 mainTex = texture2D(uMainTex, vUv);

    float halfLambert = dot(normal, uLightDirection) * 0.5 + 0.5;
    float shadow = uToonFeather > 0.0
      ? clamp(
          ((uToonStep - uToonFeather) - triMask.r * halfLambert) / uToonFeather + 1.0,
          0.0,
          1.0
        )
      : 0.0;

    float brightness =
      1.0 - (1.0 - vColor.a) * uVertexColorToonPower * (min(halfLambert - 0.5, 0.0) + 0.5);

    vec3 shadowTint = texture2D(uToonMap, vUv).rgb * uLightColor * uGlobalToonColor;
    vec3 dark = toonSide(shadowTint, uToonDarkColor, brightness);
    vec3 color = mix(toonSide(mainTex.rgb * uLightColor, uToonBrightColor, brightness), dark, shadow);

    float specular = pow(max(dot(normal, toView), 0.0), uSpecularPower * 10.0 + 1.0);
    color += max(vec3(specular * triMask.g) * uSpecularColor * uLightColor, vec3(0.0));

    // A silhouette rim, not a wash: the source skews the view vector so the term only reaches the
    // edges, and a plain Fresnel curve is the honest stand-in for that shape.
    float rim = pow(1.0 - clamp(dot(normal, toView), 0.0, 1.0), 3.0);
    color += uRimColor.rgb * rim * uRimColor.a;

    color *= uCharaColor * uLightProbeColor;

    float luma = dot(color, vec3(0.2125, 0.7154, 0.0721));
    color = mix(vec3(luma), color, uSaturation);

    gl_FragColor = vec4(color, mainTex.a);
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

/** A material colour that keeps its alpha, which the shader reads as an enable flag. */
function linearColor4(value: number[] | undefined, fallback: [number, number, number, number]) {
  const [r, g, b, a] = value ?? fallback;
  const colour = new Color().setRGB(
    r ?? fallback[0],
    g ?? fallback[1],
    b ?? fallback[2],
    SRGBColorSpace
  );
  return new Vector4(colour.r, colour.g, colour.b, a ?? fallback[3]);
}

/** The game's vertex colour attribute, under a name three will not touch. */
function ensureVertexColor(geometry: BufferGeometry): void {
  if (geometry.getAttribute('aUnityColor')) return;
  const source = geometry.getAttribute('_UNITY_COLOR');
  if (source) geometry.setAttribute('aUnityColor', source);
}

/**
 * Rebuilds the outfit's materials with the character toon, and returns the materials whose light
 * direction follows the camera.
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
    const floats = unity?.floats ?? {};
    const colors = unity?.colors ?? {};
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
        uTripleMaskMap: { value: slot('_TripleMaskMap') ?? WHITE },
        uToonMap: { value: slot('_ToonMap') ?? WHITE },
        uToonStep: { value: floats._ToonStep ?? 0.4 },
        uToonFeather: { value: floats._ToonFeather ?? 0.001 },
        uCutoff: { value: floats._Cutoff ?? 0 },
        uVertexColorToonPower: { value: floats._VertexColorToonPower ?? 1 },
        uSaturation: { value: floats._Saturation ?? 1 },
        uSpecularPower: { value: floats._SpecularPower ?? 0.15 },
        uLightDirection: { value: CHARACTER_LIGHT.clone() },
        uLightColor: { value: new Color(1, 1, 1) },
        uGlobalToonColor: { value: linearColor(colors._GlobalToonColor, new Color(1, 1, 1)) },
        uCharaColor: { value: linearColor(colors._CharaColor, new Color(1, 1, 1)) },
        uLightProbeColor: { value: linearColor(colors._LightProbeColor, new Color(1, 1, 1)) },
        uSpecularColor: { value: linearColor(colors._SpecularColor, new Color(1, 1, 1)) },
        uToonBrightColor: { value: linearColor4(colors._ToonBrightColor, [1, 1, 1, 0]) },
        uToonDarkColor: { value: linearColor4(colors._ToonDarkColor, [1, 1, 1, 0]) },
        uRimColor: { value: linearColor4(colors._RimColor, [1, 1, 1, 0.392]) }
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

/** The key light sits in view space, slightly above and to the left of the camera. */
export const CHARACTER_LIGHT = new Vector3(0.3, 0.45, 0.85).normalize();
