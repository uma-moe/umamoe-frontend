/**
 * The part of the whole plot in view, as shares of its width and height: 0 is its left or top edge, 1 its right or
 * bottom edge. Both axes zoom together, so the plot keeps its shape.
 */
export interface PlotWindow {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export const WHOLE_PLOT: PlotWindow = { left: 0, right: 1, top: 0, bottom: 1 };

/** The deepest zoom: an eighth of the plot fills the view. */
export const MAX_ZOOM = 8;

/** A point of the view, as shares of its width and height. */
export interface ViewPoint {
  x: number;
  y: number;
}

export function zoomOf(window: PlotWindow): number {
  return 1 / (window.right - window.left);
}

export function isZoomed(window: PlotWindow): boolean {
  return zoomOf(window) > 1.001;
}

function clampSpan(from: number, span: number): { from: number; to: number } {
  const start = Math.min(Math.max(from, 0), 1 - span);
  return { from: start, to: start + span };
}

/**
 * The window zoomed by `factor` (above 1 in, below 1 out) about `focus`, which stays where it is on screen. The window
 * never leaves the plot nor zooms past `MAX_ZOOM` or out past the whole plot.
 */
export function zoomAt(window: PlotWindow, focus: ViewPoint, factor: number): PlotWindow {
  const zoom = Math.min(Math.max(zoomOf(window) * factor, 1), MAX_ZOOM);
  const span = 1 / zoom;
  const focusX = window.left + focus.x * (window.right - window.left);
  const focusY = window.top + focus.y * (window.bottom - window.top);
  const horizontal = clampSpan(focusX - focus.x * span, span);
  const vertical = clampSpan(focusY - focus.y * span, span);
  return { left: horizontal.from, right: horizontal.to, top: vertical.from, bottom: vertical.to };
}

/** The window moved by `shift`, in shares of the view: dragging the plot right by a tenth of the view shows what lay left. */
export function panBy(window: PlotWindow, shift: ViewPoint): PlotWindow {
  const width = window.right - window.left;
  const height = window.bottom - window.top;
  const horizontal = clampSpan(window.left - shift.x * width, width);
  const vertical = clampSpan(window.top - shift.y * height, height);
  return { left: horizontal.from, right: horizontal.to, top: vertical.from, bottom: vertical.to };
}

/** Where a share of the whole plot falls in the view, as a share of the view (outside 0–1 when out of view). */
export function inView(share: number, from: number, to: number): number {
  return (share - from) / (to - from);
}
