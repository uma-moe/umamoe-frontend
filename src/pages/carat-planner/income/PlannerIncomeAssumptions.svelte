<script lang="ts">
  import type {
    CaratPlan,
    PlannerCompetitiveRewardVariant,
    PlannerIncomeRule,
    PlannerRewardEntry
  } from '@/lib/carat-planner/carat-planner';
  import {
    applyIncomePreset,
    applyScenarioSelection,
    PLANNER_INCOME_PRESETS,
    scenarioSelectionToEnable
  } from '@/lib/carat-planner/income/planner-income-presets';
  import {
    buildPlannerIncomeSections,
    type PlannerIncomeGroup,
    type PlannerIncomeSection
  } from './planner-income-view';
  import { markIncomeEdited } from './planner-income-edits';
  import type { IconName } from '@/components/icon-types';
  import Checkbox from '@/components/controls/Checkbox.svelte';
  import Icon from '@/components/Icon.svelte';
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';

  interface Props {
    plan: CaratPlan;
    groups: PlannerIncomeGroup[];
    rules: PlannerIncomeRule[];
    rewards: PlannerRewardEntry[];
    competitiveVariants: PlannerCompetitiveRewardVariant[];
    expandedSections: Set<string>;
    selectionMemory: Map<string, Record<string, string>>;
    oncommit: (mutator: (plan: CaratPlan) => void) => void;
  }

  let {
    plan,
    groups,
    rules,
    rewards,
    competitiveVariants,
    expandedSections = $bindable(),
    selectionMemory,
    oncommit
  }: Props = $props();

  const sections = $derived(buildPlannerIncomeSections(groups));

  const presetIcons: Record<string, IconName> = {
    conservative: 'shield',
    casual: 'user',
    active: 'activity',
    completionist: 'star'
  };

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
      markIncomeEdited(value);
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
      markIncomeEdited(value);
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
</script>

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

<style>
  @import './planner-income-sections.css';
  @import './planner-income-assumptions.css';
</style>
