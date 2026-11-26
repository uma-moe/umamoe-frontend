// The course's sky, and the fog that hides where the course stops. The dome follows the camera, the haze
// is sampled from the dome's own horizon, and the fog band is sized from the course.

import {
  Color,
  Fog,
  Sphere,
  Vector3,
  type Object3D,
  type PerspectiveCamera,
  type Scene,
  type Texture
} from 'three';
import { materialsOf } from './three-guards';

/**
 * What the empty space below the horizon is painted. The course has no ground beyond its apron, and the
 * sky is a hemisphere, so below the horizon there is nothing to draw: haze keeps that from reading as a
 * hole in the world. Fog does the same for the far scenery, which the game also fades out.
 */
export const HAZE = 0xa8c4dd;
/** Where the fog band sits before a course has been loaded: replaced as soon as one is. */
export const FOG_BOOT = { near: 1200, far: 4200 };

/** How far inside the vertical field of view the dome's rim has to stay, as a share of it. */
const RIM_INSIDE_FOV = 0.95;
/** How much further out than the camera the dome is kept, as a multiple of its radius. */
const DOME_CLEARANCE = 1.3;
/** How far past the dome the reader may fly, as a multiple of its radius. */
const WORLD_DOME_REACH = 2.5;
/** How far past the course the reader may fly, as a multiple of the course radius. */
const WORLD_COURSE_REACH = 2;
/** The dome radius to assume when a course ships no dome. */
const NO_DOME_RADIUS = 1000;
/** How far up from the bottom row the horizon is sampled, as a share of the image height. */
const HORIZON_ROW = 0.98;
/** The band of rows averaged for that sample, as a share of the image height. */
const HORIZON_BAND = 0.02;
/** Below this brightness a course's sky reads as a hole rather than as a horizon. */
const MIN_HAZE_LIGHTNESS = 0.62;
/** How far every horizon is pulled toward white, so the horizon never reads as a wall. */
const HAZE_WHITENING = 0.2;

export interface CourseSky {
  /** The dome node, which the camera is kept inside. */
  node: Object3D;
  /** The transform the dome was authored with; the follow moves it relative to this. */
  base: Vector3;
  scale: Vector3;
  centre: Vector3;
  radius: number;
}

/** The dome's own transform and bounds, which is what the follow and the world bounds are sized from. */
export function skyOf(node: Object3D, bounds: Sphere): CourseSky {
  return {
    node,
    base: node.position.clone(),
    scale: node.scale.clone(),
    centre: bounds.center,
    radius: bounds.radius
  };
}

/** How far the reader may fly from the course: well past the dome, so the opening frame fits. */
export function worldBounds(sky: CourseSky | undefined, sceneRadius: number): Sphere {
  const centre = sky ? sky.centre.clone() : new Vector3();
  const dome = (sky?.radius ?? NO_DOME_RADIUS) * WORLD_DOME_REACH;
  return new Sphere(centre, Math.max(dome, sceneRadius * WORLD_COURSE_REACH));
}

/**
 * Keeps the sky around the reader. The dome is painted on its inside, so from above the course it reads
 * as a bowl; sliding it under the camera and growing it to stay outside the camera means the reader is
 * always inside it and sees sky rather than the shape of the dome.
 */
export function followSky(sky: CourseSky, camera: PerspectiveCamera): void {
  const distance = camera.position.distanceTo(sky.centre);
  const above = Math.max(camera.position.y - sky.centre.y, 0);
  const factor = skyFollowFactor({ distance, above, fov: camera.fov, radius: sky.radius });

  sky.node.position.set(
    sky.base.x + (camera.position.x - sky.centre.x),
    sky.base.y,
    sky.base.z + (camera.position.z - sky.centre.z)
  );
  sky.node.scale.set(sky.scale.x * factor, sky.scale.y * factor, sky.scale.z * factor);
}

/** How much the dome grows to stay outside the camera and to keep its rim out of the frame. */
export function skyFollowFactor({
  distance,
  above,
  fov,
  radius
}: {
  distance: number;
  above: number;
  fov: number;
  radius: number;
}): number {
  // Two floors on the size: big enough to stay outside the camera, and big enough that the dome's rim
  // falls outside the vertical field of view. A rim crossing the frame reads as a band of sky laid
  // over the course instead of as the sky behind it.
  const halfFov = Math.tan((fov * Math.PI) / 360) * RIM_INSIDE_FOV;
  return Math.max(1, (distance * DOME_CLEARANCE) / radius, above / halfFov / radius);
}

/**
 * Takes the haze colour from the sky texture's own horizon, so the edge of the dome and the empty space
 * below it meet in the same tone instead of showing a seam.
 */
export function hazeFromSky(node: Object3D): Color {
  let map: Texture | undefined;
  node.traverse((child) => {
    for (const material of materialsOf(child)) {
      const texture = (material as { map?: Texture | null }).map;
      if (texture) map = texture;
    }
  });

  const image = map?.image as (CanvasImageSource & { height?: number }) | undefined;
  if (!image || typeof document === 'undefined') return new Color(HAZE);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d');
    if (!context) return new Color(HAZE);

    const height = image.height ?? 1;
    const edge = (from: number) => {
      context.clearRect(0, 0, 1, 1);
      context.drawImage(image, 0, from, 1, Math.max(1, height * HORIZON_BAND), 0, 0, 1, 1);
      const [red = 0, green = 0, blue = 0] = context.getImageData(0, 0, 1, 1).data;
      return new Color(red / 255, green / 255, blue / 255);
    };

    // glTF textures are not flipped, so the image's bottom row is the dome's rim: the horizon.
    const horizon = edge(height * HORIZON_ROW);
    // A night course's sky is dark down there, and a dark backdrop reads as a hole: keep it light
    // enough to stand in for the horizon haze whatever the course's sky does.
    const light = (horizon.r + horizon.g + horizon.b) / 3;
    const haze =
      light < MIN_HAZE_LIGHTNESS
        ? horizon.lerp(new Color(0xffffff), MIN_HAZE_LIGHTNESS - light)
        : horizon;
    haze.lerp(new Color(0xffffff), HAZE_WHITENING);
    return haze;
  } catch {
    // A texture the browser will not let us read keeps the default haze.
    return new Color(HAZE);
  }
}

/** Paints the haze behind the course, and the same tone into the fog that hides where it stops. */
export function applyHaze(haze: Color, scene: Scene, fog: Fog): void {
  scene.background = haze;
  fog.color.copy(haze);
}

/** The dome is unlit and painted: fogging it would wash the sky out. */
export function unfog(node: Object3D): void {
  node.traverse((child) => {
    for (const material of materialsOf(child)) if ('fog' in material) material.fog = false;
  });
}

/**
 * Where the fog starts and stops, from half the course's diagonal: past the course itself, so only the
 * scenery and the horizon are hazed over.
 */
export function fogBand(halfDiagonal: number): { near: number; far: number } {
  return { near: halfDiagonal * 1.1, far: halfDiagonal * 4 };
}
