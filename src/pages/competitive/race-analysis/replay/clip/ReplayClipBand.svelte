<script lang="ts">
  import { formatRaceTime } from '@/lib/race/replay/race-display';
  import type { ClipBounds, ClipEdge, ClipRange } from './clip-plan';

  let {
    range,
    bounds,
    disabled = false,
    ontrim
  }: {
    range: ClipRange;
    /** The timeline's displayed span, which the band shares with the playhead. */
    bounds: ClipBounds;
    disabled?: boolean;
    ontrim: (edge: ClipEdge, time: number) => void;
  } = $props();

  let plot = $state<HTMLDivElement>();

  const percent = (time: number) => {
    const span = bounds.endTime - bounds.startTime;
    const progress = span > 0 ? (time - bounds.startTime) / span : 0;
    return Math.min(100, Math.max(0, progress * 100));
  };

  const startPercent = $derived(percent(range.start));
  const endPercent = $derived(percent(range.end));

  /** formatRaceTime reads 0 as a missing time; a clip can start at zero. */
  const clock = (value: number) => (value > 0 ? formatRaceTime(value, 1) : '0:00.0');

  function timeAt(clientX: number) {
    if (!plot) return bounds.startTime;

    const box = plot.getBoundingClientRect();
    const progress = Math.min(1, Math.max(0, (clientX - box.left) / Math.max(1, box.width)));

    return bounds.startTime + progress * (bounds.endTime - bounds.startTime);
  }

  function grab(event: PointerEvent, edge: ClipEdge) {
    if (disabled || event.button !== 0) return;

    const handle = event.currentTarget as HTMLElement;
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    handle.focus({ preventScroll: true });

    const drag = (move: PointerEvent) => ontrim(edge, timeAt(move.clientX));
    const release = () => {
      handle.removeEventListener('pointermove', drag);
      handle.removeEventListener('pointerup', release);
      handle.removeEventListener('pointercancel', release);
    };

    handle.addEventListener('pointermove', drag);
    handle.addEventListener('pointerup', release);
    handle.addEventListener('pointercancel', release);
  }

  function nudge(event: KeyboardEvent, edge: ClipEdge) {
    const current = edge === 'start' ? range.start : range.end;
    const step = event.shiftKey ? 1 : 0.1;
    const targets: Record<string, number> = {
      ArrowLeft: current - step,
      ArrowDown: current - step,
      ArrowRight: current + step,
      ArrowUp: current + step,
      Home: bounds.startTime,
      End: bounds.endTime
    };

    const target = targets[event.key];
    if (disabled || target === undefined) return;

    event.preventDefault();
    event.stopPropagation();
    ontrim(edge, target);
  }
</script>

{#snippet handle(edge: ClipEdge, position: number, value: number)}
  <div
    class={'clip-handle ' + edge}
    role="slider"
    tabindex={disabled ? -1 : 0}
    aria-label={edge === 'start' ? 'Clip in point' : 'Clip out point'}
    aria-valuemin={bounds.startTime}
    aria-valuemax={bounds.endTime}
    aria-valuenow={value}
    aria-valuetext={clock(value)}
    aria-disabled={disabled}
    title={(edge === 'start' ? 'Drag to trim the in point' : 'Drag to trim the out point') +
      ' · ' +
      clock(value)}
    style:left={position + '%'}
    onpointerdown={(event) => grab(event, edge)}
    onkeydown={(event) => nudge(event, edge)}
  ></div>
{/snippet}

<div
  class="clip-band"
  class:disabled
>
  <div
    class="clip-plot"
    bind:this={plot}
  >
    <div
      class="clip-shade"
      style:left="0"
      style:width={startPercent + '%'}
    ></div>
    <div
      class="clip-shade"
      style:left={endPercent + '%'}
      style:right="0"
    ></div>
    <div
      class="clip-span"
      style:left={startPercent + '%'}
      style:width={endPercent - startPercent + '%'}
    ></div>
    {@render handle('start', startPercent, range.start)}
    {@render handle('end', endPercent, range.end)}
  </div>
</div>

<style>
  /* Mirrors the timeline rows' columns, so the band spans exactly the plot under the playhead. */
  .clip-band {
    position: absolute;
    inset: 0;
    z-index: 3;
    display: grid;
    grid-template-columns: var(--timeline-label-width) minmax(0, 1fr) var(--timeline-value-width);
    column-gap: var(--timeline-column-gap);
    pointer-events: none;
  }
  .clip-plot {
    grid-column: 2;
    position: relative;
  }
  .clip-shade {
    position: absolute;
    top: 0;
    bottom: 0;
    background: color-mix(in srgb, var(--bg-primary) 55%, transparent);
  }
  .clip-span {
    position: absolute;
    top: 0;
    bottom: 0;
    box-shadow:
      inset 0 2px 0 var(--accent-warning),
      inset 0 -2px 0 var(--accent-warning);
    background: rgb(var(--accent-warning-rgb) / 0.06);
  }
  /* A tall grip on each edge, with a tab on the time scale like an editor's trim handle. */
  .clip-handle {
    position: absolute;
    top: 0;
    bottom: 0;
    z-index: 5;
    width: 16px;
    transform: translateX(-50%);
    cursor: ew-resize;
    pointer-events: auto;
    touch-action: none;
  }
  .clip-handle::before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: calc(50% - 1.5px);
    width: 3px;
    background: var(--accent-warning);
  }
  .clip-handle::after {
    content: '';
    position: absolute;
    top: 0;
    width: 9px;
    height: 20px;
    background: var(--accent-warning);
  }
  .clip-handle.start::after {
    left: 50%;
    border-radius: 0 4px 4px 0;
  }
  .clip-handle.end::after {
    right: 50%;
    border-radius: 4px 0 0 4px;
  }
  .clip-handle:focus-visible {
    outline: 2px solid var(--text-primary);
    outline-offset: -2px;
    border-radius: 4px;
  }
  .disabled .clip-handle {
    cursor: default;
    pointer-events: none;
  }
</style>
