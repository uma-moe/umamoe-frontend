<script lang="ts">
  import type {
    CaratPlan,
    PlannerCompetitiveRewardVariant,
    PlannerCurrency,
    PlannerIncomeCadence,
    PlannerIncomeRule,
    PlannerRewardEntry
  } from '@/lib/carat-planner/carat-planner';
  import {
    applyIncomePreset,
    applyScenarioSelection,
    PLANNER_INCOME_PRESETS,
    scenarioSelectionToEnable
  } from '@/lib/carat-planner/planner-income-presets';
  import { isLegacyTrainingPassIncomeRule } from '@/lib/carat-planner/planner-income-assumptions';
  import {
    buildPlannerIncomeSections,
    incomeRuleScheduleLabel,
    type PlannerIncomeGroup,
    type PlannerIncomeSection,
    type summarizePlannerIncome
  } from './planner-income-view';
  import { itemIconPath } from '@/lib/catalog/item-icons';
  import type { IconName } from '@/components/icon-types';
  import Button from '@/components/controls/Button.svelte';
  import Checkbox from '@/components/controls/Checkbox.svelte';
  import Icon from '@/components/Icon.svelte';
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import TextField from '@/components/controls/TextField.svelte';

  interface Props {
    plan: CaratPlan;
    groups: PlannerIncomeGroup[];
    rules: PlannerIncomeRule[];
    rewards: PlannerRewardEntry[];
    competitiveVariants: PlannerCompetitiveRewardVariant[];
    income: ReturnType<typeof summarizePlannerIncome> & { through: string; preview: boolean };
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

  const sections = $derived(buildPlannerIncomeSections(groups));
  const recurringRules = $derived(
    rules.filter((rule) => !rule.scenario_group && !isLegacyTrainingPassIncomeRule(rule))
  );

  const dateFormatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  });

  const period = $derived(
    `${dateFormatter.format(new Date(plan.projectionStartDate + 'T00:00:00Z'))} – ${dateFormatter.format(new Date(income.through + 'T00:00:00Z'))}`
  );

  const presetIcons: Record<string, IconName> = {
    conservative: 'shield',
    casual: 'user',
    active: 'activity',
    completionist: 'star'
  };

  function markEdited(value: CaratPlan): void {
    if (value.incomePresetId) value.incomePresetEdited = true;
  }

  function selectedOption(group: PlannerIncomeGroup) {
    return group.options.find((option) => option.value === plan.scenarioSelections[group.id]);
  }

  function applyPreset(id: (typeof PLANNER_INCOME_PRESETS)[number]['id']): void {
    oncommit((value) =>
      applyIncomePreset(
        value,
        rules,
        id,
        Object.fromEntries(
          groups.map((group) => [group.id, group.options.map((option) => option.value)])
        ),
        rewards,
        competitiveVariants
      )
    );
  }

  function selectScenario(group: string, selected: string): void {
    oncommit((value) => {
      applyScenarioSelection(value, group, selected, competitiveVariants);
      markEdited(value);
    });
  }

  function toggleExpanded(id: string): void {
    const next = new Set(expandedSections);
    if (!next.delete(id)) next.add(id);
    expandedSections = next;
  }

  function toggleSection(section: PlannerIncomeSection): void {
    const clear = section.groups.every((group) => selectedOption(group));
    const remembered = selectionMemory.get(section.id) ?? {};
    if (clear)
      selectionMemory.set(
        section.id,
        Object.fromEntries(section.groups.map((group) => [group.id, selectedOption(group)!.value]))
      );
    oncommit((value) => {
      markEdited(value);
      for (const group of section.groups) {
        if (clear) applyScenarioSelection(value, group.id, '', competitiveVariants);
        else if (!selectedOption(group))
          applyScenarioSelection(
            value,
            group.id,
            scenarioSelectionToEnable(
              group.id,
              group.options.map((option) => option.value),
              remembered[group.id]
            ),
            competitiveVariants
          );
      }
    });
  }

  function toggleRule(rule: PlannerIncomeRule): void {
    oncommit((value) => {
      value.enabledIncomeRuleIds = value.enabledIncomeRuleIds.includes(rule.id)
        ? value.enabledIncomeRuleIds.filter((id) => id !== rule.id)
        : [...value.enabledIncomeRuleIds, rule.id];
      markEdited(value);
    });
  }

  function addCustom(): void {
    oncommit((value) =>
      value.customIncome.push({
        id: 'income-' + crypto.randomUUID(),
        label: 'Custom income',
        currency: 'free_jewels',
        amount: 0,
        cadence: 'once',
        startDate: value.projectionStartDate,
        every: 1
      })
    );
  }

  const currencyOptions = [
    { value: 'free_jewels', label: 'Carats' },
    { value: 'uma_ticket', label: 'Uma ticket' },
    { value: 'support_ticket', label: 'Support ticket' },
    { value: 'rainbow_crystal', label: 'Rainbow Crystal Shard' },
    { value: 'gold_crystal', label: 'Gold Crystal Shard' },
    { value: 'rainbow_full_crystal', label: 'Rainbow Uncap Crystal' },
    { value: 'gold_full_crystal', label: 'Gold Uncap Crystal' }
  ];
  const cadenceOptions = [
    { value: 'once', label: 'Once' },
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' }
  ];
</script>

<div class="income-panel">
  <section
    class="income-overview"
    aria-label="Projected income"
    aria-busy={loading}
  >
    <header class="panel-heading">
      <div>
        <strong>Projected income</strong>
        <span>
          {period} · {income.preview ? '30-day preview' : 'Through your last planned pull'}
        </span>
      </div>
    </header>
    <p>
      Includes selected income, estimates, custom entries and dated rewards in this period. Excludes
      your starting balance and pull spending.
    </p>
    {#if loading}
      <p>Loading income…</p>
    {:else}
      {#if income.resources.length}
        <dl class="income-resources">
          {#each income.resources as item (item.currency)}
            <div data-currency={item.currency}>
              <img
                src={itemIconPath(item.itemId)}
                width="24"
                height="24"
                alt=""
              />
              <dt>{item.label}</dt>
              <dd class:deduction={item.amount < 0}>{item.formatted}</dd>
            </div>
          {/each}
        </dl>
      {:else}
        <p class="income-empty">
          No income is scheduled in this period. Selected sources count when their payouts fall
          within these dates.
        </p>
      {/if}
      {#if income.sources.length}
        <details class="income-breakdown">
          <summary>
            <span>
              Included sources <small>{income.sources.length}</small>
            </span>
            <Icon
              name="chevron"
              size={16}
            />
          </summary>
          <ul>
            {#each income.sources as source}
              <li>
                <strong>{source.label}</strong>
                <span>{source.amountLabel}</span>
              </li>
            {/each}
          </ul>
        </details>
      {/if}
    {/if}
  </section>
  <section aria-labelledby="income-assumptions-heading">
    <header class="panel-heading">
      <div>
        <strong id="income-assumptions-heading">Income assumptions</strong>
        <span>Choose expected results and optional estimated income.</span>
      </div>
    </header>
    <div
      class="presets"
      role="radiogroup"
      aria-label="Income assumption presets"
    >
      <div class="preset-heading">
        <Icon
          name="tune"
          size={17}
        />
        <span>
          <strong>Quick presets</strong>
          <small>Apply a starting point, then adjust anything below</small>
        </span>
      </div>
      {#each PLANNER_INCOME_PRESETS as preset}
        <label
          class="preset"
          class:active={plan.incomePresetId === preset.id}
        >
          <input
            type="radio"
            name="planner-income-preset"
            value={preset.id}
            checked={plan.incomePresetId === preset.id}
            aria-label={preset.label + ': ' + preset.description}
            onchange={() => applyPreset(preset.id)}
          />
          <Icon
            name={presetIcons[preset.id]!}
            size={15}
          />
          <span>
            <strong>{preset.label}</strong>
            <small>
              {preset.description}{plan.incomePresetId === preset.id && plan.incomePresetEdited
                ? ' (edited)'
                : ''}
            </small>
          </span>
        </label>
      {/each}
    </div>
    <div class="scenario-sections">
      {#each sections as section (section.id)}
        {@const enabledCount = section.groups.filter((group) => selectedOption(group)).length}
        {@const all = enabledCount === section.groups.length}
        <section
          class="income-section"
          aria-labelledby={'income-section-' + section.id}
        >
          <header>
            <button
              type="button"
              class="disclosure"
              aria-expanded={expandedSections.has(section.id)}
              aria-controls={'income-options-' + section.id}
              onclick={() => toggleExpanded(section.id)}
            >
              <Icon
                name={section.icon}
                size={18}
              />
              <span>
                <strong id={'income-section-' + section.id}>{section.label}</strong>
                <small>{section.description}</small>
              </span>
              <em>{enabledCount}/{section.groups.length} on</em>
              <span
                class:expanded={expandedSections.has(section.id)}
                class="chevron"
              >
                <Icon
                  name="chevron"
                  size={16}
                />
              </span>
            </button>
            <div
              class="section-toggle"
              class:active={enabledCount > 0}
            >
              <Checkbox
                id={'income-toggle-' + section.id}
                label={all ? 'Clear all' : 'Select all'}
                ariaLabel={(all ? 'Clear all' : 'Select all') + ' for ' + section.label}
                checked={all}
                indeterminate={enabledCount > 0 && !all}
                onchange={() => toggleSection(section)}
              />
            </div>
          </header>
          {#if expandedSections.has(section.id)}
            <div
              class="scenario-list"
              id={'income-options-' + section.id}
            >
              {#each section.groups as group (group.id)}
                {@const selected = selectedOption(group)}
                <article class="scenario">
                  <div class="scenario-copy">
                    <Icon
                      name={group.icon}
                      size={17}
                    />
                    <div>
                      <div class="scenario-heading">
                        <strong>{group.label}</strong>
                        {#if group.helpText}
                          <InspectPopover label={'How ' + group.label + ' is calculated'}>
                            {#snippet trigger()}
                              <span class="help">?</span>
                            {/snippet}
                            <strong>{group.label}</strong>
                            <p class="help-copy">{group.helpText}</p>
                          </InspectPopover>
                        {/if}
                      </div>
                      <small class="schedule">
                        <span>{group.scheduleLabel}</span>
                        {#if group.sourceUrl}
                          <a
                            href={group.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={'Open source for ' + group.label + ' in a new tab'}
                          >
                            Source<Icon
                              name="external"
                              size={10}
                            />
                          </a>
                        {/if}
                      </small>
                    </div>
                  </div>
                  {#if group.options.length === 1}
                    <div
                      class="binary"
                      class:active={Boolean(selected)}
                    >
                      <Checkbox
                        id={'income-' + group.id}
                        label={group.options[0]!.label}
                        ariaLabel={(selected ? 'Exclude' : 'Include') + ' ' + group.label}
                        description={selected ? selected.amountLabel : 'Select to include'}
                        checked={Boolean(selected)}
                        onchange={(checked) =>
                          selectScenario(group.id, checked ? group.options[0]!.value : '')}
                      />
                    </div>
                  {:else}
                    <div
                      class="scenario-select"
                      class:active={Boolean(selected)}
                    >
                      <SelectField
                        id={'income-' + group.id}
                        label={group.label}
                        hideLabel
                        options={[
                          { value: '', label: 'Not included', description: 'No projected income' },
                          ...group.options.map((option) => ({
                            ...option,
                            description: option.amountLabel
                          }))
                        ]}
                        value={selected?.value ?? ''}
                        onchange={(value) => selectScenario(group.id, value)}
                      />
                    </div>
                  {/if}
                </article>
              {/each}
            </div>
          {/if}
        </section>
      {/each}
    </div>
  </section>
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
  <section aria-labelledby="custom-income-heading">
    <header class="panel-heading">
      <div>
        <strong id="custom-income-heading">Custom income</strong>
        <span>{plan.customIncome.length || 'No'} custom sources</span>
      </div>
      <Button
        size="sm"
        variant="secondary"
        icon="add"
        onclick={addCustom}
      >
        Add income
      </Button>
    </header>
    {#if plan.customIncome.length}
      <div class="custom-list">
        {#each plan.customIncome as item (item.id)}
          <div class="custom">
            <TextField
              id={`income-name-${item.id}`}
              label="Income name"
              maxlength={100}
              value={item.label}
              oninput={(event) =>
                oncommit(
                  (value) =>
                    (value.customIncome.find((entry) => entry.id === item.id)!.label = (
                      event.currentTarget as HTMLInputElement
                    ).value.slice(0, 100))
                )}
            />
            <TextField
              id={`income-amount-${item.id}`}
              label="Amount"
              type="number"
              min={0}
              value={String(item.amount)}
              oninput={(event) =>
                oncommit(
                  (value) =>
                    (value.customIncome.find((entry) => entry.id === item.id)!.amount =
                      Number((event.currentTarget as HTMLInputElement).value) || 0)
                )}
            />
            <SelectField
              id={'income-currency-' + item.id}
              label="Resource"
              options={currencyOptions}
              value={item.currency}
              onchange={(selected) =>
                oncommit(
                  (value) =>
                    (value.customIncome.find((entry) => entry.id === item.id)!.currency =
                      selected as PlannerCurrency)
                )}
            />
            <SelectField
              id={'income-cadence-' + item.id}
              label="Frequency"
              options={cadenceOptions}
              value={item.cadence}
              onchange={(selected) =>
                oncommit(
                  (value) =>
                    (value.customIncome.find((entry) => entry.id === item.id)!.cadence =
                      selected as PlannerIncomeCadence)
                )}
            />
            <TextField
              id={`income-start-${item.id}`}
              label="Starts"
              type="date"
              value={item.startDate}
              oninput={(event) =>
                oncommit(
                  (value) =>
                    (value.customIncome.find((entry) => entry.id === item.id)!.startDate = (
                      event.currentTarget as HTMLInputElement
                    ).value)
                )}
            />
            <Button
              size="sm"
              variant="danger"
              icon="close"
              ariaLabel={'Remove custom income ' + item.label}
              onclick={() =>
                oncommit(
                  (value) =>
                    (value.customIncome = value.customIncome.filter(
                      (entry) => entry.id !== item.id
                    ))
                )}
            />
          </div>
        {/each}
      </div>
    {/if}
  </section>
</div>

<style>
  @import './planner-income-panel.css';
</style>
