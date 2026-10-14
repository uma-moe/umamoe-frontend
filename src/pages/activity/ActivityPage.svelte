<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { virtualScroll, type VirtualRange } from '@/lib/virtual-scroll';
  import type { EChartsCoreOption } from 'echarts/core';
  import { router } from '@/routes/router';
  import type {
    ActivityHall,
    ActivityReport,
    ActivityScore,
    ActivitySort
  } from '@/lib/activity/activity-types';
  import {
    averageCareersPerDay,
    buildCareerBuckets,
    buildDailyHighlights,
    buildEvidenceGroups,
    buildProbeInsights,
    buildScoreInsights,
    buildSessionRows,
    compactNumber,
    decimalNumber,
    formatDuration,
    parsedNumber,
    primarySessionSeconds,
    scoreBand,
    scoreTone,
    shortCareerWindowCount,
    verdictLabel,
    viewerFlags,
    wholeNumber
  } from '@/lib/activity/activity';
  import AppPage from '@/layouts/AppPage.svelte';
  import ContentAd from '@/layouts/ContentAd.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import Badge from '@/components/Badge.svelte';
  import Button from '@/components/controls/Button.svelte';
  import EmptyState from '@/components/feedback/EmptyState.svelte';
  import Icon from '@/components/Icon.svelte';
  import LazyEChartsSurface from '@/components/charts/LazyEChartsSurface.svelte';
  import Pagination from '@/components/navigation/Pagination.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import { activityRepository } from './activity-repository';
  import { theme } from '@/stores/theme';

  const sortOptions = (
    [
      ['score', 'Suspicion score'],
      ['short_fan_gain', 'Short high-fan score'],
      ['short_high_fan', 'Short high-fan careers'],
      ['online_streak', 'Online streak'],
      ['active_time', 'Active time'],
      ['behavior_change', 'Behavior spike'],
      ['careers_per_hour', 'Careers/hour'],
      ['fans_per_minute', 'Fans/minute'],
      ['peak_fans_per_minute', 'Peak fans/minute'],
      ['avg_career_length', 'Shortest avg career'],
      ['careers', 'Total careers'],
      ['max_session', 'Longest session']
    ] satisfies Array<[ActivitySort, string]>
  ).map(([value, label]) => ({ value, label }));
  const scoreOptions = [
    { value: '0', label: 'All scores' },
    { value: '40', label: '40+' },
    { value: '60', label: '60+' },
    { value: '80', label: '80+' }
  ];
  const dayOptions = [1, 3, 7, 14, 30].map((value) => ({
    value: String(value),
    label: `${value}+ observed days`
  }));
  const pageSizeOptions = [25, 50, 100, 200].map((value) => ({
    value: String(value),
    label: String(value)
  }));
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  let hall = $state<ActivityHall>();
  let report = $state<ActivityReport>();
  let loading = $state(true);
  let error = $state('');
  let virtualRange = $state<VirtualRange>({ start: 0, end: 0 });
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
  const evidenceGroups = $derived(score ? buildEvidenceGroups(score.evidence?.reasons ?? []) : []);
  const scoreInsights = $derived(score ? buildScoreInsights(score) : []);
  const probeInsights = $derived(buildProbeInsights(score?.probe_metrics));
  const careerBuckets = $derived(score ? buildCareerBuckets(score) : []);
  const flags = $derived(score ? viewerFlags(score) : []);
  const dailyHighlights = $derived(buildDailyHighlights(report?.daily ?? []));
  const sessionRows = $derived(
    buildSessionRows(
      report?.top_sessions?.length ? report.top_sessions : (report?.top_online_streaks ?? [])
    )
  );
  const snapshots = $derived((report?.short_career_snapshots ?? []).slice(0, 25));
  const heatmap = $derived.by(() => {
    const values = new Map(
      (report?.heatmap ?? []).map((cell) => [`${cell.dow}:${cell.hour}`, cell])
    );
    const max = Math.max(1, ...[...values.values()].map((cell) => cell.active_seconds));
    return {
      values,
      max,
      touched: [...values.values()].filter((cell) => cell.active_seconds || cell.careers).length
    };
  });
  const hourly = $derived(
    Array.from({ length: 24 }, (_, hour) =>
      (report?.heatmap ?? [])
        .filter((cell) => cell.hour === hour)
        .reduce((sum, cell) => sum + cell.active_seconds, 0)
    )
  );
  const dailyChartOption = $derived.by((): EChartsCoreOption => {
    $theme;
    const tokens = getComputedStyle(document.documentElement);
    const color = (token: string) => tokens.getPropertyValue(token).trim();
    const points = [...(report?.daily ?? [])].reverse().slice(-45);
    const maxFans = Math.max(1, ...points.map((point) => point.fan_gain));
    const maxActive = Math.max(1, ...points.map((point) => point.active_seconds));
    return {
      animation: false,
      grid: { left: 48, right: 18, top: 18, bottom: 34 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: color('--surface-overlay'),
        borderColor: color('--border-primary'),
        textStyle: { color: color('--text-primary') }
      },
      xAxis: {
        type: 'category',
        data: points.map((point) =>
          new Date(`${point.day}T00:00:00`).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric'
          })
        ),
        axisLabel: { color: color('--text-secondary'), hideOverlap: true },
        axisLine: { lineStyle: { color: color('--border-primary') } }
      },
      yAxis: {
        type: 'value',
        min: -100,
        max: 100,
        axisLabel: {
          color: color('--text-secondary'),
          formatter: (value: number) =>
            value > 0
              ? compactNumber((maxFans * value) / 100)
              : value < 0
                ? formatDuration((maxActive * -value) / 100)
                : 'balance'
        },
        splitLine: { lineStyle: { color: color('--border-subtle') } }
      },
      series: [
        {
          name: 'Fan gain',
          type: 'line',
          data: points.map((point) => (point.fan_gain / maxFans) * 100),
          smooth: 0.25,
          symbol: 'none',
          lineStyle: { color: color('--accent-warning'), width: 2 },
          areaStyle: { color: 'rgba(255,196,128,.14)' }
        },
        {
          name: 'Bias',
          type: 'line',
          data: points.map(
            (point) => (point.fan_gain / maxFans - point.active_seconds / maxActive) * 34
          ),
          smooth: 0.3,
          symbol: 'none',
          lineStyle: { color: color('--text-primary'), width: 1.5 }
        },
        {
          name: 'Active time',
          type: 'line',
          data: points.map((point) => (-point.active_seconds / maxActive) * 100),
          smooth: 0.22,
          symbol: 'none',
          lineStyle: { color: color('--accent-primary'), width: 2, type: 'dashed' },
          areaStyle: { color: 'rgba(106,164,221,.12)' }
        }
      ]
    };
  });

  function readQuery(): void {
    const query = new URLSearchParams(location.search);
    page = Math.max(1, Number(query.get('page') ?? 0) + 1);
    pageSize = query.get('pageSize') ?? '50';
    search = query.get('query') ?? '';
    committedSearch = search;
    const requestedSort = query.get('sortBy') as ActivitySort | null;
    sortBy =
      requestedSort && sortOptions.some((option) => option.value === requestedSort)
        ? requestedSort
        : 'score';
    minScore = query.get('minScore') ?? '0';
    minDays = query.get('minDays') ?? '1';
  }

  function writeQuery(): void {
    const url = new URL(location.href);
    const set = (key: string, value: string, defaultValue: string) =>
      value === defaultValue ? url.searchParams.delete(key) : url.searchParams.set(key, value);
    set('page', String(page - 1), '0');
    set('pageSize', pageSize, '50');
    set('query', committedSearch, '');
    set('sortBy', sortBy, 'score');
    set('minScore', minScore, '0');
    set('minDays', minDays, '1');
    history.replaceState(history.state, '', `${url.pathname}${url.search}`);
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

  function toggleEvidence(key: string): void {
    const next = new Set(expandedEvidence);
    next.has(key) ? next.delete(key) : next.add(key);
    expandedEvidence = next;
  }

  function toggleSnapshot(id: number): void {
    const next = new Set(expandedSnapshots);
    next.has(id) ? next.delete(id) : next.add(id);
    expandedSnapshots = next;
  }

  function reasonMessage(reason: { key: string; message: string }, value: ActivityScore): string {
    if (reason.key === 'short_high_fan_careers')
      return `${value.short_high_fan_careers} career finishes were estimated under 15 minutes while reaching at least ${compactNumber(90_000)} fans per observed minute.`;
    if (reason.key === 'fan_gain_rate')
      return `Peak observed pace reached ${compactNumber(value.peak_fans_per_minute)} fans/min, with ${compactNumber(value.fans_per_active_minute)} fans/min sustained across active snapshots.`;
    return reason.message;
  }

  function snapshotTime(value: string): string {
    return new Date(value).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
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
      activity, not proof of botting; even 99/100 can reflect an outlier.
    </p>
  </Banner>
  {#if !viewerId}
    <section class="filters">
      <TextField
        id="activity-search"
        label="Search by Trainer Name or Viewer ID"
        hideLabel
        prefixIcon="search"
        type="search"
        placeholder="Search by Trainer Name or Viewer ID"
        bind:value={search}
        oninput={changeSearch}
      />
      <div>
        <SelectField
          id="activity-sort"
          label="Sort by"
          prefixIcon="sort"
          hideLabel
          options={sortOptions}
          bind:value={sortBy}
          onchange={applyFilters}
        /><SelectField
          id="activity-days"
          label="Minimum observed"
          prefixIcon="calendar"
          hideLabel
          options={dayOptions}
          bind:value={minDays}
          onchange={applyFilters}
        /><SelectField
          id="activity-score"
          label="Minimum score"
          prefixIcon="gauge"
          hideLabel
          options={scoreOptions}
          bind:value={minScore}
          onchange={applyFilters}
        />{#if committedSearch || sortBy !== 'score' || minDays !== '1' || minScore !== '0'}
          <Button
            variant="ghost"
            icon="close"
            onclick={clearFilters}
          >
            Clear
          </Button>
        {/if}
      </div>
    </section>
  {/if}
  {#if loading}
    <div class="loading">
      <Spinner size={30} />
      <span>{viewerId ? 'Loading viewer report…' : 'Loading suspicion scores…'}</span>
    </div>
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
    <section class="intro-stack tone-{scoreTone(score.suspicion_score)}">
      <div class="report-lead">
        <div class="lead-identity">
          <div class="lead-kicker">
            <span>{verdictLabel(score.evidence?.verdict)}</span>
            <small>Viewer ID {score.viewer_id}</small>
          </div>
          <h2>{score.trainer_name || 'Unknown Trainer'}</h2>
          <div class="lead-meta">
            <span>{score.circle_name ?? 'No current club'}</span>
            <span>{score.days_observed} observed days</span>
            <span>Last seen {new Date(score.last_seen).toLocaleDateString()}</span>
          </div>
        </div>
        <div class="report-score">
          <small>Suspicion score</small>
          <div>
            <strong>{score.suspicion_score}</strong>
            <span>/100</span>
          </div>
          <span class="score-band">{scoreBand(score.suspicion_score)}</span>
        </div>
        <p class="lead-summary">
          {score.short_high_fan_careers
            ? `${score.short_high_fan_careers} under-15m high-fan careers. Short-career gains average ${compactNumber(score.short_career_avg_fan_gain)}.`
            : score.evidence?.summary}
        </p>
      </div>
      {#if score.evidence?.caveats?.length}
        <Banner
          title={score.evidence.caveats[0]!}
          tone="warning"
        >
          {#each score.evidence.caveats.slice(1) as caveat}
            <p>{caveat}</p>
          {/each}
        </Banner>
      {/if}
      {#if score.short_high_fan_careers || score.short_fan_gain_score}
        <div class="automation-panel">
          <div>
            <span class="eyebrow">Primary signal · Training speed</span>
            <h3>{wholeNumber(score.short_high_fan_careers)} under-15m high-fan careers</h3>
            <p>
              High-fan means at least 90K fans per observed minute during an estimated career
              window.
            </p>
          </div>
          <div class="automation-score">
            <span>Weighted short-fan score</span>
            <strong>{decimalNumber(score.short_fan_gain_score)}</strong>
            <i>
              <b style={`width:${Math.min(100, (score.short_fan_gain_score / 35) * 100)}%`}></b>
            </i>
            <small>35+ is already saturated</small>
          </div>
          <dl>
            <div>
              <dt>Short windows</dt>
              <dd>{wholeNumber(shortCareerWindowCount(score))}</dd>
            </div>
            <div>
              <dt>Average short gain</dt>
              <dd>{compactNumber(score.short_career_avg_fan_gain)}</dd>
            </div>
            <div>
              <dt>P95 short gain</dt>
              <dd>{compactNumber(score.short_career_p95_fan_gain)}</dd>
            </div>
            <div>
              <dt>Last 20 avg</dt>
              <dd>{formatDuration(score.avg_career_length_last20_seconds)}</dd>
            </div>
          </dl>
        </div>
      {/if}
      <div class="summary-metrics">
        <div>
          <span>Total fan gain</span>
          <strong>{compactNumber(score.total_fan_gain)}</strong>
        </div>
        <div>
          <span>Peak fans/min</span>
          <strong>{compactNumber(score.peak_fans_per_minute)}</strong>
        </div>
        <div>
          <span>Last 20 careers/h</span>
          <strong>
            {decimalNumber(
              score.career_rate_breakdown?.last_20?.careers_per_hour ??
                score.careers_per_active_hour
            )}
          </strong>
        </div>
        <div>
          <span>Careers/day</span>
          <strong>{decimalNumber(averageCareersPerDay(score))}</strong>
        </div>
        <div>
          <span>{score.max_online_streak_seconds ? 'Max online streak' : 'Longest session'}</span>
          <strong>{formatDuration(primarySessionSeconds(score))}</strong>
        </div>
        <div>
          <span>Weekly buckets</span>
          <strong>{score.distinct_weekly_hour_buckets} / 168</strong>
        </div>
        <div>
          <span>Under-15m high-fan</span>
          <strong>{score.short_high_fan_careers}</strong>
        </div>
        <div>
          <span>Recent 3d gain</span>
          <strong>+{compactNumber(score.recent_fan_gain_3d)}</strong>
        </div>
      </div>
    </section>

    <section class="detail-section">
      <header class="section-heading">
        <div>
          <h3>Score inputs</h3>
          <p>Raw score payload grouped into activity, trend, and reset context.</p>
        </div>
        <div class="flags">
          {#each flags as flag}
            <span>{flag}</span>
          {:else}
            <span class="muted">No major activity signals were raised.</span>
          {/each}
        </div>
      </header>
      <div class="insight-grid">
        {#each scoreInsights as group}
          <article>
            <h4>{group.title}</h4>
            <p>{group.description}</p>
            <div>
              {#each group.metrics as metric}
                <dl>
                  <dt>{metric.label}</dt>
                  <dd>{metric.value}</dd>
                  {#if metric.hint}
                    <small>{metric.hint}</small>
                  {/if}
                </dl>
              {/each}
            </div>
          </article>
        {/each}
      </div>
    </section>

    <section class="detail-section">
      <header class="section-heading">
        <div>
          <h3>Why this account received this score</h3>
          <p>Signals are outlier indicators, not proof.</p>
        </div>
      </header>
      {#if evidenceGroups.length}
        <div class="evidence-groups">
          {#each evidenceGroups as group}
            <article class:expanded={expandedEvidence.has(group.key)}>
              <button
                type="button"
                onclick={() => toggleEvidence(group.key)}
                aria-expanded={expandedEvidence.has(group.key)}
              >
                <span>
                  <strong>{group.label}</strong>
                  <small>{group.description}</small>
                </span>
                <span>
                  {group.reasons.length} signals <Icon
                    name="chevron"
                    size={16}
                  />
                </span>
              </button>
              {#if expandedEvidence.has(group.key)}
                <div>
                  {#each group.reasons as reason}
                    <section>
                      <header>
                        <h4>{reason.label}</h4>
                        <strong>{reason.display_value}</strong>
                      </header>
                      <span>{reason.confidence} confidence</span>
                      <p>{reasonMessage(reason, score)}</p>
                      {#if reason.caveat}
                        <small>{reason.caveat}</small>
                      {/if}
                    </section>
                  {/each}
                </div>
              {/if}
            </article>
          {/each}
        </div>
      {:else}
        <p>{score.evidence?.summary}</p>
      {/if}
    </section>

    <section class="detail-grid">
      <article class="detail-section heatmap-section">
        <header class="section-heading">
          <div>
            <h3>Weekly activity heatmap</h3>
            <p>{heatmap.touched} of 168 slots · {score.days_observed} report days</p>
          </div>
        </header>
        <div class="heat-scroll">
          <div class="hour-profile">
            <span>24h</span>
            {#each hourly as value}
              <i style={`--bar:${Math.max(4, (value / Math.max(1, ...hourly)) * 100)}%`}></i>
            {/each}
          </div>
          <div class="hour-labels">
            <span></span>
            {#each Array.from({ length: 24 }, (_, index) => index) as hour}
              <span>
                {hour % 3 === 0 ? hour : ''}
              </span>
            {/each}
          </div>
          {#each days as day, dow}
            <div class="heat-row">
              <strong>{day}</strong>
              {#each Array.from({ length: 24 }, (_, index) => index) as hour}
                {@const cell = heatmap.values.get(`${dow}:${hour}`)}
                <i
                  title={`${day} ${hour}:00 · ${formatDuration(cell?.active_seconds)}`}
                  style={`--heat:${(cell?.active_seconds ?? 0) / heatmap.max}`}
                ></i>
              {/each}
            </div>
          {/each}
        </div>
        <div class="heat-legend">
          <span>Less</span>
          {#each [0, 0.25, 0.5, 0.75, 1] as level}
            <i style={`--heat:${level}`}></i>
          {/each}
          <span>More</span>
        </div>
      </article>
      <article class="detail-section">
        <header class="section-heading">
          <div>
            <h3>Career length buckets</h3>
            <p>Count and suspicion weight by estimated run window.</p>
          </div>
        </header>
        <div class="bucket-table">
          <div class="bucket-head">
            <span>Window</span>
            <span>Careers</span>
            <span>Suspicion weight</span>
          </div>
          {#each careerBuckets as bucket}
            <div class:short={bucket.isShortWindow}>
              <span>
                <strong>{bucket.label}</strong>
                <small>{bucket.description}</small>
              </span>
              <i>
                <b style={`width:${bucket.countPercent}%`}></b>
                <em>{wholeNumber(bucket.count)}</em>
              </i>
              <i class="signal">
                <b style={`width:${bucket.signalPercent}%`}></b>
                <em>{decimalNumber(bucket.signalScore)}</em>
              </i>
            </div>
          {/each}
        </div>
      </article>
    </section>

    {#if report?.daily?.length}
      <section class="detail-section daily">
        <header class="section-heading">
          <div>
            <h3>Daily fan gain</h3>
            <p>Fan gain is above balance, activity below, and the center line shows daily bias.</p>
          </div>
          <span>
            Peak +{compactNumber(Math.max(...report.daily.map((row) => row.fan_gain)))} · {report
              .daily.length} days
          </span>
        </header>
        <LazyEChartsSurface
          option={dailyChartOption}
          label="Daily fan gain and active time"
          height={340}
        />
        <div class="chart-legend">
          <span class="fan">Fan gain</span>
          <span class="bias">Bias</span>
          <span class="active">Active time</span>
        </div>
        <div class="daily-highlights">
          {#each dailyHighlights as metric}
            <dl>
              <dt>{metric.label}</dt>
              <dd>{metric.value}</dd>
              <small>{metric.hint}</small>
            </dl>
          {/each}
        </div>
      </section>
    {/if}

    {#if sessionRows.length}
      <section class="detail-section">
        <header class="section-heading">
          <div>
            <h3>Top sessions</h3>
            <p>Longest observed windows. Observed time can include idle gaps.</p>
          </div>
        </header>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Day</th>
                <th>Window</th>
                <th>Observed</th>
                <th>Active</th>
                <th>Idle</th>
                <th>Careers</th>
                <th>Fan gain</th>
                <th>Sessions</th>
              </tr>
            </thead>
            <tbody>
              {#each sessionRows as row}
                <tr>
                  <td>{row.dayLabel}</td>
                  <td>{row.windowLabel}</td>
                  <td>{formatDuration(row.observedSeconds)}</td>
                  <td>{formatDuration(row.activeSeconds)}</td>
                  <td>{formatDuration(row.idleSeconds)}</td>
                  <td>{wholeNumber(row.careers)}</td>
                  <td class="positive">+{wholeNumber(row.fanGain)}</td>
                  <td>{wholeNumber(row.sessionCount)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>
    {/if}

    {#if snapshots.length}
      <section class="detail-section">
        <header class="section-heading">
          <div>
            <h3>Short careers</h3>
            <p>
              Showing the latest {snapshots.length} of {report?.short_career_snapshots_total ??
                snapshots.length} records.
            </p>
          </div>
        </header>
        <div class="table-wrap">
          <table class="snapshots">
            <thead>
              <tr>
                <th>Time</th>
                <th>Previous fans</th>
                <th>Current fans</th>
                <th>Gain</th>
                <th>Snapshot gap</th>
                <th>Career gap</th>
                <th>Length</th>
                <th>Fans/min</th>
                <th>Score</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {#each snapshots as snapshot}
                <tr class:highlight={snapshot.is_high_fan_short}>
                  <td>
                    <button
                      type="button"
                      class="expand"
                      aria-expanded={expandedSnapshots.has(snapshot.snapshot_id)}
                      onclick={() => toggleSnapshot(snapshot.snapshot_id)}
                    >
                      <Icon
                        name="chevron"
                        size={14}
                      />
                    </button>
                    {snapshotTime(snapshot.snapshot_time)}
                  </td>
                  <td>{wholeNumber(snapshot.previous_snapshot_fans)}</td>
                  <td>{wholeNumber(snapshot.current_fans)}</td>
                  <td class="positive">+{compactNumber(snapshot.fan_gain)}</td>
                  <td>{formatDuration(snapshot.snapshot_gap_seconds)}</td>
                  <td>{formatDuration(snapshot.previous_career_gap_seconds)}</td>
                  <td>{formatDuration(snapshot.career_length_seconds)}</td>
                  <td>{compactNumber(parsedNumber(snapshot.fans_per_minute))}</td>
                  <td>{decimalNumber(parsedNumber(snapshot.short_training_score))}</td>
                  <td>{snapshot.is_high_fan_short ? 'High-fan' : 'Below rate'}</td>
                </tr>
                {#if expandedSnapshots.has(snapshot.snapshot_id)}
                  <tr class="snapshot-detail">
                    <td colspan="10">
                      <div>
                        <strong>Highlighted short career</strong>
                        <span>Gain +{wholeNumber(snapshot.fan_gain)}</span>
                        <span>Runtime {formatDuration(snapshot.career_length_seconds)}</span>
                        {#each [...(snapshot.prior_snapshots ?? []), ...(snapshot.next_snapshots ?? [])] as neighbor}
                          <span>
                            {snapshotTime(neighbor.snapshot_time)} · {neighbor.fan_delta >= 0
                              ? '+'
                              : ''}{wholeNumber(neighbor.fan_delta)} · {neighbor.career_count} career
                            ends
                          </span>
                        {/each}
                      </div>
                    </td>
                  </tr>
                {/if}
              {/each}
            </tbody>
          </table>
        </div>
      </section>
    {/if}

    {#if probeInsights.length}
      <section class="detail-section">
        <header class="section-heading">
          <div>
            <h3>Probe metrics</h3>
            <p>Cadence, schedule, burst, and account-context metrics returned by the API.</p>
          </div>
          <span>cadence / schedule / context</span>
        </header>
        <div class="insight-grid">
          {#each probeInsights as group}
            <article>
              <h4>{group.title}</h4>
              <p>{group.description}</p>
              <div>
                {#each group.metrics as metric}
                  <dl>
                    <dt>{metric.label}</dt>
                    <dd>{metric.value}</dd>
                    <small>{metric.hint}</small>
                  </dl>
                {/each}
              </div>
            </article>
          {/each}
        </div>
      </section>
    {/if}
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
      <ContentAd
        routeId="activity"
        top
      />
      <div class="list-meta">
        <span>{hall.total.toLocaleString()} accounts</span>
        {#if hall.last_refreshed_at}
          <span>
            Updated {new Date(hall.last_refreshed_at).toLocaleString()}
          </span>
        {/if}
      </div>
      <section
        use:virtualScroll={{
          items: hall.entries,
          searchText: (entry) =>
            [
              entry.trainer_name,
              entry.viewer_id,
              entry.circle_name,
              scoreBand(entry.suspicion_score),
              verdictLabel(entry.evidence?.verdict)
            ].join(' '),
          key: (entry) => entry.viewer_id,
          estimate: 100,
          onrange: (range) => (virtualRange = range)
        }}
        class="activity-list"
      >
        {#each hall.entries.slice(virtualRange.start, virtualRange.end) as entry, localIndex (entry.viewer_id)}
          {@const index = virtualRange.start + localIndex}
          <div data-virtual-index={index}>
            <article class="activity-row tone-{scoreTone(entry.suspicion_score)}">
              <strong class="rank">#{(page - 1) * hall.limit + index + 1}</strong>
              <div class="identity">
                <div>
                  <a
                    href={`/activity/${entry.viewer_id}${typeof window === 'undefined' ? '' : window.location.search}`}
                  >
                    {entry.trainer_name || 'Unknown Trainer'}
                  </a>
                  <span>ID {entry.viewer_id}</span>
                </div>
                <p>
                  {#if entry.circle_id}
                    <a href={`/circles/${entry.circle_id}`}>
                      {entry.circle_name || 'Club'}
                      {entry.circle_monthly_rank ? `#${entry.circle_monthly_rank}` : ''}
                    </a>
                  {/if}
                  <span>{entry.days_observed}d observed</span>
                  <span>{entry.total_careers.toLocaleString()} careers</span>
                </p>
                <small>
                  {verdictLabel(
                    entry.evidence?.verdict
                  )}{#each entry.evidence?.reasons?.slice(0, 2) ?? [] as reason}
                    <Badge>
                      {reason.label}
                    </Badge>
                  {/each}
                </small>
              </div>
              <dl>
                <div>
                  <dt>Fan gain</dt>
                  <dd>{compactNumber(entry.total_fan_gain)}</dd>
                </div>
                <div>
                  <dt>Active</dt>
                  <dd>{formatDuration(entry.total_active_seconds)}</dd>
                </div>
                <div>
                  <dt>Careers/hr</dt>
                  <dd>{entry.careers_per_active_hour.toFixed(1)}</dd>
                </div>
              </dl>
              <div class="row-score">
                <span>{scoreBand(entry.suspicion_score)}</span>
                <strong>{entry.suspicion_score}</strong>
                <small>/100</small>
              </div>
              <div class="open">
                <Button
                  variant="ghost"
                  icon="arrow-right"
                  href={`/activity/${entry.viewer_id}${typeof window === 'undefined' ? '' : window.location.search}`}
                  ariaLabel={`Open activity report for ${entry.trainer_name || entry.viewer_id}`}
                />
              </div>
            </article>
            {#if index === 14 || index === 34}
              <ContentAd
                routeId="activity"
                index={index === 14 ? 2 : 3}
              />
            {/if}
          </div>
        {/each}
      </section>
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
