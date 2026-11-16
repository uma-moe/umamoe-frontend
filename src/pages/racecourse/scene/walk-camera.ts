// A walk-along-the-ground camera, so the course can be read at the height a horsegirl stands.
//
// The world is in metres: the eye sits 1.6 m above the track, walking is 4.5 m/s and holding Shift
// covers ground at 16 m/s, which is roughly a canter. The ground is flat in every course model, so
// the height is taken from the model's lowest point instead of raycasting 230k triangles a frame.

import { Vector3, type Box3, type PerspectiveCamera } from 'three';

/** Eye height of a horsegirl, in metres. */
export const EYE_HEIGHT = 1.6;
const WALK_SPEED = 4.5;
const RUN_SPEED = 16;
/** Radians per pixel of pointer travel. */
const LOOK_SENSITIVITY = 0.0022;
const PITCH_LIMIT = Math.PI * 0.47;
/** The shared sky dome sits inside the course model and must not decide where the ground is. */
export const SKY_NODE = /race00000/;
/** Keys the movement reads, so the page does not scroll and browser shortcuts still work. */
const MOVEMENT_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ShiftLeft',
  'ShiftRight'
]);

export interface WalkCamera {
  readonly walking: boolean;
  /** Steps onto the course at that ground point, looking along `facing`. */
  enable(spot: { x: number; z: number }, facing: Vector3): void;
  disable(): void;
  /** Mounts the movement, key and pointer listeners. Call once. */
  listen(): void;
  /** The area the walker stays inside, and the ground surface it stands on. */
  setArea(box: Box3, ground: number): void;
  update(deltaSeconds: number): void;
  dispose(): void;
}

export interface WalkCameraOptions {
  camera: PerspectiveCamera;
  canvas: HTMLCanvasElement;
}

export function createWalkCamera({ camera, canvas }: WalkCameraOptions): WalkCamera {
  const keys = new Set<string>();
  const forward = new Vector3();
  const right = new Vector3();
  const step = new Vector3();
  let walking = false;
  let area: Box3 | undefined;
  let ground = 0;
  let yaw = 0;
  let pitch = 0;
  let pointer: number | undefined;
  let pointerX = 0;
  let pointerY = 0;

  function groundLevel(): number {
    return ground + EYE_HEIGHT;
  }

  function clampToArea(): void {
    if (!area) return;
    // Keep the walker a stride inside the model, so the edge of the mesh is not a cliff to fall off.
    const inset = 2;
    camera.position.x = Math.min(
      Math.max(camera.position.x, area.min.x + inset),
      area.max.x - inset
    );
    camera.position.z = Math.min(
      Math.max(camera.position.z, area.min.z + inset),
      area.max.z - inset
    );
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (!walking || !MOVEMENT_KEYS.has(event.code)) return;
    keys.add(event.code);
    if (event.code.startsWith('Arrow')) event.preventDefault();
  }

  function onKeyUp(event: KeyboardEvent): void {
    keys.delete(event.code);
  }

  function onPointerDown(event: PointerEvent): void {
    if (!walking || pointer !== undefined) return;
    pointer = event.pointerId;
    pointerX = event.clientX;
    pointerY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent): void {
    if (!walking || event.pointerId !== pointer) return;
    yaw -= (event.clientX - pointerX) * LOOK_SENSITIVITY;
    pitch = Math.min(
      Math.max(pitch - (event.clientY - pointerY) * LOOK_SENSITIVITY, -PITCH_LIMIT),
      PITCH_LIMIT
    );
    pointerX = event.clientX;
    pointerY = event.clientY;
  }

  function onPointerUp(event: PointerEvent): void {
    if (event.pointerId !== pointer) return;
    pointer = undefined;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  }

  function onWindowBlur(): void {
    keys.clear();
  }

  function listen(): void {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onWindowBlur);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
  }

  function enable(spot: { x: number; z: number }, facing: Vector3): void {
    walking = true;
    camera.position.set(spot.x, groundLevel(), spot.z);
    clampToArea();
    camera.position.y = groundLevel();
    yaw = Math.atan2(-facing.x, -facing.z);
    pitch = 0;
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
  }

  function disable(): void {
    walking = false;
    keys.clear();
    pointer = undefined;
  }

  function update(deltaSeconds: number): void {
    if (!walking) return;
    const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? RUN_SPEED : WALK_SPEED;
    // A tab that was hidden reports a huge delta; cap it so the walker cannot jump across the course.
    const distance = speed * Math.min(deltaSeconds, 0.1);

    forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    right.set(Math.cos(yaw), 0, -Math.sin(yaw));
    step.set(0, 0, 0);
    if (keys.has('KeyW') || keys.has('ArrowUp')) step.add(forward);
    if (keys.has('KeyS') || keys.has('ArrowDown')) step.sub(forward);
    if (keys.has('KeyD') || keys.has('ArrowRight')) step.add(right);
    if (keys.has('KeyA') || keys.has('ArrowLeft')) step.sub(right);
    if (step.lengthSq() > 0) camera.position.addScaledVector(step.normalize(), distance);

    clampToArea();
    camera.position.y = groundLevel();
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
  }

  return {
    get walking() {
      return walking;
    },
    enable,
    disable,
    listen,
    setArea: (box: Box3, groundY: number) => {
      area = box;
      ground = groundY;
    },
    update,
    dispose(): void {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onWindowBlur);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      keys.clear();
    }
  };
}
