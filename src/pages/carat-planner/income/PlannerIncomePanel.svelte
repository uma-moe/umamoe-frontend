<script lang="ts">
  import type {
    CaratPlan,
    PlannerCompetitiveRewardVariant,
    PlannerIncomeRule,
    PlannerRewardEntry
  } from '@/lib/carat-planner/carat-planner';
  import { isLegacyTrainingPassIncomeRule } from '@/lib/carat-planner/income/planner-income-assumptions';
  import { incomeRuleScheduleLabel, type PlannerIncomeGroup } from './planner-income-view';
  import { markIncomeEdited, type PlannerIncomeProjection } from './planner-income-edits';
  import PlannerCustomIncome from './PlannerCustomIncome.svelte';
  import PlannerIncomeAssumptions from './PlannerIncomeAssumptions.svelte';
  import PlannerIncomeOverview from './PlannerIncomeOverview.svelte';
  import Icon from '@/components/Icon.svelte';

  interface Props {
    plan: CaratPlan;
    groups: PlannerIncomeGroup[];
    rules: PlannerIncomeRule[];
    rewards: PlannerRewardEntry[];
    competitiveVariants: PlannerCompetitiveRewardVariant[];
    income: PlannerIncomeProjection;
    loading: boolean;
    expandedSections: Set<string>;
    selectionMemory: Map<string, Record<string, string>>;
    oncommit: (mutator: (plan: CaratPlan) => void) => void;
  }

  let {
    plan,
    income,
    loading,
    groups,
    rules,
    rewards,
    competitiveVariants,
    expandedSections = $bindable(),
    selectionMemory,
    oncommit
  }: Props = $props();

  const recurringRules = $derived(
    rules.filter((rule) => !rule.scenario_group && !isLegacyTrainingPassIncomeRule(rule))
  );

  function toggleRule(rule: PlannerIncomeRule): void {
    oncommit((value) => {
      value.enabledIncomeRuleIds = value.enabledIncomeRuleIds.includes(rule.id)
        ? value.enabledIncomeRuleIds.filter((id) => id !== rule.id)
        : [...value.enabledIncomeRuleIds, rule.id];
      markIncomeEdited(value);
    });
  }
</script>

<div class="income-panel">
  <PlannerIncomeOverview
    startDate={plan.projectionStartDate}
    {income}
    {loading}
  />
  <PlannerIncomeAssumptions
    {plan}
    {groups}
    {rules}
    {rewards}
    {competitiveVariants}
    bind:expandedSections
    {selectionMemory}
    {oncommit}
  />
  {#if recurringRules.length}
    <section aria-labelledby="income-rules-heading">
      <header class="panel-heading">
        <div>
          <strong id="income-rules-heading">Recurring income</strong>
          <span>Choose the sources that apply to you.</span>
        </div>
      </header>
      <div class="rule-list">
        {#each recurringRules as rule (rule.id)}
          <button
            type="button"
            class:active={plan.enabledIncomeRuleIds.includes(rule.id)}
            aria-pressed={plan.enabledIncomeRuleIds.includes(rule.id)}
            onclick={() => toggleRule(rule)}
          >
            <Icon
              name="refresh"
              size={18}
            />
            <span>
              <strong>{rule.label}</strong>
              <small>{incomeRuleScheduleLabel(rule)}</small>
            </span>
            <b>+{rule.amount.toLocaleString('en-US')}</b>
            <Icon
              name={plan.enabledIncomeRuleIds.includes(rule.id) ? 'check' : 'add'}
              size={17}
            />
          </button>
        {/each}
      </div>
    </section>
  {/if}
  <PlannerCustomIncome
    {plan}
    {oncommit}
  />
</div>

<style>
  @import './planner-income-sections.css';
  @import './planner-income-panel.css';
</style>
