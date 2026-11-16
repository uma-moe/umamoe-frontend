// A third-person camera: the reader walks an uma around the course and looks at her from behind.
//
// The orbit controls stay useful — dragging circles the outfit — so the follow part only translates
// the orbit's pivot and the camera by the same amount when she moves. WASD is camera-relative, and she
// turns to face the way she walks. Game units are metres: she is 1.63 m tall, walks at 4.5 m/s and
// runs at 16 m/s with Shift.

import { Vector3, type Box3, type Object3D, type PerspectiveCamera } from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const WALK_SPEED = 4.5;
const RUN_SPEED = 16;
/** Where the camera looks on her body, from her feet. */
const CHEST_HEIGHT = 1.0;
const BACK = 3.0;
const UP = 1.15;
const MIN_CAMERA_HEIGHT = 0.6;
/** The keys the movement reads, so the page can still scroll with the rest. */
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

export interface ThirdPersonCamera {
  readonly active: boolean;
  enable(): void;
  disable(): void;
  listen(): void;
  update(deltaSeconds: number): void;
  dispose(): void;
}

export interface ThirdPersonOptions {
  camera: PerspectiveCamera;
  canvas: HTMLCanvasElement;
  controls: OrbitControls;
  /** The outfit being walked; nobody to follow means the camera does nothing. */
  subject: () => Object3D | undefined;
  ground: (x: number, z: number) => number;
  area: () => Box3 | undefined;
}

export function createThirdPersonCamera({
  camera,
  canvas,
  controls,
  subject,
  ground,
  area
}: ThirdPersonOptions): ThirdPersonCamera {
  const keys = new Set<string>();
  const forward = new Vector3();
  const right = new Vector3();
  const move = new Vector3();
  const target = new Vector3();
  const delta = new Vector3();
  let active = false;

  function onKeyDown(event: KeyboardEvent): void {
    if (!active || !MOVEMENT_KEYS.has(event.code)) return;
    keys.add(event.code);
    if (event.code.startsWith('Arrow')) event.preventDefault();
  }

  function onKeyUp(event: KeyboardEvent): void {
    keys.delete(event.code);
  }

  function onWindowBlur(): void {
    keys.clear();
  }

  function listen(): void {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onWindowBlur);
  }

  function enable(): void {
    const outfit = subject();
    if (!outfit) return;
    active = true;
    controls.enabled = true;
    controls.minDistance = 1.2;
    controls.maxDistance = 9;
    controls.maxPolarAngle = Math.PI * 0.49;

    target.copy(outfit.position).setY(outfit.position.y + CHEST_HEIGHT);
    // Behind her: the model's front is its own +Z.
    const facing = new Vector3(Math.sin(outfit.rotation.y), 0, Math.cos(outfit.rotation.y));
    controls.target.copy(target);
    camera.position
      .copy(target)
      .addScaledVector(facing, -BACK)
      .setY(target.y + UP);
    controls.update();
  }

  function disable(): void {
    active = false;
    keys.clear();
  }

  function update(deltaSeconds: number): void {
    const outfit = subject();
    if (!active || !outfit) return;

    // Camera-relative movement, so W always walks away from the reader.
    forward.copy(controls.target).sub(camera.position).setY(0);
    if (forward.lengthSq() === 0) forward.set(0, 0, -1);
    forward.normalize();
    right.crossVectors(forward, camera.up).normalize();

    move.set(0, 0, 0);
    if (keys.has('KeyW') || keys.has('ArrowUp')) move.add(forward);
    if (keys.has('KeyS') || keys.has('ArrowDown')) move.sub(forward);
    if (keys.has('KeyD') || keys.has('ArrowRight')) move.add(right);
    if (keys.has('KeyA') || keys.has('ArrowLeft')) move.sub(right);

    if (move.lengthSq() > 0) {
      move.normalize();
      const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? RUN_SPEED : WALK_SPEED;
      // A tab that was hidden reports a huge delta; cap it so she cannot teleport across the course.
      outfit.position.addScaledVector(move, speed * Math.min(deltaSeconds, 0.1));
      const bounds = area();
      if (bounds) {
        outfit.position.x = Math.min(
          Math.max(outfit.position.x, bounds.min.x + 2),
          bounds.max.x - 2
        );
        outfit.position.z = Math.min(
          Math.max(outfit.position.z, bounds.min.z + 2),
          bounds.max.z - 2
        );
      }
      outfit.position.y = ground(outfit.position.x, outfit.position.z);
      outfit.rotation.y = Math.atan2(move.x, move.z);
    }

    // Follow her: move the pivot and the camera together, so the orbit keeps its angle and distance.
    const wanted = outfit.position.clone().setY(outfit.position.y + CHEST_HEIGHT);
    delta.subVectors(wanted, controls.target);
    if (delta.lengthSq() > 0) {
      controls.target.add(delta);
      camera.position.add(delta);
    }
    const floor = ground(outfit.position.x, outfit.position.z) + MIN_CAMERA_HEIGHT;
    if (camera.position.y < floor) camera.position.y = floor;
  }

  function dispose(): void {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onWindowBlur);
    keys.clear();
    active = false;
  }

  return {
    get active() {
      return active;
    },
    enable,
    disable,
    listen,
    update,
    dispose
  };
}
