import { Spring } from 'svelte/motion';
import { fitTrackCamera, type TrackCamera, type TrackPoint } from '../replay-track';

export class CourseMapCamera {
  width = $state(800);
  height = $state(280);
  element = $state<SVGSVGElement>();
  following = $state(true);
  followZoom = $state(1.25);
  manual = $state<TrackCamera>();

  motion = new Spring<TrackCamera>(
    { x: 500, y: 170, scale: 1, angle: 0 },
    { stiffness: 0.35, damping: 1, precision: 0.001 }
  );

  #framing: () => TrackPoint[];
  #drag: { id: number; x: number; y: number; view: TrackCamera } | undefined;

  constructor(framing: () => TrackPoint[]) {
    this.#framing = framing;
  }

  current = $derived.by(() =>
    this.following
      ? fitTrackCamera(this.#framing(), this.width, this.height, 0, this.motion.current)
      : this.motion.current
  );

  zoomInDisabled = $derived(this.following ? this.followZoom >= 2 : this.current.scale >= 64);
  zoomOutDisabled = $derived(this.following ? this.followZoom <= 0.5 : this.current.scale <= 0.15);

  rotate = (x: number, y: number, angle = this.current.angle) => ({
    x: x * Math.cos(angle) - y * Math.sin(angle),
    y: x * Math.sin(angle) + y * Math.cos(angle)
  });

  project = (point: { x: number; y: number }) => {
    const camera = this.current;
    const p = this.rotate(point.x - camera.x, point.y - camera.y);
    return { x: p.x * camera.scale + this.width / 2, y: p.y * camera.scale + this.height / 2 };
  };

  follow = () => {
    this.following = true;
    this.manual = undefined;
  };

  release = () => {
    this.manual = undefined;
    this.following = false;
  };

  zoom = (factor: number, point = { x: this.width / 2, y: this.height / 2 }) => {
    if (this.following) {
      this.followZoom = Math.max(0.5, Math.min(2, this.followZoom * factor));
      return;
    }

    const camera = this.current;
    const scale = Math.max(0.15, Math.min(64, camera.scale * factor));
    const delta = this.rotate(point.x - this.width / 2, point.y - this.height / 2, -camera.angle);
    this.manual = {
      x: camera.x + delta.x * (1 / camera.scale - 1 / scale),
      y: camera.y + delta.y * (1 / camera.scale - 1 / scale),
      scale,
      angle: camera.angle
    };

    this.following = false;
  };

  #localPoint(event: PointerEvent | WheelEvent) {
    const matrix = this.element?.getScreenCTM()?.inverse();
    return matrix
      ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix)
      : { x: this.width / 2, y: this.height / 2 };
  }

  wheel = (event: WheelEvent) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    this.zoom(event.deltaY < 0 ? 1.12 : 1 / 1.12, this.#localPoint(event));
  };

  beginDrag = (event: PointerEvent) => {
    if (event.button !== 0 || (event.target as Element).closest('[role="button"]')) return;
    const point = this.#localPoint(event);
    this.#drag = { id: event.pointerId, x: point.x, y: point.y, view: { ...this.current } };

    this.element?.setPointerCapture(event.pointerId);
  };

  moveDrag = (event: PointerEvent) => {
    const drag = this.#drag;
    if (drag?.id !== event.pointerId) return;
    const point = this.#localPoint(event),
      dx = point.x - drag.x,
      dy = point.y - drag.y;

    if (Math.hypot(dx, dy) < 4 || (event.pointerType === 'touch' && Math.abs(dy) > Math.abs(dx)))
      return;
    const delta = this.rotate(dx, dy, -drag.view.angle);
    this.following = false;
    this.manual = {
      ...drag.view,
      x: drag.view.x - delta.x / drag.view.scale,
      y: drag.view.y - delta.y / drag.view.scale
    };
  };

  endDrag = (event: PointerEvent) => {
    if (this.#drag?.id !== event.pointerId) return;
    this.#drag = undefined;
    if (this.element?.hasPointerCapture(event.pointerId))
      this.element.releasePointerCapture(event.pointerId);
  };
}
