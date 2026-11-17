// The three.js side of the racecourse viewer: one scene, one course at a time, flown freely.
//
// The models are the game's own geometry with its baked textures embedded, drawn in game units
// (Tokyo measures ~1429 x 63 x 979), so the camera frames whatever the loaded model turns out to be
// rather than a constant size.

import {
  Box3,
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

/** Close enough to the ground that the track surface stays in front of the near plane. */
const NEAR_PLANE = 0.1;
/** The parts the game models where they stand that describe the racing surface: track and turf. */
const TRACK_PART = /_000[01]_/;

/** Leave the course inside the frame with a little air around it. */
const FRAME_MARGIN = 1.05;
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
/** How long it circles after a course lands, unless the reader grabs it first. */
const INTRO_SECONDS = 6;

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
  const camera = new PerspectiveCamera(50, 1, NEAR_PLANE, 20000);
  camera.position.copy(OPENING_DIRECTION).multiplyScalar(1200);

  // No lights: the game bakes its lighting into the course's lightmap, and the rebuilt materials
  // read that instead of shading a normal.

  const fly = createFlyCamera({ camera, canvas, bounds: () => world });
  let skyDome: Sphere | undefined;
  /** How far the reader may fly from the course: well past the dome, so the opening frame fits. */
  let world: Sphere | undefined;
  let model: Object3D | undefined;
  let area: Box3 | undefined;
  let sceneRadius = 1000;
  /** The framed view the opening orbit turns around, and how far it has turned. */
  let framed: { centre: Vector3; distance: number; polar: number } | undefined;
  let introAngle = 0;
  let introLeft = 0;
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
    const box = new Box3();
    for (const child of target.children)
      if (!SKY_NODE.test(child.name) && TRACK_PART.test(child.name)) box.expandByObject(child);

    if (box.isEmpty()) {
      for (const child of target.children)
        if (!SKY_NODE.test(child.name)) box.expandByObject(child);
    }
    return box.isEmpty() ? new Box3().setFromObject(target) : box;
  }

  /** The sky is drawn from inside it: it appears once the camera is close enough to be under it. */
  function setSkyVisible(visible: boolean): void {
    if (!model) return;
    for (const child of model.children) if (SKY_NODE.test(child.name)) child.visible = visible;
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
    introLeft = INTRO_SECONDS;
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

  function spin(deltaSeconds: number): void {
    if (!framed) return;
    introAngle += INTRO_SPIN * deltaSeconds;
    introLeft -= deltaSeconds;
    if (introLeft <= 0) {
      takeControl();
      return;
    }
    camera.position
      .setFromSphericalCoords(framed.distance, framed.polar, introAngle)
      .add(framed.centre);
    camera.lookAt(framed.centre);
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
    return Promise.all(targets.map((target) => loader.loadAsync(target)))
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
    for (const child of loaded.children)
      if (SKY_NODE.test(child.name))
        skyDome = new Box3().setFromObject(child).getBoundingSphere(new Sphere());
    world = new Sphere(
      skyDome?.center.clone() ?? new Vector3(),
      Math.max((skyDome?.radius ?? 1000) * 2.5, sceneRadius * 2)
    );
    area = courseBounds(loaded);
    frame();
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
    // The dome is drawn from inside: seen from above the course it is a hollow shell that reads as a
    // bowl, so it only appears once the camera has flown down under its rim.
    if (skyDome) setSkyVisible(camera.position.y < skyDome.center.y + skyDome.radius * 0.25);
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
    window.removeEventListener('keydown', takeControl);
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
  canvas.addEventListener('pointerdown', takeControl);
  window.addEventListener('keydown', takeControl);
  resize();
  render();

  return { load, frame, dispose };
}
