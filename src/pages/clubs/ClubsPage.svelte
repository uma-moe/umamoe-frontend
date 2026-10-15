<script lang="ts">
  import ContentAd from '@/layouts/ads/ContentAd.svelte';
  import { onMount } from 'svelte';
  import AppPage from '@/layouts/AppPage.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import Icon from '@/components/Icon.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import CircleCard from '@/components/cards/CircleCard.svelte';
  import { virtualScroll, type VirtualRange } from '@/lib/virtual-scroll';
  import { clubPolicyLabels as policyLabels } from '@/lib/clubs/club-display';
  import { communityRepository } from './community-repository';
  import type { ClubQuery, ClubSummary, PagedResult } from './community-types';

  let result = $state<PagedResult<ClubSummary>>();
  let loading = $state(true);
  let refreshing = $state(false);

  let requestId = 0;

  let error = $state('');
  let search = $state('');
  let committedSearch = $state('');
  let searchKey = $state<'query' | 'name'>('query');
  let sortBy = $state('rank');
  let sortOrder = $state<'asc' | 'desc'>('asc');
  let joinStyle = $state('all');
  let openSpots = $state(false);
  let policy = $state('all');
  let page = $state(1);
  let pageSize = $state('100');
  let secondsUntilRefresh = $state(300);

  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  let refreshTimer: ReturnType<typeof setInterval> | undefined;
  const sortOptions = [
    { value: 'rank', label: 'Rank' },
    { value: 'fans', label: 'Total fans' },
    { value: 'daily', label: 'Daily gain' },
    { value: 'name', label: 'Name' },
    { value: 'members', label: 'Members' }
  ];

  const policyOptions = [
    { value: 'all', label: 'All Playstyles' },
    ...Object.entries(policyLabels).map(([value, label]) => ({ value, label }))
  ];

  const pageSizeOptions = [20, 50, 100].map((value) => ({
    value: String(value),
    label: String(value)
  }));

  const isTop100View = $derived(
    !committedSearch && page === 1 && pageSize === '100' && sortBy === 'rank'
  );

  const remoteQuery = $derived<ClubQuery>({
    page: page - 1,
    pageSize: Number(pageSize),
    query: searchKey === 'query' ? committedSearch || undefined : undefined,
    name: searchKey === 'name' ? committedSearch || undefined : undefined,
    sortBy,
    sortOrder
  });

  const visibleClubs = $derived(
    (result?.items ?? []).filter((club) => {
      if (
        joinStyle !== 'all' &&
        club.joinStyle !==
          ({ open: 1, approval: 2, closed: 3 } as const)[
            joinStyle as 'open' | 'approval' | 'closed'
          ]
      )
        return false;
      if (openSpots && club.members >= 30) return false;
      return policy === 'all' || club.policy === Number(policy);
    })
  );

  let virtualRange = $state<VirtualRange>({ start: 0, end: 0 });

  async function load(refresh = false): Promise<void> {
    const id = ++requestId;
    const query = remoteQuery;
    refreshing = refresh && Boolean(result);
    loading = !refreshing;
    if (loading) result = undefined;
    error = '';
    try {
      const value = await communityRepository.clubs(query, refresh);
      if (id !== requestId) return;
      result = value;
      secondsUntilRefresh = communityRepository.clubsRefreshSeconds(query);
    } catch (reason) {
      if (id === requestId)
        error = reason instanceof Error ? reason.message : 'The club database could not be loaded.';
    } finally {
      if (id === requestId) {
        loading = false;
        refreshing = false;
      }
    }
  }

  function readQuery(): void {
    const query = new URLSearchParams(location.search);
    const requestedPage = Number(query.get('page') ?? 0);
    page = Number.isSafeInteger(requestedPage) && requestedPage >= 0 ? requestedPage + 1 : 1;
    pageSize = pageSizeOptions.some((option) => option.value === query.get('pageSize'))
      ? query.get('pageSize')!
      : '100';
    search = query.get('query') || query.get('name') || '';
    committedSearch = search;
    searchKey = !query.get('query') && query.get('name') ? 'name' : 'query';
    const requestedSort = query.get('sortBy');
    sortBy =
      requestedSort && sortOptions.some((option) => option.value === requestedSort)
        ? requestedSort
        : 'rank';
    sortOrder = query.get('sortOrder') === 'desc' ? 'desc' : 'asc';
    const requestedJoin = query.get('joinStyle');
    joinStyle =
      requestedJoin && ['open', 'approval', 'closed'].includes(requestedJoin)
        ? requestedJoin
        : 'all';
    openSpots = query.get('hasSpots') === 'true';
    policy = /^\d+$/.test(query.get('policy') ?? '') ? query.get('policy')! : 'all';
  }

  function writeQuery(push = true): void {
    const url = new URL(location.href);
    const set = (key: string, value: string, defaultValue: string) =>
      value === defaultValue ? url.searchParams.delete(key) : url.searchParams.set(key, value);

    set('name', searchKey === 'name' ? committedSearch : '', '');
    set('page', String(page - 1), '0');
    set('pageSize', pageSize, '100');
    set('query', searchKey === 'query' ? committedSearch : '', '');
    set('sortBy', sortBy, 'rank');
    set('sortOrder', sortOrder, 'asc');
    set('joinStyle', joinStyle, 'all');
    set('hasSpots', String(openSpots), 'false');
    set('policy', policy, 'all');
    const target = `${url.pathname}${url.search}`;
    if (push) history.pushState(history.state, '', target);
    else history.replaceState(history.state, '', target);
  }

  function changeSearch(): void {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      committedSearch = search.trim();
      searchKey = 'query';
      changeRemoteFilter();
    }, 300);
  }

  function changeRemoteFilter(): void {
    page = 1;
    writeQuery();
    void load();
  }

  function clearFilters(): void {
    if (searchTimer) clearTimeout(searchTimer);
    search = '';
    committedSearch = '';
    searchKey = 'query';
    sortBy = 'rank';
    sortOrder = 'asc';
    joinStyle = 'all';
    openSpots = false;
    policy = 'all';
    pageSize = '100';
    changeRemoteFilter();
  }

  function formatCountdown(value: number): string {
    return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
  }

  function tickRefresh(): void {
    if (!isTop100View || loading || refreshing || error) return;
    secondsUntilRefresh = communityRepository.clubsRefreshSeconds(remoteQuery);
    if (secondsUntilRefresh <= 0) void load(true);
  }

  function onHistory(): void {
    if (searchTimer) clearTimeout(searchTimer);
    readQuery();
    void load();
  }

  onMount(() => {
    readQuery();
    void load();
    refreshTimer = setInterval(tickRefresh, 1000);
    addEventListener('popstate', onHistory);
    return () => {
      requestId++;
      if (searchTimer) clearTimeout(searchTimer);
      if (refreshTimer) clearInterval(refreshTimer);
      removeEventListener('popstate', onHistory);
    };
  });
</script>

<svelte:head>
  <title>Clubs · uma.moe</title>
  <meta
    name="description"
    content="Search Uma Musume clubs, ranks, fan progression, and recruitment status."
  />
</svelte:head>
<AppPage
  routeId="clubs"
  title="Club Leaderboard"
  description="Find and compare Umamusume clubs."
  tone="brand"
  width="wide"
>
  <section
    class="filters-container"
    aria-label="Club filters"
  >
    <div class="search-row">
      <TextField
        id="club-search"
        label="Search clubs"
        hideLabel
        type="search"
        suffixIcon="search"
        placeholder="Search clubs"
        bind:value={search}
        oninput={changeSearch}
      />
      <div class="filter-dropdown">
        <SelectField
          id="club-policy"
          label="Playstyle"
          hideLabel
          prefixIcon="gamepad"
          options={policyOptions}
          bind:value={policy}
          onchange={changeRemoteFilter}
        />
      </div>
    </div>
    <div class="filter-bar">
      <div
        class="filter-chips"
        aria-label="Join style"
      >
        <button
          class="filter-chip chip-open"
          class:active={joinStyle === 'open'}
          aria-pressed={joinStyle === 'open'}
          type="button"
          onclick={() => {
            joinStyle = joinStyle === 'open' ? 'all' : 'open';
            changeRemoteFilter();
          }}
        >
          <Icon
            name="lock-open"
            size={15}
          />Open
        </button>
        <button
          class="filter-chip chip-approval"
          class:active={joinStyle === 'approval'}
          aria-pressed={joinStyle === 'approval'}
          type="button"
          onclick={() => {
            joinStyle = joinStyle === 'approval' ? 'all' : 'approval';
            changeRemoteFilter();
          }}
        >
          <Icon
            name="hourglass"
            size={15}
          />Approval
        </button>
        <button
          class="filter-chip chip-closed"
          class:active={joinStyle === 'closed'}
          aria-pressed={joinStyle === 'closed'}
          type="button"
          onclick={() => {
            joinStyle = joinStyle === 'closed' ? 'all' : 'closed';
            changeRemoteFilter();
          }}
        >
          <Icon
            name="lock"
            size={15}
          />Closed
        </button>
        <button
          class="filter-chip toggle-chip"
          class:active={openSpots}
          aria-pressed={openSpots}
          type="button"
          onclick={() => {
            openSpots = !openSpots;
            changeRemoteFilter();
          }}
        >
          <Icon
            name="users-add"
            size={15}
          />Has Spots
        </button>
      </div>
    </div>
  </section>

  <div class="results-toolbar">
    <span class="results-heading">
      {loading
        ? 'Finding clubs…'
        : `${visibleClubs.length} clubs${joinStyle !== 'all' || openSpots || policy !== 'all' ? ` · ${result?.items.length ?? 0} on this page` : ''}`}
    </span>
    {#if search || joinStyle !== 'all' || openSpots || policy !== 'all' || sortBy !== 'rank' || sortOrder !== 'asc'}
      <Button
        variant="ghost"
        size="sm"
        icon="close"
        onclick={clearFilters}
      >
        Clear
      </Button>
    {/if}
    {#if isTop100View}
      <div class="live-refresh-bar">
        <span class="live-dot"></span>
        <strong>Live</strong>
        <span class:refreshing>
          {refreshing ? 'Updating…' : `Next update in ${formatCountdown(secondsUntilRefresh)}`}
        </span>
        <button
          class:refreshing
          type="button"
          title="Update now"
          aria-label="Update now"
          onclick={() => void load(true)}
          disabled={loading || refreshing}
        >
          <Icon
            name="refresh"
            size={16}
          />
        </button>
      </div>
    {/if}
  </div>
  {#if error}
    <Banner
      title="Club data unavailable"
      tone="danger"
    >
      <p>{error}</p>
      {#if result}
        <p>Showing the last successful update.</p>
      {/if}<Button
        variant="secondary"
        size="sm"
        onclick={() => void load(true)}
      >
        Retry
      </Button>
    </Banner>
  {/if}
  {#if loading}
    <div class="loading">
      <Spinner size={28} />
      <span>Loading clubs…</span>
    </div>
  {:else if !error && visibleClubs.length === 0}
    <div class="no-results">
      <Icon
        name="search"
        size={42}
      />
      <p>No clubs match your filters.</p>
      <Button
        variant="secondary"
        size="sm"
        onclick={clearFilters}
      >
        Clear all filters
      </Button>
    </div>
  {:else if visibleClubs.length}
    <ContentAd
      routeId="clubs"
      top
    />
    <section
      use:virtualScroll={{
        items: visibleClubs,
        searchText: (club) =>
          [
            club.name,
            club.circleId,
            club.leaderName,
            club.comment,
            club.monthlyFans,
            club.monthlyFans.toLocaleString()
          ].join(' '),
        key: (club) => club.circleId,
        estimate: 120,
        onrange: (range) => (virtualRange = range)
      }}
      class="club-list"
      aria-label="Club results"
    >
      {#each visibleClubs.slice(virtualRange.start, virtualRange.end) as club, localIndex (club.circleId)}
        {@const index = virtualRange.start + localIndex}
        <div data-virtual-index={index}>
          <CircleCard circle={club} />
          {#if index % 20 === 19 && index < visibleClubs.length - 1 && index < 60}
            <ContentAd
              routeId="clubs"
              index={2 + Math.floor(index / 20)}
            />
          {/if}
        </div>
      {/each}
    </section>
  {/if}
  <div class="mat-paginator">
    <span>Items per page:</span>
    <SelectField
      id="club-page-size"
      label="Items per page"
      hideLabel
      options={pageSizeOptions}
      bind:value={pageSize}
      onchange={changeRemoteFilter}
    />
    <strong>
      {result?.total
        ? `${(page - 1) * Number(pageSize) + 1}–${Math.min(page * Number(pageSize), result.total)} of ${result.total}`
        : '0 of 0'}
    </strong>
    <button
      type="button"
      aria-label="Previous page"
      disabled={page <= 1}
      onclick={() => {
        page -= 1;
        writeQuery();
        void load();
      }}
    >
      <Icon
        name="chevron"
        size={17}
      />
    </button>
    <button
      class="next"
      type="button"
      aria-label="Next page"
      disabled={page >= (result?.totalPages ?? 1)}
      onclick={() => {
        page += 1;
        writeQuery();
        void load();
      }}
    >
      <Icon
        name="chevron"
        size={17}
      />
    </button>
  </div>
</AppPage>

<style>
  @import './clubs-page.css';
</style>
