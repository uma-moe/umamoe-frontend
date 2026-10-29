import type { Attachment } from 'svelte/attachments';

/** The visible part of one axis, as fractions of its full data range. */
export interface ZoomWindow {
  start: number;
  end: number;
}

/** The plot area in the element's pixels; pointer positions are read against it. */
export interface PlotArea {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** A point inside the plot area, as fractions from its left and bottom edges. */
interface PlotPoint {
  x: number;
  y: number;
}

/** The deepest zoom: an eighth of an axis fills the plot. */
export const MAX_ZOOM = 8;
export const ZOOM_STEP = 1.5;
const KEY_PAN = 0.15;
/** A pointer must travel this far before a press becomes a drag, so clicks on points still land. */
const DRAG_THRESHOLD = 4;
const WHEEL_HINT_MS = 1400;

function clampWindow(start: number, span: number): ZoomWindow {
  const width = Math.min(1, Math.max(1 / MAX_ZOOM, span));
  const from = Math.min(1 - width, Math.max(0, start));

  return { start: from, end: from + width };
}

/**
 * Zoom and pan state for a hand-drawn SVG chart, with the skill explorer's controls: Ctrl or ⌘ with
 * the wheel zooms (the wheel alone keeps scrolling the page), two fingers pinch, a drag pans, and
 * double-click or Home shows the whole plot. The chart maps its data through `visible`.
 */
export class PlotZoom {
  /** Which axes zoom; a line chart over a few categories may zoom its values only. */
  readonly axes: { x: boolean; y: boolean } = { x: true, y: true };
  x = $state<ZoomWindow>({ start: 0, end: 1 });
  y = $state<ZoomWindow>({ start: 0, end: 1 });
  /** Set briefly when the wheel scrolled over the plot, so the chart can say how to zoom. */
  wheelHint = $state(false);

  readonly zoom = $derived(
    Math.max(
      this.axes.x ? 1 / (this.x.end - this.x.start) : 1,
      this.axes.y ? 1 / (this.y.end - this.y.start) : 1
    )
  );
  readonly zoomed = $derived(this.zoom > 1.001);

  constructor(axes: { x: boolean; y: boolean } = { x: true, y: true }) {
    this.axes = axes;
  }

  /** The visible slice of a full data range on one axis. */
  visible(axis: 'x' | 'y', min: number, max: number) {
    const window = this[axis];
    const span = max - min;

    return { min: min + span * window.start, max: min + span * window.end };
  }

  /** Zooms by `factor` (above 1 zooms in) around a focus inside the plot area. */
  zoomAt(factor: number, focus: PlotPoint = { x: 0.5, y: 0.5 }) {
    if (this.axes.x) this.x = this.scaled(this.x, focus.x, factor);
    if (this.axes.y) this.y = this.scaled(this.y, focus.y, factor);
  }

  /** Moves the window by fractions of the plot area; positive values show more to the right and above. */
  pan(deltaX: number, deltaY: number) {
    if (this.axes.x) this.x = this.shifted(this.x, deltaX);
    if (this.axes.y) this.y = this.shifted(this.y, deltaY);
  }

  reset() {
    this.x = { start: 0, end: 1 };
    this.y = { start: 0, end: 1 };
  }

  private scaled(window: ZoomWindow, focus: number, factor: number) {
    const span = window.end - window.start;
    const anchor = window.start + span * focus;
    const next = span / factor;

    return clampWindow(anchor - next * focus, next);
  }

  private shifted(window: ZoomWindow, delta: number) {
    const span = window.end - window.start;
    return clampWindow(window.start + span * delta, span);
  }

  /** Wheel, pointer and keyboard handling on the chart element; `area` locates the plot inside it. */
  gestures(area: () => PlotArea): Attachment<HTMLElement | SVGElement> {
    return (element) => {
      const pointers = new Map<number, { clientX: number; clientY: number }>();
      let travel = 0;
      let dragging = false;
      let hintTimer: ReturnType<typeof setTimeout> | undefined;

      const plotPoint = (event: { clientX: number; clientY: number }): PlotPoint => {
        const bounds = element.getBoundingClientRect();
        const plot = area();

        return {
          x: (event.clientX - bounds.left - plot.left) / Math.max(1, plot.right - plot.left),
          y: (plot.bottom - (event.clientY - bounds.top)) / Math.max(1, plot.bottom - plot.top)
        };
      };

      const clampedPoint = (event: { clientX: number; clientY: number }) => {
        const point = plotPoint(event);
        return { x: Math.min(1, Math.max(0, point.x)), y: Math.min(1, Math.max(0, point.y)) };
      };

      const wheel = (event: WheelEvent) => {
        if (!event.ctrlKey && !event.metaKey) {
          this.wheelHint = true;
          clearTimeout(hintTimer);
          hintTimer = setTimeout(() => (this.wheelHint = false), WHEEL_HINT_MS);
          return;
        }

        event.preventDefault();
        const perStep = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 0.05 : 0.0025;
        this.zoomAt(Math.exp(-event.deltaY * perStep), clampedPoint(event));
      };

      const pointerDown = (event: PointerEvent) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;

        pointers.set(event.pointerId, event);
        travel = 0;
      };

      /** One pointer drags the plot; two pinch it. */
      const pointerMove = (event: PointerEvent) => {
        const previous = pointers.get(event.pointerId);
        if (!previous) return;

        if (pointers.size === 2) {
          const other = [...pointers].find(([id]) => id !== event.pointerId)?.[1];
          if (other) {
            const before = Math.hypot(
              previous.clientX - other.clientX,
              previous.clientY - other.clientY
            );
            const after = Math.hypot(event.clientX - other.clientX, event.clientY - other.clientY);
            const midpoint = {
              clientX: (event.clientX + other.clientX) / 2,
              clientY: (event.clientY + other.clientY) / 2
            };

            if (before > 0) this.zoomAt(after / before, clampedPoint(midpoint));
          }
        } else if (dragging) {
          const plot = area();
          this.pan(
            -(event.clientX - previous.clientX) / Math.max(1, plot.right - plot.left),
            (event.clientY - previous.clientY) / Math.max(1, plot.bottom - plot.top)
          );
        }

        travel += Math.hypot(event.clientX - previous.clientX, event.clientY - previous.clientY);
        pointers.set(event.pointerId, event);

        // Captured only once it is a drag: capturing a tap would take its click away from the point under it.
        if (!dragging && travel > DRAG_THRESHOLD) {
          dragging = true;
          element.setPointerCapture(event.pointerId);
        }
      };

      const pointerUp = (event: PointerEvent) => {
        if (!pointers.delete(event.pointerId)) return;
        if (pointers.size === 0) dragging = false;
      };

      const keyDown = (event: KeyboardEvent) => {
        const steps: Record<string, () => void> = {
          '+': () => this.zoomAt(ZOOM_STEP),
          '=': () => this.zoomAt(ZOOM_STEP),
          '-': () => this.zoomAt(1 / ZOOM_STEP),
          ArrowLeft: () => this.pan(-KEY_PAN, 0),
          ArrowRight: () => this.pan(KEY_PAN, 0),
          ArrowUp: () => this.pan(0, KEY_PAN),
          ArrowDown: () => this.pan(0, -KEY_PAN),
          Home: () => this.reset()
        };

        const step = steps[event.key];
        if (!step || event.target !== element) return;

        event.preventDefault();
        step();
      };

      const doubleClick = () => this.reset();

      element.addEventListener('wheel', wheel as EventListener, { passive: false });
      element.addEventListener('pointerdown', pointerDown as EventListener);
      element.addEventListener('pointermove', pointerMove as EventListener);
      element.addEventListener('pointerup', pointerUp as EventListener);
      element.addEventListener('pointercancel', pointerUp as EventListener);
      element.addEventListener('keydown', keyDown as EventListener);
      element.addEventListener('dblclick', doubleClick);

      return () => {
        clearTimeout(hintTimer);
        element.removeEventListener('wheel', wheel as EventListener);
        element.removeEventListener('pointerdown', pointerDown as EventListener);
        element.removeEventListener('pointermove', pointerMove as EventListener);
        element.removeEventListener('pointerup', pointerUp as EventListener);
        element.removeEventListener('pointercancel', pointerUp as EventListener);
        element.removeEventListener('keydown', keyDown as EventListener);
        element.removeEventListener('dblclick', doubleClick);
      };
    };
  }
}

/** Five evenly spaced values across a visible range, for axis labels and grid lines. */
export function axisTicks(min: number, max: number, count = 5) {
  return Array.from({ length: count }, (_, index) => min + ((max - min) * index) / (count - 1));
}

/** Decimals that keep neighbouring tick labels distinct at the current zoom. */
export function tickDecimals(min: number, max: number) {
  const span = Math.abs(max - min);
  if (span >= 20) return 0;
  if (span >= 2) return 1;

  return 2;
}
