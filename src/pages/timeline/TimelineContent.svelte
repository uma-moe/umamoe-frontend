<script lang="ts">
  import { itemIconPath } from '@/lib/catalog/item-icons';
  import { onMount, tick } from 'svelte';
  import { get } from 'svelte/store';
  import { activePlan, enabledPlannerTargets, setTimelineEvent } from '@/lib/timeline/carat-planner';
  import { plannerCollection, plannerSaveError, savePlannerCollection } from '@/pages/carat-planner/planner-state';
  import TimelineBoard from './TimelineBoard.svelte';
  import { buildTimelineLanes, timelineEndDate, type TimelineAnniversary } from '@/lib/timeline/timeline-layout';
  import AdRegion from '@/layouts/AdRegion.svelte';
  import Button from '@/components/Button.svelte';
  import Banner from '@/components/Banner.svelte';
  import EmptyState from '@/components/EmptyState.svelte';
  import Spinner from '@/components/Spinner.svelte';
  import TimelineEventCard from '@/components/TimelineEventCard.svelte';
  import type { TimelineEventData } from '@/components/timeline-types';
  import { timelineRepository, type TimelineRecord } from './timeline-repository';
  import Dialog from '@/components/Dialog.svelte';
  import { plannerResourceRepository } from '@/pages/carat-planner/planner-resource-repository';
  import type { PlannerGachaEntry, PlannerRewardResource } from '@/lib/timeline/carat-planner';
  import type { TimelineCalculation } from '@/lib/timeline/timeline-prediction-types';
  import { timelineDisplayTitle, type TimelinePickupCatalog } from '@/lib/timeline/timeline-pickups';
  import { buildTimelineRewardSummaries } from '@/lib/timeline/timeline-reward-summary';
  import { timelineCardContext, timelineCardRaceLines } from '@/lib/timeline/timeline-race-facts';
  import { searchKey } from '@/lib/timeline/timeline-search';

  import { filterOptions, type FilterType, type TimelineStatus } from './timeline-controls';
  let { tab, mobile, view = $bindable('horizontal'), compactGaps = $bindable(true), search, visibleTypes, status = $bindable() }: {
    tab: 'timeline' | 'carat-planner'; mobile: boolean; view?: 'horizontal' | 'vertical'; compactGaps?: boolean;
    search: string; visibleTypes: FilterType[]; status?: TimelineStatus;
  } = $props();


  // Resource snapshots are replaced wholesale; deep proxies slow large planner scans.
  let events = $state.raw<TimelineRecord[]>([]);
  let loading = $state(true);
  let error = $state('');
  let plannerVisited = $state(false), timelineVisited = $state(false);
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
  let detailEvent = $state<TimelineRecord>();
  let detailGacha = $state<PlannerGachaEntry>();
  let ratesLoading = $state(false);
  let ratesError = $state('');
  let detailRequest = 0;
  const rewardSummaries = $derived(buildTimelineRewardSummaries(rewardResource, events));

  const plannedIds = $derived([...new Set([...activePlan(collection).targets.map((target) => target.eventId), ...activePlan(collection).enabledRewardEventIds])].filter(id => !activePlan(collection).disabledEventIds.includes(id)));
  const plannerEventCount = $derived(enabledPlannerTargets(activePlan(collection)).length);
  const searchTerm = $derived(searchKey(search));
  const filtered = $derived(events.filter((event) => {
    const knownType = filterOptions.some((option) => option.type === event.eventType);
    if (knownType && !visibleTypes.includes(event.eventType as FilterType)) return false;
    return !searchTerm || [event.title, event.context ?? '', event.typeLabel, event.gachaLabel ?? '', event.gachaTypeName ?? '', ...event.tags,
      ...(event.pickups ?? []).flatMap(pickup => [pickup.name, pickup.subLabel ?? '', ...(pickup.searchTerms ?? [])])
    ].some(value => searchKey(value).includes(searchTerm));
  }));
  const endDate = $derived(timelineEndDate(events, mobile));
  const dateLanes = $derived(buildTimelineLanes(filtered, anniversaries, endDate, compactGaps, Boolean(search.trim())));
  const searchPosition = $derived(search.trim() && filtered.length ? `${currentSearchIndex + 1} of ${dateLanes.length}` : search.trim() ? 'No results' : '');

  export function changeView(value: string) { const next = value as typeof view; void timelineBoard?.changeView(next); view = next; }
  export async function changeSpacing() { const anchor = timelineBoard?.anchorDate(); compactGaps = !compactGaps; await tick(); if (anchor) await timelineBoard?.restoreAnchor(anchor); }

  function savePlanner(next = collection): void { savePlannerCollection(next); }
  function plan(event: TimelineEventData, planned: boolean): void {
    const record = events.find((item) => item.id === event.id);
    if (!record) return;
    const summary = rewardSummaries.get(record.id);
    const plannerEvent = { ...record, plannerRewardAvailable: record.plannerRewardAvailable || Boolean(summary && summary.mode !== 'placement') };
    const planId = collection.activePlanId;
    const key = `${planId}:${record.id}`;
    const operation = Symbol();
    pendingRewardEvents.set(key, operation);
    collection = setTimelineEvent(collection, plannerEvent, planned, rewardsReady ? rewardResource : undefined);
    savePlanner();
    if (!planned || !plannerEvent.plannerRewardAvailable || rewardsReady) { pendingRewardEvents.delete(key); return; }
    void loadRewards().then(resource => {
      if (!resource || pendingRewardEvents.get(key) !== operation || collection.activePlanId !== planId || activePlan(collection).disabledEventIds.includes(record.id)) return;
      collection = setTimelineEvent(collection, plannerEvent, true, resource);
      savePlanner();
    }).catch(reason => { rewardsError = reason instanceof Error ? reason.message : 'The planner reward selection could not be saved.'; })
      .finally(() => { if (pendingRewardEvents.get(key) === operation) pendingRewardEvents.delete(key); });
  }
  async function loadRewards(refresh = false): Promise<PlannerRewardResource | undefined> {
    rewardsLoading = true;
    rewardsError = '';
    try { rewardResource = await plannerResourceRepository.rewards(refresh); rewardsReady = true; return rewardResource; }
    catch (reason) { rewardsError = reason instanceof Error ? reason.message : 'Event rewards could not be loaded.'; return undefined; }
    finally { rewardsLoading = false; }
  }
  async function loadRates(refresh = false): Promise<void> {
    const event = detailEvent;
    const request = ++detailRequest;
    ratesError = '';
    detailGacha = undefined;
    ratesLoading = Boolean(event?.canPlan);
    if (!event?.canPlan) return;
    try {
      const core = await plannerResourceRepository.core(refresh);
      const [gacha] = await plannerResourceRepository.gachasFor([event], core, refresh);
      if (request === detailRequest) detailGacha = gacha;
    } catch (reason) {
      if (request === detailRequest) ratesError = reason instanceof Error ? reason.message : 'Banner rates could not be loaded.';
    } finally { if (request === detailRequest) ratesLoading = false; }
  }
  function openDetails(event: TimelineEventData): void {
    detailEvent = events.find(item => item.id === event.id);
    void loadRates();
  }
  function closeDetails(): void { detailRequest++; detailEvent = undefined; }
  function cardView(event: TimelineRecord): TimelineEventData {
    const summary = rewardSummaries.get(event.id);
    const pickups = event.pickups ?? [];
    const visible = event.eventType === 'legend_race' ? pickups : pickups.slice(0, 2);
    const title = timelineDisplayTitle(event);
    return {
      ...event, title: event.eventType === 'champions_meeting' && !/^champions meeting\b/i.test(title) ? `Champions Meeting: ${title}` : title,
      context: timelineCardContext(event), pickups: visible, overflowPickups: pickups.length - visible.length,
      raceLines: event.eventType === 'legend_race' || !pickups.length ? timelineCardRaceLines(event) : [],
      rewardLabel: summary?.label, rewardContext: summary?.variable ? summary.previewLabel : undefined,
      rewards: summary?.variable
        ? summary.previewItems.map(item => ({ id: item.key, label: `${item.countLabel} ${item.label}`, amount: item.countLabel, icon: item.iconPath, fallbackIcon: item.icon === 'person' ? 'user' : 'gift' }))
        : summary?.items.map(item => ({ id: item.key, label: item.label, amount: item.kind === 'free_pulls' ? `${item.amount}×` : item.countLabel, freePulls: item.kind === 'free_pulls', icon: item.kind === 'free_pulls' && event.eventType === 'support_card_banner' ? itemIconPath(111) : item.iconPath }))
    };
  }
  export function jumpSearch(offset: number): void {
    if (!dateLanes.length) return;
    currentSearchIndex = offset < 0 && currentSearchIndex <= 0 ? dateLanes.length - 1 : (currentSearchIndex + offset) % dateLanes.length;
    timelineBoard?.scrollToLane(dateLanes[currentSearchIndex]!.key);
  }
  export function scrollToToday(): void { void timelineBoard?.scrollToToday(); }
  export function scrollToDate(date: Date): void { void timelineBoard?.scrollToDate(date); }
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
    const todayTimer = setInterval(() => { if (!document.hidden) now = new Date(); }, 300_000);
    const unsubscribe = plannerCollection.subscribe(next => collection = next);
    const stopRewards = plannerResourceRepository.watchRewards(rewards => { rewardResource = rewards; rewardsReady = true; });
    void load();
    return () => { stopRewards(); clearInterval(todayTimer); unsubscribe(); pendingRewardEvents.clear(); };
  });
  $effect(() => { if (tab === 'carat-planner') plannerVisited = true; else timelineVisited = true; });
  $effect(() => { search; visibleTypes; currentSearchIndex = -1; });
  $effect(() => { status = { filtered: filtered.length, total: events.length, searchPosition, plannerEventCount, loading, rewardsLoading }; });
</script>

  {#if $plannerSaveError}
    <Banner title="Plan changes are not saved on this device" tone="danger">
      <p>{$plannerSaveError}</p>
      <Button size="sm" variant="secondary" onclick={() => savePlanner()}>Retry saving</Button>
    </Banner>
  {/if}
  {#if plannerVisited || tab === 'carat-planner'}
    <div hidden={tab !== 'carat-planner'}>
      {#await import('@/pages/carat-planner/CaratPlanner.svelte')}
        <div class="loading"><Spinner label="Loading Carat Planner" size={30}/><span>Loading Carat Planner…</span></div>
      {:then module}
        <module.default active={tab === 'carat-planner'} {events} {catalog} bind:collection onchange={savePlanner} saveError={$plannerSaveError}/>
      {:catch}
        <Banner title="Carat Planner could not be loaded" tone="danger"><Button variant="secondary" onclick={() => location.reload()}>Reload page</Button></Banner>
      {/await}
    </div>
  {/if}
  {#if timelineVisited || tab === 'timeline'}
    <section class="timeline-content" class:mobile hidden={tab !== 'timeline'}>
    {#if error}<div class="timeline-error"><Banner title="Timeline could not be loaded" tone="danger"><p>{error}</p><Button variant="secondary" size="sm" icon="refresh" onclick={() => void load(true)}>Try again</Button></Banner></div>{/if}
    {#if loading}<div class="timeline-loading" aria-busy="true">
      <div class="loading-caption"><Spinner label="Loading Timeline data" size={22}/><span>Loading timeline…</span></div>
      <div class="loading-preview" aria-hidden="true">{#each [0, 1, 2] as lane}<div class="loading-lane"><div class="skeleton-date"></div><div class="skeleton-card"><div class="skeleton-media"></div><div class="skeleton-line"></div><div class="skeleton-line short"></div></div></div>{/each}</div>
    </div>
    {:else if !filtered.length && !error && search.trim()}<EmptyState icon="timeline" title="No events match" description="Enable another event type or clear the search."/>
    {:else if !error}
      <div class="timeline-viewport">
      <TimelineBoard bind:this={timelineBoard} active={tab === 'timeline'} lanes={dateLanes} events={filtered} {anniversaries} end={endDate} {now} {mobile} {view} compact={compactGaps}>
        {#snippet card(event: TimelineRecord, loadImages: boolean)}<div id={`timeline-event-${event.id}`}><TimelineEventCard event={cardView(event)} {mobile} {loadImages} planned={plannedIds.includes(event.id)} onplan={plan} onopen={openDetails}/></div>{/snippet}
      </TimelineBoard>
      {#if !mobile && tab === 'timeline'}<div class="timeline-right-rail" data-ad-position="right"><AdRegion placement="timeline_sticky_vrec_right" kind="rail" sizes={['160x600']} active/></div>{/if}
      </div>
    {/if}
    </section>
  {/if}
{#if detailEvent}
  {#key detailEvent.id}
    {#await import('./TimelineEventDetails.svelte')}
      <Dialog open title="Loading event details" onclose={closeDetails}><Spinner label="Loading event details"/></Dialog>
    {:then module}
      <module.default event={detailEvent} {catalog} {calculation} rewardSummary={rewardSummaries.get(detailEvent.id)} {rewardsLoading} {rewardsError} gacha={detailGacha} {ratesLoading} {ratesError} planned={plannedIds.includes(detailEvent.id)} onplan={plan} onclose={closeDetails} onretryrates={() => void loadRates(true)} onretryrewards={() => void loadRewards(true)}/>
    {:catch}
      <Dialog open title="Event details could not be loaded" onclose={closeDetails}><Button variant="secondary" onclick={() => location.reload()}>Reload page</Button></Dialog>
    {/await}
  {/key}
{/if}

<style>
  .timeline-content{position:relative;min-width:0}.timeline-content:not(.mobile){display:flex;flex-direction:column;flex:1 1 0px;min-height:0}.timeline-content[hidden]{display:none}.mobile{padding-bottom:calc(var(--timeline-toolbar-height) + 4px)}
  .timeline-viewport{position:relative;display:flex;flex-direction:column;flex:1 1 0;min-height:0;min-width:0}.timeline-content:not(.mobile) .timeline-viewport{container:timeline-viewport / size}.mobile .timeline-viewport{display:block}.timeline-right-rail{display:none;position:absolute;right:8px;top:calc((100dvh - var(--ad-rail-height))/2 - var(--timeline-viewport-top,0px));z-index:var(--z-rail)}@media (min-width:1700px){@container timeline-viewport (min-height:616px){.timeline-right-rail{display:block}}}
  .timeline-error{padding:20px var(--page-gutter-current)}.timeline-loading{min-height:320px;padding:24px var(--page-gutter-current);overflow:hidden}.loading-caption{display:flex;align-items:center;gap:10px;margin-bottom:24px;color:var(--text-secondary);font-size:13px}.loading-preview{display:grid;grid-template-columns:repeat(3,minmax(240px,285px));gap:16px}.loading-lane{display:grid;gap:18px}.skeleton-date,.skeleton-line{background:var(--border-primary)}.skeleton-media{background:var(--surface-2)}.skeleton-date{height:16px;width:45%;margin:auto;border-radius:4px}.skeleton-card{height:167px;border:1px solid var(--border-primary);border-radius:var(--radius-md);overflow:hidden;background:var(--surface-1)}.skeleton-media{height:56px;border-bottom:1px solid var(--border-subtle)}.skeleton-line{height:12px;width:75%;margin:16px 10px;border-radius:3px}.skeleton-line.short{width:48%}.mobile .loading-preview{grid-template-columns:minmax(0,1fr)}.mobile .loading-lane{gap:10px}.mobile .skeleton-date{margin-left:0}.loading{min-height:320px;display:flex;align-items:center;justify-content:center;gap:12px;color:var(--text-secondary)}
</style>
