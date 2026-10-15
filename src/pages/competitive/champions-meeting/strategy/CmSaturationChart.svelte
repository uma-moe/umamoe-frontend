<script lang="ts">
  import { onDestroy } from 'svelte';
  import DataTable from '@/components/data/DataTable.svelte';
  import type { SaturationBucket } from '../../hakuraku-types';
  import { pct, number } from '../cm-data';

  let {
    series,
    totalRaces,
    label,
    small = false
  }: {
    series: { name: string; color: string; buckets: SaturationBucket[] }[];
    totalRaces: number;
    label: string;
    small?: boolean;
  } = $props();

  let width = $state(560),
    hidden = $state<string[]>([]);

  let resizeFrame = 0;

  function resize(next: number) {
    if (next <= 0 || next === width) return;
    cancelAnimationFrame(resizeFrame);
    // Update the viewBox after layout; changing it in ResizeObserver loops in WebKit.
    resizeFrame = requestAnimationFrame(() => (width = next));
  }

  onDestroy(() => cancelAnimationFrame(resizeFrame));

  const filtered = $derived(
    series
      .filter((s) => !hidden.includes(s.name))
      .map((s) => ({
        ...s,
        buckets: s.buckets.filter((b) => b.races >= Math.max(1, totalRaces * 0.01) && b.entries > 0)
      }))
  );

  let selectedCount = $state('');

  const counts = $derived(
    [...new Set(filtered.flatMap((s) => s.buckets.map((b) => b.x)))].sort((a, b) => a - b)
  );
  const inspectedCount = $derived(
    counts.includes(Number(selectedCount)) ? Number(selectedCount) : counts[0]
  );
  const readout = $derived(
    filtered
      .map((s) => ({ ...s, bucket: s.buckets.find((b) => b.x === inspectedCount) }))
      .filter((s) => s.bucket)
  );
  const points = $derived(filtered.flatMap((s) => s.buckets));
  const min = $derived(points.length ? Math.min(...points.map((b) => b.x)) : 1),
    max = $derived(points.length ? Math.max(...points.map((b) => b.x)) : 2);
  const yMax = $derived(
    Math.ceil(Math.max(1 / 9, ...points.map((b) => Math.max(b.rate, b.ci[1]))) / 0.05) * 0.05
  );

  const x = (n: number) => 42 + ((n - min) / (max - min || 1)) * Math.max(1, width - 80);
  const y = (n: number) => 178 - (n / yMax) * 158;

  function inspect(event: PointerEvent) {
    if (small || !counts.length) return;
    const rect = (event.currentTarget as SVGSVGElement).getBoundingClientRect();
    const coordinate = ((event.clientX - rect.left) / rect.width) * width;
    selectedCount = String(
      counts.reduce(
        (nearest, count) =>
          Math.abs(x(count) - coordinate) < Math.abs(x(nearest) - coordinate) ? count : nearest,
        counts[0]!
      )
    );
  }
</script>

<figure
  aria-label={label}
  class:small
  bind:clientWidth={() => width, resize}
>
  {#if !small}
    <div
      class="series-controls"
      aria-label="Visible running styles"
    >
      {#each series as item}
        <button
          aria-pressed={!hidden.includes(item.name)}
          onclick={() =>
            (hidden = hidden.includes(item.name)
              ? hidden.filter((name) => name !== item.name)
              : [...hidden, item.name])}
        >
          <i style:background={item.color}></i>
          {item.name}
        </button>
      {/each}
    </div>
  {/if}
  {#if !small && points.length}
    <div class="inspection-controls">
      <div
        class="count-picker"
        role="group"
        aria-label="Inspect room count"
      >
        <span>In room</span>
        {#each counts as count}
          <button
            aria-pressed={inspectedCount === count}
            aria-label={count + ' in room'}
            onclick={() => (selectedCount = String(count))}
          >
            {count}
          </button>
        {/each}
      </div>
      <span>Hover the chart or choose a count · 95% intervals below</span>
    </div>
  {/if}
  <svg
    viewBox={'0 0 ' + width + ' 228'}
    role="img"
    aria-label={label}
    onpointermove={inspect}
    onpointerdown={inspect}
  >
    {#if !small && inspectedCount !== undefined}
      <line
        class="cursor"
        x1={x(inspectedCount)}
        x2={x(inspectedCount)}
        y1="20"
        y2="178"
      />
    {/if}
    {#each [0, 0.25, 0.5, 0.75, 1] as tick}
      <line
        x1="42"
        x2={width - 38}
        y1={y(tick * yMax)}
        y2={y(tick * yMax)}
        class="grid"
      />
      <text
        x="36"
        y={y(tick * yMax) + 4}
        text-anchor="end"
      >
        {Math.round(tick * yMax * 100)}%
      </text>
    {/each}
    <line
      x1="42"
      x2={width - 38}
      y1={y(1 / 9)}
      y2={y(1 / 9)}
      class="baseline"
    />
    <text
      x={width - 34}
      y={y(1 / 9) + 3}
    >
      1/9
    </text>
    {#each Array.from(new Set(points.map((b) => b.x))).sort((a, b) => a - b) as count}
      <text
        x={x(count)}
        y="196"
        text-anchor="middle"
      >
        {count}
      </text>
    {/each}
    {#each filtered as s}
      <polyline
        points={s.buckets.map((b) => x(b.x) + ',' + y(b.rate)).join(' ')}
        stroke={s.color}
        fill="none"
        stroke-width="2"
      />
      {#each s.buckets as b}
        {#if !small && b.x === inspectedCount}
          <line
            x1={x(b.x)}
            x2={x(b.x)}
            y1={y(b.ci[0])}
            y2={y(b.ci[1])}
            stroke={s.color}
            stroke-width="2"
          />
          <line
            x1={x(b.x) - 4}
            x2={x(b.x) + 4}
            y1={y(b.ci[0])}
            y2={y(b.ci[0])}
            stroke={s.color}
          />
          <line
            x1={x(b.x) - 4}
            x2={x(b.x) + 4}
            y1={y(b.ci[1])}
            y2={y(b.ci[1])}
            stroke={s.color}
          />
        {/if}
        <circle
          cx={x(b.x)}
          cy={y(b.rate)}
          r="3.5"
          fill={s.color}
        >
          <title>
            {s.name}: {b.x} in room · {pct(b.rate)} per Uma · {b.races.toLocaleString()} races
          </title>
        </circle>
      {/each}
    {/each}
    <text
      x={width / 2}
      y="218"
      text-anchor="middle"
      class="axis-label"
    >
      Count in room
    </text>
  </svg>
  {#if !small && points.length}
    <div class="readout">
      <div class="readout-values">
        {#each readout as row}
          <div>
            <span>
              <i style:background={row.color}></i>
              {row.name}
            </span>
            <strong>{pct(row.bucket!.rate)}</strong>
            <small>{pct(row.bucket!.ci[0], 2)}–{pct(row.bucket!.ci[1], 2)}</small>
          </div>
        {/each}
      </div>
    </div>
  {/if}
  {#if !points.length}
    <p>Select a style with enough data to show its results.</p>
  {/if}
  {#if points.length}
    <details>
      <summary>Inspect values</summary>
      <DataTable
        plain
        compact
        caption={label + ' values'}
        maxHeight={300}
        columns={[
          { key: 'name', label: 'Style' },
          { key: 'x', label: 'In room', numeric: true },
          { key: 'rate', label: 'Win rate', numeric: true },
          { key: 'lower', label: '95% interval', numeric: true },
          { key: 'races', label: 'Races', numeric: true }
        ]}
        rows={filtered.flatMap((s) =>
          s.buckets.map((b) => ({
            name: s.name,
            color: s.color,
            x: b.x,
            rate: b.rate,
            lower: b.ci[0],
            upper: b.ci[1],
            races: b.races
          }))
        )}
      >
        {#snippet cell(row, column)}
          {#if column.key === 'name'}
            <i style:background={String(row.color)}></i>
            {row.name}
          {:else if column.key === 'rate'}
            {pct(Number(row.rate))}
          {:else if column.key === 'lower'}
            {pct(Number(row.lower))}–{pct(Number(row.upper))}
          {:else}
            {number(Number(row[column.key]))}
          {/if}
        {/snippet}
      </DataTable>
    </details>
  {/if}
</figure>

<style>
  figure {
    margin: 0;
    min-width: 0;
    display: grid;
    gap: 8px;
  }
  .small {
    display: block;
  }
  svg {
    width: 100%;
    display: block;
    min-height: 180px;
    height: auto;
    max-height: 280px;
  }
  .small svg {
    min-height: 130px;
    height: auto;
  }
  text {
    fill: var(--text-secondary);
    font-size: 12px;
    font-family: inherit;
  }
  .axis-label {
    font-size: 11px;
  }
  .small text {
    font-size: 10px;
  }
  .grid {
    stroke: var(--border-subtle);
  }
  .baseline {
    stroke: var(--text-secondary);
    stroke-dasharray: 4 3;
  }
  .cursor {
    stroke: var(--text-secondary);
    stroke-dasharray: 3 4;
    opacity: 0.35;
  }
  .series-controls {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
  }
  .series-controls button {
    display: flex;
    gap: 5px;
    align-items: center;
    min-height: 28px;
    border: 0;
    background: none;
    color: var(--color-text);
    font: inherit;
    font-size: 11px;
    cursor: pointer;
    padding: 0;
  }
  .series-controls [aria-pressed='false'] {
    opacity: 0.4;
    text-decoration: line-through;
  }
  .readout {
    padding-top: 8px;
    border-top: 1px solid var(--border-subtle);
  }
  .inspection-controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .count-picker {
    display: flex;
    gap: 3px;
    align-items: center;
    font-size: 11px;
  }
  .count-picker > span {
    margin-right: 6px;
    color: var(--text-secondary);
  }
  .count-picker button {
    border: 0;
    background: transparent;
    color: var(--text-secondary);
    min-width: 26px;
    min-height: 26px;
    border-radius: 4px;
    font: inherit;
    cursor: pointer;
  }
  .count-picker button[aria-pressed='true'] {
    background: var(--color-accent-soft);
    color: var(--accent-primary);
  }
  .inspection-controls > span {
    font-size: 10px;
    color: var(--text-secondary);
    text-align: right;
    line-height: 1.6;
  }
  .readout-values {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 8px;
  }
  .readout-values > div {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 3px 6px;
    font-variant-numeric: tabular-nums;
  }
  .readout-values span {
    font-size: 10px;
    color: var(--text-secondary);
  }
  .readout-values strong {
    font-size: 12px;
    font-weight: 550;
    letter-spacing: -0.025em;
  }
  .readout-values small {
    grid-column: 1/-1;
    font-size: 10px;
    color: var(--text-secondary);
  }
  p {
    text-align: center;
    color: var(--text-secondary);
    font-size: 12px;
  }
  summary {
    padding: 6px 0;
    font-size: 11px;
    color: var(--text-secondary);
    cursor: pointer;
  }
  i {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    margin-right: 4px;
  }
  @media (max-width: 900px) {
    .readout-values {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
  @media (max-width: 600px) {
    svg {
      height: auto;
      min-height: 180px;
    }
    .inspection-controls > span {
      font-size: 9px;
    }
    .count-picker {
      gap: 1px;
    }
  }
</style>
