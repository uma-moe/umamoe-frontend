<script lang="ts">
  import type { ActivityReport, ActivityScore } from '@/lib/activity/activity-types';
  import {
    buildCareerBuckets,
    buildDailyHighlights,
    compactNumber,
    decimalNumber,
    formatDuration,
    wholeNumber
  } from '@/lib/activity/activity';
  import LazyEChartsSurface from '@/components/charts/LazyEChartsSurface.svelte';
  import { theme } from '@/stores/theme';
  import { activityDailyChartOption } from './activity-daily-chart';

  interface Props {
    report: ActivityReport;
    score: ActivityScore;
  }

  let { report, score }: Props = $props();

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const careerBuckets = $derived(buildCareerBuckets(score));
  const dailyHighlights = $derived(buildDailyHighlights(report.daily ?? []));
  const heatmap = $derived.by(() => {
    const values = new Map(
      (report.heatmap ?? []).map((cell) => [`${cell.dow}:${cell.hour}`, cell])
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
      (report.heatmap ?? [])
        .filter((cell) => cell.hour === hour)
        .reduce((sum, cell) => sum + cell.active_seconds, 0)
    )
  );

  const dailyChartOption = $derived.by(() => {
    $theme;
    return activityDailyChartOption(report.daily ?? []);
  });
</script>

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

{#if report.daily?.length}
  <section class="detail-section daily">
    <header class="section-heading">
      <div>
        <h3>Daily fan gain</h3>
        <p>Fan gain is above balance, activity below, and the center line shows daily bias.</p>
      </div>
      <span>
        Peak +{compactNumber(Math.max(...report.daily.map((row) => row.fan_gain)))} · {report.daily
          .length} days
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

<style>
  @import '../activity-metrics.css';
  @import './activity-section.css';
  @import './activity-report-patterns.css';
</style>
