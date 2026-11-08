<script lang="ts">
  import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
  import LazyEChartsSurface from '@/components/charts/LazyEChartsSurface.svelte';
  import { theme } from '@/stores/theme';
  import {
    hpByDistance,
    lastSpurtChartOption,
    timeAtDistance,
    type LastSpurtMarks
  } from './last-spurt-chart';

  let {
    capture,
    index,
    distance,
    marks,
    onseek
  }: {
    capture: ParsedRaceCapture;
    index: number;
    /** The race distance, where the chart's HP and full-spurt need end. */
    distance: number;
    marks: LastSpurtMarks;
    onseek: (time: number) => void;
  } = $props();

  const points = $derived(hpByDistance(capture, index, distance));
  const option = $derived(
    lastSpurtChartOption({ points, marks, raceDistance: distance, dark: $theme === 'dark' })
  );

  function seekDistance(value: number) {
    const time = timeAtDistance(points, value);
    if (time !== undefined) onseek(time);
  }
</script>

{#if points.length > 1}
  <div class="last-spurt-chart">
    <LazyEChartsSurface
      {option}
      label="HP over the race against the HP a full spurt needed"
      height={140}
      zoomable
      onaxisclick={seekDistance}
    />
  </div>
{/if}

<style>
  @import './last-spurt-chart.css';
</style>
