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
  Texture,
  Vector4,
  type BufferGeometry,
  type Material,
  type Mesh,
  type Object3D,
  type Side
} from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { retain } from './dispose';
import { isMesh } from './three-guards';

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
/**
 * How far a baked shadow sits from the lit colour, toward the light end of the ramp. The atlas paints a
 * shadow as one flat colour, so up close its floor would read as a hole rather than a shade.
 */
const SHADOW_LIFT = 0.3;
/** How far the lightmap is blurred on load, in texels: one texel covers about a metre of track. */
const LIGHTMAP_BLUR = 2;

function solidTexture(rgba: [number, number, number, number]): DataTexture {
  const texture = new DataTexture(new Uint8Array(rgba), 1, 1);
  texture.needsUpdate = true;
  return texture;
}

/** Unity's declared defaults: `_MainTex` is white and `_LightTex` is grey. Shared by every rebuilt material, so no course frees it. */
const WHITE = retain(solidTexture([255, 255, 255, 255]));

/**
 * Softens a lightmap, because its resolution is that of the whole course packed into one atlas: up close
 * a baked shadow edge is a texel wide and reads as a cut-out. The result keeps the source's addressing,
 * orientation and colour space, and is skipped for anything a canvas cannot draw (compressed texturing).
 */
function softenLightmap(texture: Texture): Texture {
  if (typeof document === 'undefined') return texture;
  const image = texture.image as { width?: number; height?: number } | undefined;
  if (!image?.width || !image.height) return texture;

  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d');
  if (!context) return texture;

  try {
    context.filter = `blur(${LIGHTMAP_BLUR}px)`;
    context.drawImage(image as CanvasImageSource, 0, 0);
  } catch {
    return texture;
  }

  const softened = new Texture(canvas);
  softened.flipY = texture.flipY;
  softened.wrapS = texture.wrapS;
  softened.wrapT = texture.wrapT;
  softened.colorSpace = texture.colorSpace;
  softened.needsUpdate = true;
  return softened;
}

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
  const [red, green, blue] = value ?? [];
  if (red === undefined || green === undefined || blue === undefined) return fallback.clone();
  return new Color().setRGB(red, green, blue, SRGBColorSpace);
}

/** Lifts a baked shadow off black, so the ramp's dark end shades rather than cuts. */
function softShadow(shadow: Color, light: Color): Color {
  return shadow.lerp(light, SHADOW_LIFT);
}

/** `_MulColor0`: the shader's overall tint, white when the material does not override it. */
function tintOf(value: number[] | undefined): Vector4 {
  const [red = 1, green = 1, blue = 1, alpha = 1] = value ?? [];
  return new Vector4(red, green, blue, alpha);
}

/** The map a loaded material carries; the base `Material` type does not declare one. */
function mapOf(material: Material): Texture | null {
  return (material as { map?: Texture | null }).map ?? null;
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
    if (isMesh(child)) meshes.push(child);
  });

  const wanted = new Set<number>();
  const lightmaps = new Set<number>();
  for (const mesh of meshes) {
    for (const material of [mesh.material].flat()) {
      const unity = unityOf(material);
      for (const slot of Object.values(unity?.textures ?? {})) wanted.add(slot.index);
      const lightmap = unity?.textures?._LightTex?.index;
      if (lightmap !== undefined) lightmaps.add(lightmap);
    }
  }

  const textures = new Map<number, Texture>();
  await Promise.all(
    [...wanted].map(async (index) => {
      const texture: Texture = await gltf.parser.getDependency('texture', index);
      texture.colorSpace = SRGBColorSpace;
      if (!lightmaps.has(index)) {
        textures.set(index, texture);
        return;
      }
      // Only the lightmap is softened: it is the one that carries the baked shadows. The softened copy
      // replaces the atlas everywhere it is drawn, so the one it replaced is freed here.
      const softened = softenLightmap(texture);
      if (softened !== texture) texture.dispose();
      textures.set(index, softened);
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
            value: softShadow(
              linearColor(unity?.colors?._LightmapShadowColor, new Color(0.25, 0.25, 0.25)),
              linearColor(unity?.colors?._LightmapColor, new Color(1, 1, 1))
            )
          },
          uMulColor0: { value: tintOf(unity?.colors?._MulColor0) }
        }
      });
    } else {
      const map = slot('_MainTex') ?? slot('_FilmGrainTex') ?? mapOf(source);
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
    // Rails and marker posts carry their shadow as a decal quad whose texture is a solid near-black patch:
    // drawn at all it is a black box on the ground, and the ground has the shadow baked into its lightmap.
    if (/shadow$/i.test(mesh.name)) {
      mesh.visible = false;
      continue;
    }
    const geometry = mesh.geometry;
    ensureVertexColor(geometry);
    ensureLightmapUv(geometry);
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map(convert)
      : convert(mesh.material);
  }
}
