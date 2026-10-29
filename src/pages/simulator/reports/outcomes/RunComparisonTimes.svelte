<script lang="ts">
  import SimulatorRunnerFace from '../SimulatorRunnerFace.svelte';
  import SimulatorDistributionRow, {
    type DistributionTile
  } from '../SimulatorDistributionRow.svelte';
  import { formatRaceTime } from '@/lib/race/replay/race-display';
  import { simulatorSampleSummary } from '../../simulator-results';
  import { runnerColor } from '../simulation-report';
  import { finishTimeAxis, histogramCounts, type HistogramAxis } from '../simulation-comparison';
  import { person, racesLabel } from './run-comparison';
  import type { MonteCarloResult } from '../../simulator-repository';
  import type { SimulatorUma } from '../../simulator-uma';

  interface Props {
    result: MonteCarloResult;
    umas: SimulatorUma[];
    sources: number[];
    /** One table line per runner instead of a full row of figures. */
    compact: boolean;
    onselect: (source: number) => void;
  }

  let { result, umas, sources, compact, onselect }: Props = $props();

  const label = (source: number) => umas[source]!.name;
  const counts = (samples: number[], scale: HistogramAxis) => histogramCounts(samples, scale);
  // Time: every runner's own finish times on one clock.
  const times = $derived(
    new Map(
      sources.map((source) => [
        source,
        result.finish_times.map((row) => row[source]!).filter(Number.isFinite)
      ])
    )
  );

  const timeSummaries = $derived(
    new Map([...times].map(([source, values]) => [source, simulatorSampleSummary(values)!]))
  );

  const timeScale = $derived(finishTimeAxis([...times.values()].flat()));
  const timeRows = $derived(
    compact
      ? [...sources].sort((a, b) => timeSummaries.get(a)!.median - timeSummaries.get(b)!.median)
      : sources
  );

  const bestTime = $derived(
    Math.min(...[...timeSummaries.values()].map((summary) => summary.median))
  );

  const behindBest = (value: number) =>
    value - bestTime < 0.005 ? 'fastest' : '+' + (value - bestTime).toFixed(2) + ' s';

  const clock = (value: number) => formatRaceTime(value, 2);

  function timeTiles(source: number): DistributionTile[] {
    const summary = timeSummaries.get(source)!;
    if (compact)
      return [
        { label: 'Median', value: clock(summary.median), detail: 'average ' + clock(summary.mean) },
        {
          label: 'vs best',
          value: behindBest(summary.median),
          detail: 'behind the fastest median shown'
        }
      ];
    return [
      { label: 'Fastest', value: clock(summary.min) },
      { label: 'Slowest', value: clock(summary.max) },
      { label: 'Mean', value: clock(summary.mean) },
      {
        label: 'Median',
        value: clock(summary.median),
        detail: behindBest(summary.median),
        main: true
      },
      {
        label: 'Spread',
        value: (summary.p90 - summary.p10).toFixed(2) + ' s',
        detail: 'middle 80%'
      }
    ];
  }

  const timeDigits = $derived.by(() => {
    if (timeScale.ticks.some((tick) => Math.abs(tick * 10 - Math.round(tick * 10)) > 1e-6))
      return 2;
    if (timeScale.ticks.some((tick) => !Number.isInteger(tick))) return 1;
    return 0;
  });

  const timeTick = (value: number) => formatRaceTime(value, timeDigits);

  function timeTitle(counts: number[], index: number) {
    const from = timeScale.min + index * timeScale.width,
      to = from + timeScale.width;

    let interval = clock(from) + '–' + clock(to);
    if (index === 0) interval = clock(to) + ' or faster';
    else if (index === timeScale.bins - 1) interval = clock(from) + ' or slower';
    return interval + ': ' + racesLabel(counts[index]!, result.runs);
  }
</script>

{#each timeRows as source, index (source)}
  {@const binned = counts(times.get(source)!, timeScale)}
  <SimulatorDistributionRow
    runner={person(umas, source)}
    tiles={timeTiles(source)}
    counts={binned}
    axis={timeScale}
    tick={timeTick}
    binTitle={(bin) => timeTitle(binned, bin)}
    marker={{
      value: timeSummaries.get(source)!.median,
      label: 'Median ' + clock(timeSummaries.get(source)!.median)
    }}
    sides={{ left: 'faster', right: 'slower' }}
    {compact}
    header={index === 0}
    footer={!compact || index === timeRows.length - 1}
    chartLabel="Finish time in every race"
    onselect={() => onselect(source)}
  >
    {#snippet heading()}
      <i
        class="dot"
        style:background={runnerColor(source)}
        aria-hidden="true"
      ></i>
      <SimulatorRunnerFace
        cardId={umas[source]!.cardId}
        size={18}
      />
      <strong>{label(source)}</strong>
      <span class="muted">
        {behindBest(timeSummaries.get(source)!.median) === 'fastest'
          ? 'fastest typical race'
          : behindBest(timeSummaries.get(source)!.median) + ' behind the fastest typical race'}
      </span>
    {/snippet}
  </SimulatorDistributionRow>
{/each}

<style>
  @import './run-comparison.css';
  .muted {
    color: var(--text-secondary);
  }
</style>
