<script lang="ts">
  import type { ActivityScore } from '@/lib/activity/activity-types';
  import {
    buildEvidenceGroups,
    buildScoreInsights,
    compactNumber,
    viewerFlags
  } from '@/lib/activity/activity';
  import Icon from '@/components/Icon.svelte';

  interface Props {
    score: ActivityScore;
    expandedEvidence: Set<string>;
  }

  let { score, expandedEvidence = $bindable() }: Props = $props();

  const evidenceGroups = $derived(buildEvidenceGroups(score.evidence?.reasons ?? []));
  const scoreInsights = $derived(buildScoreInsights(score));
  const flags = $derived(viewerFlags(score));

  function toggleEvidence(key: string): void {
    const next = new Set(expandedEvidence);
    next.has(key) ? next.delete(key) : next.add(key);
    expandedEvidence = next;
  }

  function reasonMessage(reason: { key: string; message: string }, value: ActivityScore): string {
    if (reason.key === 'short_high_fan_careers')
      return `${value.short_high_fan_careers} career finishes were estimated under 15 minutes while reaching at least ${compactNumber(90_000)} fans per observed minute.`;
    if (reason.key === 'fan_gain_rate')
      return `Peak observed pace reached ${compactNumber(value.peak_fans_per_minute)} fans/min, with ${compactNumber(value.fans_per_active_minute)} fans/min sustained across active snapshots.`;
    return reason.message;
  }
</script>

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

<style>
  @import '../activity-metrics.css';
  @import './activity-section.css';
  @import './activity-insights.css';
  @import './activity-report-signals.css';
</style>
