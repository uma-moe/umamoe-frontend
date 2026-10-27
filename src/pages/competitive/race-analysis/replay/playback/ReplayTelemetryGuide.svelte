<script lang="ts">
  let {
    ensemble
  }: {
    /** Sampled races show their mean instead of one race's curves. */
    ensemble: boolean;
  } = $props();
</script>

<h3>Race telemetry</h3>
{#if ensemble}
  <p>
    Faint curves show every sampled race; the solid curve is their arithmetic mean at the same
    elapsed time. Select an Uma to follow its spread on the track and graph. Finishers stay at the
    line.
  </p>
  <p>
    Click the chart to seek, or use the Replay time slider. Compare runners adds each Uma’s mean
    curve.
  </p>
{:else}
  <p>
    Combined overlays speed, remaining HP and distance behind the leader in one chart. Live values
    are shown on the left. The speed scale is on the left of the graph; HP and distance scales are
    on the right. The curves, course lanes and skill icons share one replay time axis. Click the
    chart to seek, or use the Replay time slider with the keyboard.
  </p>
  <p>
    Choose a single signal to focus on it, or enable Compare runners to add faint dotted traces for
    the rest of the field. Race events show skill activation lines and front blocking intervals.
    Expand the graph to zoom and pan.
  </p>
{/if}

<style>
  h3 {
    margin-top: 0;
    font-size: 14px;
  }
  p {
    margin: 0 0 8px;
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.6;
  }
</style>
