<script lang="ts">
  import type { Pair } from '../../hakuraku-types';
  import { pct, number, styleNames } from '../cm-data';
  import { portrait } from '../../analysis-view';
  import { virtualScroll, type VirtualRange } from '@/lib/virtual-scroll';
  import ChartFrame from '@/components/charts/ChartFrame.svelte';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import Artwork from '@/components/game/Artwork.svelte';
  import Button from '@/components/controls/Button.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import EmptyState from '@/components/feedback/EmptyState.svelte';

  interface Props {
    matching: Pair[];
    colors: Record<number, string>;
    pair?: Pair;
    maxPop: number;
    search: string;
    onselect: (key: string) => void;
  }

  let { matching, colors, pair, maxPop, search = $bindable(), onselect }: Props = $props();

  let sort = $state('pop'),
    descending = $state(true),
    range = $state<VirtualRange>({ start: 0, end: 0 });

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
</script>

<aside class="roster">
  <ChartFrame
    plain
    surface
    id="cm-uma-breakdown"
    title="Uma Breakdown"
    description="11.11% win% is average."
    slim
  >
    {#snippet actions()}
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
          items: sorted,
          key: (p) => p.key,
          root: 'closest',
          estimate: 68,
          searchText: (p) => p.name + ' ' + p.outfit + ' ' + styleNames[p.style],
          onrange: (r) => (range = r)
        }}
      >
        {#each sorted.slice(range.start, range.end) as p, index (p.key)}
          <button
            data-virtual-index={range.start + index}
            class="uma-row"
            aria-pressed={pair?.key === p.key}
            class:active={pair?.key === p.key}
            onclick={() => onselect(p.key)}
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
      <EmptyState
        compact
        icon="search"
        title="No matching Umas"
        description="No Umas match this search."
      >
        {#snippet actions()}
          <Button
            variant="secondary"
            size="sm"
            onclick={() => (search = '')}
          >
            Clear search
          </Button>
        {/snippet}
      </EmptyState>
    {/if}
  </ChartFrame>
</aside>

<style>
  @import './cm-uma-roster.css';
</style>
