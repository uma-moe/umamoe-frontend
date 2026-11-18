// The WebGL lifetime of the stage: one renderer, one scene, one camera, and the size they are drawn at.
// It owns nothing about the course.

import { Color, Fog, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { CAMERA_FOV, FAR_LIMIT, NEAR_PLANE, OPENING_DIRECTION, OPENING_DISTANCE } from './framing';

export interface Stage {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  /** The haze band; the course's size sets where it starts, the sky sets its colour. */
  fog: Fog;
  dispose(): void;
}

export interface StageOptions {
  canvas: HTMLCanvasElement;
  /** The element the canvas fills; its size drives the renderer and the camera aspect. */
  host: HTMLElement;
  /** The colour of the empty space below the horizon. */
  haze: number;
  /** The fog band before a course sets its own. */
  fogBand: { near: number; far: number };
  /** The context is gone; nothing can be drawn again. */
  onContextLost: () => void;
}

export function createStage({ canvas, host, haze, fogBand, onContextLost }: StageOptions): Stage {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new Scene();
  scene.background = new Color(haze);
  // Fog does for the far scenery what the game also does: fades it out before its edge.
  const fog = new Fog(haze, fogBand.near, fogBand.far);
  scene.fog = fog;

  const camera = new PerspectiveCamera(CAMERA_FOV, 1, NEAR_PLANE, FAR_LIMIT);
  camera.position.copy(OPENING_DIRECTION).multiplyScalar(OPENING_DISTANCE);

  // No lights: the game bakes its lighting into the course's lightmap, and the rebuilt materials
  // read that instead of shading a normal.

  function resize(): void {
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function handleContextLost(event: Event): void {
    event.preventDefault();
    onContextLost();
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  canvas.addEventListener('webglcontextlost', handleContextLost);
  resize();

  return {
    renderer,
    scene,
    camera,
    fog,
    dispose() {
      resizeObserver.disconnect();
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      renderer.dispose();
      renderer.forceContextLoss();
    }
  };
}
