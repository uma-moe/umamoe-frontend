// The three.js side of the racecourse viewer: one scene, one model at a time.
//
// The models are the game's own geometry with its baked textures embedded, drawn in game units
// (Tokyo measures ~1429 x 63 x 979), so the camera frames whatever the loaded model turns out to
// be rather than a constant size.

import {
  Box3,
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
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { applyUnityMaterials } from './unity-materials';
import { createWalkCamera, SKY_NODE } from './walk-camera';

/** How the reader looks at the course: from outside it, or standing on it at a horsegirl's height. */
export type CameraMode = 'overview' | 'walk';

/** Close enough to the ground that the track surface stays in front of the near plane. */
const WALK_NEAR = 0.1;
/** The parts the game models where they stand that describe the racing surface: track and turf. */
const TRACK_PART = /_000[01]_/;

/** Leave the course inside the frame with a little air around it. */
const FRAME_MARGIN = 1.05;
/**
 * The overview looks down at the course rather than across it: a shallow angle projects the
 * infield's depth into the frame, which pushes the camera far enough back that a wide, short stage
 * shows a small ring in the middle.
 */
const OPENING_DIRECTION = new Vector3(0.4, 0.85, 0.45).normalize();
/** A phone is taller than the course is wide: look down more so the ring uses the height. */
const PORTRAIT_DIRECTION = new Vector3(0.25, 0.93, 0.28).normalize();

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
  /** Draws one course model, replacing whatever was drawn. */
  load(url: string): Promise<void>;
  /** Puts the camera back around the current model. */
  frame(): void;
  setMode(mode: CameraMode): void;
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
  const camera = new PerspectiveCamera(50, 1, 0.5, 20000);
  camera.position.copy(OPENING_DIRECTION).multiplyScalar(1200);

  // No lights: the game bakes its lighting into the course's lightmap, and the rebuilt materials
  // read that instead of shading a normal.

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minDistance = 40;
  controls.maxDistance = 6000;

  const loader = new GLTFLoader();
  const walk = createWalkCamera({ camera, canvas });
  walk.listen();
  let model: Object3D | undefined;
  let area: Box3 | undefined;
  let ground = 0;
  let sceneRadius = 1000;
  let currentMode: CameraMode = 'overview';
  let framing = 1200;
  let generation = 0;
  let stopped = false;
  let frameHandle = 0;

  /**
   * The course without its sky dome, and without the trees and stands: those reach further out
   * than the racing surface, and the model also carries a ring of distant scenery that would shrink
   * the ring the reader came to see. Only the track and turf parts decide the frame.
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

  /**
   * The sky is drawn from inside it: in the overview it is a hollow shell around the course, so it
   * only appears at eye level, where it is the sky the reader stands under.
   */
  function setSkyVisible(visible: boolean): void {
    if (!model) return;
    for (const child of model.children) if (SKY_NODE.test(child.name)) child.visible = visible;
  }

  /** The track surface under the middle of the course, from one downward ray. */
  function groundUnder(target: Object3D, box: Box3): number {
    const center = box.getCenter(new Vector3());
    const ray = new Raycaster(
      new Vector3(center.x, box.max.y + 10, center.z),
      new Vector3(0, -1, 0)
    );
    const [hit] = ray.intersectObject(target, true);
    return hit ? hit.point.y : box.min.y;
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
   * Frames the whole course in the stage from the opening direction.
   */
  function frame(): void {
    if (!model) return;
    const box = area ?? courseBounds(model);
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new Sphere());

    // A walker stays where they stand when the course under them changes; only the depth range
    // follows the new model.
    if (walk.walking) {
      camera.far = sceneRadius * 4;
      camera.updateProjectionMatrix();
      return;
    }

    const direction = camera.aspect < 1 ? PORTRAIT_DIRECTION : OPENING_DIRECTION;
    const right = new Vector3().crossVectors(camera.up, direction).normalize();
    const up = new Vector3().crossVectors(direction, right).normalize();
    const tanVertical = Math.tan((camera.fov * Math.PI) / 360);
    const tanHorizontal = tanVertical * camera.aspect;

    // Fit the box's silhouette as seen from the opening direction, the way a model viewer does,
    // rather than all eight corners: at a low angle the corners of a course's footprint project far
    // down the frame and would push the camera back until the ring is a speck.
    const extent = box.getSize(new Vector3());
    const halfLateral = (Math.abs(extent.x * right.x) + Math.abs(extent.z * right.z)) / 2;
    const halfVertical =
      (Math.abs(extent.x * up.x) + Math.abs(extent.y * up.y) + Math.abs(extent.z * up.z)) / 2;
    const distance =
      Math.max(halfLateral / tanHorizontal, halfVertical / tanVertical) * FRAME_MARGIN;
    framing = distance;
    camera.far = distance + sceneRadius * 4;
    camera.near = WALK_NEAR;
    camera.updateProjectionMatrix();

    controls.target.copy(sphere.center);
    camera.position.copy(sphere.center).addScaledVector(direction, distance);
    controls.minDistance = Math.max(distance * 0.004, 1);
    controls.maxDistance = distance * 2.2;
    controls.update();
  }

  /**
   * Swaps the camera between the overview and walking it. Walking keeps where the view was pointed,
   * so the reader steps onto the course where they were looking instead of somewhere arbitrary.
   */
  function applyMode(): void {
    if (currentMode === 'walk') {
      // Before the first model lands there is no ground to stand on; the load applies it instead.
      if (!area || walk.walking) return;
      walk.setArea(area, ground);
      controls.enabled = false;
      // Stand where the overview was pointed at, and look back out over the course.
      const facing = camera.position.clone().sub(controls.target);
      facing.y = 0;
      walk.enable(controls.target, facing);
      setSkyVisible(true);
      camera.near = WALK_NEAR;
      camera.far = sceneRadius * 4;
      camera.updateProjectionMatrix();
      return;
    }
    if (!walk.walking) return;
    walk.disable();
    controls.enabled = true;
    setSkyVisible(false);
    // Coming back from the ground, the reader wants the whole course again, not the view they left.
    frame();
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
  }

  function load(url: string): Promise<void> {
    const token = ++generation;
    clear();
    return new Promise<void>((resolve, reject) => {
      loader.load(
        url,
        (gltf) => {
          void show(gltf, token).then(resolve);
        },
        (event) => {
          if (token === generation) handlers.onProgress?.(event.loaded, event.total);
        },
        (error) => {
          if (token !== generation) return;
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      );
    });
  }

  /** Applies the game's shading, then puts the model on screen once it is ready to draw. */
  async function show(gltf: GLTF, token: number): Promise<void> {
    try {
      await applyUnityMaterials(gltf);
    } catch {
      // A missing lightmap should not cost the reader the whole course: keep the loaded materials.
    }

    // A slower load that lost the race to a newer one must not replace what is on screen.
    if (stopped || token !== generation) {
      disposeModel(gltf.scene);
      return;
    }

    const loaded = gltf.scene;
    model = loaded;
    scene.add(loaded);
    // The sky dome stays in the scene for the view, but it is not part of the course.
    sceneRadius = new Box3().setFromObject(loaded).getBoundingSphere(new Sphere()).radius;
    area = courseBounds(loaded);
    ground = groundUnder(loaded, area);
    walk.setArea(area, ground);
    setSkyVisible(walk.walking);
    frame();
    applyMode();
  }

  let lastFrame = performance.now();

  function render(now = performance.now()): void {
    if (stopped) return;
    const delta = (now - lastFrame) / 1000;
    lastFrame = now;
    // Only the camera that is in charge updates the view; the other one would fight it.
    if (walk.walking) walk.update(delta);
    else controls.update();
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
    walk.dispose();
    controls.dispose();
    clear();
    renderer.dispose();
    renderer.forceContextLoss();
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  canvas.addEventListener('webglcontextlost', onContextLost);
  resize();
  render();

  return {
    load,
    frame,
    setMode: (mode: CameraMode) => {
      currentMode = mode;
      applyMode();
    },
    dispose
  };
}
