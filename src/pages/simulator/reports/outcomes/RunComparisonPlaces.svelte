<script lang="ts">
  import SimulatorRunnerFace from '../SimulatorRunnerFace.svelte';
  import SimulatorDistributionRow, {
    type BinTone,
    type DistributionTile
  } from '../SimulatorDistributionRow.svelte';
  import { simulatorSampleSummary } from '../../simulator-results';
  import { runnerColor } from '../simulation-report';
  import {
    histogramCounts,
    placeAxis,
    runnerOutcome,
    type HistogramAxis
  } from '../simulation-comparison';
  import { ordinal, percent, person, racesLabel } from './run-comparison';
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
  // Place: how often each runner finishes in each position.
  const places = $derived(
    new Map(
      sources.map((source) => [
        source,
        result.finish_order.map((order) => order.indexOf(source) + 1).filter((place) => place > 0)
      ])
    )
  );

  const placeScale = $derived(placeAxis(umas.length));
  const outcomes = $derived(
    new Map(sources.map((source) => [source, runnerOutcome(result, source)]))
  );

  const placeRows = $derived(
    compact
      ? [...sources].sort(
          (a, b) =>
            outcomes.get(b)!.winRate - outcomes.get(a)!.winRate ||
            outcomes.get(b)!.top3 - outcomes.get(a)!.top3
        )
      : sources
  );

  function placeTiles(source: number): DistributionTile[] {
    const outcome = outcomes.get(source)!,
      summary = simulatorSampleSummary(places.get(source)!)!;

    const wins = {
      label: 'Wins',
      value: percent(outcome.winRate),
      detail: Math.round((outcome.winRate / 100) * result.runs) + ' of ' + result.runs,
      tone: outcome.winRate > 0 ? ('ahead' as const) : ('' as const)
    };

    if (compact) return [wins, { label: 'Top 3', value: percent(outcome.top3) }];
    return [
      wins,
      { label: 'Top 3', value: percent(outcome.top3) },
      { label: 'Average', value: summary.mean.toFixed(2) },
      { label: 'Median', value: ordinal(Math.round(summary.median)), main: true },
      {
        label: 'Worst',
        value: ordinal(summary.max),
        detail: percent(
          (places.get(source)!.filter((place) => place === summary.max).length / result.runs) * 100
        )
      }
    ];
  }

  const placeTone = (index: number): BinTone => {
    if (index === 0) {
      return 'strong';
    }

    if (index < 3) {
      return 'runner';
    }

    return 'muted';
  };
</script>

{#each placeRows as source, index (source)}
  {@const binned = counts(places.get(source)!, placeScale)}
  <SimulatorDistributionRow
    runner={person(umas, source)}
    tiles={placeTiles(source)}
    counts={binned}
    axis={placeScale}
    tick={(value) => String(value)}
    binTitle={(bin) => ordinal(bin + 1) + ': ' + racesLabel(binned[bin]!, result.runs)}
    binTone={placeTone}
    sides={{ left: 'better', right: 'worse' }}
    {compact}
    header={index === 0}
    footer={!compact || index === placeRows.length - 1}
    chartLabel="Finishing position in every race"
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
        wins {percent(outcomes.get(source)!.winRate)} of races
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
