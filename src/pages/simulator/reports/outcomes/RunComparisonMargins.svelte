<script lang="ts">
  import SimulatorRunnerFace from '../SimulatorRunnerFace.svelte';
  import SimulatorDistributionRow, {
    type DistributionTile
  } from '../SimulatorDistributionRow.svelte';
  import { runnerColor } from '../simulation-report';
  import {
    formatMarginValue,
    headToHead,
    histogramCounts,
    marginAxis,
    signedLengths,
    signedSeconds,
    type HeadToHead,
    type HistogramAxis,
    type MarginUnit
  } from '../simulation-comparison';
  import { percent, person, racesLabel } from './run-comparison';
  import type { MonteCarloResult } from '../../simulator-repository';
  import type { SimulatorUma } from '../../simulator-uma';

  interface Props {
    result: MonteCarloResult;
    umas: SimulatorUma[];
    sources: number[];
    /** One table line per runner instead of a full row of figures. */
    compact: boolean;
    onselect: (source: number) => void;
    reference: number;
    distance: number;
    unit: MarginUnit;
  }

  let { result, umas, sources, compact, onselect, reference, distance, unit }: Props = $props();

  const label = (source: number) => umas[source]!.name;
  const counts = (samples: number[], scale: HistogramAxis) => histogramCounts(samples, scale);
  const seconds = $derived(unit === 'seconds');
  // Margin: every runner against the baseline in the same race. Seconds are binned as seconds ahead so right stays ahead.
  const pairs = $derived(
    new Map(
      sources
        .filter((source) => source !== reference)
        .map((source) => [source, headToHead(result, source, reference, distance)])
    )
  );
  const marginRows = $derived(
    [...pairs.values()].sort((a, b) => (compact ? b.lengths.median - a.lengths.median : 0))
  );
  const marginScale = $derived(marginAxis([...pairs.values()], unit));

  const margin = (pair: HeadToHead, key: 'min' | 'max' | 'mean' | 'median') =>
    formatMarginValue(pair.lengths[key], pair.seconds[key], unit, 2);
  const otherUnit = (pair: HeadToHead, key: 'min' | 'max' | 'mean' | 'median') =>
    seconds ? signedLengths(pair.lengths[key], 2) : signedSeconds(-pair.seconds[key]);
  const ahead = (value: number) => (value > 1e-9 ? ('ahead' as const) : ('' as const));

  function marginTiles(pair: HeadToHead): DistributionTile[] {
    if (compact)
      return [
        {
          label: 'Ahead in',
          value: percent(pair.rate),
          detail: pair.ahead + ' of ' + pair.runs + ' races',
          tone: pair.rate > 50 ? 'ahead' : ''
        },
        {
          label: 'Median',
          value: margin(pair, 'median'),
          detail: otherUnit(pair, 'median'),
          tone: ahead(pair.lengths.median)
        }
      ];
    return [
      ...(
        [
          ['Worst', 'min'],
          ['Best', 'max'],
          ['Mean', 'mean'],
          ['Median', 'median']
        ] as const
      ).map(([name, key]) => ({
        label: name,
        value: margin(pair, key),
        detail: otherUnit(pair, key),
        tone: ahead(pair.lengths[key]),
        main: key === 'median'
      })),
      {
        label: 'Ahead in',
        value: pair.rate.toFixed(1) + '%',
        detail: pair.ahead.toLocaleString('en-US') + ' of ' + pair.runs.toLocaleString('en-US'),
        tone: pair.rate > 50 ? 'ahead' : ''
      }
    ];
  }

  const marginAmount = (value: number) =>
    seconds
      ? Math.abs(value).toFixed(Math.abs(value * 100 - Math.round(value * 100)) > 1e-6 ? 3 : 2) +
        ' s'
      : Number(Math.abs(value).toFixed(2)) + ' L';

  function marginTitle(pair: HeadToHead, counts: number[], index: number) {
    const from = marginScale.min + index * marginScale.width,
      to = from + marginScale.width,
      front = from + to > 0;
    const near = Math.min(Math.abs(from), Math.abs(to)),
      far = Math.max(Math.abs(from), Math.abs(to));
    const open = (index === 0 && !front) || (index === marginScale.bins - 1 && front);
    return (
      (front ? label(pair.source) : label(reference)) +
      ' ahead by ' +
      (open
        ? marginAmount(near) + ' or more'
        : (near === 0 ? 'up to ' : marginAmount(near).replace(/ [Ls]$/, '') + '–') +
          marginAmount(far)) +
      ': ' +
      racesLabel(counts[index]!, result.runs)
    );
  }

  const marginTick = (value: number) =>
    Math.abs(value) < 1e-9
      ? '0'
      : seconds
        ? signedSeconds(
            -value,
            marginScale.ticks.some((t) => Math.abs(t * 10 - Math.round(t * 10)) > 1e-6) ? 2 : 1
          )
        : signedLengths(value, marginScale.ticks.some((t) => !Number.isInteger(t)) ? 1 : 0);
</script>

{#each marginRows as pair, index (pair.source)}
  {@const binned = counts(seconds ? pair.secondsSamples : pair.samples, marginScale)}
  <SimulatorDistributionRow
    runner={person(umas, pair.source)}
    tiles={marginTiles(pair)}
    counts={binned}
    axis={marginScale}
    tick={marginTick}
    zero
    binTitle={(bin) => marginTitle(pair, binned, bin)}
    binTone={(bin) => (marginScale.min + (bin + 0.5) * marginScale.width > 0 ? 'runner' : 'muted')}
    marker={{
      value: seconds ? pair.seconds.median : pair.lengths.median,
      label: 'Median ' + margin(pair, 'median')
    }}
    sides={{
      left: label(reference) + ' ahead',
      leftCard: umas[reference]!.cardId,
      right: label(pair.source) + ' ahead',
      rightCard: umas[pair.source]!.cardId
    }}
    {compact}
    header={index === 0}
    footer={!compact || index === marginRows.length - 1}
    chartLabel={'Margin to ' + label(reference) + ' in every race'}
    onselect={() => onselect(pair.source)}
  >
    {#snippet heading()}
      <i
        class="dot"
        style:background={runnerColor(pair.source)}
        aria-hidden="true"
      ></i>
      <SimulatorRunnerFace
        cardId={umas[pair.source]!.cardId}
        size={18}
      />
      <strong>{label(pair.source)}</strong>
      <span class={pair.call === 'ahead' ? 'clean' : pair.call === 'behind' ? 'error' : ''}>
        {pair.call === 'close' ? 'is level with' : pair.call === 'ahead' ? 'beats' : 'loses to'}
      </span>
      <SimulatorRunnerFace
        cardId={umas[reference]!.cardId}
        size={18}
      />
      <strong>{label(reference)}</strong>
    {/snippet}
  </SimulatorDistributionRow>
{:else}
  <p class="empty">
    Pick a second runner to compare her with {label(reference)}.
  </p>
{/each}

<style>
  @import './run-comparison.css';
  .empty {
    margin: 8px 0;
    font-size: 12px;
    color: var(--text-secondary);
  }
  .clean {
    color: var(--accent-success);
  }
  .error {
    color: var(--accent-error);
  }
</style>
