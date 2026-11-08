<script lang="ts">
  import { onMount } from 'svelte';
  import { CROP_ASPECTS, dragCrop, type ClipCrop, type CropHandle } from './clip-crop';
  import type { ReplayClip } from './replay-clip.svelte';

  let { clip }: { clip: ReplayClip } = $props();

  const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
  const ARROWS: Record<string, { dx: number; dy: number }> = {
    ArrowLeft: { dx: -1, dy: 0 },
    ArrowRight: { dx: 1, dy: 0 },
    ArrowUp: { dx: 0, dy: -1 },
    ArrowDown: { dx: 0, dy: 1 }
  };

  let area = $state<HTMLDivElement>();
  let width = $state(0);
  let height = $state(0);
  let drag: { handle: CropHandle; x: number; y: number; start: ClipCrop } | undefined;

  const shown = $derived(clip.cropping || clip.cropped);

  function moveCrop(handle: CropHandle, dx: number, dy: number, start: ClipCrop) {
    clip.crop = dragCrop({
      start,
      handle,
      dx,
      dy,
      stage: { width, height },
      aspect: CROP_ASPECTS[clip.aspect]
    });
  }

  function startDrag(event: PointerEvent, handle: CropHandle) {
    if (event.button !== 0 || !(event.currentTarget instanceof Element)) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag = { handle, x: event.clientX, y: event.clientY, start: clip.crop };
  }

  function continueDrag(event: PointerEvent) {
    if (drag === undefined) return;
    moveCrop(drag.handle, event.clientX - drag.x, event.clientY - drag.y, drag.start);
  }

  function endDrag() {
    drag = undefined;
  }

  /** Arrows move the window a pixel, ten with Shift, or with Alt its far corner; Enter applies it. */
  function pressKey(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      clip.endCrop();
      return;
    }

    const arrow = ARROWS[event.key];
    if (arrow === undefined) return;

    const step = event.shiftKey ? 10 : 1;

    event.preventDefault();
    moveCrop(event.altKey ? 'se' : 'move', arrow.dx * step, arrow.dy * step, clip.crop);
  }

  onMount(() => {
    if (!area) return;

    const observer = new ResizeObserver(() => clip.measureStage());

    observer.observe(area);
    return () => observer.disconnect();
  });
</script>

<div
  class="clip-crop"
  class:cropping={clip.cropping}
  bind:this={area}
  bind:clientWidth={width}
  bind:clientHeight={height}
  data-clip-exclude
>
  {#if shown}
    <button
      type="button"
      class="crop-window"
      style:left="{clip.crop.x * 100}%"
      style:top="{clip.crop.y * 100}%"
      style:width="{clip.crop.width * 100}%"
      style:height="{clip.crop.height * 100}%"
      aria-label="Crop window. Arrow keys move it, with Alt they resize it, and Enter applies it."
      aria-hidden={!clip.cropping}
      tabindex={clip.cropping ? 0 : -1}
      onpointerdown={(event) => startDrag(event, 'move')}
      onpointermove={continueDrag}
      onpointerup={endDrag}
      onpointercancel={endDrag}
      onkeydown={pressKey}
    >
      {#if clip.cropping}
        {#each HANDLES as handle (handle)}
          <span
            class="crop-handle {handle}"
            role="presentation"
            onpointerdown={(event) => startDrag(event, handle)}
          ></span>
        {/each}
      {/if}
    </button>
  {/if}
</div>

<style>
  .clip-crop {
    position: absolute;
    inset: 0;
    z-index: 8;
    overflow: hidden;
    border-radius: inherit;
    pointer-events: none;
  }
  .crop-window {
    position: absolute;
    box-sizing: border-box;
    margin: 0;
    padding: 0;
    background: transparent;
    font: inherit;
    border: 1px solid var(--accent-warning);
    box-shadow: 0 0 0 100vmax rgb(0 0 0 / 0.3);
  }
  .cropping .crop-window {
    border-width: 2px;
    box-shadow: 0 0 0 100vmax rgb(0 0 0 / 0.55);
    cursor: move;
    pointer-events: auto;
    touch-action: none;
  }
  .crop-window:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  .crop-handle {
    position: absolute;
    width: 12px;
    height: 12px;
    border-radius: 2px;
    background: var(--accent-warning);
  }
  /* Handles sit inside the window, so they stay whole at the stage's edges; a wider invisible edge makes them easy to grab. */
  .crop-handle::before {
    content: '';
    position: absolute;
    inset: -8px;
  }
  .crop-handle.n,
  .crop-handle.s {
    left: calc(50% - 10px);
    width: 20px;
    height: 6px;
  }
  .crop-handle.e,
  .crop-handle.w {
    top: calc(50% - 10px);
    width: 6px;
    height: 20px;
  }
  .crop-handle.n {
    top: -2px;
    cursor: ns-resize;
  }
  .crop-handle.s {
    bottom: -2px;
    cursor: ns-resize;
  }
  .crop-handle.e {
    right: -2px;
    cursor: ew-resize;
  }
  .crop-handle.w {
    left: -2px;
    cursor: ew-resize;
  }
  .crop-handle.nw,
  .crop-handle.ne {
    top: -2px;
  }
  .crop-handle.sw,
  .crop-handle.se {
    bottom: -2px;
  }
  .crop-handle.nw,
  .crop-handle.sw {
    left: -2px;
  }
  .crop-handle.ne,
  .crop-handle.se {
    right: -2px;
  }
  .crop-handle.nw,
  .crop-handle.se {
    cursor: nwse-resize;
  }
  .crop-handle.ne,
  .crop-handle.sw {
    cursor: nesw-resize;
  }
</style>
