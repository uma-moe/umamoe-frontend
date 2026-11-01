<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import ChartFrame from '@/components/charts/ChartFrame.svelte';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import LazyEChartsSurface from '@/components/charts/LazyEChartsSurface.svelte';
  import { theme } from '@/stores/theme';
  import { courseChart } from '../report-chart';
  import RunnerLegend from '../RunnerLegend.svelte';
  import { RACE_PHASES } from '../outcomes/stamina-report';
  import { LENGTH_METRES, referenceSpeeds, type MarginUnit } from '../simulation-comparison';
  import type { ReportBand, SimulationReport } from '../simulation-report';
  import type { MonteCarloResult } from '../../simulator-repository';
  import type { SimulatorUma } from '../../simulator-uma';

  /**
   * Two views along the course for every runner shown: how far ahead of the baseline she is at each point,
   * and one movement value (speed, target speed, acceleration or lane) at each point. Both are her median race.
   */
  let {
    report,
    result,
    umas,
    sources,
    reference,
    focus,
    distance,
    unit = 'lengths'
  }: {
    report: SimulationReport;
    result: MonteCarloResult;
    umas: SimulatorUma[];
    sources: number[];
    reference: number;
    focus?: number;
    distance: number;
    unit?: MarginUnit;
  } = $props();

  const dark = $derived($theme === 'dark');
  const name = (source: number) => umas[source]!.name;
  const x = $derived(report.distance_m);

  // Gap to the baseline: paired crossing times at every report distance, computed off the main thread.
  let worker: Worker | undefined,
    generation = 0;

  let paired = $state.raw<ReportBand[][]>([]),
    pending = $state(false),
    error = $state('');

  onMount(() => {
    worker = new Worker(new URL('../simulation-report.worker.ts', import.meta.url), {
      type: 'module'
    });

    worker.postMessage({
      initialize: true,
      report: {
        distance_m: report.distance_m,
        crossing_times: report.crossing_times,
        crossing_shape: report.crossing_shape,
        samples: report.samples
      }
    });

    request();
  });

  onDestroy(() => worker?.terminate());
  const others = $derived(sources.filter((source) => source !== reference));
  function request() {
    if (!worker || !others.length) return;
    const id = ++generation,
      list = [reference, ...others];

    pending = true;
    error = '';
    worker.onmessage = (event) => {
      if (event.data.id !== generation) return;
      pending = false;
      if (event.data.error) error = event.data.error;
      else paired = event.data.value;
    };

    worker.onerror = () => {
      if (id === generation) {
        pending = false;
        error = 'The gaps could not be worked out. Reload the results to retry.';
      }
    };

    worker.postMessage({ id, reference, sources: list });
  }

  $effect(() => {
    void reference;
    void others;
    request();
  });

  // Seconds ahead become lengths at the baseline's own speed at that point.
  const speeds = $derived(
    referenceSpeeds(result, reference, distance) ?? x.map(() => distance / 100)
  );

  const gapRows = $derived(
    others.flatMap((source, index) => {
      const bands = paired[index + 1];
      if (!bands?.length) return [];
      return [
        {
          source,
          name: name(source),
          bands:
            unit === 'seconds'
              ? bands
              : bands.map(
                  (band, point) =>
                    band.map((value, k) =>
                      k === 4 ? value : (value * speeds[point]!) / LENGTH_METRES
                    ) as ReportBand
                )
        }
      ];
    })
  );

  const signed = (value: number, digits: number, suffix: string) => {
    let sign = '±';
    if (value > 0) sign = '+';
    else if (value < 0) sign = '−';
    return sign + Math.abs(value).toFixed(digits) + suffix;
  };

  const gapChart = $derived(
    gapRows.length
      ? courseChart(x, gapRows, RACE_PHASES, dark, focus, {
          zero: true,
          format: (value) => (unit === 'seconds' ? signed(value, 2, ' s') : signed(value, 1, ' L'))
        })
      : undefined
  );

  // Movement along the course: one value at a time, every runner on the same axis.
  let metric = $state('1');
  const metrics: Record<
    string,
    { label: string; format: (value: number) => string; title: string; min?: number }
  > = {
    '1': {
      label: 'Speed',
      format: (value) => value.toFixed(1) + ' m/s',
      title: 'Speed she is actually running at'
    },
    '2': {
      label: 'Target speed',
      format: (value) => value.toFixed(1) + ' m/s',
      title: 'Speed she is trying to reach'
    },
    '3': {
      label: 'Acceleration',
      format: (value) => value.toFixed(2) + ' m/s²',
      title: 'How quickly her speed changes'
    },
    '5': {
      label: 'Lane',
      format: (value) => value.toFixed(1) + ' m',
      title: 'Distance from the inner rail',
      min: 0
    }
  };

  const moveRows = $derived(
    sources.flatMap((source) => {
      const runner = report.runners.find((row) => row.source_input_index === source);
      return runner
        ? [
            {
              source,
              name: name(source),
              bands: runner.distance.map((point) => point[Number(metric)]!)
            }
          ]
        : [];
    })
  );

  const moveChart = $derived(
    moveRows.length
      ? courseChart(x, moveRows, RACE_PHASES, dark, focus, {
          format: metrics[metric]!.format,
          centre: 0,
          min: metrics[metric]!.min
        })
      : undefined
  );
</script>

<div class="pair">
  <ChartFrame
    id="simulation-gap-course"
    title={'Gap to ' + name(reference) + ' along the course'}
    state={!others.length ? 'empty' : gapChart ? 'ready' : error ? 'error' : 'loading'}
    emptyTitle="Pick a second runner"
    emptyDetail={'Pick another runner to see where she gains or loses ground on ' +
      name(reference) +
      '.'}
    description={'How far ahead of ' +
      name(reference) +
      ' each runner is at every point of the course, in the same races: above the line she is ahead, below it she is behind, and a rising line means she is gaining there. ' +
      (unit === 'seconds'
        ? 'Seconds are how much earlier she reaches that point.'
        : 'Lengths use ' + name(reference) + '’s speed at that point (1 L = 2.5 m).') +
      ' Each line is her median race. The followed runner’s middle 80% of races is shaded. The coloured bands are the race phases.'}
  >
    {#if gapChart}
      <LazyEChartsSurface
        option={gapChart}
        label={'Gap to ' + name(reference) + ' by course distance'}
        height={240}
      />
      <RunnerLegend runners={gapRows} />
    {/if}
  </ChartFrame>
  <ChartFrame
    id="simulation-move-course"
    title="Along the course"
    description={metrics[metric]!.title +
      ' at every point of the course, for each runner’s average race. Compare where one runner is quicker, still accelerating or wider out than another. The followed runner’s middle 80% of races is shaded, and the coloured bands are the race phases.'}
  >
    {#snippet actions()}<SegmentedControl
        compact
        label="Value along the course"
        options={Object.entries(metrics).map(([value, item]) => ({
          value,
          label: item.label,
          title: item.title
        }))}
        bind:value={metric}
      />{/snippet}
    {#if moveChart}
      <LazyEChartsSurface
        option={moveChart}
        label={metrics[metric]!.label + ' by course distance'}
        height={240}
      />
      <RunnerLegend runners={moveRows} />
    {/if}
  </ChartFrame>
</div>

<style>
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
