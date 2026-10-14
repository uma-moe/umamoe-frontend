<script lang="ts">
  import Spinner from '@/components/feedback/Spinner.svelte';
  import { onDestroy } from 'svelte';
  import ChartFrame from '@/components/charts/ChartFrame.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import Tabs from '@/components/navigation/Tabs.svelte';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import Artwork from '@/components/game/Artwork.svelte';
  import Button from '@/components/controls/Button.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import type { Summary, Requirement, Contexts } from '../hakuraku-types';
  import { cmGet, snapshotPath, pct, number, styleNames, styleOrder } from './cm-data';
  import { compositionQuery } from '../hakuraku-query';
  import { portrait } from '../analysis-view';
  import { virtualScroll, type VirtualRange } from '@/lib/virtual-scroll';
  import CmFieldExplorer from './CmFieldExplorer.svelte';
  import CmComposition from './CmComposition.svelte';
  import UmaChartPoint from '../sessions/UmaChartPoint.svelte';

  let {
    data,
    colors,
    onteams,
    colorblind = false,
    view = $bindable('overview'),
    selected = $bindable('')
  }: {
    data: Summary;
    colors: Record<number, string>;
    colorblind?: boolean;
    view?: string;
    selected?: string;
    onteams: (slots: Requirement[]) => void;
  } = $props();

  let sort = $state('pop'),
    minPop = $state('3'),
    hidden = $state<number[]>([]),
    descending = $state(true),
    range = $state<VirtualRange>({ start: 0, end: 0 });
  let search = $state(''),
    expanded = $state(false),
    hovered = $state('');
  let context = $state<Contexts>(),
    error = $state(''),
    attempt = $state(0);

  const matching = $derived(
    data.pairs.filter((p) =>
      (p.name + ' ' + p.outfit + ' ' + p.card).toLowerCase().includes(search.trim().toLowerCase())
    )
  );
  const sorted = $derived(
    [...matching].sort(
      (a, b) =>
        (sort === 'name'
          ? a.name.localeCompare(b.name)
          : sort === 'players'
            ? a.owners - b.owners
            : sort === 'pop'
              ? a.pop - b.pop
              : sort === 'team'
                ? a.team - b.team
                : a.individual - b.individual) * (descending ? -1 : 1)
    )
  );

  function order(key: string) {
    descending = sort === key ? !descending : key !== 'name';
    sort = key;
  }

  const breakdownRows = $derived(sorted);
  const pair = $derived(
    data.pairs.find((p) => p.key === selected) ?? [...data.pairs].sort((a, b) => b.pop - a.pop)[0]
  );
  const visible = $derived(
    matching.filter((p) => p.stylePop * 100 >= Number(minPop) && !hidden.includes(p.style))
  );
  const inspected = $derived(
    visible.find((p) => p.key === (hovered || pair?.key)) ??
      visible.find((p) => p.key === pair?.key) ??
      visible[0]
  );
  const xMin = $derived(Math.min(1 / 9, ...visible.map((p) => p.individual)) * 0.85),
    xMax = $derived(Math.max(1 / 9, ...visible.map((p) => p.individual)) * 1.15);
  const yMin = $derived(Math.min(1 / 3, ...visible.map((p) => p.team)) * 0.85),
    yMax = $derived(Math.max(1 / 3, ...visible.map((p) => p.team)) * 1.15);
  const maxPop = $derived(Math.max(0.001, ...visible.map((p) => p.pop)));

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

  $effect(() => {
    const id = data.snapshotId,
      key = pair?.key;
    attempt;
    context = undefined;
    error = '';
    if (!key) return;
    const controller = new AbortController();
    cmGet<Contexts>(snapshotPath(id, 'characters/' + key.replace(':', '-')), controller.signal, id)
      .then((value) => {
        if (!controller.signal.aborted) context = value;
      })
      .catch((e) => {
        if (!controller.signal.aborted) error = e.message;
      });
    return () => controller.abort();
  });
</script>

<div class="uma-views">
  <Tabs
    compact
    label="Uma data display"
    items={[
      { id: 'overview', label: 'Overview' },
      { id: 'field', label: 'Running-style table' },
      { id: 'ranking', label: 'Performance ranges' }
    ]}
    bind:value={view}
    variant="pills"
  />
</div>
<div hidden={view !== 'overview'}>
  <div class="uma-grid">
    <aside class="roster">
      <ChartFrame
        plain
        surface
        id="cm-uma-breakdown"
        title="Uma Breakdown"
        description="Select a runner to connect its results, role, and team compositions."
      >
        {#snippet titleActions()}
          <SegmentedControl
            compact
            label="Uma breakdown ordering"
            value={sort}
            onchange={(value) => {
              sort = value;
              descending = true;
            }}
            options={[
              { value: 'pop', label: 'Most used' },
              { value: 'winRate', label: 'Top win%' }
            ]}
          />
        {/snippet}
        <TextField
          id="cm-uma-search"
          type="search"
          label="Find an Uma"
          placeholder="Name, outfit, or card ID"
          prefixIcon="search"
          bind:value={search}
        />
        <div class="row-head">
          <button onclick={() => order('name')}>
            Uma · style {sort === 'name' ? (descending ? '↓' : '↑') : '↕'}
          </button>
          <button onclick={() => order('winRate')}>
            Win% {sort === 'winRate' ? (descending ? '↓' : '↑') : '↕'}
          </button>
          <button onclick={() => order('team')}>
            Team% {sort === 'team' ? (descending ? '↓' : '↑') : '↕'}
          </button>
        </div>
        <div class="breakdown-scroll">
          <div
            class="breakdown-list"
            use:virtualScroll={{
              items: breakdownRows,
              key: (p) => p.key,
              root: 'closest',
              estimate: 68,
              searchText: (p) => p.name + ' ' + p.outfit + ' ' + styleNames[p.style],
              onrange: (r) => (range = r)
            }}
          >
            {#each breakdownRows.slice(range.start, range.end) as p, index (p.key)}
              <button
                data-virtual-index={range.start + index}
                class="uma-row"
                aria-pressed={pair?.key === p.key}
                class:active={pair?.key === p.key}
                onclick={() => (selected = p.key)}
              >
                <Artwork
                  src={portrait(p.card)}
                  alt=""
                  size="sm"
                />
                <span class="name">
                  {p.name}
                  <small style:color={colors[p.style] ?? '#69b7ee'}>
                    {styleNames[p.style]} · {p.outfit}
                  </small>
                  <small class="player-count">
                    {number(p.owners)} players · {pct(p.pop)} field
                  </small>
                  <i class="usage-track">
                    <i
                      style:width={(p.pop / maxPop) * 100 + '%'}
                      style:background={colors[p.style]}
                    ></i>
                  </i>
                </span>
                <strong>{pct(p.individual)}</strong>
                <span class="owners">{pct(p.team)}</span>
              </button>
            {/each}
          </div>
        </div>
        {#if !sorted.length}
          <p>No Umas match this search.</p>
          <Button
            variant="secondary"
            size="sm"
            onclick={() => (search = '')}
          >
            Clear search
          </Button>
        {/if}
      </ChartFrame>
    </aside>
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
                  onselect={() => (selected = p.key)}
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
  </div>
  <ChartFrame
    plain
    surface
    compact
    id="cm-synergy"
    title="Teams with this Uma"
  >
    {#snippet actions()}
      <SelectField
        hideLabel
        id="cm-synergy-uma"
        label="Uma and style"
        value={pair?.key ?? ''}
        onchange={(value) => (selected = value)}
        options={[...data.pairs]
          .sort((a, b) => b.owners - a.owners)
          .map((p) => ({
            value: p.key,
            label: p.name + ' · ' + p.outfit + ' · ' + styleNames[p.style]
          }))}
      />
    {/snippet}
    {#if error}
      <p role="alert">
        {error}
        <Button
          size="sm"
          variant="secondary"
          onclick={() => attempt++}
        >
          Retry
        </Button>
      </p>
    {:else if context}
      <CmComposition
        rows={context.rows.filter((r) => r.owners >= 5)}
        {colors}
        onselect={(row) => onteams(compositionQuery(row.key, pair))}
      />
    {:else}
      <Spinner
        size={40}
        centered
        minHeight="clamp(280px, 50dvh, 540px)"
        label="Loading composition data…"
      />
    {/if}
  </ChartFrame>
</div>
{#if view !== 'overview'}
  <CmFieldExplorer
    {data}
    {colors}
    {colorblind}
    {view}
    bind:selected
    onfind={onteams}
  />
{/if}

<style>
  @import './cm-uma.css';
</style>
