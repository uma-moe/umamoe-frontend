<script lang="ts">
  import type { ActivityReport, ActivityScore } from '@/lib/activity/activity-types';
  import {
    buildProbeInsights,
    buildSessionRows,
    compactNumber,
    decimalNumber,
    formatDuration,
    parsedNumber,
    wholeNumber
  } from '@/lib/activity/activity';
  import Icon from '@/components/Icon.svelte';

  interface Props {
    report: ActivityReport;
    score: ActivityScore;
    expandedSnapshots: Set<number>;
  }

  let { report, score, expandedSnapshots = $bindable() }: Props = $props();

  const probeInsights = $derived(buildProbeInsights(score.probe_metrics));
  const sessionRows = $derived(
    buildSessionRows(
      report.top_sessions?.length ? report.top_sessions : (report.top_online_streaks ?? [])
    )
  );

  const snapshots = $derived((report.short_career_snapshots ?? []).slice(0, 25));

  function toggleSnapshot(id: number): void {
    const next = new Set(expandedSnapshots);
    next.has(id) ? next.delete(id) : next.add(id);
    expandedSnapshots = next;
  }

  function snapshotTime(value: string): string {
    return new Date(value).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
</script>

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
          Showing the latest {snapshots.length} of {report.short_career_snapshots_total ??
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
                          : ''}{wholeNumber(neighbor.fan_delta)} · {neighbor.career_count} career ends
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

<style>
  @import '../activity-metrics.css';
  @import './activity-section.css';
  @import './activity-insights.css';
  @import './activity-report-records.css';
</style>
