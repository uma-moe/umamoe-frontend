<script lang="ts">
  import type { ChartDatum } from '@/lib/statistics/statistics';
  import ChartFrame from '@/components/charts/ChartFrame.svelte';
  import MetricBar from '@/components/data/MetricBar.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Icon from '@/components/Icon.svelte';
  import Tooltip from '@/components/overlays/Tooltip.svelte';
  import { virtualScroll, type VirtualRange } from '@/lib/virtual-scroll';

  interface Props {
    id: string;
    title: string;
    description: string;
    items: Array<ChartDatum & { detail?: string }>;
    searchable?: boolean;
    query?: string;
    searchLabel?: string;
    limit?: number;
    onselect?: (id: string) => void;
    onmore?: () => void;
    moreLabel?: string;
  }

  let {
    id,
    title,
    description,
    items,
    searchable = false,
    query = $bindable(''),
    searchLabel = 'Search by name or ID',
    limit = 20,
    onselect,
    onmore,
    moreLabel = 'Explore all'
  }: Props = $props();

  let sort = $state('usage');
  let virtualRange = $state<VirtualRange>({ start: 0, end: 0 });

  const matching = $derived(
    items
      .map((item, index) => ({ ...item, rank: index + 1 }))
      .filter((item) =>
        [item.name, item.id, item.detail]
          .join(' ')
          .toLowerCase()
          .includes(query.trim().toLowerCase())
      )
      .sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : a.rank - b.rank))
  );
  const listed = $derived(searchable ? matching : matching.slice(0, limit));
  const largestShare = $derived(Math.max(1, ...items.map((item) => item.percentage ?? 0)));
  const help = $derived(description + ' Bar lengths are relative to the leading result.');

  const statIcon = (type: string) =>
    ['wiz', 'wisdom', 'intelligence'].includes(type) ? 'wit' : type;
</script>

<div
  class="ranking"
  class:selectable={Boolean(onselect)}
>
  <ChartFrame
    {id}
    {title}
  >
    {#snippet titleActions()}
      <Tooltip
        text={help}
        position="bottom"
      >
        <button
          type="button"
          class="ranking-info"
          aria-label={'About ' + title + '. ' + help}
        >
          <Icon
            name="info"
            size={13}
          />
        </button>
      </Tooltip>
    {/snippet}
    {#snippet actions()}
      {#if onmore}
        <Button
          variant="secondary"
          size="sm"
          onclick={onmore}
        >
          <span class="panel-action">
            {moreLabel}<Icon
              name="arrow-right"
              size={13}
            />
          </span>
        </Button>
      {/if}
    {/snippet}
    {#if searchable}
      <div class="ranking-tools">
        <TextField
          id={id + '-search'}
          type="search"
          label={searchLabel}
          hideLabel
          placeholder={searchLabel}
          prefixIcon="search"
          bind:value={query}
        />
        <label class="sort">
          <span class="sr-only">Sort {title}</span>
          <select bind:value={sort}>
            <option value="usage">Most used</option>
            <option value="name">Name A–Z</option>
          </select>
        </label>
      </div>
    {/if}
    {#if matching.length}
      <div
        class="column-labels"
        aria-hidden="true"
      >
        <span>{items[0]?.composition ? 'Deck composition' : 'Name'}</span>
        <span class="numeric-labels">
          <span>Uses</span>
          <span>Share</span>
        </span>
      </div>
      <ol
        aria-label={title}
        use:virtualScroll={{
          items: listed,
          searchText: (item) =>
            [item.name, item.id, item.detail, item.value, item.value.toLocaleString()].join(' '),
          key: (item) => item.id,
          estimate: 48,
          onrange: (range) => (virtualRange = range)
        }}
      >
        {#each listed.slice(virtualRange.start, virtualRange.end) as item, index (item.id)}
          <li
            data-virtual-index={virtualRange.start + index}
            aria-posinset={virtualRange.start + index + 1}
            aria-setsize={listed.length}
          >
            {#snippet row()}
              <span class="rank">{item.rank.toString().padStart(2, '0')}</span>
              {#if item.image}
                <img
                  class="portrait"
                  src={item.image}
                  alt=""
                  width="44"
                  height="44"
                  loading="lazy"
                />
              {/if}
              <span class="identity">
                {#if item.composition}
                  <span
                    class="deck"
                    aria-label={item.name}
                  >
                    {#each Object.entries(item.composition) as [type, count]}
                      {#each Array(Math.min(6, Math.max(0, Math.floor(count)))) as _}
                        {#if type === 'friend' || type === 'group'}
                          <span
                            class="support-symbol"
                            class:group={type === 'group'}
                            role="img"
                            aria-label={type}
                          >
                            <Icon
                              name={type === 'friend' ? 'user' : 'community'}
                              size={18}
                            />
                          </span>
                        {:else}
                          <img
                            src={'/assets/images/icon/stats/' + statIcon(type) + '.webp'}
                            alt={type}
                            width="24"
                            height="24"
                            loading="lazy"
                          />
                        {/if}
                      {/each}
                    {/each}
                  </span>
                  <small title={item.name}>{item.name}</small>
                {:else}
                  <strong>{item.name}</strong>
                  {#if item.detail}
                    <small title={item.detail}>{item.detail}</small>
                  {/if}
                {/if}
              </span>
              <span class="usage">
                <span class="count">{item.value.toLocaleString()}</span>
                <MetricBar
                  value={Number((item.percentage ?? 0).toFixed(1))}
                  max={largestShare}
                  compact
                />
              </span>
              {#if onselect}
                <span class="arrow">
                  <Icon
                    name="arrow-right"
                    size={16}
                  />
                </span>
              {/if}
            {/snippet}
            {#if onselect}
              <button
                class="ranking-row"
                aria-label={'Analyze ' + item.name}
                onclick={() => onselect?.(item.id)}
              >
                {@render row()}
              </button>
            {:else}
              <div class="ranking-row">{@render row()}</div>
            {/if}
          </li>
        {/each}
      </ol>
      {#if searchable}
        <div class="ranking-footer"><span>{matching.length} results</span></div>
      {/if}
    {:else}
      <div class="ranking-empty">
        <Icon
          name={query ? 'search' : 'chart'}
          size={26}
        />
        <strong>{query ? 'No matches found' : 'No data available'}</strong>
        <p>
          {query
            ? 'Try a different name or ID.'
            : 'Try a broader selection or a different dataset.'}
        </p>
        {#if query}
          <Button
            variant="ghost"
            size="sm"
            onclick={() => (query = '')}
          >
            Clear search
          </Button>
        {/if}
      </div>
    {/if}
  </ChartFrame>
</div>

<style>
  @import './statistics-ranking.css';
</style>
