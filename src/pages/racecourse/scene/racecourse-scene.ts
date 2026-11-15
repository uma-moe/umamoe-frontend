// The three.js side of the racecourse viewer: one scene, one model at a time.
//
// The models are the game's own geometry with its baked textures embedded, drawn in game units
// (Tokyo measures ~1429 x 63 x 979), so the camera frames whatever the loaded model turns out to
// be rather than a constant size.

import {
  Box3,
  DirectionalLight,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  Sphere,
  Texture,
  Vector3,
  WebGLRenderer,
  type Material,
  type Object3D
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** Leave the course inside the frame with a little air around it. */
const FRAME_MARGIN = 1.05;
/** Looking down the course from the stands' side reads the layout at a glance. */
const OPENING_DIRECTION = new Vector3(0.55, 0.5, 0.75).normalize();
/** A phone is taller than the course is wide: look down more so the ring uses the height. */
const PORTRAIT_DIRECTION = new Vector3(0.3, 0.9, 0.35).normalize();

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

  // The game bakes its lighting into the models, so a soft sky/ground pair plus one sun reads
  // closer to the game than a physically correct setup would.
  scene.add(new HemisphereLight(0xffffff, 0x5a6b7d, 3));
  const sun = new DirectionalLight(0xffffff, 2.2);
  sun.position.set(600, 900, 400);
  scene.add(sun);
  const fill = new DirectionalLight(0xffffff, 0.7);
  fill.position.set(-500, 300, -400);
  scene.add(fill);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minDistance = 40;
  controls.maxDistance = 6000;

  const loader = new GLTFLoader();
  let model: Object3D | undefined;
  let generation = 0;
  let stopped = false;
  let frameHandle = 0;

  function resize(): void {
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  /**
   * Pulls the camera back until every corner of the course is inside the frustum, so a long flat
   * layout such as Tokyo fills the width instead of being framed by its much larger bounding
   * sphere.
   */
  function frame(): void {
    if (!model) return;
    const box = new Box3().setFromObject(model);
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new Sphere());

    const direction = camera.aspect < 1 ? PORTRAIT_DIRECTION : OPENING_DIRECTION;
    const right = new Vector3().crossVectors(camera.up, direction).normalize();
    const up = new Vector3().crossVectors(direction, right).normalize();
    const tanVertical = Math.tan((camera.fov * Math.PI) / 360);
    const tanHorizontal = tanVertical * camera.aspect;

    let distance = 0;
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z]) {
          const corner = new Vector3(x, y, z).sub(sphere.center);
          const lateral = Math.abs(corner.dot(right)) / tanHorizontal;
          const vertical = Math.abs(corner.dot(up)) / tanVertical;
          distance = Math.max(distance, corner.dot(direction) + Math.max(lateral, vertical));
        }
    distance = Math.max(distance * FRAME_MARGIN, 1);

    controls.target.copy(sphere.center);
    camera.position.copy(sphere.center).addScaledVector(direction, distance);
    camera.near = Math.max(distance / 1000, 0.5);
    camera.far = distance + sphere.radius * 4;
    camera.updateProjectionMatrix();
    controls.minDistance = distance * 0.08;
    controls.maxDistance = distance * 2.2;
    controls.update();
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
          // A slower load that lost the race to a newer one must not replace what is on screen.
          if (stopped || token !== generation) {
            disposeModel(gltf.scene);
            resolve();
            return;
          }
          model = gltf.scene;
          scene.add(model);
          frame();
          resolve();
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

  function render(): void {
    if (stopped) return;
    controls.update();
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

  return { load, frame, dispose };
}
