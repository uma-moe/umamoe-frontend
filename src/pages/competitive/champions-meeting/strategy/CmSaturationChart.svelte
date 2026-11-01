<script lang="ts">
  import Checkbox from '@/components/controls/Checkbox.svelte';
  import DataTable from '@/components/data/DataTable.svelte';
  import Disclosure from '@/components/overlays/Disclosure.svelte';
  import { PlotSize } from '@/components/charts/plot-size.svelte';
  import { axisTicks, PlotZoom, tickDecimals } from '@/components/charts/plot-zoom.svelte';
  import type { SaturationBucket } from '../../hakuraku-types';
  import { pct, number } from '../cm-data';

  let {
    series,
    totalRaces,
    label,
    small = false,
    neutral = 1 / 9,
    zoom = new PlotZoom()
  }: {
    /** `short` names a style in the legend, where the full name is left to assistive tech. */
    series: { name: string; short?: string; color: string; buckets: SaturationBucket[] }[];
    totalRaces: number;
    label: string;
    small?: boolean;
    /** The win rate every runner would share in an even room, drawn as the reference line. */
    neutral?: number;
    /** The plot's zoom, which the chart's toolbar holds the controls for. */
    zoom?: PlotZoom;
  } = $props();

  const valuesId = $props.id();
  const clipId = valuesId + '-plot';

  const size = new PlotSize({ width: 560, height: 228 });

  let hidden = $state<string[]>([]);

  const reported = $derived(
    series.map((s) => ({
      ...s,
      buckets: s.buckets.filter((b) => b.races >= Math.max(1, totalRaces * 0.01) && b.entries > 0)
    }))
  );

  const filtered = $derived(reported.filter((s) => !hidden.includes(s.name)));

  let selectedCount = $state('');

  const counts = $derived(
    [...new Set(filtered.flatMap((s) => s.buckets.map((b) => b.x)))].sort((a, b) => a - b)
  );

  const inspectedCount = $derived(
    counts.includes(Number(selectedCount)) ? Number(selectedCount) : counts[0]
  );

  // Every style keeps its place in the legend, hidden or without a bucket at this count, so it can be switched back.
  const legend = $derived(
    reported.map((s) => ({ ...s, bucket: s.buckets.find((b) => b.x === inspectedCount) }))
  );

  const points = $derived(filtered.flatMap((s) => s.buckets));
  const min = $derived(points.length ? Math.min(...points.map((b) => b.x)) : 1),
    max = $derived(points.length ? Math.max(...points.map((b) => b.x)) : 2);

  const yMax = $derived(
    Math.ceil(Math.max(neutral, ...points.map((b) => Math.max(b.rate, b.ci[1]))) / 0.05) * 0.05
  );

  const xRange = $derived(zoom.visible('x', min, max === min ? min + 1 : max));
  const yRange = $derived(zoom.visible('y', 0, yMax));
  const yDecimals = $derived(Math.max(0, tickDecimals(yRange.min * 100, yRange.max * 100)));

  // The plot keeps only the room its labels need: the percentages on the left and the even-room mark on the right.
  const area = $derived({
    left: yDecimals > 0 ? 42 : 34,
    right: size.width - 26,
    top: 14,
    bottom: size.height - 46
  });

  const x = (n: number) =>
    area.left +
    ((n - xRange.min) / (xRange.max - xRange.min)) * Math.max(1, area.right - area.left);
  const y = (n: number) =>
    area.bottom - ((n - yRange.min) / (yRange.max - yRange.min)) * (area.bottom - area.top);

  const visibleCounts = $derived(
    counts.filter((count) => count >= xRange.min - 0.001 && count <= xRange.max + 0.001)
  );

  function toggleSeries(name: string) {
    hidden = hidden.includes(name)
      ? hidden.filter((hiddenName) => hiddenName !== name)
      : [...hidden, name];
  }

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
  {#if !small}
    <div
      class="legend"
      role="group"
      aria-label="Visible running styles"
      style:--legend-columns={legend.length}
      style:--legend-narrow-columns={Math.ceil(legend.length / 2)}
    >
      {#each legend as item, index}
        <div
          class="legend-item"
          style:--color-accent={item.color}
        >
          <Checkbox
            id={valuesId + '-style-' + index}
            label={item.short ?? item.name}
            ariaLabel={item.name}
            description={item.bucket ? pct(item.bucket.rate) : '—'}
            checked={!hidden.includes(item.name)}
            onchange={() => toggleSeries(item.name)}
          />
        </div>
      {/each}
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
