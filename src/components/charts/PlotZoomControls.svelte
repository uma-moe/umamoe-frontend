<script lang="ts">
  import IconButton from '../controls/IconButton.svelte';
  import { MAX_ZOOM, ZOOM_STEP, type PlotZoom } from './plot-zoom.svelte';

  /** The zoom buttons and gesture hint a zoomable chart shows above its plot. */
  let { zoom }: { zoom: PlotZoom } = $props();
</script>

<div class="plot-zoom">
  <p
    class="hint"
    class:emphasis={zoom.wheelHint}
  >
    <span class="with-hover">Ctrl + scroll or pinch to zoom · drag to pan</span>
    <span class="with-touch">Pinch to zoom · drag to pan</span>
  </p>
  <div
    class="buttons"
    role="group"
    aria-label="Zoom"
  >
    <IconButton
      icon="minus"
      size="sm"
      label="Zoom out"
      disabled={!zoom.zoomed}
      onclick={() => zoom.zoomAt(1 / ZOOM_STEP)}
    />
    <output aria-live="polite">{zoom.zoom.toFixed(1)}×</output>
    <IconButton
      icon="add"
      size="sm"
      label="Zoom in"
      disabled={zoom.zoom >= MAX_ZOOM - 0.001}
      onclick={() => zoom.zoomAt(ZOOM_STEP)}
    />
    <IconButton
      icon="refresh"
      size="sm"
      label="Show the whole plot"
      disabled={!zoom.zoomed}
      onclick={() => zoom.reset()}
    />
  </div>
</div>

<style>
  .plot-zoom {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 4px 10px;
    min-width: 0;
  }
  .hint {
    margin: 0;
    color: var(--text-muted);
    font-size: 10px;
    transition: color 0.15s ease;
  }
  .hint.emphasis {
    color: var(--accent-primary);
  }
  .with-touch {
    display: none;
  }
  @media (hover: none) {
    .with-hover {
      display: none;
    }
    .with-touch {
      display: inline;
    }
  }
  .buttons {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  output {
    min-width: 3.4ch;
    color: var(--text-secondary);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    text-align: center;
  }
</style>
