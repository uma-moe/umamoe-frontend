<script lang="ts">
  import { tick } from 'svelte';
  import Artwork from '@/components/game/Artwork.svelte';
  import Button from '@/components/controls/Button.svelte';
  import IconButton from '@/components/controls/IconButton.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import EmptyState from '@/components/feedback/EmptyState.svelte';
  import { virtualScroll, type VirtualRange } from '@/lib/virtual-scroll';
  import type { Requirement, Summary } from '../../hakuraku-types';
  import { pct, number, styleNames, styleOrder } from '../cm-data';
  import { portrait } from '../../analysis-view';
  import { fieldRows, percentagePoints } from '../cm-exploration';

  let {
    data,
    colors,
    colorblind = false,
    view = 'field',
    selected = $bindable(''),
    scope = $bindable('all'),
    onfind
  }: {
    data: Summary;
    colors: Record<number, string>;
    colorblind?: boolean;
    view: string;
    selected?: string;
    scope?: string;
    onfind: (slots: Requirement[]) => void;
  } = $props();

  let search = $state(''),
    minimum = $state('20'),
    metric = $state('team'),
    sort = $state('share'),
    descending = $state(true),
    range = $state<VirtualRange>({ start: 0, end: 0 });

  let inspector = $state<HTMLElement>(),
    canvas = $state<HTMLElement>();

  const scopedPairs = $derived(
    data.pairs.filter((p) => scope === 'all' || p.style === Number(scope))
  );

  const visibleStyles = $derived(scope === 'all' ? styleOrder : [Number(scope)]);
  const rows = $derived(
    fieldRows(scopedPairs, Number(minimum), search).sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name) * (descending ? -1 : 1);
      if (sort === 'share') return (a.share - b.share) * (descending ? -1 : 1);
      const av = a.cells.get(Number(sort)),
        bv = b.cells.get(Number(sort));

      if (!av || !bv) return av ? -1 : bv ? 1 : 0;
      return (
        ((metric === 'team' ? av.team : av.individual) -
          (metric === 'team' ? bv.team : bv.individual)) *
        (descending ? -1 : 1)
      );
    })
  );

  function order(key: string) {
    descending = sort === key ? !descending : key !== 'name';
    sort = key;
  }

  function resetFilters() {
    search = '';
    minimum = '1';
  }

  const ranked = $derived(
    scopedPairs
      .filter(
        (p) =>
          p.owners >= Number(minimum) &&
          (p.name + ' ' + p.outfit + ' ' + p.card).toLowerCase().includes(search.toLowerCase())
      )
      .sort((a, b) =>
        metric === 'team' ? b.teamCI[0] - a.teamCI[0] : b.individualCI[0] - a.individualCI[0]
      )
  );

  const current = $derived(scopedPairs.find((p) => p.key === selected));
  const baseline = $derived(metric === 'team' ? 1 / 3 : 1 / 9);
  const axisMax = $derived(
    Math.max(
      baseline * 1.25,
      ...ranked.map((p) => (metric === 'team' ? p.teamCI : p.individualCI)[1])
    ) * 1.04
  );

  const maxPop = $derived(Math.max(0.001, ...data.pairs.map((p) => p.pop)));
  const positive = $derived(colorblind ? 'var(--accent-primary)' : 'var(--accent-secondary)');
  const negative = $derived(colorblind ? 'var(--accent-purple)' : 'var(--accent-error)');

  const cellColor = (rate: number, neutral: number) =>
    'color-mix(in srgb, ' +
    (rate >= neutral ? positive : negative) +
    ' ' +
    Math.min(46, 8 + Math.abs(rate - neutral) * 100) +
    '%, transparent)';

  async function inspect(key: string) {
    selected = key;
    await tick();
    if (matchMedia('(max-width:1000px)').matches)
      inspector?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }
</script>

<div
  class="explorer"
  class:inspecting={!!current}
  class:scoped={scope !== 'all'}
  style:--map-positive={positive}
  style:--map-negative={negative}
>
  <section
    class="canvas"
    bind:this={canvas}
  >
    <h2>{view === 'field' ? 'Results by running style' : 'Uma performance ranges'}</h2>
    <div class="filters">
      <TextField
        id="trial-uma-search"
        type="search"
        label="Find an Uma"
        placeholder="Name, outfit, or ID"
        prefixIcon="search"
        bind:value={search}
      /><SelectField
        id="uma-map-style"
        label="Running style"
        bind:value={scope}
        options={[
          { value: 'all', label: 'All styles' },
          ...styleOrder.map((id) => ({ value: String(id), label: styleNames[id]! }))
        ]}
      /><SelectField
        id="trial-metric"
        label="Show performance"
        bind:value={metric}
        options={[
          { value: 'team', label: 'Associated team win rate' },
          { value: 'individual', label: 'Individual win rate' }
        ]}
      /><SelectField
        id="trial-sample"
        label="Minimum players per role"
        bind:value={minimum}
        options={[
          { value: '20', label: '20 players' },
          { value: '50', label: '50 players' },
          { value: '5', label: '5 players' },
          { value: '1', label: 'All published results' }
        ]}
      />
    </div>
    {#if view === 'field'}
      <div class="map-key">
        <span>
          <i class="above"></i>
          Above {pct(baseline)} baseline
        </span>
        <span>
          <i class="below"></i>
          Below baseline
        </span>
        <span>Bar = relative popularity in the field</span>
      </div>
      <div class="table-scroll">
        <table
          class="field-map"
          aria-label="Uma role performance map"
        >
          <thead>
            <tr>
              <th
                scope="col"
                aria-sort={sort === 'name' ? (descending ? 'descending' : 'ascending') : 'none'}
              >
                <button
                  class="sort"
                  onclick={() => order('name')}
                >
                  Uma / outfit {sort === 'name' ? (descending ? '↓' : '↑') : '↕'}
                </button>
              </th>
              {#each visibleStyles as id}
                <th
                  scope="col"
                  aria-sort={sort === String(id)
                    ? descending
                      ? 'descending'
                      : 'ascending'
                    : 'none'}
                >
                  <button
                    class="sort"
                    onclick={() => order(String(id))}
                  >
                    <i style:background={colors[id]}></i>
                    {styleNames[id]}
                    {sort === String(id) ? (descending ? '↓' : '↑') : '↕'}
                  </button>
                </th>
              {/each}
            </tr>
          </thead>
          <tbody
            use:virtualScroll={{
              items: rows,
              key: (r) => r.card,
              root: 'closest',
              estimate: 38,
              searchText: (r) => r.name + ' ' + r.outfit,
              onrange: (r) => (range = r)
            }}
          >
            {#each rows.slice(range.start, range.end) as row, index (row.card)}
              <tr data-virtual-index={range.start + index}>
                <th scope="row">
                  <div class="identity">
                    <Artwork
                      src={portrait(row.card)}
                      alt=""
                      size="xs"
                      shape="portrait"
                    />
                    <span>
                      {row.name}
                      <small>{row.outfit}</small>
                    </span>
                  </div>
                </th>
                {#each visibleStyles as id}
                  {@const pair = row.cells.get(id)}
                  <td>
                    {#if pair}
                      {@const value = metric === 'team' ? pair.team : pair.individual}
                      <button
                        class:chosen={current?.key === pair.key}
                        aria-pressed={current?.key === pair.key}
                        aria-label={'Inspect ' +
                          pair.name +
                          ' ' +
                          pair.outfit +
                          ' ' +
                          styleNames[id]}
                        style:background={cellColor(value, baseline)}
                        onclick={() => void inspect(pair.key)}
                      >
                        <strong>{pct(value)}</strong>
                        <small>{number(pair.owners)} players</small>
                        <i
                          class="share"
                          style:width={(pair.pop / maxPop) * 100 + '%'}
                        ></i>
                      </button>
                    {:else}
                      <span
                        class="absent"
                        title="No result meeting the player threshold"
                      >
                        —
                      </span>
                    {/if}
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      {#if !rows.length}
        <EmptyState
          icon="search"
          title="No matching Umas"
          description="Try another name or lower the player threshold."
        >
          {#snippet actions()}
            <Button
              variant="secondary"
              size="sm"
              onclick={resetFilters}
            >
              Reset field filters
            </Button>
          {/snippet}
        </EmptyState>
      {/if}
    {:else}
      <div class="range-axis">
        <span>Uma</span>
        <div>
          <span>0%</span>
          <span>{pct(axisMax / 2)}</span>
          <span>{pct(axisMax)}</span>
        </div>
        <span>Win rate</span>
        <span>Players</span>
      </div>
      <div class="rankings-scroll">
        <div
          class="rankings"
          use:virtualScroll={{
            items: ranked,
            key: (p) => p.key,
            root: 'closest',
            estimate: 40,
            searchText: (p) => p.name + ' ' + p.outfit + ' ' + styleNames[p.style],
            onrange: (r) => (range = r)
          }}
        >
          {#each ranked.slice(range.start, range.end) as pair, index (pair.key)}
            {@const value = metric === 'team' ? pair.team : pair.individual}{@const ci =
              metric === 'team' ? pair.teamCI : pair.individualCI}
            <button
              data-virtual-index={range.start + index}
              class="ranking"
              class:chosen={current?.key === pair.key}
              aria-pressed={current?.key === pair.key}
              aria-label={'Inspect ' + pair.name + ' ' + pair.outfit + ' ' + styleNames[pair.style]}
              onclick={() => void inspect(pair.key)}
            >
              <span class="identity">
                <Artwork
                  src={portrait(pair.card)}
                  alt=""
                  size="xs"
                  shape="portrait"
                />
                <span>
                  {pair.name}
                  <small>{pair.outfit}, {styleNames[pair.style]}</small>
                </span>
              </span>
              <span
                class="range"
                role="img"
                aria-label={pct(ci[0], 2) + ' to ' + pct(ci[1], 2) + ' 95% interval'}
              >
                <i
                  class="neutral"
                  style:left={(baseline / axisMax) * 100 + '%'}
                ></i>
                <i
                  class="interval"
                  style:left={(ci[0] / axisMax) * 100 + '%'}
                  style:width={((ci[1] - ci[0]) / axisMax) * 100 + '%'}
                  style:background={colors[pair.style]}
                ></i>
                <i
                  class="dot"
                  style:left={(value / axisMax) * 100 + '%'}
                  style:background={colors[pair.style]}
                ></i>
              </span>
              <strong>{pct(value)}</strong>
              <small>{number(pair.owners)}</small>
            </button>
          {/each}
        </div>
      </div>
      {#if !ranked.length}
        <EmptyState
          icon="search"
          title="No matching results"
          description="Try another name or lower the player threshold."
        >
          {#snippet actions()}
            <Button
              variant="secondary"
              size="sm"
              onclick={resetFilters}
            >
              Reset ranking filters
            </Button>
          {/snippet}
        </EmptyState>
      {/if}
    {/if}
  </section>
  {#if current}
    <aside
      class="inspector"
      aria-label="Selected Uma insight"
      bind:this={inspector}
    >
      <div class="back-to-chart">
        <Button
          variant="secondary"
          size="sm"
          onclick={() => canvas?.scrollIntoView({ block: 'start', behavior: 'instant' })}
        >
          ← Back to the chart
        </Button>
      </div>
      <div class="inspector-heading">
        <span class="eyebrow">Selected Uma / role</span>
        <IconButton
          icon="close"
          size="sm"
          label="Close Uma details"
          onclick={() => {
            selected = '';
            canvas?.scrollIntoView({ block: 'start', behavior: 'instant' });
          }}
        />
      </div>
      <div class="selected-identity">
        <Artwork
          src={portrait(current.card)}
          alt=""
          size="sm"
          shape="portrait"
        />
        <div>
          <h3>{current.name}</h3>
          <p>{current.outfit}</p>
          <span class="role">
            <i style:background={colors[current.style]}></i>
            {styleNames[current.style]}
          </span>
        </div>
      </div>
      <dl class="readout">
        <div>
          <dt>Associated team win rate</dt>
          <dd>{pct(current.team)}</dd>
          <small>{percentagePoints(current.team - 1 / 3)} from neutral</small>
        </div>
        <div>
          <dt>Individual win rate</dt>
          <dd>{pct(current.individual)}</dd>
          <small>{percentagePoints(current.individual - 1 / 9)} from neutral</small>
        </div>
      </dl>
      <div class="evidence">
        <span>Estimated win ranges</span>
        <p>
          Team <strong>{pct(current.teamCI[0], 2)}–{pct(current.teamCI[1], 2)}</strong>
        </p>
        <p>
          Individual <strong>
            {pct(current.individualCI[0], 2)}–{pct(current.individualCI[1], 2)}
          </strong>
        </p>
        <p>
          Distinct players <strong>{number(current.owners)}</strong>
        </p>
        <p>
          Share of this style <strong>{pct(current.stylePop)}</strong>
        </p>
        <p>
          Share of the whole field <strong>{pct(current.pop)}</strong>
        </p>
      </div>
      <div class="inspector-actions">
        <Button
          size="sm"
          icon="arrow-right"
          onclick={() => onfind([{ card: current.card, style: current.style }, {}, {}])}
        >
          Find captured builds
        </Button>
      </div>
    </aside>
  {/if}
</div>

<style>
  @import './cm-field-explorer.css';
</style>
