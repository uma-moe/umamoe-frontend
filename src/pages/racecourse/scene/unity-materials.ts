// Rebuilds the course materials the way the game's own shader draws them.
//
// The race course does not use a toon ramp texture: `Gallop/3D/Bg/LightmapColorFog` indexes a
// two-colour ramp with the baked lightmap's red channel and multiplies the result into the albedo.
// Everything the shader needs is already inside the model:
//
//   t      = lightmap.r * vertexColor.r * 4      (deliberately unclamped: bright texels overshoot)
//   ramp   = mix(shadowColor, lightColor, t)
//   albedo = mix(_MainTex, _SubTex, _MultimapRate)
//   out    = albedo * ramp * _MulColor0, with alpha = _MainTex.a * vertexColor.a
//
// `_LightTex` is sampled with the second UV set (TEXCOORD_1) and the vertex colour lives in the
// non-standard `_UNITY_COLOR` attribute, which a standard viewer ignores. Materials without a
// lightmap belong to the other shaders of the family (cutout foliage, monitor screens, the sky);
// those are unlit in the game as well, so they are drawn unlit here.

import {
  BackSide,
  BufferAttribute,
  Color,
  DataTexture,
  DoubleSide,
  FrontSide,
  MeshBasicMaterial,
  ShaderMaterial,
  SRGBColorSpace,
  Vector4,
  type BufferGeometry,
  type Material,
  type Mesh,
  type Object3D,
  type Side,
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

/** The lightmap is scaled before it indexes the ramp, per the shader's `mul r0.x, r0.x, l(4)`. */
const RAMP_GAIN = 4;

function solidTexture(rgba: [number, number, number, number]): DataTexture {
  const texture = new DataTexture(new Uint8Array(rgba), 1, 1);
  texture.needsUpdate = true;
  return texture;
}

/** Unity's declared defaults: `_MainTex` is white and `_LightTex` is grey. */
const WHITE = solidTexture([255, 255, 255, 255]);

const vertexShader = /* glsl */ `
  attribute vec2 uv1;
  attribute vec4 aUnityColor;

  varying vec2 vUv0;
  varying vec2 vUv1;
  varying vec4 vColor;

  void main() {
    vUv0 = uv;
    vUv1 = uv1;
    vColor = aUnityColor;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uMainTex;
  uniform sampler2D uSubTex;
  uniform sampler2D uLightTex;
  uniform float uMultimapRate;
  uniform float uCutoff;
  uniform vec3 uLightmapColor;
  uniform vec3 uLightmapShadowColor;
  uniform vec4 uMulColor0;

  varying vec2 vUv0;
  varying vec2 vUv1;
  varying vec4 vColor;

  void main() {
    vec4 main = texture2D(uMainTex, vUv0);
    vec4 sub = texture2D(uSubTex, vUv0);
    vec3 albedo = mix(main.rgb, sub.rgb, uMultimapRate);
    float alpha = mix(main.a * vColor.a, sub.a, uMultimapRate);

    float t = texture2D(uLightTex, vUv1).r * vColor.r * ${RAMP_GAIN.toFixed(1)};
    vec3 ramp = mix(uLightmapShadowColor, uLightmapColor, t);

    vec4 color = vec4(albedo * ramp, alpha) * uMulColor0;
    if (uCutoff > 0.0 && color.a < uCutoff) discard;

    gl_FragColor = color;
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function unityOf(material: Material): UnityMaterial | undefined {
  return (material.userData as { unity?: UnityMaterial } | undefined)?.unity;
}

/** Unity's `_Cull`: 0 draws both faces, 1 culls front, 2 culls back (the default here). */
function sideFor(cull: number | undefined): Side {
  if (cull === 0) return DoubleSide;
  if (cull === 1) return BackSide;
  return FrontSide;
}

/** Material colours are serialized in sRGB, so they are converted into the renderer's linear space. */
function linearColor(value: number[] | undefined, fallback: Color): Color {
  if (!value || value.length < 3) return fallback.clone();
  return new Color().setRGB(value[0]!, value[1]!, value[2]!, SRGBColorSpace);
}

/** The shader declares the game's own vertex-colour attribute under a name three will not touch. */
function ensureVertexColor(geometry: BufferGeometry): void {
  if (geometry.getAttribute('aUnityColor')) return;
  const source = geometry.getAttribute('_UNITY_COLOR');
  if (source) {
    geometry.setAttribute('aUnityColor', source);
    return;
  }
  const count = geometry.getAttribute('position')?.count ?? 0;
  geometry.setAttribute('aUnityColor', new BufferAttribute(new Float32Array(count * 4).fill(1), 4));
}

/** The lightmap is sampled with the second UV set; a mesh without one samples the origin. */
function ensureLightmapUv(geometry: BufferGeometry): void {
  if (geometry.getAttribute('uv1')) return;
  const count = geometry.getAttribute('position')?.count ?? 0;
  geometry.setAttribute('uv1', new BufferAttribute(new Float32Array(count * 2), 2));
}

/**
 * Replaces the loaded materials with the game's shading. Textures are pulled through the glTF
 * parser, so the lightmap images that no material referenced still load.
 */
export async function applyUnityMaterials(gltf: GLTF): Promise<void> {
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

  const rebuilt = new Map<Material, Material>();
  const convert = (source: Material): Material => {
    const cached = rebuilt.get(source);
    if (cached) return cached;

    const unity = unityOf(source);
    const slot = (name: string) => {
      const index = unity?.textures?.[name]?.index;
      return index === undefined ? undefined : textures.get(index);
    };
    const side = sideFor(unity?.floats?._Cull);
    const lightTex = slot('_LightTex');
    let material: Material;

    if (lightTex) {
      const cutoff = source.alphaTest > 0 ? (unity?.floats?._Cutoff ?? source.alphaTest) : 0;
      material = new ShaderMaterial({
        vertexShader,
        fragmentShader,
        side,
        uniforms: {
          uMainTex: { value: slot('_MainTex') ?? WHITE },
          uSubTex: { value: slot('_SubTex') ?? WHITE },
          uLightTex: { value: lightTex },
          uMultimapRate: { value: unity?.floats?._MultimapRate ?? 0 },
          uCutoff: { value: cutoff },
          uLightmapColor: { value: linearColor(unity?.colors?._LightmapColor, new Color(1, 1, 1)) },
          uLightmapShadowColor: {
            value: linearColor(unity?.colors?._LightmapShadowColor, new Color(0.25, 0.25, 0.25))
          },
          uMulColor0: {
            value: new Vector4(
              ...((unity?.colors?._MulColor0 ?? [1, 1, 1, 1]) as [number, number, number, number])
            )
          }
        }
      });
    } else {
      const map = slot('_MainTex') ?? slot('_FilmGrainTex') ?? (source as MeshBasicMaterial).map;
      material = new MeshBasicMaterial({
        map: map ?? null,
        color: map ? 0xffffff : 0x808080,
        side,
        alphaTest: source.alphaTest,
        transparent: source.transparent
      });
    }

    rebuilt.set(source, material);
    return material;
  };

  for (const mesh of meshes) {
    const geometry = mesh.geometry;
    ensureVertexColor(geometry);
    ensureLightmapUv(geometry);
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map(convert)
      : convert(mesh.material);
  }
}
