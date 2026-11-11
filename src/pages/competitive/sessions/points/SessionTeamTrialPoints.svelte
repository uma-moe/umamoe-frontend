<script lang="ts">
  import LazyEChartsSurface from '@/components/charts/LazyEChartsSurface.svelte';
  import Checkbox from '@/components/controls/Checkbox.svelte';
  import { theme } from '@/stores/theme';
  import { teamTrialPointsChart } from './team-trial-points-chart';
  import { POINT_SOURCES, type PointSourceId, type TeamTrialPoints } from './team-trial-points';

  let { data }: { data: TeamTrialPoints } = $props();

  const legendId = $props.id();

  const COMPACT_WIDTH = 560;

  let hidden = $state<PointSourceId[]>([]);
  let width = $state(0);

  const chart = $derived(
    teamTrialPointsChart({
      data,
      hidden,
      dark: $theme === 'dark',
      compact: width > 0 && width < COMPACT_WIDTH
    })
  );
  const earnedSources = $derived(
    POINT_SOURCES.filter(
      (source) =>
        !source.penalty && data.runners.some((entry) => entry.meanBySource[source.id] !== 0)
    )
  );

  function toggleSource(id: PointSourceId, shown: boolean) {
    hidden = shown ? hidden.filter((source) => source !== id) : [...hidden, id];
  }
</script>

<section
  class="points-card"
  aria-label="Team Trials points"
  bind:clientWidth={width}
>
  <header class="points-head">
    <h3>Point breakdown</h3>
    <p class="facts">
      <span>{data.races} {data.races === 1 ? 'race' : 'races'}</span>
      {#if data.teamAverage !== undefined}
        <span>Team score {Math.round(data.teamAverage).toLocaleString('en-US')} a race</span>
      {/if}
    </p>
  </header>
  <div
    class="legend"
    role="group"
    aria-label="Shown point sources"
  >
    {#each earnedSources as source (source.id)}
      <div
        class="legend-item"
        style:--color-accent={source.color}
      >
        <Checkbox
          id={legendId + '-' + source.id}
          label={source.label}
          checked={!hidden.includes(source.id)}
          onchange={(shown) => toggleSource(source.id, shown)}
        />
      </div>
    {/each}
  </div>
  <LazyEChartsSurface
    option={chart.option}
    height={chart.height}
    label="Mean Team Trials points a race for each runner, by source, with the spread of her race totals"
    zoomable
  />
</section>

<style>
  @import './session-team-trial-points.css';
</style>
