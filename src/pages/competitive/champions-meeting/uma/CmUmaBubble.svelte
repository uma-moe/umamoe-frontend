<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { Pair, Requirement } from '../../hakuraku-types';
  import { pct, number, styleNames, styleOrder } from '../cm-data';
  import { portrait } from '../../analysis-view';
  import ChartFrame from '@/components/charts/ChartFrame.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import Artwork from '@/components/game/Artwork.svelte';
  import Button from '@/components/controls/Button.svelte';
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

  let chartWidth = $state(620),
    resizeFrame = 0;

  function resizeChart(next: number) {
    if (next <= 0 || next === chartWidth) return;
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => (chartWidth = next));
  }

  onDestroy(() => cancelAnimationFrame(resizeFrame));

  const x = (n: number) => 55 + ((n - xMin) / (xMax - xMin)) * (chartWidth - 80),
    y = (n: number) => 345 - ((n - yMin) / (yMax - yMin)) * 300;
</script>

<div class="bubble-panel">
  <ChartFrame
    plain
    surface
    id="cm-uma-bubble"
    title="Individual vs. team win rate"
    description="Own win rate (horizontal) · Team win rate (vertical) · Circle size: field share."
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
    {#if expanded}
      <p class="pan-hint">Scroll horizontally to explore the full chart.</p>
    {/if}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard users need to scroll the expanded chart.) -->
    <div
      class="chart-scroll"
      bind:clientWidth={() => chartWidth, resizeChart}
      class:expanded
      tabindex={expanded ? 0 : undefined}
      role="region"
      aria-label="Uma chart; scroll horizontally in expanded view"
    >
      {#if visible.length}
        <svg
          viewBox={`0 0 ${chartWidth} 410`}
          class="bubble"
          role="group"
          aria-label="Individual versus team win rate. Select an Uma to inspect its data."
        >
          {#each [0, 0.25, 0.5, 0.75, 1] as f}
            <line
              x1="50"
              x2={chartWidth - 20}
              y1={y(yMin + f * (yMax - yMin))}
              y2={y(yMin + f * (yMax - yMin))}
              class="grid"
            />
            <text
              x="44"
              y={y(yMin + f * (yMax - yMin)) + 4}
              text-anchor="end"
            >
              {pct(yMin + f * (yMax - yMin))}
            </text>
            <text
              x={x(xMin + f * (xMax - xMin))}
              y="383"
              text-anchor="middle"
            >
              {pct(xMin + f * (xMax - xMin))}
            </text>
          {/each}
          <line
            x1={x(1 / 9)}
            x2={x(1 / 9)}
            y1="25"
            y2="365"
            class="baseline"
          />
          <line
            x1="50"
            x2={chartWidth - 20}
            y1={y(1 / 3)}
            y2={y(1 / 3)}
            class="baseline"
          />
          <text
            class="baseline-label"
            x={x(1 / 9) + 5}
            y="30"
          >
            11.1% neutral Uma
          </text>
          <text
            class="baseline-label"
            x={chartWidth - 22}
            y={y(1 / 3) - 7}
            text-anchor="end"
          >
            33.3% neutral team
          </text>
          <text
            x={chartWidth / 2}
            y="403"
            text-anchor="middle"
          >
            Individual win rate
          </text>
          <text
            transform="translate(12 195) rotate(-90)"
            text-anchor="middle"
          >
            Team win rate
          </text>
          {#each [...visible].sort((a, b) => b.pop - a.pop) as p}
            {@const r = 10 + 17 * Math.sqrt(p.pop / maxPop)}
            <UmaChartPoint
              x={x(p.individual)}
              y={y(p.team)}
              {r}
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
        </svg>
      {:else}
        <div class="empty">
          <strong>No Umas match these chart filters.</strong>
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
        </div>
      {/if}
    </div>
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
  </ChartFrame>
</div>

<style>
  @import './uma-text.css';
  @import './cm-uma-bubble.css';
</style>
