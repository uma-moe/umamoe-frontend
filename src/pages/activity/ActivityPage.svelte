<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { router } from '@/routes/router';
  import type { ActivityHall, ActivityReport, ActivitySort } from '@/lib/activity/activity-types';
  import { buildEvidenceGroups } from '@/lib/activity/activity';
  import AppPage from '@/layouts/AppPage.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import Button from '@/components/controls/Button.svelte';
  import EmptyState from '@/components/feedback/EmptyState.svelte';
  import Icon from '@/components/Icon.svelte';
  import Pagination from '@/components/navigation/Pagination.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import { activityRepository } from './activity-repository';
  import { pageSizeOptions, readActivityQuery, writeActivityQuery } from './activity-query';
  import ActivityFilters from './ActivityFilters.svelte';
  import ActivityHallList from './ActivityHallList.svelte';
  import ActivityReportSummary from './report/ActivityReportSummary.svelte';
  import ActivityReportSignals from './report/ActivityReportSignals.svelte';
  import ActivityReportPatterns from './report/ActivityReportPatterns.svelte';
  import ActivityReportRecords from './report/ActivityReportRecords.svelte';

  let hall = $state<ActivityHall>();
  let report = $state<ActivityReport>();
  let loading = $state(true);
  let error = $state('');
  let search = $state('');
  let committedSearch = $state('');
  let sortBy = $state<ActivitySort>('score');
  let minDays = $state('1');
  let minScore = $state('0');
  let page = $state(1);
  let pageSize = $state('50');

  let searchTimer: ReturnType<typeof setTimeout> | undefined;

  let expandedEvidence = $state(new Set<string>());
  let expandedSnapshots = $state(new Set<number>());

  const viewerId = $derived(Number(router.route.params.viewerId || 0));
  const score = $derived(report?.score);

  function readQuery(): void {
    const query = readActivityQuery(location.search);
    page = query.page;
    pageSize = query.pageSize;
    search = query.search;
    committedSearch = search;
    sortBy = query.sortBy;
    minScore = query.minScore;
    minDays = query.minDays;
  }

  function writeQuery(): void {
    writeActivityQuery({ page, pageSize, search: committedSearch, sortBy, minScore, minDays });
  }

  let initialized = $state(false);

  let loadGeneration = 0;

  async function load(refresh = false): Promise<void> {
    const request = ++loadGeneration;
    const requestedViewer = viewerId;
    loading = true;
    error = '';
    try {
      if (requestedViewer) {
        const result = await activityRepository.report(requestedViewer, refresh);
        if (request !== loadGeneration) return;
        report = result;
        const groups = report.score
          ? buildEvidenceGroups(report.score.evidence?.reasons ?? [])
          : [];

        expandedEvidence = new Set(groups[0] ? [groups[0].key] : []);
        expandedSnapshots = new Set(
          report.short_career_snapshots?.[0] ? [report.short_career_snapshots[0].snapshot_id] : []
        );
      } else {
        const result = await activityRepository.hall(
          {
            page: page - 1,
            limit: Number(pageSize),
            query: committedSearch || undefined,
            sortBy,
            minScore: Number(minScore),
            minDays: Number(minDays)
          },
          refresh
        );

        if (request !== loadGeneration) return;
        hall = result;
      }
    } catch (reason) {
      if (request === loadGeneration)
        error =
          reason instanceof Error
            ? reason.message
            : `Could not load ${requestedViewer ? 'this viewer report' : 'suspicion scores'}.`;
    } finally {
      if (request === loadGeneration) loading = false;
    }
  }

  function applyFilters(): void {
    page = 1;
    writeQuery();
    void load();
  }

  function changeSearch(): void {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      committedSearch = search.trim();
      applyFilters();
    }, 300);
  }

  function clearFilters(): void {
    search = '';
    committedSearch = '';
    sortBy = 'score';
    minDays = '1';
    minScore = '0';
    applyFilters();
  }

  onMount(() => {
    initialized = true;
    return () => {
      loadGeneration++;
      if (searchTimer) clearTimeout(searchTimer);
    };
  });

  $effect(() => {
    viewerId;
    if (initialized)
      untrack(() => {
        if (searchTimer) clearTimeout(searchTimer);
        readQuery();
        void load();
      });
  });
</script>

<svelte:head>
  <title>{viewerId ? `Activity report ${viewerId}` : 'Activity Reports'} · uma.moe</title>
  <meta
    name="description"
    content="Reconstructed activity signals for accounts observed in top Uma Musume clubs."
  />
</svelte:head>
<AppPage
  routeId="activity"
  title="Top 100 Club Activity Reports"
  description="Search observed trainers and compare activity across Top 100 clubs."
  width="wide"
>
  {#if viewerId}
    {#snippet actions()}
      <Button
        href={`/activity${typeof window === 'undefined' ? '' : window.location.search}`}
        variant="secondary"
        icon="back"
      >
        Back to activity reports
      </Button>
    {/snippet}
  {/if}
  <Banner
    title="Limited snapshot reconstruction"
    tone="info"
  >
    <p>
      Based on periodic club snapshots, including accounts with zero scores. Scores show unusual
      activity, not proof of botting. Even 99/100 can reflect an outlier.
    </p>
  </Banner>
  {#if !viewerId}
    <ActivityFilters
      bind:search
      {committedSearch}
      bind:sortBy
      bind:minDays
      bind:minScore
      onsearch={changeSearch}
      onapply={applyFilters}
      onclear={clearFilters}
    />
  {/if}
  {#if loading}
    <Spinner
      centered
      minHeight="260px"
      label={viewerId ? 'Loading viewer report…' : 'Loading suspicion scores…'}
    />
  {:else if error}
    <section
      class="error-state"
      role="alert"
    >
      <Icon name="warning" />
      <p>{error}</p>
      <Button
        variant="secondary"
        size="sm"
        onclick={() => load(true)}
      >
        Retry
      </Button>
    </section>
  {:else if viewerId && score}
    <ActivityReportSummary {score} />

    <ActivityReportSignals
      {score}
      bind:expandedEvidence
    />

    <ActivityReportPatterns
      report={report!}
      {score}
    />

    <ActivityReportRecords
      report={report!}
      {score}
      bind:expandedSnapshots
    />
  {:else if viewerId}
    <EmptyState
      icon="activity"
      title={`No suspicion score exists for viewer ID ${viewerId}.`}
      description="This viewer is not present in the retained Top 100 snapshot history."
    />
  {:else}
    {#if !hall?.entries.length}
      <EmptyState
        icon="search"
        title="No matching suspicion score data found."
        description="Try lowering the score or observation threshold."
      />
    {:else}
      <ActivityHallList
        {hall}
        {page}
      />
    {/if}
  {/if}
  {#if !viewerId && !loading}
    <footer class="pager">
      <label>
        Items per page: <SelectField
          id="activity-page-size"
          label="Items per page"
          hideLabel
          options={pageSizeOptions}
          bind:value={pageSize}
          onchange={applyFilters}
        />
      </label>
      <span>
        {hall?.total
          ? `${(page - 1) * hall.limit + 1}–${Math.min(page * hall.limit, hall.total)} of ${hall.total}`
          : '0 of 0'}
      </span>
      <Pagination
        bind:page
        pages={hall?.total_pages ?? 0}
        showPageNumbers={false}
        onchange={() => {
          writeQuery();
          window.scrollTo({ top: 0, behavior: 'smooth' });
          void load();
        }}
      />
    </footer>
  {/if}
</AppPage>

<style>
  @import './activity-page.css';
</style>
