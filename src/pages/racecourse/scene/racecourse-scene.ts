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
  type Mesh,
  type Object3D,
  type ShaderMaterial
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { AnimationMixer, LoopRepeat, type AnimationAction, type AnimationClip } from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { applyCharacterMaterials } from './character-toon';
import { createFlyCamera } from './fly-camera';
import { createThirdPersonCamera } from './third-person-camera';
import { buildHeightField, type HeightField } from './height-field';
import { applyUnityMaterials } from './unity-materials';
import { SKY_NODE } from './sky';

/** How the reader looks at the course: from outside it, or behind an uma walking on it. */
export type CameraMode = 'overview' | 'third';

/** Close enough to the ground that the track surface stays in front of the near plane. */
const WALK_NEAR = 0.1;
/** The clips the state machine uses, by the pipeline's file names. */
const IDLE_MOTION = 'gate-waiting-left-foot';
const RUN_MOTION = 'run-fast-standard';
const CROSSFADE = 0.25;
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
  /** Stands one uma on the course; `undefined` removes it. */
  setCharacter(url: string | undefined): Promise<void>;
  /** Every published clip, preloaded so a state change never waits on the network. */
  setMotionCatalog(urls: string[]): void;
  /** Where the track starts, so a new outfit or course puts her at the line rather than the middle. */
  setTrackStart(point: { x: number; z: number } | undefined): void;
  /** Plays one race clip on the outfit; `undefined` returns her to the bind pose. */
  setMotion(url: string | undefined): Promise<void>;
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
  let characterMaterials: ShaderMaterial[] = [];
  const clips = new Map<string, AnimationClip>();
  const clipLoads = new Map<string, Promise<AnimationClip | undefined>>();
  let motionCatalog: string[] = [];
  let currentState: 'idle' | 'run' | undefined;
  let mixer: AnimationMixer | undefined;
  let motionAction: AnimationAction | undefined;
  let motionUrl: string | undefined;
  const fly = createFlyCamera({ camera, canvas, bounds: () => skyDome });
  let skyDome: Sphere | undefined;
  const third = createThirdPersonCamera({
    camera,
    canvas,
    controls,
    subject: () => character,
    ground: groundAt,
    area: () => area
  });
  third.listen();
  let model: Object3D | undefined;
  let character: Object3D | undefined;
  let characterUrl: string | undefined;
  let area: Box3 | undefined;
  let ground = 0;
  let heights: HeightField | undefined;
  let trackStart: { x: number; z: number } | undefined;
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
   * only appears up close, where it is the sky the reader stands under.
   */
  function setSkyVisible(visible: boolean): void {
    if (!model) return;
    for (const child of model.children) if (SKY_NODE.test(child.name)) child.visible = visible;
  }

  /** Every mesh under a course part, which is what the height field samples. */
  function trackMeshes(root: Object3D): Mesh[] {
    const meshes: Mesh[] = [];
    root.traverse((child) => {
      const mesh = child as Mesh;
      if (mesh.isMesh) meshes.push(mesh);
    });
    return meshes;
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

    // Nothing moves the camera in third person but the follow controller; the frame only follows the
    // depth range of whatever the course turned out to be.
    if (third.active) {
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
    const distance = Math.min(
      Math.max(halfLateral / tanHorizontal, halfVertical / tanVertical) * FRAME_MARGIN,
      // The dome is the edge of the world, so the camera never starts outside it.
      skyDome ? skyDome.radius * 0.9 : Number.POSITIVE_INFINITY
    );
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
   * Swaps between the free camera over the course and walking an uma around it. Third person needs
   * somebody to follow; the free camera keeps whatever view the reader left it pointing at.
   */
  function applyMode(): void {
    if (currentMode === 'third') {
      if (!character) return;
      fly.disable();
      setSkyVisible(true);
      camera.near = WALK_NEAR;
      camera.far = sceneRadius * 4;
      camera.updateProjectionMatrix();
      third.enable();
      return;
    }
    third.disable();
    controls.enabled = false;
    setSkyVisible(false);
    camera.near = WALK_NEAR;
    camera.far = sceneRadius * 4;
    camera.updateProjectionMatrix();
    fly.enable();
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

  /**
   * Ground height at a world position: the course's own surface where the height field knows it, and
   * the middle of the course elsewhere.
   */
  function groundAt(x: number, z: number): number {
    return heights?.sample(x, z) ?? ground;
  }

  /**
   * Stands the outfit at the start of the track, facing whoever is looking. The models are in metres,
   * so she is 1.63 m tall next to a 1400 m course.
   */
  function placeCharacter(target: Object3D): void {
    if (!area) return;
    const centre = area.getCenter(new Vector3());
    const spot = trackStart ?? { x: centre.x, z: centre.z };
    target.position.set(spot.x, groundAt(spot.x, spot.z), spot.z);
    target.rotation.y = Math.atan2(camera.position.x - spot.x, camera.position.z - spot.z);
  }

  function clearCharacter(): void {
    if (!character) return;
    clearMotion();
    if (mixer) {
      mixer.uncacheRoot(character);
      mixer = undefined;
    }
    character.removeFromParent();
    disposeModel(character);
    character = undefined;
    characterMaterials = [];
    motionUrl = undefined;
    currentState = undefined;
  }

  /** Stops whatever clip is playing, keeping the loaded clips around. */
  function clearMotion(): void {
    if (mixer) {
      mixer.stopAllAction();
      currentState = undefined;
    }
    motionAction = undefined;
  }

  /**
   * Binds the outfit's motion. `undefined` runs the state machine: standing still plays the gate
   * clip, moving plays the run clip, and the two crossfade so no T-pose shows between them.
   */
  async function setMotion(url: string | undefined): Promise<void> {
    if (url === motionUrl) return;
    motionUrl = url;
    clearMotion();
    if (!character) return;
    if (!url) {
      playState('idle');
      return;
    }

    const clip = await clipFor(url);
    if (!clip || stopped || motionUrl !== url || !character) return;
    play(clip);
  }

  /** Loads a clip once and keeps it, so switching back to it costs nothing. */
  async function clipFor(url: string): Promise<AnimationClip | undefined> {
    const cached = clips.get(url);
    if (cached) return cached;
    const pending = clipLoads.get(url);
    if (pending) return pending;

    const load = loader
      .loadAsync(url)
      .then((gltf) => {
        const clip = gltf.animations[0];
        if (clip) clips.set(url, clip);
        clipLoads.delete(url);
        return clip;
      })
      .catch(() => {
        clipLoads.delete(url);
        return undefined;
      });
    clipLoads.set(url, load);
    return load;
  }

  function ensureMixer(): AnimationMixer | undefined {
    if (!character) return undefined;
    mixer ??= new AnimationMixer(character);
    return mixer;
  }

  /** Crossfades to one clip, looping it. */
  function play(clip: AnimationClip): void {
    const activeMixer = ensureMixer();
    if (!activeMixer) return;
    const next = activeMixer.clipAction(clip);
    next.reset();
    next.setLoop(LoopRepeat, Number.POSITIVE_INFINITY);
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.play();
    if (motionAction && motionAction !== next) next.crossFadeFrom(motionAction, CROSSFADE, true);
    motionAction = next;
  }

  /** The state machine: idle when she stands, running when she does not. */
  async function playState(state: 'idle' | 'run'): Promise<void> {
    if (state === currentState) return;
    currentState = state;
    if (motionUrl) return;
    const slug = state === 'idle' ? IDLE_MOTION : RUN_MOTION;
    const url = motionCatalog.find((entry) => entry.endsWith(`/${slug}.glb`));
    if (!url) return;
    const clip = await clipFor(url);
    if (!clip || stopped || motionUrl || !character) return;
    play(clip);
  }

  /** Preloads every published clip so a state change never waits on the network. */
  async function preloadMotions(): Promise<void> {
    const queue = [...motionCatalog];
    const workers = Array.from({ length: 4 }, async () => {
      while (queue.length > 0 && !stopped) {
        const url = queue.shift();
        if (url) await clipFor(url);
      }
    });
    await Promise.all(workers);
  }

  async function setCharacter(url: string | undefined): Promise<void> {
    if (url === characterUrl) {
      if (character) placeCharacter(character);
      return;
    }
    characterUrl = url;
    clearCharacter();
    if (!url) {
      if (third.active) {
        third.disable();
        frame();
      }
      return;
    }

    const gltf = await loader.loadAsync(url);
    try {
      characterMaterials = await applyCharacterMaterials(gltf);
    } catch {
      // A missing shadow mask should still show the outfit; the loaded materials stay as they are.
    }
    if (stopped || characterUrl !== url) {
      disposeModel(gltf.scene);
      return;
    }
    character = gltf.scene;
    scene.add(character);
    placeCharacter(character);
    applyMode();
    void preloadMotions();
    // A clip chosen before the outfit existed plays once it does; otherwise the state machine starts.
    if (motionUrl) {
      const pending = motionUrl;
      motionUrl = undefined;
      void setMotion(pending);
    } else {
      void playState('idle');
    }
  }

  function clear(): void {
    if (!model) return;
    model.removeFromParent();
    disposeModel(model);
    model = undefined;
    heights = undefined;
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
    for (const child of loaded.children)
      if (SKY_NODE.test(child.name))
        skyDome = new Box3().setFromObject(child).getBoundingSphere(new Sphere());
    area = courseBounds(loaded);
    ground = groundUnder(loaded, area);
    heights = buildHeightField(
      loaded.children.flatMap((child) => (TRACK_PART.test(child.name) ? trackMeshes(child) : [])),
      area
    );
    setSkyVisible(third.active);
    if (character) placeCharacter(character);
    frame();
    applyMode();
  }

  let lastFrame = performance.now();

  function render(now = performance.now()): void {
    if (stopped) return;
    const delta = (now - lastFrame) / 1000;
    lastFrame = now;
    // The follow camera moves the pivot itself; the orbit controls own the rest.
    if (third.active) {
      third.update(delta);
      controls.update();
      // The state machine follows her feet unless the reader pinned a clip.
      void playState(third.speed > 0.1 ? 'run' : 'idle');
    } else {
      fly.update(delta);
    }
    mixer?.update(delta);
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
    clearCharacter();
    third.dispose();
    fly.dispose();
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
    setCharacter,
    setMotionCatalog: (urls) => {
      motionCatalog = urls;
      void preloadMotions();
    },
    setTrackStart: (point) => {
      trackStart = point;
      if (character) placeCharacter(character);
    },
    setMotion,
    frame,
    setMode: (mode: CameraMode) => {
      currentMode = mode;
      applyMode();
    },
    dispose
  };
}
