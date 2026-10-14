<script
  lang="ts"
  module
>
  export type DistributionTile = {
    label: string;
    value: string;
    detail?: string;
    tone?: 'ahead' | '';
    main?: boolean;
  };
  export type BinTone = 'runner' | 'strong' | 'muted';
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import SimulatorRunnerFace from './SimulatorRunnerFace.svelte';
  import type { HistogramAxis } from './simulation-comparison';

  /**
   * One runner's results over every race: key figures as tiles and the races as a histogram on an axis shared by every row.
   * `compact` turns it into a single table line for whole-field views; the first compact row carries the column labels
   * and the last one the axis.
   */
  type Runner = { name: string; cardId?: number; color: string };
  let {
    runner,
    heading,
    tiles,
    counts,
    axis,
    tick,
    binTitle,
    binTone = () => 'runner',
    marker,
    sides,
    zero = false,
    compact = false,
    header = false,
    footer = true,
    chartLabel,
    onselect
  }: {
    runner: Runner;
    heading?: Snippet;
    tiles: DistributionTile[];
    counts: number[];
    axis: HistogramAxis;
    tick: (value: number) => string;
    binTitle: (index: number) => string;
    binTone?: (index: number) => BinTone;
    marker?: { value: number; label: string };
    sides?: { left: string; leftCard?: number; right: string; rightCard?: number };
    zero?: boolean;
    compact?: boolean;
    header?: boolean;
    footer?: boolean;
    chartLabel: string;
    onselect?: () => void;
  } = $props();

  const peak = $derived(Math.max(1, ...counts));
  const x = (value: number) =>
    Math.max(0, Math.min(100, ((value - axis.min) / (axis.max - axis.min)) * 100));
  const summary = $derived(
    runner.name + ': ' + tiles.map((tile) => tile.label + ' ' + tile.value).join(', ')
  );
  // Labels keep at least ~52 px apart, so narrow phone columns show every second or third tick instead of overlapping.
  let axisWidth = $state(600);
  const labelled = $derived.by(() => {
    const ticks = axis.ticks,
      gap =
        ticks.length > 1
          ? (axisWidth * (ticks[1]! - ticks[0]!)) / (axis.max - axis.min)
          : axisWidth,
      every = Math.max(1, Math.ceil(52 / Math.max(1, gap)));
    const anchor = ticks.findIndex((value) => Math.abs(value) < 1e-9);
    return ticks.filter((_, index) => (index - Math.max(0, anchor)) % every === 0);
  });
</script>

{#snippet plot(height: number)}
  <div
    class="plot"
    style:height={height + 'px'}
    role="img"
    aria-label={summary}
  >
    {#each axis.ticks as value}<i
        class="grid"
        class:zero={zero && Math.abs(value) < 1e-9}
        style:left={x(value) + '%'}
      ></i>{/each}
    <div class="bars">
      {#each counts as count, index}<span
          class="bin {binTone(index)}"
          title={binTitle(index)}
        >
          {#if count}<i
              style:height={Math.max(compact ? 6 : 2, (count / peak) * 100) + '%'}
            ></i>{/if}
        </span>{/each}
    </div>
    {#if marker}<i
        class="marker"
        style:left={x(marker.value) + '%'}
        title={marker.label}
      ></i>{/if}
  </div>
{/snippet}
{#snippet ticks()}
  <div
    class="axis"
    aria-hidden="true"
    bind:clientWidth={axisWidth}
  >
    {#each labelled as value}<span
        style:left={x(value) + '%'}
        class:start={x(value) < 3}
        class:end={x(value) > 97}
      >
        {tick(value)}
      </span>{/each}
  </div>
{/snippet}

{#if compact}
  {#if header}<div
      class="line head"
      class:stacked={tiles.length >= 3}
      style:--stats={tiles.length}
      aria-hidden="true"
    >
      <span>Runner</span>
      {#each tiles as tile}<span class="num">{tile.label}</span>{/each}
      <span>{chartLabel}</span>
    </div>{/if}
  <div
    class="line"
    class:stacked={tiles.length >= 3}
    style:--stats={tiles.length}
    style:--runner={runner.color}
  >
    <button
      type="button"
      class="who"
      onclick={onselect}
      disabled={!onselect}
      title={runner.name}
    >
      <i
        class="dot"
        aria-hidden="true"
      ></i>
      <SimulatorRunnerFace
        cardId={runner.cardId}
        size={20}
      />
      <span>{runner.name}</span>
    </button>
    {#each tiles as tile}<span
        class="num"
        class:ahead={tile.tone === 'ahead'}
        title={tile.label + (tile.detail ? ' · ' + tile.detail : '')}
      >
        <small class="label">{tile.label}</small>
        {tile.value}
      </span>{/each}
    {@render plot(26)}
  </div>
  {#if footer}<div
      class="line foot"
      class:stacked={tiles.length >= 3}
      style:--stats={tiles.length}
    >
      <span></span>
      {#each tiles as _}<span></span>{/each}{@render ticks()}
    </div>{/if}
{:else}
  <div
    class="row"
    style:--runner={runner.color}
  >
    <div class="summary">
      {#if heading}<p class="heading">{@render heading()}</p>{/if}
      <dl
        class="tiles"
        style:--tiles={tiles.length}
      >
        {#each tiles as tile}<div
            class="tile"
            class:ahead={tile.tone === 'ahead'}
            class:main={tile.main}
          >
            <dt>{tile.label}</dt>
            <dd>
              <strong>{tile.value}</strong>
              {#if tile.detail}<small>{tile.detail}</small>{/if}
            </dd>
          </div>{/each}
      </dl>
    </div>
    <div class="chart">
      {@render plot(84)}
      {@render ticks()}
      {#if sides}<div class="sides">
          <span>
            <span aria-hidden="true">◀</span>
            {#if sides.leftCard !== undefined}<SimulatorRunnerFace
                cardId={sides.leftCard}
                size={16}
              />{/if}{sides.left}
          </span>
          {#if marker}<span class="marker-key">
              <i aria-hidden="true"></i>
              median
            </span>{/if}
          <span class="ahead">
            {sides.right}{#if sides.rightCard !== undefined}<SimulatorRunnerFace
                cardId={sides.rightCard}
                size={16}
              />{/if}
            <span aria-hidden="true">▶</span>
          </span>
        </div>{/if}
    </div>
  </div>
{/if}

<style>
  @import './simulator-distribution-row.css';
</style>
