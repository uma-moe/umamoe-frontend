// The three.js side of the racecourse viewer: one scene, one course at a time, flown freely.
//
// The models are the game's own geometry with its baked textures embedded, drawn in game units
// (Tokyo measures ~1429 x 63 x 979), so the camera frames whatever the loaded model turns out to be
// rather than a constant size.

import {
  Box3,
  Color,
  Fog,
  Group,
  LoadingManager,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Sphere,
  Texture,
  Vector3,
  WebGLRenderer,
  type Material,
  type Object3D
} from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { createFlyCamera } from './fly-camera';
import { applyUnityMaterials } from './unity-materials';
import { SKY_NODE } from './sky';
import { infieldFootprint, type Footprint } from './infield';

/** Close enough to the ground that the track surface stays in front of the near plane. */
const NEAR_PLANE = 0.1;
/** The parts the game models where they stand that describe the racing surface: track and turf. */
/**
 * The racing surface, which is what the opening view frames: the track and turf lightmapped meshes. The
 * track part also carries the far scenery and the cloud ring, so framing its whole box opens too wide.
 */
const SURFACE_MESH = /^(turf|dirt)_lm/;
/** The trees: flat quads the game turns towards the camera. */
const TREE_NODE = /^tree_/;
const TRACK_PART = /_000[01]_/;

/** Leave the course inside the frame with a little air around it. */
const FRAME_MARGIN = 1.12;
/**
 * The opening view looks down at the course rather than across it: a shallow angle projects the
 * infield's depth into the frame, which pushes the camera far enough back that a wide, short stage
 * shows a small ring in the middle.
 */
const OPENING_DIRECTION = new Vector3(0.4, 0.85, 0.45).normalize();
/** A phone is taller than the course is wide: look down more so the ring uses the height. */
const PORTRAIT_DIRECTION = new Vector3(0.25, 0.93, 0.28).normalize();
/** How fast the opening view circles the course, in radians per second. */
const INTRO_SPIN = 0.25;

export interface RacecourseSceneHandlers {
  onProgress?: (loaded: number, total: number) => void;
  onFailure?: (message: string) => void;
}

export interface RacecourseSceneOptions {
  canvas: HTMLCanvasElement;
  /** The element the canvas fills; its size drives the renderer and the camera aspect. */
  host: HTMLElement;
  handlers?: RacecourseSceneHandlers;
}

export interface RacecourseScene {
  /** Draws one course, from one whole-course file or the prefabs it is assembled from. */
  load(targets: string[]): Promise<void>;
  /** Puts the camera back around the current model. */
  frame(): void;
  /** Moves the camera along its line of sight: `1` closes in, `-1` pulls back. */
  zoom(direction: 1 | -1): void;
  dispose(): void;
}

export function createRacecourseScene({
  canvas,
  host,
  handlers = {}
}: RacecourseSceneOptions): RacecourseScene {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new Scene();
  // The course has no ground beyond its apron, and the sky is a hemisphere, so below the horizon there
  // is nothing to draw: haze keeps that from reading as a hole in the world. Fog does the same for the
  // far scenery, which the game also fades out.
  const HAZE = 0xa8c4dd;
  scene.background = new Color(HAZE);
  const fog = new Fog(HAZE, 1200, 4200);
  scene.fog = fog;
  const camera = new PerspectiveCamera(50, 1, NEAR_PLANE, 20000);
  camera.position.copy(OPENING_DIRECTION).multiplyScalar(1200);

  // No lights: the game bakes its lighting into the course's lightmap, and the rebuilt materials
  // read that instead of shading a normal.

  const fly = createFlyCamera({ camera, canvas, bounds: () => world });
  /**
   * The course's sky, which follows the camera so the reader is always inside it. Two nodes: the dome
   * the model ships (a hemisphere, so a view from above would otherwise look into nothing) and a
   * mirrored copy that closes it into a full sphere.
   */
  let sky:
    | {
        nodes: { node: Object3D; base: Vector3; scale: Vector3 }[];
        centre: Vector3;
        radius: number;
      }
    | undefined;
  /** How far the reader may fly from the course: well past the dome, so the opening frame fits. */
  let world: Sphere | undefined;
  /** Trees inside the oval. They are flat quads, so they only read as trees when they face the camera. */
  let billboards: { node: Object3D; x: number; z: number }[] = [];
  let model: Object3D | undefined;
  let area: Box3 | undefined;
  let sceneRadius = 1000;
  /** The framed view the opening orbit turns around, and how far it has turned. */
  let framed: { centre: Vector3; distance: number; polar: number } | undefined;
  let introAngle = 0;
  let intro = false;
  let loading = false;
  let generation = 0;
  let stopped = false;
  let frameHandle = 0;

  /**
   * The course without its sky dome, and without the trees and stands: those reach further out than
   * the racing surface, and the model also carries a ring of distant scenery that would shrink the
   * ring the reader came to see. Only the track and turf parts decide the frame.
   */
  function courseBounds(target: Object3D): Box3 {
    // The racing surface itself, wherever it sits in the model: track and turf, track and dirt.
    const surface = new Box3();
    target.traverse((child) => {
      if (SURFACE_MESH.test(child.name)) surface.expandByObject(child);
    });
    if (!surface.isEmpty()) return surface;

    const parts = new Box3();
    for (const child of target.children)
      if (!SKY_NODE.test(child.name) && TRACK_PART.test(child.name)) parts.expandByObject(child);

    if (!parts.isEmpty()) return parts;
    for (const child of target.children)
      if (!SKY_NODE.test(child.name)) parts.expandByObject(child);
    return parts.isEmpty() ? new Box3().setFromObject(target) : parts;
  }

  /**
   * Keeps the sky around the reader. The dome is painted on its inside, so from above the course it
   * reads as a bowl; sliding it under the camera and growing it to stay outside the camera means the
   * reader is always inside it and sees sky rather than the shape of the dome.
   */
  function followSky(): void {
    if (!sky) return;
    const distance = camera.position.distanceTo(sky.centre);
    // Two floors on the size: big enough to stay outside the camera, and big enough that the dome's rim
    // falls outside the vertical field of view. A rim crossing the frame reads as a band of sky laid
    // over the course instead of as the sky behind it.
    const above = Math.max(camera.position.y - sky.centre.y, 0);
    const halfFov = Math.tan((camera.fov * Math.PI) / 360) * 0.95;
    const factor = Math.max(1, (distance * 1.3) / sky.radius, above / halfFov / sky.radius);
    for (const { node, base, scale } of sky.nodes) {
      node.position.set(
        base.x + (camera.position.x - sky.centre.x),
        base.y,
        base.z + (camera.position.z - sky.centre.z)
      );
      node.scale.set(scale.x * factor, scale.y * factor, scale.z * factor);
    }
  }

  /**
   * Takes the haze colour from the sky texture's own horizon, so the edge of the dome and the empty
   * space below it meet in the same tone instead of showing a seam.
   */
  function hazeFromSky(node: Object3D): Color {
    let map: Texture | undefined;
    node.traverse((child) => {
      const mesh = child as Object3D & { material?: Material | Material[] };
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        const texture = (material as { map?: Texture } | undefined)?.map;
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
        context.drawImage(image, 0, from, 1, Math.max(1, height * 0.02), 0, 0, 1, 1);
        const [red = 0, green = 0, blue = 0] = context.getImageData(0, 0, 1, 1).data;
        return new Color(red / 255, green / 255, blue / 255);
      };

      // glTF textures are not flipped, so the image's bottom row is the dome's rim: the horizon.
      const horizon = edge(height * 0.98);
      // A night course's sky is dark down there, and a dark backdrop reads as a hole: keep it light
      // enough to stand in for the horizon haze whatever the course's sky does.
      const light = (horizon.r + horizon.g + horizon.b) / 3;
      const haze = light < 0.62 ? horizon.lerp(new Color(0xffffff), 0.62 - light) : horizon;
      haze.lerp(new Color(0xffffff), 0.2);
      scene.background = haze;
      fog.color.copy(haze);
      return haze;
    } catch {
      // A texture the browser will not let us read keeps the default haze.
      return new Color(HAZE);
    }
  }

  function resize(): void {
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  /**
   * Frames the whole course in the stage from the opening direction: fits the box's silhouette the
   * way a model viewer does, rather than all eight corners, and never starts outside the sky dome.
   */
  function frame(): void {
    if (!model) return;
    const box = area ?? courseBounds(model);
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new Sphere());

    const direction = camera.aspect < 1 ? PORTRAIT_DIRECTION : OPENING_DIRECTION;
    const right = new Vector3().crossVectors(camera.up, direction).normalize();
    const up = new Vector3().crossVectors(direction, right).normalize();
    const tanVertical = Math.tan((camera.fov * Math.PI) / 360);
    const tanHorizontal = tanVertical * camera.aspect;

    const extent = box.getSize(new Vector3());
    const halfLateral = (Math.abs(extent.x * right.x) + Math.abs(extent.z * right.z)) / 2;
    const halfVertical =
      (Math.abs(extent.x * up.x) + Math.abs(extent.y * up.y) + Math.abs(extent.z * up.z)) / 2;
    const distance =
      Math.max(halfLateral / tanHorizontal, halfVertical / tanVertical) * FRAME_MARGIN;

    camera.far = distance + sceneRadius * 4;
    camera.near = NEAR_PLANE;
    camera.updateProjectionMatrix();

    camera.position.copy(sphere.center).addScaledVector(direction, distance);
    camera.lookAt(sphere.center);

    // Circle the course for a moment before handing over: the camera is already where it should be,
    // and a slow orbit reads as the model arriving rather than a still frame appearing.
    framed = {
      centre: sphere.center.clone(),
      distance,
      polar: Math.acos(direction.y)
    };
    introAngle = Math.atan2(direction.x, direction.z);
    intro = true;
    fly.disable();

    // The fly camera starts looking wherever the camera points; it takes over on the first input.
  }

  /** Ends the opening orbit and hands the camera to the reader. */
  function takeControl(): void {
    if (!intro) return;
    intro = false;
    fly.enable();
  }

  const MOVEMENT_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyR', 'KeyF']);

  /** A movement key is an interaction with the view; anything else is left alone. */
  function onMovementKey(event: KeyboardEvent): void {
    if (MOVEMENT_KEYS.has(event.code) || event.code.startsWith('Arrow')) takeControl();
  }

  /**
   * Zoom, Google-Maps style: a step along the line of sight, sized by how far the camera already is
   * from what it is looking at. Any zoom is an interaction, so it takes the camera over.
   */
  function zoom(direction: 1 | -1): void {
    takeControl();
    const target = framed?.centre ?? area?.getCenter(new Vector3());
    const span = target ? camera.position.distanceTo(target) : sceneRadius;
    const step = Math.max(span * 0.25, 4) * direction;
    camera.position.addScaledVector(camera.getWorldDirection(new Vector3()), step);
  }

  function spin(deltaSeconds: number): void {
    if (!framed) return;
    introAngle += INTRO_SPIN * deltaSeconds;
    camera.position
      .setFromSphericalCoords(framed.distance, framed.polar, introAngle)
      .add(framed.centre);
    camera.lookAt(framed.centre);
  }

  /** The racing surface's footprint, from its vertices: what the oval encloses is the infield. */
  function surfaceFootprint(target: Object3D): Footprint {
    const points: [number, number][] = [];
    const point = new Vector3();
    target.traverse((child) => {
      const mesh = child as Object3D & {
        geometry?: {
          attributes: {
            position?: { count: number; getX(i: number): number; getZ(i: number): number };
          };
        };
      };
      if (!SURFACE_MESH.test(child.name) || !mesh.geometry) return;
      const position = mesh.geometry.attributes.position;
      if (!position) return;
      child.updateWorldMatrix(true, false);
      for (let index = 0; index < position.count; index += 1) {
        point.set(position.getX(index), 0, position.getZ(index)).applyMatrix4(child.matrixWorld);
        points.push([point.x, point.z]);
      }
    });
    return infieldFootprint(points);
  }

  /** Collects the trees the oval encloses, with the position their quad turns around. */
  function collectBillboards(target: Object3D): { node: Object3D; x: number; z: number }[] {
    const { inside } = surfaceFootprint(target);
    const trees: { node: Object3D; x: number; z: number }[] = [];
    const position = new Vector3();
    target.traverse((child) => {
      if (!TREE_NODE.test(child.name)) return;
      child.getWorldPosition(position);
      if (inside(position.x, position.z)) trees.push({ node: child, x: position.x, z: position.z });
    });
    return trees;
  }

  /**
   * Turns each infield tree to face the camera, keeping it upright the way the game draws them. Looking
   * straight down gives no direction to turn to, so the last angle is kept rather than jittering.
   */
  function faceBillboards(): void {
    for (const tree of billboards) {
      const dx = camera.position.x - tree.x;
      const dz = camera.position.z - tree.z;
      if (dx * dx + dz * dz < 1) continue;
      tree.node.rotation.y = Math.atan2(dx, dz);
    }
  }

  function release(material: Material): void {
    for (const value of Object.values(material)) if (value instanceof Texture) value.dispose();
    material.dispose();
  }

  function disposeModel(target: Object3D): void {
    target.traverse((child) => {
      const mesh = child as Object3D & {
        geometry?: { dispose(): void };
        material?: Material | Material[];
      };
      mesh.geometry?.dispose();
      if (Array.isArray(mesh.material)) mesh.material.forEach(release);
      else if (mesh.material) release(mesh.material);
    });
  }

  function clear(): void {
    if (!model) return;
    model.removeFromParent();
    disposeModel(model);
    model = undefined;
    area = undefined;
  }

  function load(targets: string[]): Promise<void> {
    const token = ++generation;
    // The course already on screen keeps circling while the next one streams in.
    loading = true;

    // Byte progress across the files of one course, so the overlay can show a real percentage.
    const progress = new Map<string, { loaded: number; total: number }>();
    const report = () => {
      let loaded = 0;
      let total = 0;
      for (const entry of progress.values()) {
        loaded += entry.loaded;
        total += entry.total;
      }
      if (token === generation) handlers.onProgress?.(loaded, total);
    };

    return Promise.all(
      targets.map(
        (target) =>
          new Promise<GLTF>((resolve, reject) => {
            loader.load(
              target,
              resolve,
              (event) => {
                const total = event.total || event.loaded;
                progress.set(target, { loaded: event.loaded, total });
                report();
              },
              (error) => reject(error instanceof Error ? error : new Error(String(error)))
            );
          })
      )
    )
      .then((gltfs) => show(gltfs, token))
      .catch((error: unknown) => {
        loading = false;
        if (token !== generation) return;
        throw error instanceof Error ? error : new Error(String(error));
      });
  }

  /** Applies the game's shading, then puts the course on screen once it is ready to draw. */
  async function show(gltfs: GLTF[], token: number): Promise<void> {
    for (const gltf of gltfs) {
      try {
        await applyUnityMaterials(gltf);
      } catch {
        // A missing lightmap should not cost the reader the whole course: keep the loaded materials.
      }
    }

    // A slower load that lost the race to a newer one must not replace what is on screen.
    if (stopped || token !== generation) {
      for (const gltf of gltfs) disposeModel(gltf.scene);
      return;
    }
    loading = false;

    // A whole-course model arrives as one scene; a course assembled from prefabs arrives as several,
    // all modelled where they stand, so their root nodes are added side by side without a transform.
    // Adding the nodes rather than each file's scene wrapper keeps their names, which is how the sky
    // and the racing surface are told apart when framing.
    const loaded = gltfs.length === 1 ? gltfs[0]!.scene : new Group();
    if (gltfs.length > 1)
      for (const gltf of gltfs) for (const child of [...gltf.scene.children]) loaded.add(child);
    // The course already on screen stays while the next one streams in, so a track change is a swap
    // rather than a blank stage.
    const previous = model;
    model = loaded;
    scene.add(loaded);
    sceneRadius = new Box3().setFromObject(loaded).getBoundingSphere(new Sphere()).radius;
    for (const child of [...loaded.children])
      if (SKY_NODE.test(child.name)) {
        const bounds = new Box3().setFromObject(child).getBoundingSphere(new Sphere());
        sky = {
          nodes: [{ node: child, base: child.position.clone(), scale: child.scale.clone() }],
          centre: bounds.center.clone(),
          radius: bounds.radius
        };
      }
    world = new Sphere(
      sky?.centre.clone() ?? new Vector3(),
      Math.max((sky?.radius ?? 1000) * 2.5, sceneRadius * 2)
    );
    area = courseBounds(loaded);
    billboards = collectBillboards(loaded);
    // Fog starts past the course itself, so only the scenery and the horizon are hazed over.
    const reach = area.getSize(new Vector3()).length() / 2;
    fog.near = reach * 1.1;
    fog.far = reach * 4;
    // The dome is unlit and painted: fogging it would wash the sky out. The children are copied first:
    // the mirrored copy added below matches the same name and would otherwise be cloned forever.
    for (const child of [...loaded.children])
      if (SKY_NODE.test(child.name)) {
        child.traverse((node) => {
          const mesh = node as Object3D & {
            material?: Material | Material[];
          };
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const material of materials) if (material && 'fog' in material) material.fog = false;
        });
        hazeFromSky(child);
      }
    frame();
    followSky();
    if (previous) {
      previous.removeFromParent();
      disposeModel(previous);
    }
  }

  let lastFrame = performance.now();

  function render(now = performance.now()): void {
    if (stopped) return;
    const delta = (now - lastFrame) / 1000;
    lastFrame = now;
    if (intro || loading) spin(delta);
    else fly.update(delta);
    faceBillboards();
    followSky();
    renderer.render(scene, camera);
    frameHandle = requestAnimationFrame(render);
  }

  function onContextLost(event: Event): void {
    event.preventDefault();
    stop();
    handlers.onFailure?.('The 3D view stopped. Reload the page to bring it back.');
  }

  function stop(): void {
    stopped = true;
    cancelAnimationFrame(frameHandle);
  }

  function dispose(): void {
    stop();
    resizeObserver.disconnect();
    canvas.removeEventListener('webglcontextlost', onContextLost);
    canvas.removeEventListener('pointerdown', takeControl);
    window.removeEventListener('keydown', onMovementKey);
    fly.dispose();
    clear();
    renderer.dispose();
    renderer.forceContextLoss();
  }

  const manager = new LoadingManager();
  // Progress across the prefabs of one course: how many files are done, not how many bytes.
  manager.onProgress = (_url, loaded, total) => handlers.onProgress?.(loaded, total);
  const loader = new GLTFLoader(manager);
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  canvas.addEventListener('webglcontextlost', onContextLost);
  // Any input hands the camera over; the orbit is an arrival, not a mode.
  // Only the view itself takes the camera over: a click on the stage, or a movement key. Typing in
  // the track picker must not stop the orbit.
  canvas.addEventListener('pointerdown', takeControl);
  window.addEventListener('keydown', onMovementKey);
  resize();
  render();

  return { load, frame, zoom, dispose };
}
