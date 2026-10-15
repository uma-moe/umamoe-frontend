import type { TimelineBoardViewport } from './timeline-board-viewport.svelte';

interface DragState {
  x: number;
  y: number;
  lastX: number;
  lastY: number;
  time: number;
  vx: number;
  vy: number;
}

/** Mouse dragging with momentum and wheel handling for the desktop board. */
export class TimelineDragScroll {
  dragging = $state(false);

  #viewport: TimelineBoardViewport;
  #active: () => boolean;
  #view: () => 'horizontal' | 'vertical';
  #drag: DragState | undefined;
  #suppressClick = false;
  #momentum = 0;

  constructor(
    viewport: TimelineBoardViewport,
    active: () => boolean,
    view: () => 'horizontal' | 'vertical'
  ) {
    this.#viewport = viewport;
    this.#active = active;
    this.#view = view;
  }

  stop() {
    cancelAnimationFrame(this.#momentum);
  }

  reset() {
    this.dragging = false;
    this.#drag = undefined;
  }

  wheel = (event: WheelEvent) => {
    const board = this.#viewport.board;
    if (!this.#active() || !board || event.ctrlKey || event.metaKey || event.defaultPrevented)
      return;
    cancelAnimationFrame(this.#momentum);
    if (this.#view() !== 'horizontal') return;
    const mode = event.deltaMode;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (!delta) return;
    const unit =
      mode === 1 ? 18 : mode === 2 ? (event.shiftKey ? board.clientHeight : board.clientWidth) : 1;
    // The axis stays consistent over cards and at the ends. Shift accesses tall event stacks.
    event.preventDefault();
    board.scrollBy({ [event.shiftKey ? 'top' : 'left']: delta * unit, behavior: 'instant' });
  };

  begin = (event: MouseEvent) => {
    const board = this.#viewport.board;
    cancelAnimationFrame(this.#momentum);
    this.#suppressClick = false;
    if (
      event.button ||
      !this.#active() ||
      !board ||
      (event.target as HTMLElement).closest(
        'button:not(.open-action),a:not(.pickups > a),input,select,textarea'
      )
    )
      return;
    const rect = board.getBoundingClientRect();
    if (
      event.clientX >= rect.left + board.clientLeft + board.clientWidth ||
      event.clientY >= rect.top + board.clientTop + board.clientHeight
    )
      return;
    this.#drag = {
      x: event.clientX,
      y: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      time: performance.now(),
      vx: 0,
      vy: 0
    };
  };

  move = (event: MouseEvent) => {
    const drag = this.#drag,
      board = this.#viewport.board;
    if (!drag || !board) return;
    if (!this.dragging && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 12) return;
    this.dragging = true;
    this.#suppressClick = true;
    event.preventDefault();
    const elapsed = performance.now() - drag.time;
    if (elapsed > 0) {
      drag.vx = ((event.clientX - drag.lastX) / elapsed) * 16;
      drag.vy = ((event.clientY - drag.lastY) / elapsed) * 16;
    }
    // Incremental movement preserves virtual-row corrections made during the drag.
    board.scrollLeft -= event.clientX - drag.lastX;
    board.scrollTop -= event.clientY - drag.lastY;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    drag.time = performance.now();
    this.#viewport.scheduleViewport();
  };

  end = () => {
    const drag = this.#drag;
    let vx = drag?.vx ?? 0,
      vy = drag?.vy ?? 0;
    const coast = () => {
      const board = this.#viewport.board;
      if (!board || Math.hypot(vx, vy) <= 0.5) return;
      board.scrollLeft -= vx;
      board.scrollTop -= vy;
      vx *= 0.92;
      vy *= 0.92;
      this.#viewport.updateViewport();
      this.#momentum = requestAnimationFrame(coast);
    };
    if (
      this.dragging &&
      drag &&
      performance.now() - drag.time < 100 &&
      !matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      coast();
    this.reset();
  };

  captureClick = (event: MouseEvent) => {
    if (this.#suppressClick && event.detail) {
      event.preventDefault();
      event.stopPropagation();
      this.#suppressClick = false;
    }
  };
}
