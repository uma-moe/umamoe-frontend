<script lang="ts">
  import ContentAd from '@/layouts/ads/ContentAd.svelte';
  import { virtualScroll, type VirtualRange } from '@/lib/virtual-scroll';
  import { onMount } from 'svelte';
  import AppPage from '@/layouts/AppPage.svelte';
  import Icon from '@/components/Icon.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import Button from '@/components/controls/Button.svelte';
  import LeaderboardRow from '@/components/data/LeaderboardRow.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import Tabs from '@/components/navigation/Tabs.svelte';
  import { communityRepository } from '@/pages/clubs/community-repository';
  import type { PagedResult, RankingTab, TrainerRanking } from '@/pages/clubs/community-types';
  import RankingsFilters from './RankingsFilters.svelte';
  import RankingsPaginator from './RankingsPaginator.svelte';
  import { pageSizeOptions, rankingYears } from './rankings-options';

  const today = new Date();

  let tab = $state<RankingTab>('monthly');
  let result = $state<PagedResult<TrainerRanking>>();
  let virtualRange = $state<VirtualRange>({ start: 0, end: 0 });
  let loading = $state(true);
  let error = $state('');
  let search = $state('');
  let committedSearch = $state('');
  let month = $state(String(today.getMonth() + 1));
  let year = $state(String(today.getFullYear()));
  let alltimeSort = $state('avg_month');
  let gainsSort = $state('gain_30d');
  let page = $state(1);
  let pageSize = $state('100');

  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  let requestId = 0;
  const years = rankingYears(today);

  async function load(refresh = false): Promise<void> {
    const request = ++requestId;
    loading = true;
    error = '';
    result = undefined;
    try {
      const loaded = await communityRepository.rankings(
        {
          tab,
          page: page - 1,
          pageSize: Number(pageSize),
          query: committedSearch || undefined,
          month: Number(month),
          year: Number(year),
          sortBy: tab === 'alltime' ? alltimeSort : tab === 'gains' ? gainsSort : undefined
        },
        refresh
      );

      if (request === requestId) result = loaded;
    } catch (reason) {
      if (request === requestId)
        error = reason instanceof Error ? reason.message : 'The rankings could not be loaded.';
    } finally {
      if (request === requestId) loading = false;
    }
  }

  function readQuery(): void {
    if (searchTimer) clearTimeout(searchTimer);
    const query = new URLSearchParams(location.search);
    const requestedTab = query.get('tab');
    tab = requestedTab === 'alltime' || requestedTab === 'gains' ? requestedTab : 'monthly';
    page = Math.max(1, Number(query.get('page') ?? 0) + 1);
    pageSize = pageSizeOptions.some((option) => option.value === query.get('pageSize'))
      ? query.get('pageSize')!
      : '100';
    search = query.get('query') ?? '';
    committedSearch = search;
    const requestedMonth = Number(query.get('month'));
    if (requestedMonth >= 1 && requestedMonth <= 12) month = String(requestedMonth);
    const requestedYear = Number(query.get('year'));
    if (years.some((option) => Number(option.value) === requestedYear))
      year = String(requestedYear);
    const requestedSort = query.get('sortBy');
    if (
      requestedSort &&
      ['total_fans', 'total_gain', 'avg_day', 'avg_week', 'avg_month'].includes(requestedSort)
    )
      alltimeSort = requestedSort;
    if (requestedSort && ['gain_3d', 'gain_7d', 'gain_30d'].includes(requestedSort))
      gainsSort = requestedSort;
  }

  function writeQuery(push = true): void {
    const url = new URL(location.href);
    const set = (key: string, value: string, defaultValue: string) =>
      value === defaultValue ? url.searchParams.delete(key) : url.searchParams.set(key, value);

    set('tab', tab, 'monthly');
    set('page', String(page - 1), '0');
    set('pageSize', pageSize, '100');
    set('query', committedSearch, '');
    if (tab === 'monthly') {
      set('month', month, String(today.getMonth() + 1));
      set('year', year, String(today.getFullYear()));
      url.searchParams.delete('sortBy');
    } else {
      url.searchParams.delete('month');
      url.searchParams.delete('year');
      set(
        'sortBy',
        tab === 'alltime' ? alltimeSort : gainsSort,
        tab === 'alltime' ? 'avg_month' : 'gain_30d'
      );
    }

    const target = `${url.pathname}${url.search}`;
    if (push) history.pushState(history.state, '', target);
    else history.replaceState(history.state, '', target);
  }

  function selectTab(value: string): void {
    tab = value as RankingTab;
    page = 1;
    writeQuery();
    void load();
  }

  function changeFilter(): void {
    page = 1;
    writeQuery();
    void load();
  }

  function clearSearch(): void {
    if (searchTimer) clearTimeout(searchTimer);
    search = '';
    committedSearch = '';
    page = 1;
    writeQuery();
    void load();
  }

  function changeSearch(): void {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      committedSearch = search.trim();
      page = 1;
      writeQuery();
      void load();
    }, 300);
  }

  function onHistory(): void {
    readQuery();
    void load();
  }

  onMount(() => {
    readQuery();
    void load();
    addEventListener('popstate', onHistory);
    return () => {
      if (searchTimer) clearTimeout(searchTimer);
      removeEventListener('popstate', onHistory);
    };
  });
</script>

<svelte:head>
  <title>Trainer Rankings · uma.moe</title>
  <meta
    name="description"
    content="Global Uma Musume trainer fan rankings, recent gains, and all-time performance."
  />
</svelte:head>
<AppPage
  routeId="rankings"
  title="Trainer Rankings"
  description="Global trainer fan rankings monthly, all-time, and recent gains."
  width="wide"
>
  <div class="ranking-tabs">
    <Tabs
      label="Ranking period"
      items={[
        { id: 'monthly', label: 'Monthly', icon: 'calendar' },
        { id: 'alltime', label: 'All-Time', icon: 'trophy' },
        { id: 'gains', label: 'Gains', icon: 'trending-up' }
      ]}
      value={tab}
      onchange={selectTab}
    />
  </div>
  <RankingsFilters
    {tab}
    bind:search
    bind:month
    bind:year
    bind:alltimeSort
    bind:gainsSort
    {years}
    onsearch={changeSearch}
    onfilterchange={changeFilter}
    onclear={clearSearch}
  />
  {#if loading}
    <div class="loading">
      <Spinner size={28} />
      <span>Loading rankings…</span>
    </div>
  {:else if error}
    <Banner
      title="Ranking data unavailable"
      tone="danger"
    >
      <p>{error}</p>
      <Button
        variant="secondary"
        size="sm"
        onclick={() => void load(true)}
      >
        Retry
      </Button>
    </Banner>
  {:else if !result?.items.length}
    <div class="no-results">
      <Icon
        name="search"
        size={42}
      />
      <p>No rankings found.</p>
    </div>
  {:else}
    <ContentAd
      routeId="rankings"
      top
    />
    <section
      use:virtualScroll={{
        items: result.items,
        searchText: (entry) =>
          [
            entry.name,
            entry.viewerId,
            entry.circleName,
            ...entry.stats.map((stat) => stat.value)
          ].join(' '),
        key: (entry) => entry.viewerId,
        estimate: 60,
        onrange: (range) => (virtualRange = range)
      }}
      class="leaderboard"
      aria-label="Trainer ranking results"
    >
      {#each result.items.slice(virtualRange.start, virtualRange.end) as entry, localIndex (entry.viewerId)}
        {@const index = virtualRange.start + localIndex}
        <div data-virtual-index={index}>
          <LeaderboardRow
            rank={entry.rank}
            name={entry.name}
            group={entry.circleId ? entry.circleName || 'Club' : undefined}
            groupHref={entry.circleId ? `/circles/${entry.circleId}` : undefined}
            stats={entry.stats}
          />{#if index % 20 === 19 && index < result.items.length - 1 && index < 60}
            <ContentAd
              routeId="rankings"
              index={2 + Math.floor(index / 20)}
            />
          {/if}
        </div>
      {/each}
    </section>
  {/if}
  <RankingsPaginator
    {page}
    bind:pageSize
    {result}
    onpage={(value) => {
      page = value;
      writeQuery();
      void load();
    }}
    onpagesizechange={changeFilter}
  />
</AppPage>

<style>
  .ranking-tabs :global(.tabs) {
    gap: 4px;
    padding: 4px;
    border-color: var(--tab-bar-border);
    border-radius: 10px;
    background: var(--tab-bar-bg);
  }
  .ranking-tabs :global(.tab) {
    gap: 8px;
    padding: 10px 16px;
    border: 1px solid transparent;
    border-radius: 8px;
    color: var(--tab-btn-color);
    font-size: 0.875rem;
    font-weight: 500;
    box-shadow: none;
  }
  .ranking-tabs :global(.tab:hover) {
    background: var(--tab-btn-hover-bg);
    color: var(--text-primary);
  }
  .ranking-tabs :global(.tab.active) {
    background: rgb(255 183 77/0.12);
    color: var(--accent-warning);
    border-color: rgb(255 183 77/0.25);
  }
  .loading,
  .no-results {
    min-height: 220px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
    color: var(--color-text-muted);
  }
  .no-results {
    flex-direction: column;
    gap: 4px;
  }
  .no-results :global(svg) {
    color: var(--text-disabled);
  }
  .no-results p {
    margin: 0;
    color: var(--text-secondary);
  }
  .leaderboard {
    display: grid;
    gap: 6px;
  }
</style>
