<script lang="ts">
  import type { ActivityScore } from '@/lib/activity/activity-types';
  import {
    averageCareersPerDay,
    compactNumber,
    decimalNumber,
    formatDuration,
    primarySessionSeconds,
    scoreBand,
    scoreTone,
    shortCareerWindowCount,
    verdictLabel,
    wholeNumber
  } from '@/lib/activity/activity';
  import Banner from '@/components/feedback/Banner.svelte';

  let { score }: { score: ActivityScore } = $props();
</script>

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
        <span class="eyebrow">Training speed (primary signal)</span>
        <h3>{wholeNumber(score.short_high_fan_careers)} under-15m high-fan careers</h3>
        <p>
          High-fan means at least 90K fans per observed minute during an estimated career window.
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
          score.career_rate_breakdown?.last_20?.careers_per_hour ?? score.careers_per_active_hour
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

<style>
  @import '../activity-metrics.css';
  @import '../activity-tones.css';
  @import './activity-report-summary.css';
</style>
