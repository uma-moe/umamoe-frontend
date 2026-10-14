<script lang="ts">
  import ContentAd from '@/layouts/ContentAd.svelte';
  import { virtualScroll, type VirtualRange } from '@/lib/virtual-scroll';
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
    clubPolicyLabels,
    clubMetrics,
    clubMetric,
    memberMetric,
    readClubConfig,
    clubRankIcon as rankIcon,
    clubInitialPeriod,
    clubDataStatus,
    formatClubTimeAgo
  } from '@/lib/clubs/club-display';
  import SourcePage from '@/layouts/SourcePage.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import Button from '@/components/controls/Button.svelte';
  import DiscordText from '@/components/DiscordText.svelte';
  import Icon from '@/components/Icon.svelte';
  import IconButton from '@/components/controls/IconButton.svelte';
  import Menu from '@/components/navigation/Menu.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import ToggleButton from '@/components/controls/ToggleButton.svelte';
  import LazyEChartsSurface from '@/components/charts/LazyEChartsSurface.svelte';
  import { communityRepository } from './community-repository';
  import { exportClub } from './club-export';
  import ClubSettingsDialog from './ClubSettingsDialog.svelte';
  import ClubMemberProgression from './ClubMemberProgression.svelte';
  import { clubProgressionOption } from './club-chart';
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
  let clubChartHeight = $state(280);
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

  let virtualRange = $state<VirtualRange>({ start: 0, end: 0 });

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

  const compactNumber = new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 2
  });

  function number(value: number): string {
    return Math.round(value).toLocaleString();
  }

  function signed(value: number): string {
    return `${value > 0 ? '+' : ''}${number(value)}`;
  }

  function joinLabel(value: number): string {
    return value === 1 ? 'Open' : value === 2 ? 'Approval' : 'Closed';
  }

  function updated(value: string): string {
    return formatClubTimeAgo(value, now);
  }

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
    if (!details || !allMembers.length || exportBusy || !['csv', 'json', 'xlsx'].includes(format))
      return;
    exportBusy = true;
    try {
      await exportClub(details, allMembers, config, year, month, format as 'csv' | 'json' | 'xlsx');
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
    <header class="club-heading">
      <div class="club-identity">
        <Button
          href="/circles"
          variant="ghost"
          icon="arrow-left"
          ariaLabel="Back to clubs"
        />
        <div class="club-title">
          <h1>{details?.circle.name ?? 'Club details'}</h1>
          <div class="heading-meta">
            <span class="membership-meta">
              <Icon
                name="users"
                size={14}
              />{details?.circle.member_count ?? 0}/30
              <span>members</span>
            </span>
            <span
              class="join-meta"
              class:open={details?.circle.join_style === 1}
              class:approval={details?.circle.join_style === 2}
            >
              {joinLabel(details?.circle.join_style ?? 3)}
            </span>
            {#if isLive}
              <span class="live-status">
                <span class="live-dot"></span>
                <span class="live-label">Live</span>
                <span class="countdown">
                  {refreshing
                    ? 'Updating…'
                    : `${Math.floor(secondsUntilRefresh / 60)}:${String(secondsUntilRefresh % 60).padStart(2, '0')}`}
                </span>
              </span>
            {/if}
          </div>
        </div>
      </div>
      <div class="header-actions">
        <div
          class="month-nav"
          role="group"
          aria-label="Club month"
        >
          <IconButton
            icon="arrow-left"
            label="Previous month"
            onclick={() => changeMonth(-1)}
          />
          <strong aria-live="polite">{year} / {String(month).padStart(2, '0')}</strong>
          <IconButton
            icon="arrow-right"
            label="Next month"
            onclick={() => changeMonth(1)}
          />
        </div>
        {#if isLive}
          <div
            class="live-refresh-bar"
            class:refreshing
          >
            <IconButton
              icon="refresh"
              label="Update now"
              disabled={refreshing}
              onclick={() => load(true)}
            />
          </div>
        {/if}<Menu
          label={exportBusy ? 'Exporting…' : 'Export'}
          items={[
            { id: 'xlsx', label: 'Excel (XLSX)', disabled: exportBusy },
            { id: 'csv', label: 'CSV', disabled: exportBusy },
            { id: 'json', label: 'JSON', disabled: exportBusy }
          ]}
          onselect={download}
        />
      </div>
    </header>
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
        <div class="loading"><Spinner size={30} />Loading club…</div>
      {:else if details}
        <div class="overview-grid">
          <section
            class="info-card details-card"
            aria-label="Club Information"
          >
            <header>
              <h2>Club Information</h2>
              {#if dataStatus?.updatedAt}
                <div class="updated-row">
                  <span class="label">Updated</span>
                  <span
                    class="value"
                    title={new Date(dataStatus.updatedAt).toLocaleString(undefined, {
                      dateStyle: 'medium',
                      timeStyle: 'medium'
                    })}
                  >
                    {updated(dataStatus.updatedAt)}
                  </span>
                </div>
              {/if}
            </header>
            <div class="info-body">
              <div class="club-overview">
                <dl class="club-fans">
                  <div class="info-row fan-metric">
                    <dt class="label">Monthly Fans</dt>
                    <dd class="value">
                      <span>{compactNumber.format(monthlyFans)}</span>
                      {#if Math.abs(monthlyFans) >= 1000}
                        <small>{number(monthlyFans)}</small>
                      {/if}
                    </dd>
                  </div>
                  {#if dataStatus?.liveFresh}
                    <div class="info-row fan-metric live-row">
                      <dt class="label">
                        <span class="live-dot"></span>
                        Live Points
                      </dt>
                      <dd class="value">
                        <span>{compactNumber.format(details.circle.live_points!)}</span>
                        {#if Math.abs(details.circle.live_points!) >= 1000}
                          <small>
                            {number(details.circle.live_points!)}
                          </small>
                        {/if}
                      </dd>
                    </div>
                  {/if}
                </dl>
                {#if details.clubRank}
                  <div
                    class="club-rank-row"
                    class:max-rank={!details.fansToNextTier}
                  >
                    {#if details.fansToLowerTier != null}
                      <div class="tier-side lower">
                        {#if rankIcon(details.clubRank - 1)}
                          <img
                            class="tier-icon"
                            src={rankIcon(details.clubRank - 1)}
                            alt="Lower Tier"
                          />
                        {/if}
                        <div class="tier-info">
                          <span class="tier-gap-label">
                            <span class="tier-direction">
                              <Icon
                                name="arrow-right"
                                size={16}
                              />
                            </span>
                            Tier buffer
                          </span>
                          <strong
                            class="tier-gap-value safe"
                            title={number(details.fansToLowerTier)}
                          >
                            {compactNumber.format(details.fansToLowerTier)}
                          </strong>
                          {#if details.yesterdayFansToLowerTier != null}
                            {@const delta =
                              details.fansToLowerTier - details.yesterdayFansToLowerTier}
                            <span
                              class="tier-delta"
                              title={signed(delta)}
                              class:positive={delta > 0}
                              class:negative={delta < 0}
                            >
                              {delta > 0 ? '+' : ''}{compactNumber.format(delta)}
                            </span>
                          {/if}
                        </div>
                      </div>
                    {/if}
                    <div class="rank-center">
                      {#if rankIcon(details.clubRank)}
                        <img
                          class="club-rank-icon"
                          src={rankIcon(details.clubRank)}
                          alt="Club Rank"
                        />
                      {/if}{#if displayedRank !== undefined}
                        <span class="rank-label">
                          Rank #{number(displayedRank)}
                        </span>
                      {/if}
                    </div>
                    {#if details.fansToNextTier}
                      <div class="tier-side upper">
                        <div class="tier-info">
                          <span class="tier-gap-label">
                            <span class="tier-direction">
                              <Icon
                                name="arrow-right"
                                size={16}
                              />
                            </span>
                            Next tier
                          </span>
                          <strong
                            class="tier-gap-value needed"
                            title={number(details.fansToNextTier)}
                          >
                            {compactNumber.format(details.fansToNextTier)}
                          </strong>
                          {#if details.yesterdayFansToNextTier != null}
                            {@const delta =
                              details.fansToNextTier - details.yesterdayFansToNextTier}
                            <span
                              class="tier-delta"
                              title={signed(delta)}
                              class:positive={delta < 0}
                              class:negative={delta > 0}
                            >
                              {delta > 0 ? '+' : ''}{compactNumber.format(delta)}
                            </span>
                          {/if}
                        </div>
                        {#if rankIcon(details.clubRank + 1)}
                          <img
                            class="tier-icon"
                            src={rankIcon(details.clubRank + 1)}
                            alt="Next Tier"
                          />
                        {/if}
                      </div>
                    {/if}
                  </div>
                {/if}
              </div>
              <div class="club-details">
                <dl class="club-metadata">
                  <div class="info-row leader-row">
                    <dt class="label">Leader</dt>
                    <dd class="value">
                      {details.circle.leader_name || details.circle.leader_viewer_id || 'Unknown'}
                    </dd>
                  </div>
                  {#if details.circle.policy && clubPolicyLabels[details.circle.policy]}
                    <div class="info-row">
                      <dt class="label">Playstyle</dt>
                      <dd class="value">{clubPolicyLabels[details.circle.policy]}</dd>
                    </div>
                  {/if}
                </dl>
                {#if details.circle.comment}
                  <p class="description">
                    <DiscordText text={details.circle.comment} />
                  </p>
                {/if}
              </div>
            </div>
          </section>
          <section
            class="details-card progression-card"
            aria-label="Club Progression"
          >
            <header><h2>Club Progression</h2></header>
            <div class="card-body">
              <div
                class="club-chart"
                bind:clientHeight={clubChartHeight}
              >
                <LazyEChartsSurface
                  option={clubChart}
                  label="Club progression by observed day"
                  height={clubChartHeight}
                  dismissTouchTooltip
                />
              </div>
            </div>
          </section>
        </div>
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
            <div
              class="members-grid"
              use:virtualScroll={{
                items: members,
                searchText: (member) =>
                  [
                    member.name,
                    member.viewerId,
                    member.role,
                    member.fanCount,
                    member.fanCount.toLocaleString()
                  ].join(' '),
                key: (member) => member.viewerId,
                estimate: 230,
                onrange: (range) => (virtualRange = range)
              }}
            >
              {#each members.slice(virtualRange.start, virtualRange.end) as member, localIndex (member.viewerId)}
                {@const index = virtualRange.start + localIndex}
                <article
                  data-virtual-index={index}
                  class="member-card"
                  class:inactive={!member.active}
                  style:--placement-color={member.active
                    ? ['#ffd700', '#90a4ae', '#cd7f32'][index]
                    : undefined}
                >
                  <header>
                    <span class="member-rank">#{index + 1}</span>
                    <div class="name-block">
                      <a
                        href={`/profile/${member.viewerId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {member.name}<Icon
                          name="external"
                          size={12}
                        />
                      </a>
                      <button
                        type="button"
                        class="member-id"
                        onclick={() => copyTrainer(member)}
                      >
                        ID {member.viewerId}<Icon
                          name="copy"
                          size={12}
                        />
                      </button>
                    </div>
                    {#if !member.active}
                      <span>Left</span>
                    {:else}
                      <small
                        class="role-badge"
                        data-role={member.role}
                      >
                        {member.role}
                      </small>
                    {/if}
                  </header>
                  {#if config.showTotalFans && primary.key !== 'fanCount'}
                    <div class="total-fans">
                      <span>Total Fans</span>
                      <strong>{number(member.fanCount)}</strong>
                    </div>
                  {/if}
                  <div class="primary-metric">
                    <span>{primary.label}</span>
                    <strong
                      class:positive={primary.key !== 'fanCount' &&
                        memberMetric(member, config) > 0}
                      class:negative={memberMetric(member, config) < 0}
                    >
                      {primary.key === 'fanCount'
                        ? number(memberMetric(member, config))
                        : signed(
                            memberMetric(member, config)
                          )}{#if config.includePriorClubData && member.hasPriorClubData}
                        <sup title={`Includes ${number(member.priorClubGain)} from prior club`}>
                          *
                        </sup>
                      {/if}
                    </strong>
                  </div>
                  <dl class="member-stats">
                    {#each extraMetrics.filter((metric) => metric.key !== 'fanCount') as metric}
                      <div>
                        <dt title={metric.label}>{metric.label}</dt>
                        <dd
                          class:positive={member[metric.key] > 0}
                          class:negative={member[metric.key] < 0}
                        >
                          {signed(member[metric.key])}
                        </dd>
                      </div>
                    {/each}{#if config.showLastUpdated}
                      <div>
                        <dt>Last Updated</dt>
                        <dd title={member.lastUpdated}>{updated(member.lastUpdated)}</dd>
                      </div>
                    {/if}
                  </dl>
                </article>
              {/each}
            </div>
          {:else}
            <div class="member-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th class="table-rank">#</th>
                    <th>Trainer</th>
                    {#if config.showRole}
                      <th class="desktop-cell">Role</th>
                    {/if}
                    <th class="member-primary">{primary.label}</th>
                    {#each extraMetrics as metric, metricIndex}
                      <th
                        class="member-extra"
                        class:mobile-summary={metricIndex === 0}
                      >
                        {metric.label}
                      </th>
                    {/each}{#if config.showLastUpdated}
                      <th class="desktop-cell">Updated</th>
                    {/if}
                  </tr>
                </thead>
                <tbody
                  use:virtualScroll={{
                    items: members,
                    searchText: (member) =>
                      [
                        member.name,
                        member.viewerId,
                        member.role,
                        member.fanCount,
                        member.fanCount.toLocaleString()
                      ].join(' '),
                    key: (member) => member.viewerId,
                    estimate: 45,
                    onrange: (range) => (virtualRange = range)
                  }}
                >
                  {#each members.slice(virtualRange.start, virtualRange.end) as member, localIndex (member.viewerId)}
                    {@const index = virtualRange.start + localIndex}
                    <tr
                      data-virtual-index={index}
                      class:inactive={!member.active}
                    >
                      <td class="table-rank">{index + 1}</td>
                      <td class="member-identity">
                        <div class="member-name-row">
                          <a
                            href={'/profile/' + member.viewerId}
                            title={member.name}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {member.name}
                          </a>
                          <button
                            class="member-expand"
                            type="button"
                            aria-label={(expandedMembers.includes(member.viewerId)
                              ? 'Hide'
                              : 'Show') +
                              ' stats for ' +
                              member.name}
                            aria-expanded={expandedMembers.includes(member.viewerId)}
                            aria-controls={'club-member-details-' + member.viewerId}
                            onclick={() =>
                              (expandedMembers = expandedMembers.includes(member.viewerId)
                                ? expandedMembers.filter((id) => id !== member.viewerId)
                                : [...expandedMembers, member.viewerId])}
                          >
                            <Icon
                              name="chevron"
                              size={14}
                            />
                          </button>
                        </div>
                        <div class="identity-tools">
                          <button
                            class="member-id"
                            onclick={() => copyTrainer(member)}
                          >
                            ID {member.viewerId}
                          </button>
                          {#if !member.active}
                            <small>Left</small>
                          {/if}
                        </div>
                      </td>
                      {#if config.showRole}
                        <td class="desktop-cell">{member.role}</td>
                      {/if}
                      <td
                        class="member-primary"
                        class:positive={primary.key !== 'fanCount' &&
                          memberMetric(member, config) > 0}
                        class:negative={memberMetric(member, config) < 0}
                      >
                        {number(memberMetric(member, config))}
                      </td>
                      {#each extraMetrics as metric, metricIndex}
                        <td
                          class="member-extra"
                          class:mobile-summary={metricIndex === 0}
                          class:positive={metric.key !== 'fanCount' && member[metric.key] > 0}
                          class:negative={member[metric.key] < 0}
                        >
                          {number(member[metric.key])}
                        </td>
                      {/each}
                      {#if config.showLastUpdated}
                        <td class="desktop-cell">
                          {updated(member.lastUpdated)}
                        </td>
                      {/if}
                    </tr>
                    {#if expandedMembers.includes(member.viewerId)}
                      <tr
                        data-virtual-index={index}
                        class="member-details"
                        id={'club-member-details-' + member.viewerId}
                      >
                        <td colspan={3 + Number(extraMetrics.length > 0)}>
                          <div class="member-detail-heading">
                            <strong>{member.name}</strong>
                            <button
                              class="member-id"
                              onclick={() => copyTrainer(member)}
                            >
                              ID {member.viewerId}<Icon
                                name="copy"
                                size={12}
                              />
                            </button>
                            {#if !member.active}
                              <small>Left club</small>
                            {/if}
                          </div>
                          <dl class="member-stats">
                            {#if config.showRole}
                              <div>
                                <dt>Role</dt>
                                <dd>{member.role}</dd>
                              </div>
                            {/if}{#each extraMetrics.slice(1) as metric}
                              <div>
                                <dt>{metric.label}</dt>
                                <dd
                                  class:positive={metric.key !== 'fanCount' &&
                                    member[metric.key] > 0}
                                  class:negative={member[metric.key] < 0}
                                >
                                  {number(member[metric.key])}
                                </dd>
                              </div>
                            {/each}{#if config.showLastUpdated}
                              <div>
                                <dt>Updated</dt>
                                <dd>{updated(member.lastUpdated)}</dd>
                              </div>
                            {/if}
                          </dl>
                        </td>
                      </tr>
                    {/if}
                  {/each}
                </tbody>
              </table>
            </div>
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
