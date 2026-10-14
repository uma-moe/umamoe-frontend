<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { MultiRaceCharacterStats } from '@/lib/race/multi-race-analysis';
  import UmaChartPoint from './UmaChartPoint.svelte';
  import { portrait, rate } from '../analysis-view';

  let {
    characters,
    entries,
    selected,
    onselect
  }: {
    characters: MultiRaceCharacterStats[];
    entries: number;
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

  const maxX = $derived(Math.max(5, ...characters.map((c) => rate(c.races, entries))) * 1.15);
  const maxY = $derived(
    Math.min(110, Math.max(10, ...characters.map((c) => rate(c.wins, c.races))) * 1.15)
  );

  const x = (v: number) => 58 + (v / maxX) * Math.max(1, width - 90),
    y = (v: number) => 260 - (v / maxY) * 220;
</script>

<div
  class="plot"
  bind:clientWidth={() => width, resize}
>
  <svg
    viewBox={`0 0 ${width} 310`}
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
        y="283"
        text-anchor="middle"
      >
        {(maxX * f).toFixed(1)}%
      </text>
    {/each}
    <text
      x={width / 2}
      y="304"
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
    {#each [...characters].sort((a, b) => Number(a.key === selected) - Number(b.key === selected)) as c (c.key)}
      <UmaChartPoint
        x={x(rate(c.races, entries))}
        y={y(rate(c.wins, c.races))}
        r={17}
        image={portrait(c.cardId)}
        color={c.key === selected ? '#e8ad63' : '#69b7ee'}
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
    height: 310px;
    overflow: visible;
  }
  line {
    stroke: var(--border-subtle);
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
