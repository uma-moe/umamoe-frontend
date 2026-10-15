<script lang="ts">
  import type { TimelineRecord } from '@/pages/timeline/timeline-repository';
  import type {
    CaratPlan,
    PlannerDataBundle,
    PlannerRewardResource
  } from '@/lib/carat-planner/carat-planner';
  import {
    buildPlannerRewardGroups,
    plannerRewardSummary
  } from '@/lib/carat-planner/rewards/planner-reward-groups';
  import { buildPlannerCampaigns } from '@/lib/carat-planner/planner-campaigns';
  import {
    activeIncomeAssumptionCount,
    type PlannerIncomeGroup
  } from '../income/planner-income-view';
  import type { PlannerIncomeProjection } from '../income/planner-income-edits';
  import PlannerIncomePanel from '../income/PlannerIncomePanel.svelte';
  import PlannerRewardsPanel from '../rewards/PlannerRewardsPanel.svelte';
  import PlannerBalancePanel from './PlannerBalancePanel.svelte';
  import Icon from '@/components/Icon.svelte';
  import Tabs, { type TabItem } from '@/components/navigation/Tabs.svelte';

  interface Props {
    plan: CaratPlan;
    events: TimelineRecord[];
    resources: PlannerDataBundle;
    effectiveRewards: PlannerRewardResource;
    incomeGroups: PlannerIncomeGroup[];
    income: PlannerIncomeProjection;
    loading: boolean;
    oncommit: (mutator: (plan: CaratPlan) => void) => void;
  }

  let {
    plan,
    events,
    resources,
    effectiveRewards,
    incomeGroups,
    income,
    loading,
    oncommit
  }: Props = $props();

  const incomeSelectionMemory = new Map<string, Record<string, string>>();

  let expandedIncomeSections = $state(new Set<string>());
  let rewardSearch = $state(''),
    showPastRewards = $state(false);
  let setup = $state<'' | 'resources' | 'income' | 'rewards'>('');

  // Pull counts and balances do not change reward descriptions or available outcomes.
  const rewardStart = $derived(plan.projectionStartDate);
  const rewardSelections = $derived(
    JSON.stringify({
      scenarioSelections: plan.scenarioSelections,
      variableRewardSelections: plan.variableRewardSelections
    })
  );
  const rewardGroups = $derived(
    buildPlannerRewardGroups(
      effectiveRewards.rewards,
      effectiveRewards.event_benefits ?? [],
      effectiveRewards.competitive_variants ?? [],
      effectiveRewards.free_pull_campaigns ?? [],
      events,
      rewardStart,
      undefined,
      JSON.parse(rewardSelections)
    )
  );
  const rewardCampaigns = $derived(
    buildPlannerCampaigns(
      effectiveRewards.free_pull_campaigns ?? [],
      events,
      plan.projectionStartDate
    )
  );
  const rewardSummary = $derived(plannerRewardSummary(plan, rewardGroups, rewardCampaigns));
  const incomeCount = $derived(activeIncomeAssumptionCount(plan, resources.income.rules));
  const incomePeriod = $derived(
    income.preview
      ? '30-day preview'
      : 'Through ' +
          new Intl.DateTimeFormat('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            timeZone: 'UTC'
          }).format(new Date(income.through + 'T00:00:00Z'))
  );
  const setupTabs: TabItem[] = $derived([
    {
      id: 'resources',
      label: 'Balance',
      icon: 'paid',
      description:
        new Intl.DateTimeFormat('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          timeZone: 'UTC'
        }).format(new Date(plan.projectionStartDate + 'T00:00:00Z')) +
        ' · ' +
        plan.balances.freeJewels.toLocaleString('en-US') +
        ' Carats'
    },
    {
      id: 'income',
      label: 'Income',
      icon: 'chart',
      description: loading ? 'Loading income…' : incomePeriod + ' · ' + income.totalLabel
    },
    {
      id: 'rewards',
      label: 'Rewards',
      icon: 'gift',
      description:
        rewardSummary.count +
        ' counted automatically' +
        (rewardSummary.totalLabel ? ' · ' + rewardSummary.totalLabel : '')
    }
  ]);
</script>

<section
  class="setup"
  class:open={Boolean(setup)}
  aria-label="Plan assumptions"
>
  <button
    class="assumption-bar"
    type="button"
    aria-expanded={Boolean(setup)}
    aria-controls="planner-setup-workspace"
    onclick={() => (setup = setup ? '' : 'resources')}
  >
    <span class="assumption-title">
      <Icon name="tune" />
      <span>
        <strong>Plan assumptions</strong>
        <small>Balance, income and automatically counted rewards</small>
      </span>
    </span>
    <span
      class="assumption-summary"
      aria-hidden="true"
    >
      <span>
        <strong>{plan.balances.freeJewels.toLocaleString('en-US')}</strong>
        starting Carats
      </span>
      <span>
        <strong>{incomeCount}</strong>
        income settings
      </span>
      <span>
        <strong>{rewardSummary.count}</strong>
        rewards counted
      </span>
    </span>
    <Icon name="chevron" />
  </button>
  {#if setup}
    <Tabs
      id="planner-assumptions-tabs"
      controls="planner-setup-workspace"
      label="Planner assumptions"
      items={setupTabs}
      value={setup}
      variant="underline"
      onchange={(value) => (setup = value as typeof setup)}
    />
    <div
      id="planner-setup-workspace"
      class="setup-workspace"
      role="tabpanel"
      aria-labelledby={'planner-assumptions-tabs-' + setup}
    >
      {#if setup === 'resources'}
        <PlannerBalancePanel
          {plan}
          {oncommit}
        />
      {:else if setup === 'income'}
        <PlannerIncomePanel
          {plan}
          {income}
          {loading}
          groups={incomeGroups}
          rules={resources.income.rules}
          rewards={effectiveRewards.rewards}
          competitiveVariants={resources.rewards.competitive_variants ?? []}
          bind:expandedSections={expandedIncomeSections}
          selectionMemory={incomeSelectionMemory}
          {oncommit}
        />
      {:else}
        <PlannerRewardsPanel
          {plan}
          groups={rewardGroups}
          campaignViews={rewardCampaigns}
          resources={effectiveRewards}
          bind:search={rewardSearch}
          bind:showPast={showPastRewards}
          {oncommit}
        />
      {/if}
    </div>
  {/if}
</section>

<style>
  @import './planner-setup.css';
</style>
