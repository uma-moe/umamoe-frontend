<script lang="ts">
  import DataTable from '@/components/data/DataTable.svelte';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import Disclosure from '@/components/overlays/Disclosure.svelte';
  import PlotZoomControls from '@/components/charts/PlotZoomControls.svelte';
  import { PlotSize } from '@/components/charts/plot-size.svelte';
  import { axisTicks, PlotZoom, tickDecimals } from '@/components/charts/plot-zoom.svelte';
  import type { SaturationBucket } from '../../hakuraku-types';
  import { pct, number } from '../cm-data';

  let {
    series,
    totalRaces,
    label,
    small = false,
    countPicker = true,
    neutral = 1 / 9
  }: {
    series: { name: string; color: string; buckets: SaturationBucket[] }[];
    totalRaces: number;
    label: string;
    small?: boolean;
    /** Buttons for each room count beside the hover readout; a few captured races read better without. */
    countPicker?: boolean;
    /** The win rate every runner would share in an even room, drawn as the reference line. */
    neutral?: number;
  } = $props();

  const valuesId = $props.id();
  const clipId = valuesId + '-plot';
  const zoom = new PlotZoom();

  const size = new PlotSize({ width: 560, height: 228 });

  let hidden = $state<string[]>([]);

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
    Math.ceil(Math.max(neutral, ...points.map((b) => Math.max(b.rate, b.ci[1]))) / 0.05) * 0.05
  );

  const area = $derived({ left: 42, right: size.width - 38, top: 14, bottom: size.height - 46 });
  const xRange = $derived(zoom.visible('x', min, max === min ? min + 1 : max));
  const yRange = $derived(zoom.visible('y', 0, yMax));
  const yDecimals = $derived(Math.max(0, tickDecimals(yRange.min * 100, yRange.max * 100)));

  const x = (n: number) =>
    area.left +
    ((n - xRange.min) / (xRange.max - xRange.min)) * Math.max(1, area.right - area.left);
  const y = (n: number) =>
    area.bottom - ((n - yRange.min) / (yRange.max - yRange.min)) * (area.bottom - area.top);

  const visibleCounts = $derived(
    counts.filter((count) => count >= xRange.min - 0.001 && count <= xRange.max + 0.001)
  );

  function inspect(event: PointerEvent) {
    if (small || !counts.length) return;
    const rect = (event.currentTarget as SVGSVGElement).getBoundingClientRect();
    const coordinate = event.clientX - rect.left;
    const candidates = visibleCounts.length ? visibleCounts : counts;
    selectedCount = String(
      candidates.reduce(
        (nearest, count) =>
          Math.abs(x(count) - coordinate) < Math.abs(x(nearest) - coordinate) ? count : nearest,
        candidates[0]!
      )
    );
  }
</script>

<figure
  aria-label={label}
  class:small
>
  {#if !small}
    <div class="chart-controls">
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
      {#if points.length}
        <PlotZoomControls {zoom} />
      {/if}
    </div>
  {/if}
  {#if !small && points.length && countPicker}
    <div class="inspection-controls">
      <div class="count-picker">
        <span>In room</span>
        <SegmentedControl
          compact
          label="Inspect room count"
          value={String(inspectedCount)}
          options={counts.map((count) => ({
            value: String(count),
            label: String(count),
            title: count + ' in room'
          }))}
          onchange={(value) => (selectedCount = value)}
        />
      </div>
    </div>
  {/if}
  <div
    class="plot"
    {@attach size.observe}
  >
    <!-- svelte-ignore a11y_no_noninteractive_tabindex (The plot takes keyboard zoom and pan.) -->
    <svg
      viewBox={'0 0 ' + size.width + ' ' + size.height}
      role={small ? 'img' : 'group'}
      tabindex={small ? undefined : 0}
      aria-label={small
        ? label
        : label +
          '. Hover for the values at a count. Plus and minus zoom, arrow keys pan, Home resets.'}
      class:zoomed={zoom.zoomed}
      onpointermove={inspect}
      onpointerdown={inspect}
      {@attach small ? undefined : zoom.gestures(() => area)}
    >
      <defs>
        <clipPath id={clipId}>
          <rect
            x={area.left - 5}
            y={area.top - 5}
            width={area.right - area.left + 10}
            height={area.bottom - area.top + 10}
          />
        </clipPath>
      </defs>
      {#each axisTicks(yRange.min, yRange.max) as tick (tick)}
        <line
          x1={area.left}
          x2={area.right}
          y1={y(tick)}
          y2={y(tick)}
          class="grid"
        />
        <text
          x={area.left - 6}
          y={y(tick) + 4}
          text-anchor="end"
        >
          {(tick * 100).toFixed(yDecimals)}%
        </text>
      {/each}
      {#each visibleCounts as count (count)}
        <text
          x={x(count)}
          y={area.bottom + 18}
          text-anchor="middle"
        >
          {count}
        </text>
      {/each}
      <text
        x={(area.left + area.right) / 2}
        y={size.height - 8}
        text-anchor="middle"
        class="axis-label"
      >
        Count in room
      </text>
      <g clip-path={'url(#' + clipId + ')'}>
        {#if !small && inspectedCount !== undefined}
          <line
            class="cursor"
            x1={x(inspectedCount)}
            x2={x(inspectedCount)}
            y1={area.top}
            y2={area.bottom}
          />
        {/if}
        <line
          x1={area.left}
          x2={area.right}
          y1={y(neutral)}
          y2={y(neutral)}
          class="baseline"
        />
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
                {s.name} with {b.x} in the room, {pct(b.rate)} per Uma over {b.races.toLocaleString()}
                races
              </title>
            </circle>
          {/each}
        {/each}
      </g>
      {#if neutral >= yRange.min && neutral <= yRange.max}
        <text
          x={area.right + 4}
          y={y(neutral) + 3}
        >
          1/{Math.round(1 / neutral)}
        </text>
      {/if}
    </svg>
  </div>
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
    <div class="values-disclosure">
      <Disclosure
        id={valuesId}
        title="Inspect values"
      >
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
      </Disclosure>
    </div>
  {/if}
</figure>

<style>
  @import '@/components/charts/zoomable-plot.css';
  @import './cm-saturation-chart.css';
</style>
