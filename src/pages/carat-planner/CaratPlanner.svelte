<script lang="ts">
  import {
    buildTimelineRewardSummaries,
    withTimelineRewardFallbacks
  } from '@/lib/timeline/timeline-reward-summary';
  import { onMount, untrack } from 'svelte';
  import { searchParams } from 'sv-router';
  import type { TimelineRecord } from '@/pages/timeline/timeline-repository';
  import {
    activePlan,
    buildPlannerLedger,
    clonePlanCollection,
    enabledPlannerTargets,
    findPlannerEvent,
    plannerTargetEvents,
    resolvePlannerPullDate,
    synchronizePlannerTargets,
    projectPlan,
    setTimelineEvent,
    type CaratPlan,
    type CaratPlanCollection
  } from '@/lib/carat-planner/carat-planner';
  import { compactPlannerCollectionResourceState } from '@/lib/carat-planner/planner-resource-state';
  import { reconcileIncomePreset } from '@/lib/carat-planner/planner-income-presets';
  import { buildPlannerIncomeGroups, summarizePlannerIncome } from './income/planner-income-view';
  import type { TimelinePickupCatalog } from '@/lib/timeline/timeline-pickups';
  import { plannerUsingCache } from './planner-resource-repository';
  import { PlannerResources } from './planner-resources.svelte';
  import { withCurrentPlan } from './planner-collection';
  import { plannerCloudSync, startPlannerCloudSync } from './planner-state';
  import PlannerBannerPicker from './PlannerBannerPicker.svelte';
  import PlannerProjectionSummary from './PlannerProjectionSummary.svelte';
  import PlannerManager from './manager/PlannerManager.svelte';
  import PlannerSetup from './setup/PlannerSetup.svelte';
  import PlannerPullPlan from './goals/PlannerPullPlan.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Icon from '@/components/Icon.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';

  interface Props {
    active?: boolean;
    events: TimelineRecord[];
    catalog: TimelinePickupCatalog;
    collection: CaratPlanCollection;
    onchange: (collection: CaratPlanCollection) => void;
    saveError: string;
  }

  let {
    active = true,
    events,
    catalog,
    collection = $bindable(),
    onchange,
    saveError
  }: Props = $props();

  const loader: PlannerResources = new PlannerResources(
    () => targetEvents,
    () => targetResourceKey
  );

  let eventSearch = $state('');
  let handledBanner = '';
  let importError = $state('');
  let cloudStatus = $state(plannerCloudSync.currentStatus());

  const resources = $derived(loader.bundle);
  const rewardResource = $derived(resources.rewards);
  const effectiveRewards = $derived(withTimelineRewardFallbacks(rewardResource, events));
  const incomeGroups = $derived(
    buildPlannerIncomeGroups(
      resources.income.rules,
      resources.rewards.competitive_variants ?? [],
      events,
      resources.rewards.global_reward_comparison
    )
  );
  const rewardSummaries = $derived(buildTimelineRewardSummaries(rewardResource, events));
  const plan = $derived(
    synchronizePlannerTargets(activePlan(collection), events, resources.gachas)
  );
  // Pull counts, goals and current balances spend income; they do not rebuild it.
  const ledgerKey = $derived(
    JSON.stringify([
      plan.projectionStartDate,
      plan.enabledIncomeRuleIds,
      plan.enabledRewardIds,
      plan.disabledRewardIds,
      plan.disabledEventIds,
      plan.scenarioSelections,
      plan.variableRewardSelections,
      plan.customIncome,
      enabledPlannerTargets(plan)
        .map((target) => resolvePlannerPullDate(target))
        .filter((date) => date >= plan.projectionStartDate)
        .sort()
    ])
  );
  const incomeResource = $derived(resources.income);
  const coreResource = $derived(resources.core);
  const ledger = $derived.by(() => {
    const dates = JSON.parse(ledgerKey).at(-1) as string[];
    const bundle = {
      core: coreResource,
      income: incomeResource,
      rewards: effectiveRewards,
      timelineEvents: events
    };
    return untrack(() =>
      buildPlannerLedger(plan, bundle, dates.at(-1) ?? plan.projectionStartDate, dates)
    );
  });
  const projection = $derived(
    projectPlan(plan, { ...resources, rewards: effectiveRewards, timelineEvents: events }, ledger)
  );
  const projectionByTarget = $derived(
    new Map(projection.targets.map((item) => [item.targetId, item]))
  );

  const targetEvents = $derived(plannerTargetEvents(activePlan(collection), events));
  const targetResourceKey = $derived(
    JSON.stringify({
      planId: collection.activePlanId,
      version: loader.version,
      events: targetEvents
    })
  );
  const activeTargets = $derived(enabledPlannerTargets(plan));
  const addedEventIds = $derived(
    new Set([
      ...activeTargets.map((target) => target.eventId),
      ...plan.enabledRewardEventIds.filter((id) => !plan.disabledEventIds.includes(id))
    ])
  );
  const incomeProjection = $derived.by(() => {
    const dates = JSON.parse(ledgerKey).at(-1) as string[];
    const through =
      dates.at(-1) ??
      new Date(new Date(plan.projectionStartDate + 'T00:00:00Z').getTime() + 29 * 86_400_000)
        .toISOString()
        .slice(0, 10);
    const bundle = {
      core: coreResource,
      income: incomeResource,
      rewards: effectiveRewards,
      timelineEvents: events
    };
    const entries = dates.length
      ? ledger
      : untrack(() => buildPlannerLedger(plan, bundle, through, []));
    return { ...summarizePlannerIncome(entries), through, preview: !dates.length };
  });

  function publish(next: CaratPlanCollection): void {
    collection = loader.ready
      ? compactPlannerCollectionResourceState(
          next,
          { ...resources, rewards: effectiveRewards },
          events
        )
      : next;
    onchange(collection);
  }

  function commit(mutator: (value: CaratPlan) => void): void {
    const next = clonePlanCollection(withCurrentPlan(collection, plan));
    const value = activePlan(next);
    mutator(value);
    value.updatedAt = new Date().toISOString();
    publish(next);
  }

  function addEvent(event: TimelineRecord): void {
    if (event.plannerRewardAvailable && (loader.loading || loader.error)) return;
    const summary = rewardSummaries.get(event.id);
    publish(
      setTimelineEvent(
        withCurrentPlan(collection, plan),
        {
          ...event,
          plannerRewardAvailable:
            event.plannerRewardAvailable || Boolean(summary && summary.mode !== 'placement')
        },
        true,
        effectiveRewards
      )
    );
    eventSearch = '';
  }

  function removeTarget(id: string): void {
    const target = plan.targets.find((item) => item.id === id);
    if (!target) return;
    const event = events.find((item) => item.id === target.eventId) ?? {
      id: target.eventId,
      title: target.title,
      eventType: `${target.bannerKind}_banner`,
      plannerRewardAvailable: plan.enabledRewardEventIds.includes(target.eventId)
    };
    publish(
      setTimelineEvent(
        withCurrentPlan(collection, plan),
        {
          ...event,
          plannerRewardAvailable:
            event.plannerRewardAvailable || plan.enabledRewardEventIds.includes(event.id)
        },
        false
      )
    );
  }

  $effect(() => {
    if (loader.ready) {
      const compacted = compactPlannerCollectionResourceState(
        collection,
        { ...resources, rewards: effectiveRewards },
        events
      );
      if (JSON.stringify(compacted) !== JSON.stringify(collection))
        untrack(() => publish(compacted));
    }
  });

  $effect(() => {
    if (!loader.ready || !plan.resourceDefaultsApplied) return;
    const next = clonePlanCollection(collection);
    const groups = Object.fromEntries(
      incomeGroups.map((group) => [group.id, group.options.map((option) => option.value)])
    );
    if (
      reconcileIncomePreset(
        activePlan(next),
        groups,
        effectiveRewards.rewards,
        resources.rewards.competitive_variants ?? []
      )
    )
      untrack(() => publish(next));
  });

  $effect(() => {
    if (loader.ready && !plan.resourceDefaultsApplied)
      untrack(() =>
        commit((value) => {
          value.enabledIncomeRuleIds = resources.income.rules
            .filter((rule) => rule.default_enabled && !rule.scenario_group)
            .map((rule) => rule.id);
          for (const rule of resources.income.rules.filter(
            (item) => item.default_enabled && item.scenario_group && item.scenario_option
          ))
            if (!value.scenarioSelections[rule.scenario_group!])
              value.scenarioSelections[rule.scenario_group!] = rule.scenario_option!;
          value.resourceDefaultsApplied = true;
        })
      );
    const key = targetResourceKey;
    if (loader.ready && loader.needsGachas(key)) untrack(() => void loader.loadTargetGachas(key));
  });

  $effect(() => {
    if (!active) {
      handledBanner = '';
      return;
    }
    const requested = searchParams.toURLSearchParams().get('banner')?.trim() ?? '';
    const event = findPlannerEvent(requested, events);
    if (event && (!event.plannerRewardAvailable || loader.ready))
      untrack(() => {
        if (requested !== handledBanner) {
          handledBanner = requested;
          addEvent(event);
        }
      });
  });

  $effect(() => {
    if (loader.ready) untrack(startPlannerCloudSync);
  });

  onMount(() => {
    const stopRewards = loader.watchRewards();
    const unsubscribe = plannerCloudSync.subscribe((status) => {
      cloudStatus = status;
    });
    void loader.load();
    return () => {
      loader.destroy();
      stopRewards();
      unsubscribe();
    };
  });
</script>

<section class="planner">
  {#if $plannerUsingCache}
    <p
      class="resource-status"
      role="status"
    >
      Using saved planner data while the resource service is unavailable. Updates will retry
      automatically.
    </p>
  {/if}
  <section
    class="workbench-panel"
    aria-label="Planner controls and projection"
  >
    <PlannerManager
      {active}
      {collection}
      {plan}
      {saveError}
      {cloudStatus}
      bind:importError
      onpublish={publish}
      oncommit={commit}
    />
    <div class="workbench">
      <PlannerBannerPicker
        {events}
        projectionStart={plan.projectionStartDate}
        {addedEventIds}
        rewardsUnavailable={loader.loading || Boolean(loader.error)}
        bind:query={eventSearch}
        onadd={addEvent}
      />
      <PlannerProjectionSummary {projection} />
    </div>
  </section>
  {#if cloudStatus.kind === 'reverted'}
    <div
      class="resource-status error"
      role="alert"
    >
      <Icon name="refresh" />
      <span>{cloudStatus.label}</span>
    </div>
  {/if}
  {#if importError}
    <div
      class="resource-status error"
      role="alert"
    >
      <Icon name="warning" />
      <span>
        <strong>Plan could not be imported</strong>
        {importError}
      </span>
    </div>
  {/if}
  {#if loader.loading || loader.gachasLoading}
    <div
      class="resource-status"
      role="status"
    >
      <Spinner
        label="Loading planner data"
        size={20}
      />
      <span>Loading rates, rewards, and income data…</span>
    </div>
  {:else if loader.error}
    <div
      class="resource-status error"
      role="alert"
    >
      <Icon name="warning" />
      <span>
        <strong>Some planner data is unavailable</strong>
        {loader.error}
      </span>
      <Button
        size="sm"
        variant="secondary"
        onclick={() => loader.load(true)}
      >
        Retry
      </Button>
    </div>
  {/if}
  <PlannerSetup
    {plan}
    {events}
    {resources}
    {effectiveRewards}
    {incomeGroups}
    income={incomeProjection}
    loading={loader.loading}
    oncommit={commit}
  />
  <PlannerPullPlan
    {plan}
    {activeTargets}
    {projectionByTarget}
    {resources}
    {events}
    {catalog}
    oncommit={commit}
    onremove={removeTarget}
  />
</section>

<style>
  @import './carat-planner.css';
</style>
