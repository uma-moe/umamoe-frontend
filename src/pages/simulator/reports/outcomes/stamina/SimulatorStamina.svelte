<script lang="ts">
  import ChartFrame from '@/components/charts/ChartFrame.svelte';
  import LazyEChartsSurface from '@/components/charts/LazyEChartsSurface.svelte';
  import { theme } from '@/stores/theme';
  import { RACE_PHASES, hpByDistance, staminaReport } from '../stamina-report';
  import { hpCourseChart } from '../../report-chart';
  import { staminaInput } from './stamina-view';
  import StaminaHpBudget from './StaminaHpBudget.svelte';
  import StaminaRaces from './StaminaRaces.svelte';
  import StaminaSpurtTable from './StaminaSpurtTable.svelte';
  import type { MonteCarloResult } from '../../../simulator-repository';
  import type { MonteCarloInput } from '../../../requests/race-sim-request';
  import type { SimulatorUma } from '../../../simulator-uma';

  /** Stamina, the last spurt and where each runner's HP goes, measured over every race in the batch. */
  let {
    result,
    input,
    umas,
    sources,
    selected,
    distance,
    inspected = $bindable(),
    onreplay
  }: {
    result: MonteCarloResult;
    input?: MonteCarloInput;
    umas: SimulatorUma[];
    sources: number[];
    selected: number[];
    distance: number;
    inspected?: number;
    onreplay: (index: number) => void;
  } = $props();

  const reports = $derived(
    new Map(
      umas.map((_, source) => [
        source,
        staminaReport(result, source, staminaInput(input, umas, source), distance)
      ])
    )
  );
  const rows = $derived(sources.map((source) => reports.get(source)!).filter(Boolean));
  const budgets = $derived(rows.filter((row) => row.phases && row.maxHp));

  // HP over the course: picked runners, with the inspected runner's middle 80% shaded.
  const charted = $derived(
    selected
      .filter((source) => sources.includes(source))
      .concat(sources.filter((source) => !selected.includes(source)))
      .slice(0, 18)
  );
  const curves = $derived(
    charted.flatMap((source) => {
      const data = hpByDistance(result, source, distance);
      return data ? [{ source, name: umas[source]!.name, x: data.x, bands: data.bands }] : [];
    })
  );
  const focus = $derived(
    inspected !== undefined && charted.includes(inspected) ? inspected : charted[0]
  );
  const chart = $derived(
    curves.length
      ? hpCourseChart(curves[0]!.x, curves, RACE_PHASES, $theme === 'dark', focus)
      : undefined
  );
</script>

<div class="stamina">
  <StaminaSpurtTable
    {rows}
    {umas}
    {selected}
    {focus}
    {distance}
    oninspect={(source) => (inspected = source)}
  />

  <div class="pair">
    <StaminaHpBudget
      {budgets}
      {umas}
      {focus}
      oninspect={(source) => (inspected = source)}
    />

    <ChartFrame
      id="simulation-hp-course"
      title="HP over the race"
      slim
      state={chart ? 'ready' : 'empty'}
      emptyTitle="HP by distance unavailable"
      emptyDetail="This batch has no per-race telemetry. Run it again to see HP over the race."
      description="HP left as a share of maximum HP at every point of the course, for each runner's median race. The followed runner's middle 80% of races is shaded; select a runner in either table to follow her. The coloured bands are the race phases; the last spurt is decided when the late race starts."
    >
      {#if chart}
        <LazyEChartsSurface
          option={chart}
          label="HP left by course distance for each runner"
          height={Math.max(190, Math.min(260, 92 + budgets.length * 30))}
        />
      {/if}
    </ChartFrame>
  </div>

  <StaminaRaces
    {result}
    {input}
    {umas}
    {charted}
    {focus}
    {distance}
    oninspect={(source) => (inspected = source)}
    {onreplay}
  />
</div>

<style>
  .stamina {
    min-width: 0;
    display: grid;
    gap: 12px;
  }
  .pair {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    min-width: 0;
  }
  @media (max-width: 1100px) {
    .pair {
      grid-template-columns: 1fr;
    }
  }
</style>
