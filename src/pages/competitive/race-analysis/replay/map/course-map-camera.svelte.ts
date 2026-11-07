import { Spring } from 'svelte/motion';
import { FIT_MARGIN_Y, fitTrackCamera, type TrackCamera, type TrackPoint } from '../replay-track';
import { DISTANCE_STRIP, MAP_LABELS_INSIDE, MAP_RIBBONS_OUTSIDE } from '../course-ribbons';
import { cameraMatrix, projectPoint } from './screen-projection';

// Skill labels stack above the portraits, so the frame starts below a band kept for them.
const LABEL_BAND = 48;
// The inner rail sits a distance strip from the infield edge, as in race positions; the fit's own
// margin makes up most of it.
const INFIELD_LABEL_BAND = DISTANCE_STRIP - FIT_MARGIN_Y;
// Ribbons and course labels fall back to the map edge when the outer rail lies beyond it. Above
// the track, the skill label band holds them; below it, the frame keeps their depth beyond the
// fit's margin.
const OUTER_RIBBON_BAND = MAP_RIBBONS_OUTSIDE + MAP_LABELS_INSIDE - FIT_MARGIN_Y;

interface CameraSource {
  framing: () => TrackPoint[];
  /** Width at the right edge covered by an overlay; the camera frames the race beside it. */
  inset: () => number;
  /** Moves the frame's centre right, towards the centre of the whole map. */
  centreShift: () => number;
  /** The map edge the infield faces once the course runs left to right. */
  infieldEdge: () => 'top' | 'bottom';
}

export class CourseMapCamera {
  width = $state(800);
  height = $state(280);
  element = $state<SVGSVGElement>();
  following = $state(true);
  followZoom = $state(1);
  manual = $state<TrackCamera>();

  motion = new Spring<TrackCamera>(
    { x: 500, y: 170, scale: 1, angle: 0 },
    { stiffness: 0.35, damping: 1, precision: 0.001 }
  );

  #source: CameraSource;
  #drag: { id: number; x: number; y: number; view: TrackCamera } | undefined;

  constructor(source: CameraSource) {
    this.#source = source;
  }

  frameWidth = $derived.by(() => Math.max(120, this.width - this.#source.inset()));
  infieldBelow = $derived.by(() => this.#source.infieldEdge() === 'bottom');
  frameTop = $derived(LABEL_BAND + (this.infieldBelow ? 0 : INFIELD_LABEL_BAND));
  frameBottom = $derived(
    this.height - (this.infieldBelow ? INFIELD_LABEL_BAND : OUTER_RIBBON_BAND)
  );

  frameHeight = $derived(Math.max(80, this.frameBottom - this.frameTop));
  centreX = $derived.by(() => this.frameWidth / 2 + this.#source.centreShift());
  centreY = $derived(this.frameBottom - this.frameHeight / 2);

  /** Where the framing's infield edge settles; follow zoom pivots on it to keep the rail in place. */
  infieldY = $derived(
    this.centreY + (this.infieldBelow ? 1 : -1) * (this.frameHeight / 2 - FIT_MARGIN_Y)
  );

  // While following, the framing stays in view during camera motion; zooming scales around it.
  current = $derived.by(() => {
    if (!this.following) return this.motion.current;

    const zoom = this.followZoom,
      motion = this.motion.current;

    const fitted = fitTrackCamera(this.#source.framing(), this.frameWidth, this.frameHeight, 0, {
      ...motion,
      scale: motion.scale / zoom
    });

    return this.#zoomAbout(fitted, fitted.scale * zoom, { x: this.centreX, y: this.infieldY });
  });

  /** Maps course coordinates onto the map; shared by every layer drawn on it. */
  matrix = $derived(cameraMatrix(this.current, { x: this.centreX, y: this.centreY }));

  zoomInDisabled = $derived(this.following ? this.followZoom >= 2 : this.current.scale >= 64);
  zoomOutDisabled = $derived(this.following ? this.followZoom <= 0.5 : this.current.scale <= 0.15);

  rotate = (x: number, y: number, angle = this.current.angle) => ({
    x: x * Math.cos(angle) - y * Math.sin(angle),
    y: x * Math.sin(angle) + y * Math.cos(angle)
  });

  project = (point: { x: number; y: number }) => projectPoint(this.matrix, point);

  follow = () => {
    this.following = true;
    this.manual = undefined;
  };

  release = () => {
    this.manual = undefined;
    this.following = false;
  };

  zoom = (factor: number, point = { x: this.centreX, y: this.centreY }) => {
    if (this.following) {
      this.followZoom = Math.max(0.5, Math.min(2, this.followZoom * factor));
      return;
    }

    const camera = this.current;
    const scale = Math.max(0.15, Math.min(64, camera.scale * factor));
    this.manual = this.#zoomAbout(camera, scale, point);
    this.following = false;
  };

  /** Rescales the camera so the course under a map point stays on that point. */
  #zoomAbout(camera: TrackCamera, scale: number, point: { x: number; y: number }): TrackCamera {
    const delta = this.rotate(point.x - this.centreX, point.y - this.centreY, -camera.angle);

    return {
      x: camera.x + delta.x * (1 / camera.scale - 1 / scale),
      y: camera.y + delta.y * (1 / camera.scale - 1 / scale),
      scale,
      angle: camera.angle
    };
  }

  #localPoint(event: PointerEvent | WheelEvent) {
    const matrix = this.element?.getScreenCTM()?.inverse();
    return matrix
      ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix)
      : { x: this.centreX, y: this.centreY };
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
