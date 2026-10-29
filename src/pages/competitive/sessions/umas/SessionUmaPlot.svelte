<script lang="ts">
  import type { MultiRaceCharacterStats } from '@/lib/race/multi-race-analysis';
  import PlotZoomControls from '@/components/charts/PlotZoomControls.svelte';
  import { PlotSize } from '@/components/charts/plot-size.svelte';
  import { axisTicks, PlotZoom, tickDecimals } from '@/components/charts/plot-zoom.svelte';
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

  /** Portrait radius; the clip leaves this much room so points on an edge stay whole. */
  const POINT_RADIUS = 17;
  const MARGIN = { left: 48, right: 24, top: 24, bottom: 46 };

  const plotId = $props.id();
  const clipId = plotId + '-plot';
  const zoom = new PlotZoom();

  const size = new PlotSize({ width: 600, height: 300 });

  const colors = $derived(chartColors($theme === 'dark'));
  // An even split of the entries between the Umas shown, the vertical counterpart of the neutral rate.
  const averageShare = $derived(characters.length ? 100 / characters.length : 0);
  const maxX = $derived(
    Math.max(5, averageShare, ...characters.map((c) => rate(c.races, entries))) * 1.15
  );
  const maxY = $derived(
    Math.min(110, Math.max(10, neutral, ...characters.map((c) => rate(c.wins, c.races))) * 1.15)
  );

  const area = $derived({
    left: MARGIN.left,
    right: size.width - MARGIN.right,
    top: MARGIN.top,
    bottom: size.height - MARGIN.bottom
  });

  const xRange = $derived(zoom.visible('x', 0, maxX));
  const yRange = $derived(zoom.visible('y', 0, maxY));
  const xDecimals = $derived(tickDecimals(xRange.min, xRange.max) + 1);
  const yDecimals = $derived(tickDecimals(yRange.min, yRange.max));

  const x = (value: number) =>
    area.left + ((value - xRange.min) / (xRange.max - xRange.min)) * (area.right - area.left);
  const y = (value: number) =>
    area.bottom - ((value - yRange.min) / (yRange.max - yRange.min)) * (area.bottom - area.top);

  const ordered = $derived(
    [...characters].sort((a, b) => Number(a.key === selected) - Number(b.key === selected))
  );
</script>

<div class="uma-plot">
  <PlotZoomControls {zoom} />
  <div
    class="plot"
    {@attach size.observe}
  >
    <!-- svelte-ignore a11y_no_noninteractive_tabindex (The plot takes keyboard zoom and pan.) -->
    <svg
      viewBox={`0 0 ${size.width} ${size.height}`}
      role="group"
      tabindex="0"
      aria-label="Uma popularity and win rate. Select a portrait to inspect its results. Plus and minus zoom, arrow keys pan, Home shows the whole plot."
      class:zoomed={zoom.zoomed}
      {@attach zoom.gestures(() => area)}
    >
      <defs>
        <clipPath id={clipId}>
          <rect
            x={area.left - POINT_RADIUS}
            y={area.top - POINT_RADIUS}
            width={area.right - area.left + POINT_RADIUS * 2}
            height={area.bottom - area.top + POINT_RADIUS * 2}
          />
        </clipPath>
      </defs>
      {#each axisTicks(yRange.min, yRange.max) as tick (tick)}
        <line
          x1={area.left}
          x2={area.right}
          y1={y(tick)}
          y2={y(tick)}
        />
        <text
          x={area.left - 6}
          y={y(tick) + 4}
          text-anchor="end"
        >
          {tick.toFixed(yDecimals)}%
        </text>
      {/each}
      {#each axisTicks(xRange.min, xRange.max) as tick (tick)}
        <text
          x={x(tick)}
          y={area.bottom + 18}
          text-anchor="middle"
        >
          {tick.toFixed(xDecimals)}%
        </text>
      {/each}
      <text
        x={(area.left + area.right) / 2}
        y={size.height - 6}
        text-anchor="middle"
      >
        Field share
      </text>
      <text
        x={area.left}
        y={area.top - 10}
      >
        Win rate
      </text>
      <g clip-path={`url(#${clipId})`}>
        <line
          class="reference"
          x1={area.left}
          x2={area.right}
          y1={y(neutral)}
          y2={y(neutral)}
        />
        <text
          class="reference-label"
          x={area.right}
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
            y1={area.top}
            y2={area.bottom}
          />
          <text
            class="reference-label"
            x={x(averageShare) + 5}
            y={area.top + 10}
          >
            Average share {formatRate(averageShare)}
          </text>
        {/if}
        {#each ordered as c (c.key)}
          <g class:few={isSmallSample(c.races) && c.key !== selected}>
            <UmaChartPoint
              x={x(rate(c.races, entries))}
              y={y(rate(c.wins, c.races))}
              r={POINT_RADIUS}
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
      </g>
    </svg>
  </div>
</div>

<style>
  @import '@/components/charts/zoomable-plot.css';

  /* Fills whatever height its card has, so the scatter never leaves an empty band below it. */
  .uma-plot {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    min-height: 0;
  }
  .plot {
    min-height: 280px;
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
</style>
