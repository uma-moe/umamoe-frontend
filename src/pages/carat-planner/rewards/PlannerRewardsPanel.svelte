<script
  module
  lang="ts"
>
  import InfoBadge from '@/components/feedback/InfoBadge.svelte';
  const fullDate = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  });

  const shortDate = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  });
</script>

<script lang="ts">
  import { virtualScroll, type VirtualRange } from '@/lib/virtual-scroll';
  import type { CaratPlan, PlannerRewardResource } from '@/lib/carat-planner/carat-planner';
  import {
    cycleRewardOption,
    rewardBannerPlanned,
    rewardGroupActive,
    rewardGroupSelectable,
    updateRewardGroup,
    type PlannerRewardGroup
  } from '@/lib/carat-planner/rewards/planner-reward-groups';
  import {
    activateRewardEvents,
    campaignState,
    selectPlannerCampaign,
    type PlannerCampaign
  } from '@/lib/carat-planner/rewards/planner-campaigns';
  import { itemIconPath } from '@/lib/game-assets/item-icons';
  import { timelineImage } from '@/lib/game-assets/timeline-artwork';
  import Button from '@/components/controls/Button.svelte';
  import Icon from '@/components/Icon.svelte';
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';
  import TextField from '@/components/controls/TextField.svelte';

  let virtualRange = $state<VirtualRange>({ start: 0, end: 0 });

  interface Props {
    plan: CaratPlan;
    resources: PlannerRewardResource;
    groups: PlannerRewardGroup[];
    campaignViews: PlannerCampaign[];
    search: string;
    showPast: boolean;
    oncommit: (mutator: (plan: CaratPlan) => void) => void;
  }

  let {
    plan,
    resources,
    groups,
    campaignViews,
    search = $bindable(),
    showPast = $bindable(),
    oncommit
  }: Props = $props();

  const items = $derived(
    [
      ...groups.map((group) => ({
        id: 'group:' + group.id,
        availableAt: group.availableAt,
        isPast: group.isPast,
        searchText: group.searchText,
        group,
        campaign: undefined
      })),
      ...campaignViews.map((campaign) => ({
        id: 'campaign:' + campaign.id,
        availableAt: campaign.availableAt,
        isPast: campaign.isPast,
        searchText: campaign.searchText,
        campaign,
        group: undefined
      }))
    ].filter((item) => item.searchText.includes(search.trim().toLowerCase()))
  );

  const upcomingCount = $derived(items.filter((item) => !item.isPast).length),
    pastCount = $derived(items.length - upcomingCount);

  const matching = $derived(
    items
      .filter((item) => item.isPast === showPast)
      .sort((a, b) =>
        a.availableAt && b.availableAt
          ? (showPast ? -1 : 1) * a.availableAt.localeCompare(b.availableAt) ||
            a.id.localeCompare(b.id)
          : a.availableAt
            ? -1
            : b.availableAt
              ? 1
              : a.id.localeCompare(b.id)
      )
  );

  const visible = $derived(matching.slice(virtualRange.start, virtualRange.end));

  const date = (value: string, year = true) =>
    value ? (year ? fullDate : shortDate).format(new Date(value + 'T00:00:00Z')) : '';

  function dateLabel(group: PlannerRewardGroup): string {
    return group.availableUntil && group.availableUntil !== group.availableAt
      ? date(group.availableAt, false) + ' – ' + date(group.availableUntil)
      : date(group.availableAt);
  }

  function artwork(group: PlannerRewardGroup): string | undefined {
    const variant = group.competitiveVariants[0];
    return (
      group.imagePath ??
      (variant?.master_event_id
        ? timelineImage(undefined, variant.competition, String(variant.master_event_id))
        : undefined)
    );
  }

  function bannerAvailable(group: PlannerRewardGroup): boolean {
    return Boolean(
      group.eventBenefits.some((item) => item.kind === 'free_pulls') &&
      group.event &&
      ['character_banner', 'support_card_banner'].includes(group.event.eventType)
    );
  }

  function toggleBanner(group: PlannerRewardGroup) {
    if (group.event)
      oncommit((value) =>
        activateRewardEvents(value, [group.event!], !rewardBannerPlanned(plan, group), resources)
      );
  }

  function selectCampaign(campaign: PlannerCampaign, stock: boolean) {
    oncommit((value) => selectPlannerCampaign(value, campaign, stock, resources));
  }

  function campaignLabel(campaign: PlannerCampaign, stock: boolean) {
    return stock && campaign.stockDestination
      ? campaign.totalPulls.toLocaleString('en-US') + ' pulls on ' + campaign.stockDestination.title
      : campaign.allocations
          .map((item) => item.pulls.toLocaleString('en-US') + ' pulls on ' + item.title)
          .join(' · ');
  }
</script>

<div class="rewards-panel">
  <header class="toolbar">
    <div class="query">
      <TextField
        id="planner-reward-search"
        label="Find a reward"
        hideLabel
        type="search"
        prefixIcon="search"
        placeholder="Find an event or reward"
        bind:value={search}
      />{#if search}
        <Button
          variant="ghost"
          size="sm"
          icon="close"
          ariaLabel="Clear reward search"
          onclick={() => (search = '')}
        />
      {/if}
    </div>
    <span class="hint">
      <Icon
        name="check"
        size={15}
      />
      <span>
        <strong>Upcoming rewards are counted</strong>
        <small>Uncheck only what you will not collect.</small>
      </span>
    </span>
    <div
      class="period"
      role="group"
      aria-label="Reward period"
    >
      <Button
        variant={!showPast ? 'secondary' : 'ghost'}
        size="sm"
        ariaPressed={!showPast}
        onclick={() => (showPast = false)}
      >
        Upcoming <span>{upcomingCount}</span>
      </Button>
      <Button
        variant={showPast ? 'secondary' : 'ghost'}
        size="sm"
        ariaPressed={showPast}
        onclick={() => (showPast = true)}
      >
        Past <span>{pastCount}</span>
      </Button>
    </div>
  </header>
  <div
    class="reward-viewport"
    aria-label={showPast
      ? 'Past event rewards, newest first'
      : 'Current and upcoming event rewards, earliest first'}
  >
    <div
      use:virtualScroll={{
        items: matching,
        searchText: (item) => item.searchText,
        key: (item) => item.id,
        root: 'closest',
        estimate: 65,
        onrange: (range) => (virtualRange = range)
      }}
    >
      {#each visible as item, index (item.id)}
        <div data-virtual-index={virtualRange.start + index}>
          {#if item.campaign}
            {@const campaign = item.campaign}
            {@const state = campaignState(plan, campaign)}
            <article
              class="campaign"
              class:has-image={campaign.allocations.some((allocation) => allocation.imagePath)}
              class:past={showPast}
              data-campaign-id={campaign.id}
            >
              <div
                class="art"
                aria-hidden="true"
              >
                {#each campaign.allocations
                  .filter((allocation) => allocation.imagePath)
                  .slice(0, 2) as allocation}
                  <img
                    src={allocation.imagePath}
                    alt=""
                    loading="lazy"
                  />
                {:else}
                  <Icon
                    name="gift"
                    size={22}
                  />
                {/each}
              </div>
              <div class="copy">
                <strong>{campaign.label}</strong>
                {#if campaign.availableAt}
                  <time>{date(campaign.availableAt)}</time>
                {/if}
              </div>
              <div class="benefits">
                <span>
                  {campaign.totalPulls.toLocaleString('en-US')} banner-limited pulls total{#if campaign.pullsPerDay}
                    · {campaign.pullsPerDay} per day
                  {/if} · one shared campaign
                </span>
              </div>
              <div class="actions">
                {#if campaign.sourceUrl}
                  <a
                    href={campaign.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={'Open news post for ' + campaign.label + ' in a new tab'}
                  >
                    <Icon
                      name="external"
                      size={13}
                    />
                  </a>
                {/if}
                {#if showPast}
                  <span class="history">Past</span>
                {:else}
                  {#if campaign.stockDestination}
                    <span title={campaignLabel(campaign, state.stock)}>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon="swap"
                        disabled={!state.canSwitch}
                        ariaLabel={'Switch free-pull allocation for ' + campaign.label}
                        onclick={() => selectCampaign(campaign, !state.stock)}
                      >
                        {state.stock ? 'Later banner' : 'Daily split'}
                      </Button>
                    </span>
                  {/if}
                  <Button
                    variant={state.ready ? 'secondary' : 'ghost'}
                    size="sm"
                    icon={state.ready ? 'check' : 'add'}
                    disabled={!state.canSelect}
                    ariaPressed={state.ready}
                    ariaLabel={(state.ready ? 'Remove' : 'Add') +
                      ' ' +
                      campaign.label +
                      (state.ready ? ' from plan' : ' to plan')}
                    onclick={() => selectCampaign(campaign, state.stock)}
                  >
                    {state.ready ? 'Added' : 'Add to plan'}
                  </Button>
                {/if}
              </div>
            </article>
          {:else if item.group}
            {@const group = item.group}
            {@const art = artwork(group)}
            {@const active = rewardGroupActive(plan, group)}
            <article
              class:has-image={Boolean(art)}
              class:has-result={group.variableOptions.length > 0}
              class:past={showPast}
              class:excluded={!active && rewardGroupSelectable(group) && !showPast}
              data-reward-id={group.id}
            >
              <div
                class="art"
                aria-hidden="true"
              >
                {#if art}
                  <img
                    src={art}
                    alt=""
                    loading="lazy"
                  />
                {:else}
                  <Icon
                    name="gift"
                    size={22}
                  />
                {/if}
              </div>
              <div class="copy">
                <strong>{group.title}</strong>
                {#if group.availableAt}
                  <time>{dateLabel(group)}</time>
                {/if}
              </div>
              <div class="benefits">
                {#each group.benefits as benefit}
                  <span data-kind={benefit.kind}>
                    {#if benefit.itemId}
                      <img
                        src={itemIconPath(benefit.itemId)}
                        alt=""
                      />
                    {/if}{benefit.text}
                  </span>
                {/each}
                {#if group.breakdownTooltip}
                  <InspectPopover label={'Show reward breakdown for ' + group.title}>
                    {#snippet trigger()}
                      <InfoBadge />
                    {/snippet}
                    <div class="breakdown">{group.breakdownTooltip}</div>
                  </InspectPopover>
                {/if}
              </div>
              <div class="actions">
                {#if group.sourceUrl}
                  <a
                    href={group.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={group.sourceLabel ?? 'Source'}
                    title={group.sourceLabel + ' for ' + group.title}
                  >
                    <span>{group.sourceLabel ?? 'Source'}</span>
                    <Icon
                      name="external"
                      size={13}
                    />
                  </a>
                {:else if group.sourceLabel}
                  <span
                    class="source"
                    title={group.sourceLabel + ' is the source for this reward'}
                  >
                    <span>{group.sourceLabel}</span>
                    <Icon
                      name="database"
                      size={13}
                    />
                  </span>
                {/if}
                {#if showPast}
                  <span class="history">Past</span>
                {:else}
                  {#if group.variableOptions.length}
                    <div
                      class="result"
                      role="group"
                      aria-label={'Expected result for ' + group.title}
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        icon="arrow-left"
                        ariaLabel={'Previous result for ' + group.title}
                        onclick={() => oncommit((value) => cycleRewardOption(value, group, -1))}
                      />
                      <button
                        type="button"
                        class="current-result"
                        aria-label={'Lower expected result for ' + group.title}
                        onclick={() => oncommit((value) => cycleRewardOption(value, group, -1))}
                      >
                        <strong>{group.selectedOption.label}</strong>
                        <small>{group.selectedOption.amountLabel}</small>
                      </button>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon="arrow-right"
                        ariaLabel={'Next result for ' + group.title}
                        onclick={() => oncommit((value) => cycleRewardOption(value, group, 1))}
                      />
                    </div>
                  {/if}
                  {#if bannerAvailable(group)}
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={rewardBannerPlanned(plan, group) ? 'check' : 'add'}
                      ariaPressed={rewardBannerPlanned(plan, group)}
                      ariaLabel={(rewardBannerPlanned(plan, group) ? 'Remove ' : 'Add ') +
                        group.title +
                        ' banner'}
                      onclick={() => toggleBanner(group)}
                    >
                      {rewardBannerPlanned(plan, group) ? 'Added' : 'Plan'}
                    </Button>
                  {/if}
                  {#if rewardGroupSelectable(group) && !group.variableOptions.length}
                    <Button
                      variant={active ? 'secondary' : 'ghost'}
                      size="sm"
                      icon={active ? 'check' : 'add'}
                      ariaPressed={active}
                      ariaLabel={(active ? 'Exclude ' : 'Include ') + group.title + ' rewards'}
                      onclick={() => oncommit((value) => updateRewardGroup(value, group, !active))}
                    />
                  {/if}
                {/if}
              </div>
            </article>
          {/if}
        </div>
      {/each}
    </div>
    {#if !matching.length}
      <p class="empty">
        {#if search.trim()}
          No {showPast ? 'past' : 'upcoming'} rewards match this search.
        {:else}
          {showPast
            ? 'No historical rewards are available.'
            : 'No usable rewards are scheduled from the plan start date.'}
        {/if}
      </p>
    {/if}
  </div>
</div>

<style>
  @import './planner-rewards-panel.css';
</style>
