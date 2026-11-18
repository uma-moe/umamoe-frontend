// The three.js side of the racecourse viewer: one scene, one course at a time, flown freely.
//
// The models are the game's own geometry with its baked textures embedded, drawn in game units
// (Tokyo measures ~1429 x 63 x 979), so the camera frames whatever the loaded model turns out to be
// rather than a constant size.
//
// This file coordinates. It holds what is on screen and how the camera is driven; the stage, the loop,
// the sky, the trees, the marked line and the loading all live beside it.

import { Box3, Group, Sphere, Vector3, type Mesh, type Object3D } from 'three';
import { createFlyCamera } from './fly-camera';
import { applyUnityMaterials } from './unity-materials';
import { collectBillboards, faceBillboards, type Billboard } from './billboards';
import { collectSurfaces, courseBounds, createSurfaceQuery, findSkyNodes } from './course-model';
import { buildRibbon, createCourseLine } from './course-line';
import { disposeObjects } from './dispose';
import {
  FLY_START,
  NEAR_PLANE,
  OPENING_DIRECTION,
  PORTRAIT_DIRECTION,
  farFor,
  fitDistance,
  topDownDistance,
  zoomStep
} from './framing';
import { assembleCourse, createCourseLoader, type LoadedCourse } from './loading';
import { createRailOutline } from './rail-outline';
import { createRenderLoop } from './render-loop';
import {
  FOG_BOOT,
  HAZE,
  applyHaze,
  fogBand,
  followSky,
  hazeFromSky,
  skyOf,
  unfog,
  worldBounds,
  type CourseSky
} from './sky';
import { createStage } from './stage';

/** How often the fly camera's position is reported to the stage, in milliseconds. */
const CAMERA_REPORT_INTERVAL = 120;
/** The radius assumed before a course is loaded, so zoom has something to size itself by. */
const NO_COURSE_RADIUS = 1000;

/** The camera is free, or pinned straight down: there is no third mode. */
export type CameraMode = 'fly' | 'topDown';

export interface RacecourseSceneHandlers {
  onProgress?: (loaded: number, total: number) => void;
  onFailure?: (message: string) => void;
  /** How the camera is driven now, so the controls and the hint can say what the reader can do. */
  onViewChange?: (mode: CameraMode) => void;
  /** Where the camera is, while the reader flies it, so the stage can show it. */
  onCameraMove?: (x: number, y: number, z: number) => void;
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
  /** Hands over a free camera standing on the spot a good view was read from. */
  freeCamera(): void;
  /** Looks straight down at the course, north up: the whole ring flat in the frame. */
  topDown(): void;
  /** Moves the camera along its line of sight: `1` closes in, `-1` pulls back. */
  zoom(direction: 1 | -1): void;
  /** Marks a course's racing line on the track, in simulator coordinates, or clears it. */
  highlight(points?: readonly (readonly [number, number])[]): void;
  /** Draws the edges of the racing surface, so the rail a marked course should follow is visible. */
  rails(on: boolean): void;
  dispose(): void;
}

export function createRacecourseScene({
  canvas,
  host,
  handlers = {}
}: RacecourseSceneOptions): RacecourseScene {
  const stage = createStage({
    canvas,
    host,
    haze: HAZE,
    fogBand: FOG_BOOT,
    onContextLost: contextLost
  });
  const { renderer, scene, camera, fog } = stage;

  const fly = createFlyCamera({ camera, canvas, bounds: () => world });
  const loader = createCourseLoader((loaded, total) => handlers.onProgress?.(loaded, total));

  /** The course's sky, which follows the camera so the reader is always inside it. */
  let sky: CourseSky | undefined;
  /** How far the reader may fly from the course: well past the dome, so the opening frame fits. */
  let world: Sphere | undefined;
  /** Trees inside the oval. They are flat quads, so they only read as trees when they face the camera. */
  let billboards: Billboard[] = [];
  /** The racing surface: the meshes a marked course is laid on. */
  let surfaces: Mesh[] = [];
  /** The band drawn for the selected course's racing line. */
  let courseLine: Mesh | undefined;
  /** The rails drawn over the racing surface, when the reader asks to see them. */
  let railOutline: Group | undefined;
  let railsShown = false;
  let model: Object3D | undefined;
  let area: Box3 | undefined;
  let sceneRadius = NO_COURSE_RADIUS;
  /** The centre of the framed view, so zoom and the straight-down shot agree on it. */
  let framed: Vector3 | undefined;
  /**
   * How the camera is driven: the reader flies it, or the straight-down view holds still and only the
   * buttons move it. A top-down shot has nowhere to look around from, so it takes no pointer and no
   * movement keys.
   */
  let mode: CameraMode = 'fly';
  /** The stage is gone: nothing more may be drawn on it or shown in it. */
  let stopped = false;
  let lastReport = 0;

  function setMode(next: CameraMode): void {
    if (mode === next) return;
    mode = next;
    handlers.onViewChange?.(mode);
  }

  /** Puts the near and far planes where a camera this far out needs them. */
  function setCameraReach(distance: number): void {
    camera.far = farFor(distance, sceneRadius);
    camera.near = NEAR_PLANE;
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
    const distance = fitDistance({
      size: box.getSize(new Vector3()),
      aspect: camera.aspect,
      direction,
      fov: camera.fov
    });
    setCameraReach(distance);

    camera.position.copy(sphere.center).addScaledVector(direction, distance);
    camera.lookAt(sphere.center);

    framed = sphere.center.clone();
    setMode('fly');
    fly.enable();

    // The fly camera starts looking wherever the camera points; it takes over on the first input.
  }

  /** Stands a free camera on the spot the view was read from, looking at the course. */
  function freeCamera(): void {
    if (!model) return;
    const centre = framed ?? (area ?? courseBounds(model)).getBoundingSphere(new Sphere()).center;
    camera.position.copy(FLY_START);
    camera.lookAt(centre);
    setMode('fly');
    fly.enable();
  }

  /** Zoom, Google-Maps style: a step along the line of sight, sized by how far out the camera is. */
  function zoom(direction: 1 | -1): void {
    const target = framed ?? area?.getCenter(new Vector3());
    const span = target ? camera.position.distanceTo(target) : sceneRadius;
    camera.position.addScaledVector(
      camera.getWorldDirection(new Vector3()),
      zoomStep(span, direction)
    );
  }

  /**
   * Looks straight down at the course from above its centre, north up, at the distance that fits the
   * whole ring in the stage.
   */
  function topDown(): void {
    const box = area ?? (model ? courseBounds(model) : undefined);
    if (!box || box.isEmpty()) return;
    const centre = framed ?? box.getBoundingSphere(new Sphere()).center;
    fly.disable();
    setMode('topDown');

    const distance = topDownDistance({
      size: box.getSize(new Vector3()),
      aspect: camera.aspect,
      fov: camera.fov
    });
    setCameraReach(distance);

    camera.position.set(centre.x, centre.y + distance, centre.z);
    // Looking along the up vector leaves the roll undefined, so north is made the up of the shot.
    camera.up.set(0, 0, -1);
    camera.lookAt(centre);
    camera.up.set(0, 1, 0);
  }

  /**
   * Marks a course's racing line. The simulator's line is laid on the track by `buildRibbon`; this only
   * decides where the band goes and swaps the one on screen for it.
   */
  function highlight(points?: readonly (readonly [number, number])[]): void {
    if (courseLine) {
      courseLine.removeFromParent();
      disposeObjects(courseLine);
      courseLine = undefined;
    }
    if (!points || !model) return;

    const ribbon = buildRibbon({
      points,
      centre: (area ?? courseBounds(model)).getBoundingSphere(new Sphere()).center,
      heightAt: createSurfaceQuery(surfaces, area?.max.y)
    });
    if (!ribbon) return;

    courseLine = createCourseLine(ribbon);
    scene.add(courseLine);
  }

  function showRails(on: boolean): void {
    railsShown = on;
    rebuildRails();
  }

  /**
   * Draws the rail outline when it is asked for, and takes the last one away either way: a new course
   * replaces the rails it had.
   */
  function rebuildRails(): void {
    if (railOutline) {
      railOutline.removeFromParent();
      disposeObjects(railOutline);
      railOutline = undefined;
    }
    if (!railsShown || surfaces.length === 0) return;

    railOutline = createRailOutline(surfaces);
    scene.add(railOutline);
  }

  function clear(): void {
    if (!model) return;
    model.removeFromParent();
    disposeObjects(model);
    model = undefined;
    area = undefined;
  }

  /** Applies the game's shading, then puts the course on screen once it is ready to draw. */
  async function show({ token, gltfs }: LoadedCourse): Promise<void> {
    for (const gltf of gltfs) {
      try {
        await applyUnityMaterials(gltf);
      } catch {
        // A missing lightmap should not cost the reader the whole course: keep the loaded materials.
      }
    }

    // A slower load that lost the race to a newer one must not replace what is on screen.
    if (stopped || loader.isStale(token)) {
      disposeObjects(...gltfs.map((gltf) => gltf.scene));
      return;
    }

    const loaded = assembleCourse(gltfs);
    // The course already on screen stays while the next one streams in, so a track change is a swap
    // rather than a blank stage.
    const previous = model;
    model = loaded;
    scene.add(loaded);
    sceneRadius = new Box3().setFromObject(loaded).getBoundingSphere(new Sphere()).radius;

    for (const node of findSkyNodes(loaded)) {
      sky = skyOf(node, new Box3().setFromObject(node).getBoundingSphere(new Sphere()));
    }
    world = worldBounds(sky, sceneRadius);

    area = courseBounds(loaded);
    billboards = collectBillboards(loaded, area);
    surfaces = collectSurfaces(loaded);
    rebuildRails();

    const band = fogBand(area.getSize(new Vector3()).length() / 2);
    fog.near = band.near;
    fog.far = band.far;

    for (const node of findSkyNodes(loaded)) {
      unfog(node);
      applyHaze(hazeFromSky(node), scene, fog);
    }

    frame();
    if (sky) followSky(sky, camera);

    if (previous) {
      previous.removeFromParent();
      disposeObjects(previous);
    }
  }

  function load(targets: string[]): Promise<void> {
    return loader.load(targets).then((loaded) => (loaded ? show(loaded) : undefined));
  }

  function stop(): void {
    stopped = true;
    renderLoop.stop();
  }

  function contextLost(): void {
    stop();
    handlers.onFailure?.('The 3D view stopped. Reload the page to bring it back.');
  }

  function dispose(): void {
    stop();
    fly.dispose();
    railsShown = false;
    rebuildRails();
    clear();
    if (courseLine) {
      courseLine.removeFromParent();
      disposeObjects(courseLine);
      courseLine = undefined;
    }
    loader.dispose();
    stage.dispose();
  }

  const renderLoop = createRenderLoop((delta, now) => {
    if (mode === 'fly') fly.update(delta);
    if (mode === 'fly' && now - lastReport > CAMERA_REPORT_INTERVAL) {
      lastReport = now;
      handlers.onCameraMove?.(camera.position.x, camera.position.y, camera.position.z);
    }
    faceBillboards(billboards, camera.position);
    if (sky) followSky(sky, camera);
    renderer.render(scene, camera);
  });

  renderLoop.start();

  return { load, frame, freeCamera, topDown, zoom, highlight, rails: showRails, dispose };
}
