<script lang="ts">
  import ContentAd from '@/layouts/ads/ContentAd.svelte';
  import { copyText } from '@/lib/clipboard';
  import { onMount, untrack } from 'svelte';
  import { router } from '@/routes/router';
  import { theme } from '@/stores/theme';
  import {
    calculateMemberMetrics,
    clubProgression,
    type ClubMemberMetric
  } from '@/lib/clubs/member-metrics';
  import {
    clubMetrics,
    clubMetric,
    memberMetric,
    readClubConfig,
    clubInitialPeriod,
    clubDataStatus
  } from '@/lib/clubs/club-display';
  import SourcePage from '@/layouts/SourcePage.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import Button from '@/components/controls/Button.svelte';
  import IconButton from '@/components/controls/IconButton.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import ToggleButton from '@/components/controls/ToggleButton.svelte';
  import { communityRepository } from './community-repository';
  import { exportClub } from './club-export';
  import ClubSettingsDialog from './ClubSettingsDialog.svelte';
  import ClubMemberProgression from './members/ClubMemberProgression.svelte';
  import ClubDetailsHeader from './details/ClubDetailsHeader.svelte';
  import ClubDetailsOverview from './details/ClubDetailsOverview.svelte';
  import ClubMemberGrid from './members/ClubMemberGrid.svelte';
  import ClubMemberTable from './members/ClubMemberTable.svelte';
  import { clubProgressionOption } from './charts/club-chart';
  import type { ClubDetails } from './community-types';

  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);

  jst.setUTCDate(jst.getUTCDate() - 1);

  const initialPeriod = clubInitialPeriod(router.route.search, {
    year: jst.getUTCFullYear(),
    month: jst.getUTCMonth() + 1
  });

  let year = $state(initialPeriod.year);
  let month = $state(initialPeriod.month);
  let now = $state(Date.now());
  let clubChartHeight = $state(280);
  let details = $state.raw<ClubDetails>();
  let loading = $state(true);
  let refreshing = $state(false);
  let error = $state('');
  let search = $state('');
  let settingsOpen = $state(false);
  let config = $state(readClubConfig(localStorage.getItem('circle_details_config')));
  let memberChartMode = $state<'cumulative' | 'delta'>('cumulative');
  let memberView = $state<'chart' | 'calendar'>('chart');
  let listMode = $state<'grid' | 'row'>('grid');
  let expandedMembers = $state<number[]>([]);
  let exportBusy = $state(false);

  let exported = false;
  let requestId = 0;

  let secondsUntilRefresh = $state(300);

  const clubId = $derived(Number(router.route.params.id || 0));
  const isCurrentMonth = $derived(year === jst.getUTCFullYear() && month === jst.getUTCMonth() + 1);
  const isLastMonth = $derived(
    new Date(year, month).getTime() === new Date(jst.getUTCFullYear(), jst.getUTCMonth()).getTime()
  );

  const isLive = $derived(
    isCurrentMonth && Boolean(details) && (details?.circle.monthly_rank ?? 999) <= 100
  );

  const dataStatus = $derived(
    details
      ? clubDataStatus(
          {
            liveFans: details.circle.live_points,
            lastUpdated: details.circle.last_updated,
            lastLiveUpdate: details.circle.last_live_update
          },
          details.members,
          { year, month, currentMonth: isCurrentMonth },
          now
        )
      : undefined
  );

  const allMembers = $derived(
    details
      ? calculateMemberMetrics(details.members, {
          year,
          month,
          currentMonth: isCurrentMonth,
          includePrior: config.includePriorClubData,
          leaderViewerId: details.circle.leader_viewer_id
        }).sort(
          (a, b) =>
            Number(b.active) - Number(a.active) ||
            (a.active ? memberMetric(b, config) - memberMetric(a, config) : b.fanCount - a.fanCount)
        )
      : []
  );

  const members = $derived(
    allMembers.filter(
      (member) =>
        !search.trim() ||
        `${member.name} ${member.viewerId}`
          .toLocaleLowerCase()
          .includes(search.trim().toLocaleLowerCase())
    )
  );

  const history = $derived(details ? clubProgression(details.members, year, month) : []);
  const computedMonthlyFans = $derived(
    allMembers.reduce((sum, member) => sum + (member.active ? member.monthlyGain : 0), 0)
  );

  const monthlyFans = $derived(
    isCurrentMonth
      ? (details?.circle.monthly_point ?? computedMonthlyFans)
      : isLastMonth
        ? (details?.circle.last_month_point ?? computedMonthlyFans)
        : computedMonthlyFans
  );

  const displayedRank = $derived(
    isCurrentMonth
      ? details?.circle.monthly_rank
      : isLastMonth
        ? details?.circle.last_month_rank || undefined
        : undefined
  );

  const primary = $derived(clubMetric(config));
  const extraMetrics = $derived(
    clubMetrics.filter((metric) => config[metric.flag] && metric.value !== primary.value)
  );

  const clubChart = $derived(clubProgressionOption(history, $theme));

  async function copyTrainer(member: ClubMemberMetric): Promise<void> {
    if (!(await copyText(String(member.viewerId)))) error = 'Trainer ID could not be copied.';
  }

  async function load(refresh = false): Promise<void> {
    const id = ++requestId,
      requestedClub = clubId,
      requestedYear = year,
      requestedMonth = month;

    refreshing = refresh && Boolean(details);
    loading = !refreshing;
    error = '';
    if (loading) details = undefined;
    try {
      const value = await communityRepository.clubDetails(
        requestedClub,
        requestedYear,
        requestedMonth,
        refresh
      );

      if (id !== requestId) return;
      details = value;
      now = Date.now();
      secondsUntilRefresh = communityRepository.clubDetailsRefreshSeconds(
        requestedClub,
        requestedYear,
        requestedMonth
      );
    } catch (reason) {
      if (id === requestId)
        error = reason instanceof Error ? reason.message : 'Club details could not be loaded.';
    } finally {
      if (id === requestId) {
        loading = false;
        refreshing = false;
        void maybeExport();
      }
    }
  }

  function changeMonth(offset: number): void {
    const next = new Date(year, month - 1 + offset, 1);
    year = next.getFullYear();
    month = next.getMonth() + 1;
    details = undefined;
    void load();
  }

  async function download(format: string): Promise<void> {
    if (!details || !allMembers.length || exportBusy) return;
    if (format !== 'csv' && format !== 'json' && format !== 'xlsx') return;
    exportBusy = true;
    try {
      await exportClub({ details, members: allMembers, config, year, month, format });
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'Export could not be created.';
    } finally {
      exportBusy = false;
    }
  }

  async function maybeExport(): Promise<void> {
    const raw = router.route.params.exportFormat?.toLowerCase();
    const format = raw === 'excel' || raw === 'xls' || raw === 'exel' ? 'xlsx' : raw;
    if (!loading && !error && !exported && format && ['csv', 'json', 'xlsx'].includes(format)) {
      exported = true;
      await download(format);
    }
  }

  $effect(() => {
    clubId;
    untrack(() => {
      exported = false;
      void load();
    });
  });

  $effect(() => {
    try {
      localStorage.setItem('circle_details_config', JSON.stringify(config));
    } catch {
      /* Continue without persistence when browser storage is unavailable. */
    }
  });

  onMount(() => {
    const timer = setInterval(() => {
      now = Date.now();
      if (!isLive || document.hidden || loading || refreshing || error) return;
      secondsUntilRefresh = communityRepository.clubDetailsRefreshSeconds(clubId, year, month);
      if (secondsUntilRefresh <= 0) void load(true);
    }, 1000);

    return () => {
      clearInterval(timer);
      requestId++;
    };
  });
</script>

<svelte:head><title>{details?.circle.name ?? 'Club details'} · uma.moe</title></svelte:head>
<SourcePage
  routeId="clubs"
  title={details?.circle.name ?? 'Club details'}
  width="wide"
>
  <div class="club-page">
    <ClubDetailsHeader
      {details}
      {year}
      {month}
      {isLive}
      {refreshing}
      {secondsUntilRefresh}
      {exportBusy}
      onmonth={changeMonth}
      onrefresh={() => load(true)}
      ondownload={download}
    />
    <div class="content">
      {#if error}
        <Banner
          tone="danger"
          title="Club details unavailable"
        >
          <p>{error}</p>
          <Button
            variant="secondary"
            onclick={() => load(true)}
          >
            Retry
          </Button>
        </Banner>
      {/if}
      {#if loading}
        <Spinner
          centered
          minHeight="220px"
          label="Loading club…"
        />
      {:else if details}
        <ClubDetailsOverview
          {details}
          {dataStatus}
          {monthlyFans}
          {displayedRank}
          {clubChart}
          {now}
          bind:clubChartHeight
        />
        <ContentAd routeId="clubs" />
        <ClubMemberProgression
          snapshots={details.members}
          {year}
          {month}
          includePrior={config.includePriorClubData}
          {search}
          bind:mode={memberChartMode}
          bind:view={memberView}
        />
        <ContentAd
          routeId="clubs"
          index={2}
        />
        <div class="club-toolbar">
          <h2>
            Members <span class="member-count">{members.length}</span>
          </h2>
          <div class="member-search">
            <TextField
              id="club-member-search"
              label="Filter by name or ID"
              hideLabel
              type="search"
              placeholder="Search members by name or ID"
              suffixIcon="search"
              bind:value={search}
            />
          </div>
          <div class="member-controls">
            <ToggleButton
              icon="users"
              label="Prior club data"
              ariaLabel="Include Prior Club Data"
              pressed={config.includePriorClubData}
              onclick={() => (config.includePriorClubData = !config.includePriorClubData)}
            />
            <IconButton
              icon={listMode === 'grid' ? 'menu' : 'grid'}
              label={listMode === 'grid' ? 'Show member rows' : 'Show member cards'}
              onclick={() => (listMode = listMode === 'grid' ? 'row' : 'grid')}
            /><IconButton
              icon="filter"
              label="Display Settings"
              onclick={() => (settingsOpen = true)}
            />
          </div>
        </div>
        <section
          class="members-section"
          aria-label="Club members"
        >
          {#if listMode === 'grid'}
            <ClubMemberGrid
              {members}
              {config}
              {primary}
              {extraMetrics}
              {now}
              oncopy={copyTrainer}
            />
          {:else}
            <ClubMemberTable
              {members}
              {config}
              {primary}
              {extraMetrics}
              bind:expandedMembers
              {now}
              oncopy={copyTrainer}
            />
          {/if}
          {#if !members.length}
            <p class="no-members">No members match your search.</p>
          {/if}
        </section>
      {/if}
    </div>
  </div>
</SourcePage>

<ClubSettingsDialog
  bind:open={settingsOpen}
  {config}
  onsave={(value) => (config = value)}
/>

<style>
  @import './club-details-page.css';
</style>
