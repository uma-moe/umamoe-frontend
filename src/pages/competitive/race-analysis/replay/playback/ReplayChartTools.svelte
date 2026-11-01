<script lang="ts">
  import type { Snippet } from 'svelte';
  import ReplayTimelineGuide from './ReplayTimelineGuide.svelte';

  let {
    tools,
    ensemble
  }: {
    /** The telemetry chart's own controls, such as its metric, display options and expand button. */
    tools?: Snippet;
    ensemble: boolean;
  } = $props();
</script>

<!-- A desktop toolbar's chart view: the chart's controls followed by the guide to reading the timeline. -->
<div
  class="chart-tools"
  role="group"
  aria-label="Telemetry view"
>
  {@render tools?.()}
  <ReplayTimelineGuide {ensemble} />
</div>

<style>
  .chart-tools {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  /* Every control shares the race page's small-button height. */
  .chart-tools :global(.ui-button) {
    min-width: 32px;
    min-height: 32px;
    padding-inline: 8px;
    font-size: 11px;
  }
  .chart-tools :global(.ui-button svg) {
    width: 15px;
    height: 15px;
  }
  /* Button wraps its label in a span; without that box, a label hidden at this width leaves no gap beside the icon. */
  .chart-tools :global(.ui-button > span) {
    display: contents;
  }
</style>
