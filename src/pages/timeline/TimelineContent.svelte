<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { get } from 'svelte/store';
  import {
    activePlan,
    enabledPlannerTargets,
    setTimelineEvent
  } from '@/lib/carat-planner/carat-planner';
  import {
    plannerCollection,
    plannerSaveError,
    savePlannerCollection
  } from '@/pages/carat-planner/planner-state';
  import TimelineBoard from './board/TimelineBoard.svelte';
  import {
    buildTimelineLanes,
    timelineEndDate,
    type TimelineAnniversary
  } from '@/lib/timeline/board/timeline-layout';
  import AdRegion from '@/layouts/ads/AdRegion.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import EmptyState from '@/components/feedback/EmptyState.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import TimelineEventCard from '@/components/cards/TimelineEventCard.svelte';
  import type { TimelineEventData } from '@/components/cards/timeline-types';
  import { timelineRepository, type TimelineRecord } from './timeline-repository';
  import { plannerResourceRepository } from '@/pages/carat-planner/planner-resource-repository';
  import type { PlannerRewardResource } from '@/lib/carat-planner/carat-planner';
  import type { TimelineCalculation } from '@/lib/timeline/prediction/timeline-prediction-types';
  import type { TimelinePickupCatalog } from '@/lib/timeline/events/timeline-pickups';
  import { buildTimelineRewardSummaries } from '@/lib/timeline/events/timeline-reward-summary';
  import { searchKey } from '@/lib/timeline/board/timeline-search';
  import type { FilterType, TimelineStatus } from './timeline-controls';
  import { filterTimelineEvents, plannedEventIds, timelineCardView } from './timeline-events';
  import TimelineEventDialog from './details/TimelineEventDialog.svelte';
  import TimelineLoading from './TimelineLoading.svelte';

  let {
    tab,
    mobile,
    view = $bindable('horizontal'),
    compactGaps = $bindable(true),
    search,
    visibleTypes,
    status = $bindable()
  }: {
    tab: 'timeline' | 'carat-planner';
    mobile: boolean;
    view?: 'horizontal' | 'vertical';
    compactGaps?: boolean;
    search: string;
    visibleTypes: FilterType[];
    status?: TimelineStatus;
  } = $props();

  // Resource snapshots are replaced wholesale; deep proxies slow large planner scans.
  let events = $state.raw<TimelineRecord[]>([]);
  let loading = $state(true);
  let error = $state('');
  let plannerVisited = $state(false),
    timelineVisited = $state(false);

  let now = $state(new Date());
  let anniversaries = $state.raw<TimelineAnniversary[]>([]);
  let timelineBoard = $state<TimelineBoard>();
  let currentSearchIndex = $state(-1);
  let collection = $state.raw(get(plannerCollection));
  let calculation = $state<TimelineCalculation | null>(null);
  let catalog = $state.raw<TimelinePickupCatalog>({ characters: {}, supports: new Map() });
  let rewardResource = $state.raw<PlannerRewardResource>({ rewards: [] });
  let rewardsLoading = $state(false);
  let rewardsError = $state('');

  let rewardsReady = false;
  const pendingRewardEvents = new Map<string, symbol>();

  let detailDialog = $state<TimelineEventDialog>();

  const rewardSummaries = $derived(buildTimelineRewardSummaries(rewardResource, events));
  const plannedIds = $derived(plannedEventIds(collection));
  const plannerEventCount = $derived(enabledPlannerTargets(activePlan(collection)).length);
  const searchTerm = $derived(searchKey(search));
  const filtered = $derived(filterTimelineEvents(events, visibleTypes, searchTerm));
  const endDate = $derived(timelineEndDate(events, mobile));
  const dateLanes = $derived(
    buildTimelineLanes(filtered, anniversaries, endDate, compactGaps, Boolean(search.trim()))
  );

  const searchPosition = $derived(
    search.trim() && filtered.length
      ? `${currentSearchIndex + 1} of ${dateLanes.length}`
      : search.trim()
        ? 'No results'
        : ''
  );

  export function changeView(value: string) {
    if (value !== 'horizontal' && value !== 'vertical') return;
    void timelineBoard?.changeView(value);
    view = value;
  }

  export async function changeSpacing() {
    const anchor = timelineBoard?.anchorDate();
    compactGaps = !compactGaps;
    await tick();
    if (anchor) await timelineBoard?.restoreAnchor(anchor);
  }

  function savePlanner(next = collection): void {
    savePlannerCollection(next);
  }

  function plan(event: TimelineEventData, planned: boolean): void {
    const record = events.find((item) => item.id === event.id);
    if (!record) return;
    const summary = rewardSummaries.get(record.id);
    const plannerEvent = {
      ...record,
      plannerRewardAvailable:
        record.plannerRewardAvailable || Boolean(summary && summary.mode !== 'placement')
    };

    const planId = collection.activePlanId;
    const key = `${planId}:${record.id}`;
    const operation = Symbol();
    pendingRewardEvents.set(key, operation);
    collection = setTimelineEvent(
      collection,
      plannerEvent,
      planned,
      rewardsReady ? rewardResource : undefined
    );
    savePlanner();
    if (!planned || !plannerEvent.plannerRewardAvailable || rewardsReady) {
      pendingRewardEvents.delete(key);
      return;
    }

    void loadRewards()
      .then((resource) => {
        if (
          !resource ||
          pendingRewardEvents.get(key) !== operation ||
          collection.activePlanId !== planId ||
          activePlan(collection).disabledEventIds.includes(record.id)
        )
          return;
        collection = setTimelineEvent(collection, plannerEvent, true, resource);
        savePlanner();
      })
      .catch((reason) => {
        rewardsError =
          reason instanceof Error
            ? reason.message
            : 'The planner reward selection could not be saved.';
      })
      .finally(() => {
        if (pendingRewardEvents.get(key) === operation) pendingRewardEvents.delete(key);
      });
  }

  async function loadRewards(refresh = false): Promise<PlannerRewardResource | undefined> {
    rewardsLoading = true;
    rewardsError = '';
    try {
      rewardResource = await plannerResourceRepository.rewards(refresh);
      rewardsReady = true;
      return rewardResource;
    } catch (reason) {
      rewardsError =
        reason instanceof Error ? reason.message : 'Event rewards could not be loaded.';
      return undefined;
    } finally {
      rewardsLoading = false;
    }
  }

  function openDetails(event: TimelineEventData): void {
    detailDialog?.open(events.find((item) => item.id === event.id));
  }

  export function jumpSearch(offset: number): void {
    if (!dateLanes.length) return;
    currentSearchIndex =
      offset < 0 && currentSearchIndex <= 0
        ? dateLanes.length - 1
        : (currentSearchIndex + offset) % dateLanes.length;
    timelineBoard?.scrollToLane(dateLanes[currentSearchIndex]!.key);
  }

  export function scrollToToday(): void {
    void timelineBoard?.scrollToToday();
  }

  export function scrollToDate(date: Date): void {
    void timelineBoard?.scrollToDate(date);
  }

  async function load(refresh = false): Promise<void> {
    loading = true;
    error = '';
    try {
      const loaded = await timelineRepository.load(refresh);
      events = loaded.events;
      anniversaries = loaded.anniversaries;
      calculation = loaded.calculation;
      catalog = loaded.catalog;
      void loadRewards(refresh);
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'Timeline resources could not be loaded.';
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    const todayTimer = setInterval(() => {
      if (!document.hidden) now = new Date();
    }, 300_000);

    const unsubscribe = plannerCollection.subscribe((next) => (collection = next));
    const stopRewards = plannerResourceRepository.watchRewards((rewards) => {
      rewardResource = rewards;
      rewardsReady = true;
    });

    void load();
    return () => {
      stopRewards();
      clearInterval(todayTimer);
      unsubscribe();
      pendingRewardEvents.clear();
    };
  });

  $effect(() => {
    if (tab === 'carat-planner') plannerVisited = true;
    else timelineVisited = true;
  });

  $effect(() => {
    search;
    visibleTypes;
    currentSearchIndex = -1;
  });

  $effect(() => {
    status = {
      filtered: filtered.length,
      total: events.length,
      searchPosition,
      plannerEventCount,
      loading,
      rewardsLoading
    };
  });
</script>

{#if $plannerSaveError}
  <Banner
    title="Plan changes are not saved on this device"
    tone="danger"
  >
    <p>{$plannerSaveError}</p>
    <Button
      size="sm"
      variant="secondary"
      onclick={() => savePlanner()}
    >
      Retry saving
    </Button>
  </Banner>
{/if}
{#if plannerVisited || tab === 'carat-planner'}
  <div hidden={tab !== 'carat-planner'}>
    {#await import('@/pages/carat-planner/CaratPlanner.svelte')}
      <Spinner
        centered
        minHeight="320px"
        label="Loading Carat Planner…"
      />
    {:then module}
      <module.default
        active={tab === 'carat-planner'}
        {events}
        {catalog}
        bind:collection
        onchange={savePlanner}
        saveError={$plannerSaveError}
      />
    {:catch}
      <Banner
        title="Carat Planner could not be loaded"
        tone="danger"
      >
        <Button
          variant="secondary"
          onclick={() => location.reload()}
        >
          Reload page
        </Button>
      </Banner>
    {/await}
  </div>
{/if}
{#if timelineVisited || tab === 'timeline'}
  <section
    class="timeline-content"
    class:mobile
    hidden={tab !== 'timeline'}
  >
    {#if error}
      <div class="timeline-error">
        <Banner
          title="Timeline could not be loaded"
          tone="danger"
        >
          <p>{error}</p>
          <Button
            variant="secondary"
            size="sm"
            icon="refresh"
            onclick={() => void load(true)}
          >
            Try again
          </Button>
        </Banner>
      </div>
    {/if}
    {#if loading}
      <TimelineLoading />
    {:else if !filtered.length && !error && search.trim()}
      <EmptyState
        icon="timeline"
        title="No events match"
        description="Enable another event type or clear the search."
      />
    {:else if !error}
      <div class="timeline-viewport">
        <TimelineBoard
          bind:this={timelineBoard}
          active={tab === 'timeline'}
          lanes={dateLanes}
          events={filtered}
          {anniversaries}
          end={endDate}
          {now}
          {mobile}
          {view}
          compact={compactGaps}
        >
          {#snippet card(event: TimelineRecord, loadImages: boolean)}
            <div id={`timeline-event-${event.id}`}>
              <TimelineEventCard
                event={timelineCardView(event, rewardSummaries.get(event.id))}
                {mobile}
                {loadImages}
                planned={plannedIds.includes(event.id)}
                onplan={plan}
                onopen={openDetails}
              />
            </div>
          {/snippet}
        </TimelineBoard>
        {#if !mobile && tab === 'timeline'}
          <div
            class="timeline-right-rail"
            data-ad-position="right"
          >
            <AdRegion
              placement="timeline_sticky_vrec_right"
              kind="rail"
              sizes={['160x600']}
              active
            />
          </div>
        {/if}
      </div>
    {/if}
  </section>
{/if}
<TimelineEventDialog
  bind:this={detailDialog}
  {catalog}
  {calculation}
  {rewardSummaries}
  {rewardsLoading}
  {rewardsError}
  {plannedIds}
  onplan={plan}
  onretryrewards={() => void loadRewards(true)}
/>

<style>
  .timeline-content {
    position: relative;
    min-width: 0;
  }
  .timeline-content:not(.mobile) {
    display: flex;
    flex-direction: column;
    flex: 1 1 0px;
    min-height: 0;
  }
  .timeline-content[hidden] {
    display: none;
  }
  .mobile {
    padding-bottom: calc(var(--timeline-toolbar-height) + 4px);
  }
  .timeline-viewport {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1 1 0;
    min-height: 0;
    min-width: 0;
  }
  .timeline-content:not(.mobile) .timeline-viewport {
    container: timeline-viewport / size;
  }
  .mobile .timeline-viewport {
    display: block;
  }
  .timeline-right-rail {
    display: none;
    position: absolute;
    right: 8px;
    top: calc((100dvh - var(--ad-rail-height)) / 2 - var(--timeline-viewport-top, 0px));
    z-index: var(--z-rail);
  }
  @media (min-width: 1700px) {
    @container timeline-viewport (min-height:616px) {
      .timeline-right-rail {
        display: block;
      }
    }
  }
  .timeline-error {
    padding: 20px var(--page-gutter-current);
  }
</style>
