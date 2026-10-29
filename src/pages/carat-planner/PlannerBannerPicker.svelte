<script lang="ts">
  import type { TimelineRecord } from '@/pages/timeline/timeline-repository';
  import { filterPlannerBanners } from '@/lib/carat-planner/presentation/planner-presentation';
  import { timelineDisplayTitle } from '@/lib/timeline/events/timeline-pickups';
  import Combobox from '@/components/controls/Combobox.svelte';
  import Icon from '@/components/Icon.svelte';

  interface Props {
    events: TimelineRecord[];
    projectionStart: string;
    addedEventIds: Set<string>;
    rewardsUnavailable: boolean;
    query: string;
    onadd: (event: TimelineRecord) => void;
  }

  let {
    events,
    projectionStart,
    addedEventIds,
    rewardsUnavailable,
    query = $bindable(),
    onadd
  }: Props = $props();

  const eventsById = $derived(new Map(events.map((event) => [event.id, event])));
  const matchingBanners = $derived(filterPlannerBanners(events, query, projectionStart));
  const bannerOptions = $derived(
    matchingBanners.map((event) => ({
      value: event.id,
      label: timelineDisplayTitle(event),
      disabled: addedEventIds.has(event.id) || (event.plannerRewardAvailable && rewardsUnavailable)
    }))
  );
</script>

<div class="picker">
  <Combobox
    id="planner-banner"
    label="Search character, support, or paid banners"
    hideLabel
    prefixIcon="search"
    action
    filter={false}
    batchSize={40}
    bind:query
    options={bannerOptions}
    placeholder="Search names, banner types, or reruns…"
    clearLabel="Clear banner search"
    emptyText={events.length
      ? 'No banners match this search and type.'
      : 'Waiting for banner data…'}
    onchange={(value) => {
      const event = eventsById.get(value);
      if (event) onadd(event);
    }}
  >
    {#snippet optionContent(option)}
      {@const event = eventsById.get(option.value)!}
      <span class="banner-option">
        <span class="banner-art">
          {#if event.image}
            <img
              src={event.image}
              alt=""
              loading="lazy"
            />
          {:else}
            <Icon name={event.eventType.includes('support') ? 'database' : 'user'} />
          {/if}
        </span>
        <span class="banner-copy">
          <strong>{option.label}</strong>
          <time>{event.dateLabel}</time>
        </span>
        <span class="banner-action">
          <Icon
            name={addedEventIds.has(event.id) ? 'check' : 'add'}
            size={16}
          />
          <span>{addedEventIds.has(event.id) ? 'Added' : 'Add'}</span>
        </span>
      </span>
    {/snippet}
  </Combobox>
</div>

<style>
  .picker {
    min-width: 0;
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 8px 10px;
  }
  .picker :global(.combo-panel) {
    max-height: min(320px, 46dvh);
  }
  .banner-option {
    width: 100%;
    min-width: 0;
    min-height: 52px;
    display: grid;
    grid-template-columns: 148px minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    padding-block: 4px;
  }
  .banner-art {
    display: grid;
    place-items: center;
    height: 36px;
    border: 1px solid var(--border-subtle);
    background: var(--surface-2);
  }
  .banner-art img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .banner-copy {
    min-width: 0;
    display: grid;
    gap: 3px;
  }
  .banner-copy strong,
  .banner-copy time {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .banner-copy time {
    color: var(--text-secondary);
    font-size: 10px;
  }
  .banner-action {
    display: flex;
    align-items: center;
    gap: 3px;
    color: var(--accent-primary);
    font-size: 10px;
  }
  @media (max-width: 768px) {
    .picker {
      padding: 10px 6px;
    }
  }
  @media (max-width: 680px) {
    .banner-option {
      grid-template-columns: 120px minmax(0, 1fr) 18px;
      gap: 6px;
    }
    .banner-art {
      height: 29px;
    }
    .banner-action > span {
      display: none;
    }
  }
</style>
