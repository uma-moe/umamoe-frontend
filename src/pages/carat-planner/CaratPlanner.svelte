<script lang="ts">
  import LazyContent from '@/components/LazyContent.svelte';
  import { buildTimelineRewardSummaries, withTimelineRewardFallbacks } from '@/lib/timeline/timeline-reward-summary';
  import { copyText } from '@/lib/clipboard';
  import { itemIconPath } from '@/lib/catalog/item-icons';
  import { onMount, untrack } from 'svelte';
  import { searchParams } from 'sv-router';
  import type { TimelineRecord } from '@/pages/timeline/timeline-repository';
  import { activePlan, availableCrystals, buildPlannerLedger, clonePlanCollection, createPlan, enabledPlannerTargets, findPlannerEvent, importPlanCollection, importSharedPlan, withoutPlannerResourceDates, plannerTargetEvents, resolvePlannerPullDate, sanitizePlan, synchronizePlannerTargets, projectPlan, setTimelineEvent, type CaratPlan, type CaratPlanCollection, type PlannerDataBundle, type PlannerTarget } from '@/lib/timeline/carat-planner';
  import { compactPlannerCollectionResourceState } from '@/lib/timeline/planner-resource-state';
  import { reconcileIncomePreset } from '@/lib/timeline/planner-income-presets';
  import { activeIncomeAssumptionCount, buildPlannerIncomeGroups, summarizePlannerIncome } from './planner-income-view';
  import { buildPlannerRewardGroups, plannerRewardSummary } from '@/lib/timeline/planner-reward-groups';
  import { buildPlannerCampaigns } from '@/lib/timeline/planner-campaigns';
  import { filterPlannerBanners, plannerPullPlanItems } from '@/lib/timeline/planner-presentation';
  import { timelineDisplayTitle, type TimelinePickupCatalog } from '@/lib/timeline/timeline-pickups';
  import { decodeCompactPlannerShare, encodeCompactPlannerShare } from '@/lib/timeline/planner-share-codec';
  import { router } from '@/routes/router';
  import { plannerResourceRepository, plannerUsingCache } from './planner-resource-repository';
  import { plannerCloudRepository } from './planner-cloud-repository';
  import { plannerCloudSync, startPlannerCloudSync } from './planner-state';
  import PlannerIncomePanel from './PlannerIncomePanel.svelte';
  import PlannerBalancePanel from './PlannerBalancePanel.svelte';
  import PlannerRewardsPanel from './PlannerRewardsPanel.svelte';
  import PlannerTargetRow from './PlannerTargetRow.svelte';
  import Button from '@/components/Button.svelte';
  import Combobox from '@/components/Combobox.svelte';
  import Icon from '@/components/Icon.svelte';
  import Menu, { type MenuItem } from '@/components/Menu.svelte';
  import SelectField from '@/components/SelectField.svelte';
  import TextField from '@/components/TextField.svelte';
  import Spinner from '@/components/Spinner.svelte';
  import Tabs, { type TabItem } from '@/components/Tabs.svelte';

  interface Props { active?: boolean; events: TimelineRecord[]; catalog: TimelinePickupCatalog; collection: CaratPlanCollection; onchange: (collection: CaratPlanCollection) => void; saveError: string; }
  let { active = true, events, catalog, collection = $bindable(), onchange, saveError }: Props = $props();
  const pickupCopyMemory = new Map<string, number>();
  const incomeSelectionMemory = new Map<string, Record<string, string>>();
  let expandedIncomeSections = $state(new Set<string>());
  let rewardSearch = $state(''), showPastRewards = $state(false);
  let eventSearch = $state(''); let setup = $state<'' | 'resources' | 'income' | 'rewards'>(''); let importInput: HTMLInputElement;
  // Resource loads replace the snapshot; individual entries are never edited.
  let resources = $state.raw<PlannerDataBundle>({ core: {}, income: { rules: [] }, rewards: { rewards: [] } });
  let resourcesLoading = $state(false); let gachasLoading = $state(false); let resourcesError = $state('');
  let shareNotice = $state('');
  let handledCompactShare = ''; let handledCloudShare = '';
  let handledBanner = '';
  let importError = $state('');
  let shareUrl = $state('');
  let cloudStatus = $state(plannerCloudSync.currentStatus());
  let gachaRequestKey = '';
  let resourceRequest = 0; let gachaRequest = 0; let destroyed = false;
  let resourcesReady = $state(false); let resourceVersion = $state(0); let refreshGachas = false;
  const rewardResource = $derived(resources.rewards);
  const effectiveRewards = $derived(withTimelineRewardFallbacks(rewardResource, events));
  const incomeGroups = $derived(buildPlannerIncomeGroups(resources.income.rules, resources.rewards.competitive_variants ?? [], events, resources.rewards.global_reward_comparison));
  const rewardSummaries = $derived(buildTimelineRewardSummaries(rewardResource, events));
  const plan = $derived(synchronizePlannerTargets(activePlan(collection), events, resources.gachas));
  // Pull counts, goals and current balances spend income; they do not rebuild it.
  const ledgerKey = $derived(JSON.stringify([
    plan.projectionStartDate, plan.enabledIncomeRuleIds, plan.enabledRewardIds, plan.disabledRewardIds,
    plan.disabledEventIds, plan.scenarioSelections, plan.variableRewardSelections, plan.customIncome,
    enabledPlannerTargets(plan).map(target => resolvePlannerPullDate(target)).filter(date => date >= plan.projectionStartDate).sort()
  ]));
  const incomeResource = $derived(resources.income);
  const coreResource = $derived(resources.core);
  const ledger = $derived.by(() => {
    const dates = JSON.parse(ledgerKey).at(-1) as string[];
    const bundle = { core: coreResource, income: incomeResource, rewards: effectiveRewards, timelineEvents: events };
    return untrack(() => buildPlannerLedger(plan, bundle, dates.at(-1) ?? plan.projectionStartDate, dates));
  });
  const projection = $derived(projectPlan(plan, { ...resources, rewards: effectiveRewards, timelineEvents: events }, ledger));
  const projectionByTarget = $derived(new Map(projection.targets.map((item) => [item.targetId, item])));
  let draftName = $state<{ planId: string; savedName: string; value: string }>();
  const displayedName = $derived(draftName?.planId === plan.id && draftName.savedName === plan.name ? draftName.value : plan.name);
  const targetEvents = $derived(plannerTargetEvents(activePlan(collection), events));
  const targetResourceKey = $derived(JSON.stringify({ planId: collection.activePlanId, version: resourceVersion, events: targetEvents }));
  const activeTargets = $derived(enabledPlannerTargets(plan));
  const pullItems = $derived(plannerPullPlanItems(plan, events));
  const addedEventIds = $derived(new Set([...activeTargets.map(target => target.eventId), ...plan.enabledRewardEventIds.filter(id => !plan.disabledEventIds.includes(id))]));
  const eventsById = $derived(new Map(events.map(event => [event.id, event])));
  const projectionStart = $derived(plan.projectionStartDate);
  const matchingBanners = $derived(filterPlannerBanners(events, eventSearch, projectionStart));
  const bannerOptions = $derived(matchingBanners.map(event => ({ value: event.id, label: timelineDisplayTitle(event), disabled: addedEventIds.has(event.id) || event.plannerRewardAvailable && (resourcesLoading || Boolean(resourcesError)) })));
  const globalPullTiming = $derived.by(() => {
    const timings = new Set(activeTargets.map(target => target.pullTiming));
    const timing = activeTargets[0]?.pullTiming;
    return timings.size === 1 && (timing === 'start' || timing === 'end') ? timing : '';
  });
  const regularTargets = $derived(activeTargets.filter(target => target.bannerKind !== 'paid'));
  const globalPaidCarats = $derived(regularTargets.length && regularTargets.every(target => target.allowPaidJewels === regularTargets[0]!.allowPaidJewels) ? regularTargets[0]!.allowPaidJewels ? 'allow' : 'free-only' : '');
  const planOptions: MenuItem[] = $derived([
    ...collection.plans.map(item => ({ id:'plan:'+item.id, label:item.name, checked:item.id === plan.id, icon:item.id === plan.id ? 'check' as const : 'book' as const })),
    { id:'create', label:'Add plan', icon:'add', separator:true }
  ]);
  // Pull counts and balances do not change reward descriptions or available outcomes.
  const rewardStart = $derived(plan.projectionStartDate);
  const rewardSelections = $derived(JSON.stringify({ scenarioSelections: plan.scenarioSelections, variableRewardSelections: plan.variableRewardSelections }));
  const rewardGroups = $derived(buildPlannerRewardGroups(effectiveRewards.rewards, effectiveRewards.event_benefits ?? [], effectiveRewards.competitive_variants ?? [], effectiveRewards.free_pull_campaigns ?? [], events, rewardStart, undefined, JSON.parse(rewardSelections)));
  const rewardCampaigns = $derived(buildPlannerCampaigns(effectiveRewards.free_pull_campaigns ?? [], events, plan.projectionStartDate));
  const rewardSummary = $derived(plannerRewardSummary(plan, rewardGroups, rewardCampaigns));
  const incomeCount = $derived(activeIncomeAssumptionCount(plan, resources.income.rules));
  const incomeProjection = $derived.by(() => {
    const dates = JSON.parse(ledgerKey).at(-1) as string[];
    const through = dates.at(-1) ?? new Date(new Date(plan.projectionStartDate + 'T00:00:00Z').getTime() + 29 * 86_400_000).toISOString().slice(0, 10);
    const bundle = { core: coreResource, income: incomeResource, rewards: effectiveRewards, timelineEvents: events };
    const entries = dates.length ? ledger : untrack(() => buildPlannerLedger(plan, bundle, through, []));
    return { ...summarizePlannerIncome(entries), through, preview: !dates.length };
  });
  const incomePeriod = $derived(incomeProjection.preview ? '30-day preview' : 'Through ' + new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(incomeProjection.through + 'T00:00:00Z')));
  const setupTabs: TabItem[] = $derived([
    { id:'resources',label:'Balance',icon:'paid',description:new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(plan.projectionStartDate+'T00:00:00Z'))+' · '+plan.balances.freeJewels.toLocaleString('en-US')+' Carats' },
    { id:'income',label:'Income',icon:'chart',description:resourcesLoading ? 'Loading income…' : incomePeriod + ' · ' + incomeProjection.totalLabel },
    { id:'rewards',label:'Rewards',icon:'gift',description:rewardSummary.count+' counted automatically'+(rewardSummary.totalLabel?' · '+rewardSummary.totalLabel:'') },
  ]);
  const rewardViewKey = $derived(JSON.stringify([plan.projectionStartDate, plan.scenarioSelections, plan.variableRewardSelections]));
  function publish(next: CaratPlanCollection): void {
    collection = resourcesReady ? compactPlannerCollectionResourceState(next, { ...resources, rewards: effectiveRewards }, events) : next;
    onchange(collection);
  }
  function currentCollection(): CaratPlanCollection { return { ...collection, plans: collection.plans.map(item => item.id === plan.id ? plan : item) }; }
  function commit(mutator: (value: CaratPlan) => void): void { const next = clonePlanCollection(currentCollection()); const value = activePlan(next); mutator(value); value.updatedAt = new Date().toISOString(); publish(next); }
  function applyGlobalPullTiming(timing: string): void {
    if (timing !== 'start' && timing !== 'end') return;
    commit(value => { for (const target of enabledPlannerTargets(value)) { target.pullTiming = timing; target.customPullDate = undefined; } });
  }
  function applyGlobalPaidCarats(selection: string): void {
    if (selection !== 'allow' && selection !== 'free-only') return;
    commit(value => { for (const target of enabledPlannerTargets(value)) if (target.bannerKind !== 'paid') target.allowPaidJewels = selection === 'allow'; });
  }
  function selectPlan(value: string): void { publish({ ...currentCollection(), activePlanId: value }); }
  function addPlan(): void { const next = clonePlanCollection(collection); const value = createPlan('New plan'); next.plans.push(value); next.activePlanId = value.id; publish(next); }
  function duplicatePlan(): void {
    const next = clonePlanCollection(currentCollection());
    const source = activePlan(next);
    const copy = JSON.parse(JSON.stringify(source)) as CaratPlan;
    copy.id = `plan-${crypto.randomUUID()}`;
    copy.name = `${source.name} copy`.slice(0, 80);
    copy.createdAt = copy.updatedAt = new Date().toISOString();
    copy.customIncome = copy.customIncome.map(item => ({ ...item, id: `income-${crypto.randomUUID()}` }));
    copy.targets = copy.targets.map(target => ({ ...target, id: `target-${crypto.randomUUID()}` }));
    next.plans.push(copy); next.activePlanId = copy.id; publish(next);
  }
  function deletePlan(): void { if (collection.plans.length < 2 || !confirm(`Delete "${plan.name}"?`)) return; const deletedPlanId = collection.activePlanId; const next = clonePlanCollection(collection); next.plans = next.plans.filter((item) => item.id !== next.activePlanId); next.activePlanId = next.plans[0]!.id; publish(next); if (cloudStatus.loggedIn) void plannerCloudRepository.deleteShare(deletedPlanId).catch(() => { if (!destroyed) shareNotice = 'Plan deleted, but its shared link could not be removed from the server.'; }); }
  function planAction(action: string) {
    if (action === 'share') void sharePlan();
    else if (action === 'duplicate') duplicatePlan();
    else if (action === 'export') exportPlan();
    else if (action === 'import') importInput.click();
    else if (action === 'delete') deletePlan();
  }
  function addEvent(event: TimelineRecord): void {
    if (event.plannerRewardAvailable && (resourcesLoading || resourcesError)) return;
    const summary = rewardSummaries.get(event.id);
    publish(setTimelineEvent(currentCollection(), { ...event, plannerRewardAvailable: event.plannerRewardAvailable || Boolean(summary && summary.mode !== 'placement') }, true, effectiveRewards));
    eventSearch = '';
  }
  function updateTarget(id: string, mutator: (target: PlannerTarget) => void): void { commit((value) => { const target = value.targets.find((item) => item.id === id); if (target) mutator(target); }); }
  function removeTarget(id: string): void {
    const target = plan.targets.find(item => item.id === id);
    if (!target) return;
    const event = events.find(item => item.id === target.eventId) ?? { id: target.eventId, title: target.title, eventType: `${target.bannerKind}_banner`, plannerRewardAvailable: plan.enabledRewardEventIds.includes(target.eventId) };
    publish(setTimelineEvent(currentCollection(), { ...event, plannerRewardAvailable: event.plannerRewardAvailable || plan.enabledRewardEventIds.includes(event.id) }, false));
  }
  function exportPlan(): void { const blob = new Blob([JSON.stringify({ version: 1, plan: withoutPlannerResourceDates(plan) }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `${plan.name.replaceAll(/[^a-z0-9]+/gi, '-').toLowerCase() || 'carat-plan'}.json`; link.click(); URL.revokeObjectURL(url); }
  async function importPlan(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error('Planner import is too large.');
      const json = await file.text();
      if (destroyed) return;
      publish(importPlanCollection(json, currentCollection()));
      importError = '';
    } catch (reason) { if (!destroyed) importError = reason instanceof Error ? reason.message : 'Unable to import plan.'; }
    finally { input.value = ''; }
  }
  async function copyShareUrl(url?: URL, updateMessage = true): Promise<boolean> {
    if (destroyed) return false;
    if (url) shareUrl = url.toString();
    if (!shareUrl) return false;
    const copied = await copyText(shareUrl);
    if (!destroyed && updateMessage) shareNotice = copied ? 'Share link copied.' : 'Copy the share link below.';
    return copied;
  }
  async function sharePlan(): Promise<void> {
    shareUrl = '';
    if (cloudStatus.loggedIn) {
      try {
        shareNotice = 'Creating share link…';
        plannerCloudSync.notifyLocalChange(collection, 0);
        const shared = await plannerCloudRepository.createShare(plan);
        if (destroyed) return;
        const url = new URL('/timeline', location.origin);
        url.searchParams.set('tab', 'carat-planner');
        url.searchParams.set('share', shared.share_id);
        const copied = await copyShareUrl(url, false);
        if (!destroyed) shareNotice = (copied ? 'Share link copied.' : 'Share link ready.') + ' It always opens the latest saved version of this plan. Opening it adds a separate copy.';
        return;
      } catch { if (destroyed) return; }
    }
    try {
      shareNotice = 'Creating compact share link…';
      const payload = await encodeCompactPlannerShare(plan);
      if (destroyed) return;
      const url = new URL('/timeline', location.origin);
      url.searchParams.set('tab', 'carat-planner');
      url.hash = `p=${payload}`;
      const copied = await copyShareUrl(url, false);
      if (!destroyed) shareNotice = copied ? 'Self-contained plan link copied. Opening it adds a separate copy.' : 'Self-contained plan link ready. Opening it adds a separate copy.';
    } catch (reason) {
      if (!destroyed) shareNotice = reason instanceof Error ? reason.message : 'Compact share link could not be created.';
    }
  }
  async function importCompactShare(payload: string): Promise<void> { shareNotice = 'Opening compact shared plan…'; try { const decoded = await decodeCompactPlannerShare(payload); if (!destroyed && active && handledCompactShare === payload) openSharedPlan(decoded.plan, `b64${decoded.fingerprint}`); } catch (reason) { if (!destroyed && active && handledCompactShare === payload) shareNotice = reason instanceof Error ? reason.message : 'Shared plan could not be opened.'; } }
  async function importCloudShare(shareId: string): Promise<void> { if (!/^(?:[a-fA-F0-9]{16}|[a-zA-Z0-9]{8,12})$/.test(shareId)) { shareNotice = 'This shared plan link is invalid.'; return; } try { shareNotice = 'Loading shared plan…'; const shared = await plannerCloudRepository.getSharedPlan(shareId); if (!destroyed && active && handledCloudShare === shareId) openSharedPlan(shared.plan, shareId); } catch { if (!destroyed && active && handledCloudShare === shareId) shareNotice = 'Shared plan was not found or is no longer available.'; } }
  function openSharedPlan(value: unknown, shareId: string): void {
    publish(importSharedPlan(value, shareId, currentCollection()));
    shareNotice = `Opened ${activePlan(collection).name} as a separate copy.`;
  }
  async function loadTargetGachas(key: string): Promise<void> {
    gachaRequestKey = key;
    const request = ++gachaRequest;
    resourcesError = '';
    gachasLoading = true;
    resources = { ...resources, gachas: [] };
    try {
      const gachas = await plannerResourceRepository.gachasFor(targetEvents, resources.core, refreshGachas);
      if (!destroyed && request === gachaRequest && key === targetResourceKey) { refreshGachas = false; resources = { ...resources, gachas }; }
    } catch (reason) {
      if (!destroyed && request === gachaRequest && key === targetResourceKey) resourcesError = reason instanceof Error ? reason.message : 'Banner rates could not be loaded.';
    } finally { if (!destroyed && request === gachaRequest) gachasLoading = false; }
  }
  async function loadResources(refresh = false): Promise<void> {
    const request = ++resourceRequest;
    gachaRequest++;
    resourcesReady = false; resourcesLoading = true; gachasLoading = false; resourcesError = '';
    try {
      const initial = await plannerResourceRepository.initial(refresh);
      if (destroyed || request !== resourceRequest) return;
      resources = initial;
      refreshGachas = refresh; resourceVersion++; resourcesReady = true;
    } catch (reason) {
      if (!destroyed && request === resourceRequest) resourcesError = reason instanceof Error ? reason.message : 'Planner resources could not be loaded.';
    } finally { if (!destroyed && request === resourceRequest) resourcesLoading = false; }
  }
  $effect(() => {
    if (resourcesReady) {
      const compacted = compactPlannerCollectionResourceState(collection, { ...resources, rewards: effectiveRewards }, events);
      if (JSON.stringify(compacted) !== JSON.stringify(collection)) untrack(() => publish(compacted));
    }
  });
  $effect(() => {
    if (!resourcesReady || !plan.resourceDefaultsApplied) return;
    const next = clonePlanCollection(collection);
    const groups = Object.fromEntries(incomeGroups.map(group => [group.id, group.options.map(option => option.value)]));
    if (reconcileIncomePreset(activePlan(next), groups, effectiveRewards.rewards, resources.rewards.competitive_variants ?? [])) untrack(() => publish(next));
  });
  $effect(() => {
    if (resourcesReady && !plan.resourceDefaultsApplied) untrack(() => commit(value => {
      value.enabledIncomeRuleIds = resources.income.rules.filter(rule => rule.default_enabled && !rule.scenario_group).map(rule => rule.id);
      for (const rule of resources.income.rules.filter(item => item.default_enabled && item.scenario_group && item.scenario_option)) if (!value.scenarioSelections[rule.scenario_group!]) value.scenarioSelections[rule.scenario_group!] = rule.scenario_option!;
      value.resourceDefaultsApplied = true;
    }));
    const key = targetResourceKey;
    if (resourcesReady && key !== gachaRequestKey) untrack(() => void loadTargetGachas(key));
  });
  $effect(() => {
    if (!active) { handledBanner = ''; return; }
    const requested = searchParams.toURLSearchParams().get('banner')?.trim() ?? '';
    const event = findPlannerEvent(requested, events);
    if (event && (!event.plannerRewardAvailable || resourcesReady)) untrack(() => {
      if (requested !== handledBanner) { handledBanner = requested; addEvent(event); }
    });
  });
  $effect(() => {
    if (!active) { handledCompactShare = ''; handledCloudShare = ''; return; }
    const query = searchParams.toURLSearchParams();
    const shareId = query.get('share')?.trim() ?? '';
    const fragment = router.route.hash.replace(/^#/, '');
    const payload = shareId ? '' : (fragment.startsWith('p=') ? fragment.slice(2) : query.get('p') ?? '').trim();
    untrack(() => {
      if (payload !== handledCompactShare) { handledCompactShare = payload; if (payload) void importCompactShare(payload); }
      if (shareId !== handledCloudShare) { handledCloudShare = shareId; if (shareId) void importCloudShare(shareId); }
    });
  });
  $effect(() => {
    if (resourcesReady) untrack(startPlannerCloudSync);
  });
  onMount(() => {
    const stopRewards = plannerResourceRepository.watchRewards(rewards => { resources = { ...resources, rewards }; });
    const unsubscribe = plannerCloudSync.subscribe(status => { cloudStatus = status; if (status.kind === 'reverted') draftName = undefined; });
    void loadResources();
    return () => { destroyed = true; stopRewards(); unsubscribe(); };
  });
</script>

<section class="planner">
{#if $plannerUsingCache}<p class="resource-status" role="status">Using saved planner data while the resource service is unavailable. Updates will retry automatically.</p>{/if}
<section class="workbench-panel" aria-label="Planner controls and projection">
  <header class="manager">
<div class="identity">
<div class="plan-picker"><span>Selected plan</span><Menu label={displayedName} ariaLabel="Selected plan" menuLabel="Select a plan" icon="book" items={planOptions} onselect={value => value === 'create' ? addPlan() : selectPlan(value.slice(5))}/></div>
<TextField id="planner-name" label="Plan name" maxlength={80} autocomplete="off" value={displayedName}
  oninput={(event) => draftName = { planId: plan.id, savedName: plan.name, value: (event.currentTarget as HTMLInputElement).value }}
  onblur={() => { const name = displayedName; commit(value => value.name = sanitizePlan({ ...value, name })!.name); draftName = undefined; }}/>
</div>
<div class="actions" role="group" aria-label="Plan actions">
<span class:warning={Boolean(saveError) || cloudStatus.kind === 'offline' || cloudStatus.kind === 'reverted'} class="sync" role="status" aria-label={saveError ? 'Not saved on this device' : cloudStatus.label} title={saveError ? 'Not saved on this device' : cloudStatus.label}>
{#if !saveError && (cloudStatus.kind === 'loading' || cloudStatus.kind === 'saving')}<Spinner label={cloudStatus.label} size={15}/>{:else}<Icon name={saveError || cloudStatus.kind === 'offline' || cloudStatus.kind === 'reverted' ? 'warning' : 'check'} size={15}/>{/if}<span>{saveError ? 'Not saved on this device' : cloudStatus.label}</span></span>
<Menu label="More plan actions" menuLabel="Plan actions" icon="more" iconOnly items={[
  {id:'share',label:'Share plan',icon:'share'}, {id:'duplicate',label:'Duplicate plan',icon:'copy'},
  {id:'export',label:'Export plan',icon:'download'}, {id:'import',label:'Import plan',icon:'upload'},
  {id:'delete',label:'Delete plan',icon:'trash',danger:true,disabled:collection.plans.length < 2}
]} onselect={planAction}/>
<input bind:this={importInput} class="file" type="file" accept="application/json" onchange={importPlan}/></div>
</header>
{#if shareNotice}<div class="share-notice" role="status"><Icon name={shareUrl ? 'share' : 'info'} size={18}/><span>{shareNotice}</span>{#if shareUrl}<a href={shareUrl} target="_blank" rel="noopener noreferrer">Open link</a><Button size="sm" variant="ghost" icon="copy" onclick={() => void copyShareUrl()}>Copy link</Button>{/if}</div>{/if}
  <div class="workbench">
<div class="picker">
<Combobox id="planner-banner" label="Search character, support, or paid banners" hideLabel prefixIcon="search" action filter={false} batchSize={40} bind:query={eventSearch} options={bannerOptions} placeholder="Search names, banner types, or reruns…" clearLabel="Clear banner search" emptyText={events.length ? 'No banners match this search and type.' : 'Waiting for banner data…'} onchange={value => { const event = eventsById.get(value); if (event) addEvent(event); }}>
  {#snippet optionContent(option)}
    {@const event = eventsById.get(option.value)!}
    <span class="banner-option">
      <span class="banner-art">{#if event.image}<img src={event.image} alt="" loading="lazy"/>{:else}<Icon name={event.eventType.includes('support') ? 'database' : 'user'}/>{/if}</span>
      <span class="banner-copy"><strong>{option.label}</strong><time>{event.dateLabel}</time></span>
      <span class="banner-action"><Icon name={addedEventIds.has(event.id) ? 'check' : 'add'} size={16}/><span>{addedEventIds.has(event.id) ? 'Added' : 'Add'}</span></span>
    </span>
  {/snippet}
</Combobox></div>
<div class="overview" role="group" aria-label="Projection summary">
<div class:short={projection.totalShortfallJewels > 0}>
<Icon name={projection.totalShortfallJewels ? 'warning' : 'check'}/>
<span>
<strong>{projection.requiredPaidJewels ? projection.requiredPaidJewels.toLocaleString() : projection.totalShortfallJewels ? projection.totalShortfallJewels.toLocaleString() : 'Funded'}</strong>
<small>{projection.requiredPaidJewels ? 'Requires paid Carats' : projection.totalShortfallJewels ? 'Carats short' : 'Plan status'}</small>
{#if projection.requiredPaidJewels && projection.totalShortfallJewels > projection.requiredPaidJewels}<small>Plus {(projection.totalShortfallJewels - projection.requiredPaidJewels).toLocaleString()} Carats short</small>{/if}
</span>
</div>
<div><Icon name="diamond" size={18}/><span><strong>{projection.balances.freeJewels.toLocaleString()}</strong><small>Carats left</small></span></div>
<div><Icon name="ticket" size={18}/><span><strong>{(projection.balances.umaTickets + projection.balances.supportTickets).toLocaleString()}</strong><small>Tickets left</small></span></div>
<div class="crystals" aria-label="Uncap crystals" title="Completed Uncap Crystals plus progress toward the next one. Every 20/20 shards crafts one more crystal.">
  <span class="crystal-art" aria-hidden="true"><img src={itemIconPath(144)} alt=""/><img src={itemIconPath(145)} alt=""/></span>
  <strong class="crystal-values"><span><b>SSR</b> {availableCrystals(projection.balances.rainbowFullCrystals, projection.balances.rainbowCrystals)} <small>({Math.trunc(Math.max(0, projection.balances.rainbowCrystals)) % 20}/20)</small></span><span><b>SR</b> {availableCrystals(projection.balances.goldFullCrystals, projection.balances.goldCrystals)} <small>({Math.trunc(Math.max(0, projection.balances.goldCrystals)) % 20}/20)</small></span></strong>
</div>
<div><Icon name="timeline" size={18}/><span><strong>{projection.plannedPulls.toLocaleString()}</strong><small>Planned pulls</small></span></div>
</div>
</div>
</section>
  {#if cloudStatus.kind === 'reverted'}<div class="resource-status error" role="alert"><Icon name="refresh"/><span>{cloudStatus.label}</span></div>{/if}
  {#if importError}<div class="resource-status error" role="alert"><Icon name="warning"/><span><strong>Plan could not be imported</strong>{importError}</span></div>{/if}
  {#if resourcesLoading || gachasLoading}<div class="resource-status" role="status">
<Spinner label="Loading planner data" size={20}/>
<span>Loading rates, rewards, and income data…</span>
</div>{:else if resourcesError}<div class="resource-status error" role="alert">
<Icon name="warning"/>
<span>
<strong>Some planner data is unavailable</strong>{resourcesError}</span>
<Button size="sm" variant="secondary" onclick={() => loadResources(true)}>Retry</Button>
</div>{/if}
  <section class="setup" class:open={Boolean(setup)} aria-label="Plan assumptions">
    <button class="assumption-bar" type="button" aria-expanded={Boolean(setup)} aria-controls="planner-setup-workspace" onclick={() => setup = setup ? '' : 'resources'}>
      <span class="assumption-title"><Icon name="tune"/><span><strong>Plan assumptions</strong><small>Balance, income and automatically counted rewards</small></span></span>
      <span class="assumption-summary" aria-hidden="true">
        <span><strong>{plan.balances.freeJewels.toLocaleString('en-US')}</strong> starting Carats</span>
        <span><strong>{incomeCount}</strong> income settings</span>
        <span><strong>{rewardSummary.count}</strong> rewards counted</span>
      </span>
      <Icon name="chevron"/>
    </button>
    {#if setup}
      <Tabs id="planner-assumptions-tabs" controls="planner-setup-workspace" label="Planner assumptions" items={setupTabs} value={setup} variant="underline" onchange={value => setup = value as typeof setup}/>
      <div id="planner-setup-workspace" class="setup-workspace" role="tabpanel" aria-labelledby={'planner-assumptions-tabs-' + setup}>
        {#if setup === 'resources'}
          <PlannerBalancePanel {plan} oncommit={commit}/>
        {:else if setup === 'income'}
          <PlannerIncomePanel {plan} income={incomeProjection} loading={resourcesLoading} groups={incomeGroups} rules={resources.income.rules} rewards={effectiveRewards.rewards} competitiveVariants={resources.rewards.competitive_variants ?? []} bind:expandedSections={expandedIncomeSections} selectionMemory={incomeSelectionMemory} oncommit={commit}/>
        {:else}
          <PlannerRewardsPanel {plan} groups={rewardGroups} campaignViews={rewardCampaigns} resources={effectiveRewards} bind:search={rewardSearch} bind:showPast={showPastRewards} oncommit={commit}/>
        {/if}
      </div>
    {/if}
  </section>
  <section class="targets">
<header>
<div>
<h2>Pull plan</h2>
<p>Earliest pull first. Open a row to change rate-up goals or inspect the odds.</p>
</div>
<div class="target-heading-actions">
<span>{activeTargets.length} {activeTargets.length === 1 ? 'target' : 'targets'}</span>
{#if activeTargets.length}<div class="target-bulk" role="group" aria-label="Apply settings to every planned banner">
  <span class="bulk-title"><Icon name="tune" size={15}/><strong>All banners</strong></span>
  <SelectField id="planner-all-timing" label="Pull on" options={[{value:'',label:'Individual'},{value:'start',label:'Banner start'},{value:'end',label:'Banner end'}]} value={globalPullTiming} onchange={applyGlobalPullTiming}/>
  <SelectField id="planner-all-paid" label={regularTargets.length < activeTargets.length ? "Paid Carats (regular banners)" : "Paid Carats"} disabled={!regularTargets.length} options={[{value:'',label:'Mixed'},{value:'free-only',label:'Do not use'},{value:'allow',label:'Allowed'}]} value={globalPaidCarats} onchange={applyGlobalPaidCarats}/>
</div>{/if}
</div>
</header>{#if !activeTargets.length}<div class="empty-targets"><span><Icon name="calendar" size={24}/></span><div><strong>Your plan is ready for its first banner</strong><p>Search above to add one. Regular banners start with 200 pulls, paid banners with one draw, and Step-Ups with one round.</p></div></div>{:else}<div class="target-list">{#each pullItems as item, index (item.id)}
{#if item.kind === 'anniversary'}<div class="anniversary-marker" role="separator" aria-label={`${item.label} on ${item.date}`}><span></span><strong><Icon name="cake" size={14}/>{item.label}</strong><span></span></div>
{:else}{@const target = item.target}<LazyContent height={150} eager={index < 2}><PlannerTargetRow {target} past={item.past} projection={projectionByTarget.get(target.id)} {resources} {events} {catalog} {pickupCopyMemory} onupdate={(mutator) => updateTarget(target.id, mutator)} onremove={() => removeTarget(target.id)}/></LazyContent>{/if}
{/each}</div>
<p class="disclaimer">
<Icon name="info"/> Each pickup uses its published rate. Uncap Crystals replace copies after the first; available exchange copies are shared across selected goals after the pulls.</p>{/if}</section>
</section>

<style>
  .planner{display:grid;gap:12px;min-width:0;width:100%;padding:16px var(--page-gutter-current) 40px;background:var(--color-canvas);font-size:.82rem}
.workbench-panel{min-width:0;border:1px solid var(--border-subtle);border-radius:var(--radius-sm);background:var(--surface-1)}
.manager{display:flex;align-items:center;justify-content:space-between;gap:14px;min-height:48px;padding:6px 9px;border-bottom:1px solid var(--border-subtle)}
.identity{min-width:0;display:grid;grid-template-columns:minmax(0,190px) minmax(0,280px);gap:8px}
.plan-picker{min-width:0;display:grid;gap:6px;--menu-width:100%}.plan-picker>span{color:var(--color-text);font-size:var(--font-sm);font-weight:600;line-height:1.2}
.actions{min-width:0;display:flex;align-items:center;justify-content:flex-end;gap:6px}
.sync{min-width:0;max-width:210px;height:30px;display:flex;align-items:center;gap:5px;padding:0 8px;border:1px solid var(--border-subtle);border-radius:var(--radius-sm);color:var(--text-secondary);font-size:10px;white-space:nowrap}
.sync>span{min-width:0;overflow:hidden;text-overflow:ellipsis}
.sync.warning{color:var(--accent-warning)}
.share-notice{min-height:38px;display:flex;align-items:center;gap:8px;padding:7px 10px;border-bottom:1px solid var(--border-subtle);background:color-mix(in srgb,var(--accent-primary) 7%,transparent);color:var(--text-secondary);font-size:12px}
.share-notice>span{flex:1;min-width:0}.share-notice>:global(svg),.share-notice>a{color:var(--accent-primary)}.share-notice>a{white-space:nowrap;font-size:11px}
.file{display:none}
.workbench{min-width:0;display:grid;grid-template-columns:minmax(0,1fr) minmax(520px,auto);align-items:stretch}
.picker{min-width:0;position:relative;display:flex;flex-direction:column;justify-content:center;padding:8px 10px}
.picker :global(.combo-panel){max-height:min(320px,46dvh)}
.banner-option{width:100%;min-width:0;min-height:52px;display:grid;grid-template-columns:148px minmax(0,1fr) auto;align-items:center;gap:8px;padding-block:4px}
.banner-art{display:grid;place-items:center;height:36px;border:1px solid var(--border-subtle);background:var(--surface-2)}
.banner-art img{display:block;width:100%;height:100%;object-fit:contain}
.banner-copy{min-width:0;display:grid;gap:3px}
.banner-copy strong,.banner-copy time{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.banner-copy time{color:var(--text-secondary);font-size:10px}
.banner-action{display:flex;align-items:center;gap:3px;color:var(--accent-primary);font-size:10px}
.overview{min-width:0;display:grid;grid-template-columns:repeat(5,minmax(100px,1fr));border-left:1px solid var(--border-subtle)}
.overview>div{min-width:0;min-height:58px;display:flex;align-items:center;gap:7px;padding:7px 10px;border-right:1px solid var(--border-subtle)}
.overview>div:first-child{color:var(--accent-secondary)}.overview>div:last-child{border-right:0}
.overview span{min-width:0;display:grid}
.overview strong{overflow:hidden;font-size:14px;font-variant-numeric:tabular-nums;text-overflow:ellipsis}
.overview small{color:var(--text-secondary);font-size:9px;white-space:nowrap}
.overview .crystal-art{width:31px;display:flex;align-items:center;flex-shrink:0}.crystal-art img{width:20px;height:20px;object-fit:contain}.crystal-art img+img{margin:8px 0 0 -9px}
.overview .crystal-values{display:grid;overflow:visible;font-size:11px;line-height:1.12;gap:1px}.crystal-values>span{display:grid;grid-template-columns:24px auto minmax(0,1fr);gap:3px;align-items:baseline}.crystal-values b{color:var(--text-secondary);font-size:10px}
.overview>div.short{color:var(--accent-error)}
.resource-status{min-height:44px;display:flex;align-items:center;gap:7px;padding:6px 10px;border:1px solid var(--border-primary);background:var(--surface-1);color:var(--text-secondary)}
.resource-status.error{border-color:rgb(var(--accent-error-rgb)/.45);color:var(--accent-error)}
.resource-status span{min-width:0;display:flex;flex:1;flex-direction:column}
.setup{overflow:hidden;border:1px solid var(--border-subtle);border-radius:var(--radius-sm);background:var(--surface-1)}
.assumption-bar{width:100%;min-height:48px;display:grid;grid-template-columns:minmax(240px,1fr) auto auto;align-items:center;gap:16px;padding:8px 12px;border:0;background:transparent;color:var(--text-primary);text-align:left;cursor:pointer}
.assumption-title{min-width:0;display:flex;align-items:center;gap:9px}
.assumption-title>:global(svg){color:var(--accent-primary)}
.assumption-title>span{min-width:0;display:grid;gap:1px}
.assumption-title strong{font-size:12px}.assumption-title small{overflow:hidden;font-size:10px;white-space:nowrap;text-overflow:ellipsis}
.assumption-bar small{display:block;color:var(--text-secondary)}
.assumption-summary{display:flex;align-items:center;white-space:nowrap;color:var(--text-secondary);font-size:10px;font-variant-numeric:tabular-nums}
.assumption-summary>span{padding-inline:10px}.assumption-summary>span+span{border-left:1px solid var(--border-subtle)}
.setup.open .assumption-bar>:global(svg:last-child){transform:rotate(180deg)}
.setup>:global(.tabs){border-top:1px solid var(--border-subtle)}
.setup-workspace{container:planner-setup / inline-size;min-width:0;padding:12px}
.targets{padding:0}
.targets>header{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:10px}
.targets h2,.targets p{margin:0}
.targets h2{font-size:16px}.targets header p{font-size:12px}
.targets header p{color:var(--text-secondary)}
.target-heading-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;min-width:0;flex:1 1 480px}
.target-heading-actions>span{color:var(--text-secondary);font-size:10px;white-space:nowrap}
.empty-targets{min-height:86px;display:flex;align-items:center;justify-content:center;gap:13px;padding:14px 18px;border:1px solid var(--border-secondary);border-radius:var(--radius-sm);text-align:left}
.empty-targets>span{width:42px;height:42px;flex:0 0 42px;display:grid;place-items:center;color:var(--accent-primary)}
.empty-targets strong{display:block;color:var(--text-primary);font-size:.88rem}
.empty-targets p{margin:3px 0 0;color:var(--text-muted);font-size:.76rem}
.target-bulk{display:flex;align-items:center;gap:12px;min-width:0;margin-left:auto}
.bulk-title{display:flex;align-items:center;gap:5px;white-space:nowrap;color:var(--text-secondary);font-size:10px}
.bulk-title :global(svg){color:var(--accent-primary)}
.target-bulk :global(.field){display:grid;grid-template-columns:auto minmax(90px,1fr);align-items:center;gap:5px}
.target-bulk :global(label){white-space:nowrap}
.anniversary-marker{min-height:28px;display:grid;grid-template-columns:minmax(24px,1fr) auto minmax(24px,1fr);align-items:center;gap:9px;padding:2px 12px;color:var(--text-secondary)}
.anniversary-marker>span{height:1px;background:var(--border-secondary)}
.anniversary-marker strong{display:flex;align-items:center;gap:5px;font-size:10px}
.target-list{container:planner-targets / inline-size;display:grid;gap:0}
.disclaimer{display:flex;align-items:center;gap:6px;margin-top:10px!important;color:var(--text-secondary);font-size:9px}

  @media(max-width:1100px){
.workbench{grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr)}
.overview{grid-template-columns:repeat(2,minmax(0,1fr))}
.overview>div:nth-child(n+3){border-top:1px solid var(--border-subtle)}
}

  @media(max-width:768px){
.manager{display:grid;grid-template-columns:minmax(0,1fr) 44px;align-items:stretch;gap:8px;padding:7px 6px 8px}
.identity{grid-template-columns:minmax(0,1fr)}
.actions{flex-direction:column;justify-content:flex-end;gap:6px;width:var(--touch-target)}
.sync{width:var(--touch-target);padding:0;justify-content:center}.sync>span{display:none}
.workbench{grid-template-columns:1fr}.picker{padding:10px 6px}
.overview{border-left:0;border-top:1px solid var(--border-subtle);grid-template-columns:repeat(2,minmax(0,1fr))}
.overview>div{min-height:50px;padding:7px 12px;border-top:0;border-right:0}
.overview>div:first-child{grid-column:1/-1;min-height:48px;background:var(--surface-2);border-bottom:1px solid var(--border-subtle)}
.overview>div:nth-child(3){border-top:0}.overview>div:nth-child(3),.overview>div:nth-child(5){border-left:1px solid var(--border-subtle)}
.share-notice{flex-wrap:wrap;align-items:center}.share-notice>span{flex-basis:calc(100% - 28px)}.share-notice>a{display:flex;align-items:center;min-height:var(--touch-target);margin-left:26px}
}

  @media(max-width:680px){.planner{padding-inline:4px}
.target-heading-actions{width:100%;flex-basis:100%;align-items:stretch;flex-direction:column}
.target-heading-actions>span{align-self:flex-start}
.target-bulk{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));margin-left:0}
.bulk-title{grid-column:1/-1}
.target-bulk :global(.field){grid-template-columns:minmax(0,1fr)}
.banner-option{grid-template-columns:120px minmax(0,1fr) 18px;gap:6px}
.banner-art{height:29px}
.banner-action>span{display:none}
.assumption-bar{grid-template-columns:1fr auto}
.assumption-summary{grid-column:1/-1;grid-row:2;min-width:0;overflow-x:auto;scrollbar-width:none}
.assumption-summary>span{padding-inline:6px}.assumption-summary>span:first-child{padding-left:0}
.assumption-bar>:global(svg:last-child){grid-column:2;grid-row:1}.assumption-title small{display:none}
.setup-workspace{padding-inline:4px}
.targets{padding-inline:4px}
}
@media(max-width:640px){.targets header p{display:none}}

</style>
