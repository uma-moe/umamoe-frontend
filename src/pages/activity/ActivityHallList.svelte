<script lang="ts">
  import { virtualScroll, type VirtualRange } from '@/lib/virtual-scroll';
  import type { ActivityHall } from '@/lib/activity/activity-types';
  import {
    compactNumber,
    formatDuration,
    scoreBand,
    scoreTone,
    verdictLabel
  } from '@/lib/activity/activity';
  import ContentAd from '@/layouts/ads/ContentAd.svelte';
  import Badge from '@/components/Badge.svelte';
  import Button from '@/components/controls/Button.svelte';

  interface Props {
    hall: ActivityHall;
    page: number;
  }

  let { hall, page }: Props = $props();

  let virtualRange = $state<VirtualRange>({ start: 0, end: 0 });
</script>

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

<style>
  @import './activity-metrics.css';
  @import './activity-tones.css';
  @import './activity-hall-list.css';
</style>
