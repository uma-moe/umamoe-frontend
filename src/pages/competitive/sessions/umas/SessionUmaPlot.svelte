<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { MultiRaceCharacterStats } from '@/lib/race/multi-race-analysis';
  import UmaChartPoint from '../UmaChartPoint.svelte';
  import { portrait, rate } from '../../analysis-view';
  import { formatRate, isSmallSample } from '../session-insights';
  import { chartColors } from '../session-statistics';
  import { theme } from '@/stores/theme';

  let {
    characters,
    entries,
    neutral,
    selected,
    onselect
  }: {
    characters: MultiRaceCharacterStats[];
    entries: number;
    /** The win rate, in percent, every Uma would share if all were equally strong. */
    neutral: number;
    selected?: string;
    onselect: (key: string) => void;
  } = $props();

  let width = $state(600),
    resizeFrame = 0;

  function resize(next: number) {
    if (next <= 0 || next === width) return;
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => (width = next));
  }

  onDestroy(() => cancelAnimationFrame(resizeFrame));

  const colors = $derived(chartColors($theme === 'dark'));
  // An even split of the entries between the Umas shown, the vertical counterpart of the neutral rate.
  const averageShare = $derived(characters.length ? 100 / characters.length : 0);
  const maxX = $derived(
    Math.max(5, averageShare, ...characters.map((c) => rate(c.races, entries))) * 1.15
  );
  const maxY = $derived(
    Math.min(110, Math.max(10, neutral, ...characters.map((c) => rate(c.wins, c.races))) * 1.15)
  );

  const x = (v: number) => 58 + (v / maxX) * Math.max(1, width - 90),
    y = (v: number) => 226 - (v / maxY) * 192;
</script>

<div
  class="plot"
  bind:clientWidth={() => width, resize}
>
  <svg
    viewBox={`0 0 ${width} 270`}
    role="group"
    aria-label="Uma popularity and win rate. Select a portrait to inspect its results."
  >
    {#each [0, 0.25, 0.5, 0.75, 1] as f}
      <line
        x1="48"
        x2={width - 24}
        y1={y(maxY * f)}
        y2={y(maxY * f)}
      />
      <text
        x="42"
        y={y(maxY * f) + 4}
        text-anchor="end"
      >
        {(maxY * f).toFixed(0)}%
      </text>
      <text
        x={x(maxX * f)}
        y="245"
        text-anchor="middle"
      >
        {(maxX * f).toFixed(1)}%
      </text>
    {/each}
    <text
      x={width / 2}
      y="265"
      text-anchor="middle"
    >
      Field share
    </text>
    <text
      x="48"
      y="16"
    >
      Win rate
    </text>
    <line
      class="reference"
      x1="48"
      x2={width - 24}
      y1={y(neutral)}
      y2={y(neutral)}
    />
    <text
      class="reference-label"
      x={width - 24}
      y={y(neutral) - 5}
      text-anchor="end"
    >
      Neutral {formatRate(neutral)}
    </text>
    {#if averageShare > 0}
      <line
        class="reference"
        x1={x(averageShare)}
        x2={x(averageShare)}
        y1={y(maxY)}
        y2={y(0)}
      />
      <text
        class="reference-label"
        x={x(averageShare) + 5}
        y={y(maxY) + 10}
      >
        Average share {formatRate(averageShare)}
      </text>
    {/if}
    {#each [...characters].sort((a, b) => Number(a.key === selected) - Number(b.key === selected)) as c (c.key)}
      <g class:few={isSmallSample(c.races) && c.key !== selected}>
        <UmaChartPoint
          x={x(rate(c.races, entries))}
          y={y(rate(c.wins, c.races))}
          r={17}
          image={portrait(c.cardId)}
          color={c.key === selected ? colors.accent : colors.muted}
          selected={c.key === selected}
          onselect={() => onselect(c.key)}
          label={'Select ' +
            c.name +
            ': ' +
            rate(c.wins, c.races).toFixed(1) +
            '% win rate, ' +
            rate(c.races, entries).toFixed(1) +
            '% field share, ' +
            c.races +
            ' entries'}
        />
      </g>
    {/each}
  </svg>
</div>

<style>
  .plot {
    min-width: 0;
    width: 100%;
  }
  svg {
    display: block;
    width: 100%;
    height: 270px;
    overflow: visible;
  }
  line {
    stroke: var(--border-subtle);
  }
  .reference {
    stroke: var(--text-secondary);
    stroke-dasharray: 4 4;
    opacity: 0.7;
  }
  .reference-label {
    fill: var(--text-secondary);
    font-size: 10px;
  }
  .few {
    opacity: 0.45;
  }
  text {
    fill: var(--text-secondary);
    font-family: inherit;
    font-size: 10px;
  }
  @media (max-width: 760px) {
    svg {
      height: auto;
      min-height: 260px;
    }
  }
</style>
