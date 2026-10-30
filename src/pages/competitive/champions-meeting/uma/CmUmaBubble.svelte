<script lang="ts">
  import type { Pair, Requirement } from '../../hakuraku-types';
  import { pct, number, styleNames, styleOrder } from '../cm-data';
  import { portrait } from '../../analysis-view';
  import ChartFrame from '@/components/charts/ChartFrame.svelte';
  import PlotZoomControls from '@/components/charts/PlotZoomControls.svelte';
  import { PlotSize } from '@/components/charts/plot-size.svelte';
  import { axisTicks, PlotZoom, tickDecimals } from '@/components/charts/plot-zoom.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import Artwork from '@/components/game/Artwork.svelte';
  import Button from '@/components/controls/Button.svelte';
  import EmptyState from '@/components/feedback/EmptyState.svelte';
  import UmaChartPoint from '../../sessions/UmaChartPoint.svelte';

  interface Props {
    visible: Pair[];
    colors: Record<number, string>;
    pair?: Pair;
    maxPop: number;
    minPop: string;
    hidden: number[];
    search: string;
    onselect: (key: string) => void;
    onteams: (slots: Requirement[]) => void;
  }

  let {
    visible,
    colors,
    pair,
    maxPop,
    minPop = $bindable(),
    hidden = $bindable(),
    search = $bindable(),
    onselect,
    onteams
  }: Props = $props();

  /** The largest portrait radius; the clip leaves this much room so points on an edge stay whole. */
  const MAX_RADIUS = 27;
  const MARGIN = { left: 50, right: 20, top: 24, bottom: 40 };

  const plotId = $props.id();
  const clipId = plotId + '-plot';
  const zoom = new PlotZoom();
  const size = new PlotSize({ width: 620, height: 360 });

  let expanded = $state(false),
    hovered = $state('');

  const inspected = $derived(
    visible.find((p) => p.key === (hovered || pair?.key)) ??
      visible.find((p) => p.key === pair?.key) ??
      visible[0]
  );

  const xMin = $derived(Math.min(1 / 9, ...visible.map((p) => p.individual)) * 0.85),
    xMax = $derived(Math.max(1 / 9, ...visible.map((p) => p.individual)) * 1.15);

  const yMin = $derived(Math.min(1 / 3, ...visible.map((p) => p.team)) * 0.85),
    yMax = $derived(Math.max(1 / 3, ...visible.map((p) => p.team)) * 1.15);

  const area = $derived({
    left: MARGIN.left,
    right: size.width - MARGIN.right,
    top: MARGIN.top,
    bottom: size.height - MARGIN.bottom
  });

  const xRange = $derived(zoom.visible('x', xMin, xMax));
  const yRange = $derived(zoom.visible('y', yMin, yMax));
  // tickDecimals reads percent spans; at least one decimal keeps neighbouring rate labels distinct.
  const xDecimals = $derived(Math.max(1, tickDecimals(xRange.min * 100, xRange.max * 100)));
  const yDecimals = $derived(Math.max(1, tickDecimals(yRange.min * 100, yRange.max * 100)));

  const x = (value: number) =>
    area.left + ((value - xRange.min) / (xRange.max - xRange.min)) * (area.right - area.left);
  const y = (value: number) =>
    area.bottom - ((value - yRange.min) / (yRange.max - yRange.min)) * (area.bottom - area.top);

  const ordered = $derived([...visible].sort((a, b) => b.pop - a.pop));
</script>

<div class="bubble-panel">
  <ChartFrame
    plain
    surface
    id="cm-uma-bubble"
    title="Individual vs. team win rate"
    description="Bubble size represents total simulated corpus share."
    slim
    expandable
    bind:expanded
  >
    {#snippet actions()}
      <div class="bubble-filter">
        <span aria-hidden="true">Min. style share</span>
        <SelectField
          hideLabel
          id="cm-bubble-min"
          label="Minimum style share"
          bind:value={minPop}
          options={[
            { value: '1', label: '≥1%' },
            { value: '3', label: '≥3%' },
            { value: '5', label: '≥5%' },
            { value: '0', label: 'All' }
          ]}
        />
      </div>
    {/snippet}
    <div class="bubble-body">
      <div class="legend">
        {#each styleOrder as id}
          <button
            aria-pressed={!hidden.includes(id)}
            class:muted={hidden.includes(id)}
            onclick={() =>
              (hidden = hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id])}
          >
            <i style:background={colors[id]}></i>
            {styleNames[id]}
          </button>
        {/each}
      </div>
      {#if visible.length}
        <PlotZoomControls {zoom} />
        <div
          class="plot"
          class:expanded
          {@attach size.observe}
        >
          <!-- svelte-ignore a11y_no_noninteractive_tabindex (The plot takes keyboard zoom and pan.) -->
          <svg
            viewBox={`0 0 ${size.width} ${size.height}`}
            role="group"
            tabindex="0"
            aria-label="Individual versus team win rate. Select an Uma to inspect its data. Plus and minus zoom, arrow keys pan, Home shows the whole plot."
            class:zoomed={zoom.zoomed}
            {@attach zoom.gestures(() => area)}
          >
            <defs>
              <clipPath id={clipId}>
                <rect
                  x={area.left - MAX_RADIUS}
                  y={area.top - MAX_RADIUS}
                  width={area.right - area.left + MAX_RADIUS * 2}
                  height={area.bottom - area.top + MAX_RADIUS * 2}
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
                {pct(tick, yDecimals)}
              </text>
            {/each}
            {#each axisTicks(xRange.min, xRange.max) as tick (tick)}
              <text
                x={x(tick)}
                y={area.bottom + 16}
                text-anchor="middle"
              >
                {pct(tick, xDecimals)}
              </text>
            {/each}
            <text
              x={(area.left + area.right) / 2}
              y={size.height - 6}
              text-anchor="middle"
            >
              Individual win rate
            </text>
            <text
              transform={`translate(12 ${(area.top + area.bottom) / 2}) rotate(-90)`}
              text-anchor="middle"
            >
              Team win rate
            </text>
            <g clip-path={`url(#${clipId})`}>
              <line
                x1={x(1 / 9)}
                x2={x(1 / 9)}
                y1={area.top}
                y2={area.bottom}
                class="baseline"
              />
              <line
                x1={area.left}
                x2={area.right}
                y1={y(1 / 3)}
                y2={y(1 / 3)}
                class="baseline"
              />
              <text
                class="baseline-label"
                x={x(1 / 9) + 5}
                y={area.top + 8}
              >
                11.1% neutral Uma
              </text>
              <text
                class="baseline-label"
                x={area.right - 2}
                y={y(1 / 3) - 6}
                text-anchor="end"
              >
                33.3% neutral team
              </text>
              {#each ordered as p (p.key)}
                <UmaChartPoint
                  x={x(p.individual)}
                  y={y(p.team)}
                  r={10 + (MAX_RADIUS - 10) * Math.sqrt(p.pop / maxPop)}
                  image={portrait(p.card)}
                  color={colors[p.style] ?? '#69b7ee'}
                  selected={pair?.key === p.key}
                  onselect={() => onselect(p.key)}
                  onhover={(active) => (hovered = active ? p.key : '')}
                  label={'Inspect ' +
                    p.name +
                    ' ' +
                    p.outfit +
                    ' ' +
                    styleNames[p.style] +
                    ': individual ' +
                    pct(p.individual) +
                    ', team ' +
                    pct(p.team) +
                    ', corpus share ' +
                    pct(p.pop) +
                    ', style share ' +
                    pct(p.stylePop) +
                    ', ' +
                    number(p.owners) +
                    ' players'}
                />
              {/each}
            </g>
          </svg>
        </div>
      {:else}
        <EmptyState
          icon="search"
          title="No matching Umas"
          description="No Umas match these chart filters."
        >
          {#snippet actions()}
            <Button
              variant="secondary"
              size="sm"
              onclick={() => {
                hidden = [];
                minPop = '0';
                search = '';
              }}
            >
              Reset chart filters
            </Button>
          {/snippet}
        </EmptyState>
      {/if}
      {#if inspected}
        <section
          class="inspection"
          aria-label="Uma chart details"
        >
          <div class="inspection-heading">
            <Artwork
              src={portrait(inspected.card)}
              alt=""
              size="sm"
            />
            <div>
              <strong>{inspected.name}</strong>
              <small>
                {inspected.outfit} ·
                <span style:color={colors[inspected.style]}>{styleNames[inspected.style]}</span>
              </small>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onclick={() => {
                expanded = false;
                onteams([
                  { card: inspected.card, chara: inspected.chara, style: inspected.style },
                  {},
                  {}
                ]);
              }}
            >
              Find teams
            </Button>
          </div>
          <dl>
            <div>
              <dt>Individual win rate</dt>
              <dd>{pct(inspected.individual)}</dd>
              <small>
                {pct(inspected.individualCI[0])}–{pct(inspected.individualCI[1])} estimate
              </small>
            </div>
            <div>
              <dt>Team win rate</dt>
              <dd>{pct(inspected.team)}</dd>
              <small>{pct(inspected.teamCI[0])}–{pct(inspected.teamCI[1])} CI</small>
            </div>
            <div>
              <dt>Players</dt>
              <dd>{number(inspected.owners)}</dd>
              <small>{pct(inspected.stylePop)} of this style</small>
            </div>
            <div>
              <dt>Corpus share</dt>
              <dd>{pct(inspected.pop)}</dd>
              <small>{number(inspected.runnerExposures)} entries</small>
            </div>
          </dl>
        </section>
      {/if}
    </div>
  </ChartFrame>
</div>

<style>
  @import '@/components/charts/zoomable-plot.css';
  @import './cm-uma-bubble.css';
</style>
