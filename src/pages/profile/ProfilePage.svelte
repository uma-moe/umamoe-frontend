<script lang="ts">
  import LazyContent from '@/components/LazyContent.svelte';
  import { router } from '@/routes/router';
  import {
    formatProfileNumber as format,
    signedProfileGain as signed,
    profileGainColor
  } from '@/lib/profile/profile-display';
  import Button from '@/components/controls/Button.svelte';
  import CircleCard from '@/components/cards/CircleCard.svelte';
  import DataTable from '@/components/data/DataTable.svelte';
  import EmptyState from '@/components/feedback/EmptyState.svelte';
  import Icon from '@/components/Icon.svelte';
  import StatTile from '@/components/game/StatTile.svelte';
  import ProfileShell from './ProfileShell.svelte';
  import ProfileFanHistory from './overview/ProfileFanHistory.svelte';
  import ProfileFanActivity from './overview/ProfileFanActivity.svelte';
  import ProfileBorrow from './overview/ProfileBorrow.svelte';
  import ProfileTeamStadium from './overview/ProfileTeamStadium.svelte';
  import ProfileVeteransRoster from './veterans/ProfileVeteransRoster.svelte';
  import ContentAd from '@/layouts/ContentAd.svelte';
  import { DEFAULT_PROFILE_SECTIONS, type ProfileSectionId } from './profile-layout';

  // A future preference editor can supply this order without changing the widgets.
  let { sectionOrder = DEFAULT_PROFILE_SECTIONS }: { sectionOrder?: readonly ProfileSectionId[] } =
    $props();

  const accountId = $derived(router.route.params.accountId || '');

  function month(value: number): string {
    return (
      ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
        value - 1
      ] ?? ''
    );
  }
</script>

<svelte:head>
  <title>Trainer {accountId} · uma.moe</title>
  <meta
    name="description"
    content={`Uma Musume trainer profile for ${accountId}.`}
  />
</svelte:head>

<ProfileShell
  {accountId}
  current="overview"
>
  {#snippet children(context)}
    {@const profile = context.profile}
    {#snippet visibilityControl(section: string)}
      {#if context.isOwner}
        {@const visible = !context.visibility.hidden_sections.includes(section)}
        <div class="section-actions">
          <Button
            variant={visible ? 'secondary' : 'danger'}
            size="sm"
            icon={visible ? 'eye' : 'eye-off'}
            disabled={!context.visibilityReady}
            ariaPressed={!visible}
            onclick={() => context.toggleSection(section)}
          >
            {visible ? 'Public' : 'Hidden'}
          </Button>
        </div>
      {/if}
    {/snippet}

    {#snippet fanActivity()}
      {@const showHistory = context.sectionVisible('fan_history')}
      {@const rolling = context.sectionVisible('rolling_alltime')
        ? profile.fan_history.rolling
        : null}
      {#if (showHistory && profile.fan_history.monthly.length) || rolling}
        <div class="activity-section">
          <div
            class="activity-row"
            class:with-gains={Boolean(rolling)}
          >
            {#key accountId}
              <ProfileFanActivity
                {accountId}
                monthly={showHistory ? profile.fan_history.monthly : []}
              >
                {#snippet actions()}
                  {@render visibilityControl('fan_history')}
                {/snippet}
              </ProfileFanActivity>
            {/key}
            {#if rolling}
              <section
                class="rolling-gains"
                aria-labelledby="rolling-gains-title"
              >
                <header class="section-heading">
                  <Icon
                    name="activity"
                    size={20}
                  />
                  <h2 id="rolling-gains-title">Rolling Gains</h2>
                  {@render visibilityControl('rolling_alltime')}
                </header>
                <div class="rolling-stack">
                  <StatTile
                    compact
                    label="3 Days"
                    value={signed(rolling.gain_3d)}
                    valueColor={profileGainColor(rolling.gain_3d)}
                    detail={`#${format(rolling.rank_3d)}`}
                  />
                  <StatTile
                    compact
                    label="7 Days"
                    value={signed(rolling.gain_7d)}
                    valueColor={profileGainColor(rolling.gain_7d)}
                    detail={`#${format(rolling.rank_7d)}`}
                  />
                  <StatTile
                    compact
                    label="30 Days"
                    value={signed(rolling.gain_30d)}
                    valueColor={profileGainColor(rolling.gain_30d)}
                    detail={`#${format(rolling.rank_30d)}`}
                  />
                </div>
              </section>
            {/if}
          </div>
          {#if showHistory && profile.fan_history.monthly.length}
            {#key accountId}
              <ProfileFanHistory monthly={profile.fan_history.monthly} />
            {/key}
          {/if}
        </div>
      {/if}
    {/snippet}

    {#snippet allTime()}
      {#if context.sectionVisible('rolling_alltime') && profile.fan_history.alltime}
        {@const all = profile.fan_history.alltime}
        <section
          class="stats-section"
          aria-labelledby="all-time-title"
        >
          <header class="section-heading">
            <Icon
              name="trophy"
              size={20}
            />
            <h2 id="all-time-title">All-Time Stats</h2>
            {#if !profile.fan_history.rolling}
              {@render visibilityControl('rolling_alltime')}
            {/if}
          </header>
          <div class="stat-grid all-time-grid">
            <StatTile
              compact
              padding="sm"
              label="Total Fans"
              value={format(all.total_fans)}
              detail={`#${format(all.rank_total_fans)}`}
            />
            <StatTile
              compact
              padding="sm"
              label="Total Gain"
              value={signed(all.total_gain)}
              valueColor={profileGainColor(all.total_gain)}
              detail={`#${format(all.rank_total_gain)}`}
            />
            <StatTile
              compact
              padding="sm"
              label="Active Days"
              value={format(all.active_days)}
            />
            <StatTile
              compact
              padding="sm"
              label="Avg / Day"
              value={format(all.avg_day)}
              detail={all.rank_avg_day == null ? undefined : `#${format(all.rank_avg_day)}`}
            />
            <StatTile
              compact
              padding="sm"
              label="Avg / Week"
              value={format(all.avg_week)}
              detail={all.rank_avg_week == null ? undefined : `#${format(all.rank_avg_week)}`}
            />
            <StatTile
              compact
              padding="sm"
              label="Avg / Month"
              value={format(all.avg_month)}
              detail={all.rank_avg_month == null ? undefined : `#${format(all.rank_avg_month)}`}
            />
          </div>
        </section>
      {/if}
    {/snippet}

    {#snippet borrow()}
      {#if profile.inheritance && context.sectionVisible('inheritance')}
        <section
          class="inheritance"
          aria-labelledby="borrow-title"
        >
          <header class="section-heading">
            <Icon
              name="lineage"
              size={20}
            />
            <h2 id="borrow-title">Current borrow</h2>
            <span class="section-detail">Inheritance &amp; support card</span>
            {@render visibilityControl('inheritance')}
          </header>
          {#key accountId}
            <ProfileBorrow {profile} />
          {/key}
        </section>
      {/if}
    {/snippet}

    {#snippet currentCircle()}
      {#if profile.circle && context.sectionVisible('circle')}
        {@const circle = profile.circle}
        <section
          class="circle-section"
          aria-labelledby="current-circle-title"
        >
          <header class="section-heading">
            <Icon
              name="community"
              size={20}
            />
            <h2 id="current-circle-title">Current Circle</h2>
            {@render visibilityControl('circle')}
          </header>
          <CircleCard
            circle={{
              circleId: circle.circle_id,
              name: circle.name,
              members: circle.member_count,
              rank: circle.monthly_rank ?? undefined,
              monthlyFans: circle.monthly_point ?? undefined,
              liveFans: circle.live_points ?? undefined,
              liveRank: circle.live_rank ?? undefined,
              yesterdayRank: circle.yesterday_rank,
              yesterdayFans: circle.yesterday_points,
              clubRank: circle.club_rank,
              leaderName: circle.leader_name,
              joinStyle:
                circle.join_style === 1 || circle.join_style === 2 || circle.join_style === 3
                  ? circle.join_style
                  : undefined,
              policy: circle.policy,
              comment: circle.comment
            }}
          />
        </section>
      {/if}
    {/snippet}

    {#snippet circleHistory()}
      {#if profile.circle_history.length > 0 && context.sectionVisible('circle_history')}
        <section
          class="history-section"
          aria-labelledby="circle-history-title"
        >
          <header class="section-heading">
            <Icon
              name="timeline"
              size={18}
            />
            <h2 id="circle-history-title">Circle History</h2>
            {@render visibilityControl('circle_history')}
          </header>
          <div class="card-content">
            <DataTable
              caption="Circle History"
              columns={[
                { key: 'period', label: 'Period' },
                { key: 'circle', label: 'Circle' },
                { key: 'rank', label: 'Rank', numeric: true },
                { key: 'points', label: 'Points', numeric: true }
              ]}
              rows={profile.circle_history.map((row) => ({
                period: month(row.month) + ' ' + row.year,
                circle: row.circle_name,
                circleId: row.circle_id,
                rank: row.circle_rank == null ? '-' : '#' + format(row.circle_rank),
                points: format(row.circle_points)
              }))}
            >
              {#snippet cell(row, column)}
                {#if column.key === 'circle'}
                  <a href={'/circles/' + row.circleId}>
                    {row.circle}
                  </a>
                {:else}
                  {row[column.key]}
                {/if}
              {/snippet}
            </DataTable>
          </div>
        </section>
      {/if}
    {/snippet}

    {#snippet stadium()}
      {#if profile.team_stadium.length && context.sectionVisible('team_stadium')}
        <section
          class="stadium-section"
          aria-roledescription="carousel"
          aria-labelledby="profile-stadium-title"
        >
          <header class="section-heading">
            <Icon
              name="race"
              size={20}
            />
            <h2 id="profile-stadium-title">Team Stadium</h2>
            {@render visibilityControl('team_stadium')}
          </header>
          <LazyContent height={240}>
            <ProfileTeamStadium
              {accountId}
              members={profile.team_stadium}
              characters={context.characters}
            />
          </LazyContent>
        </section>
      {/if}
    {/snippet}

    {#snippet veterans()}
      {#if context.sectionVisible('veterans')}
        <section
          class="profile-collection"
          aria-labelledby="veterans-title"
        >
          <header class="section-heading">
            <Icon
              name="veterans"
              size={20}
            />
            <h2 id="veterans-title">Veterans</h2>
            <span class="section-detail">{profile.veterans?.length ?? 0} in collection</span>
            <div class="collection-actions">
              {@render visibilityControl('veterans')}<Button
                href={'/veterans/' + accountId}
                variant="secondary"
                size="sm"
                icon="external"
              >
                Open browser
              </Button>
            </div>
          </header>
          <LazyContent height={480}>
            <ProfileVeteransRoster
              {accountId}
              {profile}
              characters={context.characters}
              isOwner={context.isOwner}
              compact
            />
          </LazyContent>
        </section>
      {/if}
    {/snippet}

    {@const sections = {
      fan_activity: fanActivity,
      all_time: allTime,
      inheritance: borrow,
      circle: currentCircle,
      circle_history: circleHistory,
      team_stadium: stadium,
      veterans
    }}
    <div class="content-container">
      {#each sectionOrder as section, index (section)}
        {@render sections[section]()}{#if index === 1}
          <ContentAd routeId="profile" />
        {/if}
      {/each}
      {#if !profile.fan_history.monthly.length && !profile.fan_history.rolling && !profile.circle && !profile.circle_history.length && !profile.fan_history.alltime && !profile.inheritance && !profile.support_card && !profile.team_stadium.length && !profile.veterans?.length}
        <EmptyState
          icon="user"
          title="No profile data yet"
          description="No data available for this trainer yet."
        />
      {/if}
    </div>
  {/snippet}
</ProfileShell>

<style>
  .content-container {
    min-width: 0;
    display: grid;
    gap: var(--space-8);
  }
  .activity-section {
    min-width: 0;
    display: grid;
    gap: var(--space-3);
  }
  .activity-row {
    min-width: 0;
    display: grid;
    gap: var(--space-4);
    align-items: stretch;
  }
  .activity-row.with-gains {
    grid-template-columns: minmax(0, 1fr) clamp(180px, 18%, 240px);
  }
  .rolling-gains,
  .rolling-stack,
  .stats-section,
  .inheritance,
  .circle-section,
  .history-section,
  .stadium-section,
  .profile-collection {
    min-width: 0;
    display: grid;
    gap: var(--space-3);
  }
  .rolling-gains {
    grid-template-rows: auto 1fr;
  }
  .rolling-stack {
    grid-template-rows: repeat(3, 1fr);
  }
  .stat-grid {
    display: grid;
    gap: var(--space-3);
  }
  .all-time-grid {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }
  .section-heading {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .section-heading > :global(svg) {
    color: var(--color-accent);
  }
  .section-heading h2 {
    margin: 0;
    font-size: var(--font-md);
    font-weight: 700;
    line-height: 1.2;
  }
  .section-actions {
    margin-left: auto;
  }
  .section-detail {
    color: var(--color-text-subtle);
    font-size: var(--font-xs);
  }
  .collection-actions {
    margin-left: auto;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  a {
    color: var(--color-accent);
    text-decoration: none;
  }
  a:hover {
    text-decoration: underline;
  }
  @media (max-width: 700px) {
    .activity-row.with-gains {
      grid-template-columns: minmax(0, 1fr);
    }
    .all-time-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .content-container {
      gap: var(--space-6);
    }
  }
</style>
