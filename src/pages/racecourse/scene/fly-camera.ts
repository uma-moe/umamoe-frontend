// A free-fly camera for the overview: WASD moves, the mouse looks, and the dome holds you in.
//
// The overview used to be an orbit camera, which means dragging to look at a 1.4 km course from
// 1.5 km away. A fly camera is the same gesture budget — click to capture the pointer, mouse to look,
// keys to move — and it can be clamped inside the sky dome the course model carries, so the reader
// never ends up outside the world.

import { Vector3, type PerspectiveCamera, type Sphere } from 'three';

const LOOK_SENSITIVITY = 0.0022;
/** One speed: fast enough to cross a 1.4 km course in about twelve seconds. */
const SPEED = 120;
const PITCH_LIMIT = Math.PI * 0.495;
const KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyQ',
  'KeyE',
  'KeyR',
  'KeyF',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight'
]);

export interface FlyCamera {
  readonly active: boolean;
  enable(): void;
  disable(): void;
  /** Where the camera is, so switching back to third person can start from the same place. */
  position(): Vector3;
  update(deltaSeconds: number): void;
  dispose(): void;
}

export interface FlyCameraOptions {
  camera: PerspectiveCamera;
  canvas: HTMLCanvasElement;
  /** The dome the camera stays inside: the sky the course model carries. */
  bounds: () => Sphere | undefined;
}

export function createFlyCamera({ camera, canvas, bounds }: FlyCameraOptions): FlyCamera {
  const keys = new Set<string>();
  const forward = new Vector3();
  const right = new Vector3();
  const move = new Vector3();
  let active = false;
  let yaw = 0;
  let pitch = 0;

  function applyRotation(): void {
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
  }

  function onPointerLockChange(): void {
    if (document.pointerLockElement === canvas || !active) return;
    // Esc releases the pointer; the camera keeps its place and stops reading keys.
    keys.clear();
  }

  function onMouseMove(event: MouseEvent): void {
    if (!active || document.pointerLockElement !== canvas) return;
    yaw -= event.movementX * LOOK_SENSITIVITY;
    pitch = Math.min(
      Math.max(pitch - event.movementY * LOOK_SENSITIVITY, -PITCH_LIMIT),
      PITCH_LIMIT
    );
    applyRotation();
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (!active || !KEYS.has(event.code)) return;
    keys.add(event.code);
    if (event.code.startsWith('Arrow')) event.preventDefault();
  }

  function onKeyUp(event: KeyboardEvent): void {
    keys.delete(event.code);
  }

  function onCanvasClick(): void {
    if (!active || document.pointerLockElement === canvas) return;
    // Newer browsers return a promise and reject it when the document cannot capture the pointer
    // (an iframe, or a headless one); the camera still works with the keyboard.
    const request = canvas.requestPointerLock() as unknown;
    if (request instanceof Promise) request.catch(() => {});
  }

  function onWindowBlur(): void {
    keys.clear();
  }

  function enable(): void {
    active = true;
    // Start looking where the overview was already pointed.
    camera.getWorldDirection(forward);
    yaw = Math.atan2(-forward.x, -forward.z);
    pitch = Math.asin(Math.min(Math.max(forward.y, -1), 1));
    applyRotation();
    canvas.addEventListener('click', onCanvasClick);
  }

  function disable(): void {
    active = false;
    keys.clear();
    canvas.removeEventListener('click', onCanvasClick);
    if (document.pointerLockElement === canvas) document.exitPointerLock();
  }

  function update(deltaSeconds: number): void {
    if (!active) return;
    const wantsKeyboard = keys.size > 0;
    if (!wantsKeyboard) return;

    const distance = SPEED * Math.min(deltaSeconds, 0.1);

    forward.set(
      -Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      -Math.cos(yaw) * Math.cos(pitch)
    );
    right.set(Math.cos(yaw), 0, -Math.sin(yaw));
    move.set(0, 0, 0);
    if (keys.has('KeyW') || keys.has('ArrowUp')) move.add(forward);
    if (keys.has('KeyS') || keys.has('ArrowDown')) move.sub(forward);
    if (keys.has('KeyD') || keys.has('ArrowRight')) move.add(right);
    if (keys.has('KeyA') || keys.has('ArrowLeft')) move.sub(right);
    if (keys.has('KeyE') || keys.has('KeyR')) move.y += 1;
    if (keys.has('KeyQ') || keys.has('KeyF')) move.y -= 1;
    if (move.lengthSq() === 0) return;

    camera.position.addScaledVector(move.normalize(), distance);

    // Stay inside the dome: the course model's sky is the edge of the world.
    const dome = bounds();
    if (dome) {
      const offset = camera.position.clone().sub(dome.center);
      const limit = dome.radius * 0.92;
      if (offset.length() > limit) camera.position.copy(dome.center).add(offset.setLength(limit));
    }
  }

  function dispose(): void {
    disable();
    document.removeEventListener('pointerlockchange', onPointerLockChange);
    document.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onWindowBlur);
  }

  document.addEventListener('pointerlockchange', onPointerLockChange);
  document.addEventListener('mousemove', onMouseMove);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onWindowBlur);

  return {
    get active() {
      return active;
    },
    enable,
    disable,
    position: () => camera.position.clone(),
    update,
    dispose
  };
}
