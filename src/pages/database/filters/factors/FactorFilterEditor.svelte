<script lang="ts">
  import Combobox from '@/components/controls/Combobox.svelte';
  import Icon from '@/components/Icon.svelte';
  import IconButton from '@/components/controls/IconButton.svelte';
  import NumberStepper from '@/components/controls/NumberStepper.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import Slider from '@/components/controls/Slider.svelte';
  import { factorImage, factorOptions, type FactorCategory } from '@/lib/catalog/factor-catalog';
  import type { FactorRequirement } from '@/lib/inheritance/inheritance-search';
  import WhiteFactorTypePicker from './WhiteFactorTypePicker.svelte';
  import { completeTourInteraction } from '@/components/tours/tour-state';

  interface Props {
    id: string;
    label: string;
    category: FactorCategory;
    tone?: 'blue' | 'pink' | 'green' | 'white';
    requirements?: FactorRequirement[];
    maxStars?: number;
    priorityMode?: boolean;
    addLabelOverride?: string;
  }

  let {
    id,
    label,
    category,
    tone = 'blue',
    requirements = $bindable([]),
    maxStars = 9,
    priorityMode = false,
    addLabelOverride
  }: Props = $props();

  const searchable = $derived(category === 'unique' || category === 'skills-races');
  const actualMaxStars = $derived(maxStars);
  const supportsOccurrences = $derived(maxStars > 3);

  const maxOccurrences = 3;

  const options = $derived([
    ...(category === 'skills-races' ? [] : [{ value: '0', label: 'Any' }]),
    ...factorOptions(category).map((factor) => ({
      value: String(factor.id),
      label: factor.text,
      image: category === 'skills-races' ? factorImage(Number(factor.id)) : undefined
    }))
  ]);
  const addLabel = $derived(
    addLabelOverride ??
      (category === 'stats'
        ? 'Add Blue Factor'
        : category === 'aptitude'
          ? 'Add Pink Factor'
          : category === 'unique'
            ? 'Add Green Factor'
            : priorityMode
              ? 'Add Optional White Factor'
              : 'Add White Factor')
  );
  const priorityDetail = $derived(
    label.toLocaleLowerCase().includes('lineage')
      ? 'priority group, then stack score'
      : 'priority group, then match count'
  );

  function add(): void {
    requirements = [
      ...requirements,
      {
        factorId: 0,
        minimumStars: 1,
        maximumStars: actualMaxStars,
        priority: priorityMode ? 0 : undefined,
        operator: 'and'
      }
    ];
    if (id === 'blue-factors') completeTourInteraction('filter-add-factor');
  }

  function update(index: number, patch: Partial<FactorRequirement>): void {
    requirements = requirements.map((entry, entryIndex) =>
      entryIndex === index ? { ...entry, ...patch } : entry
    );
    if (id === 'blue-factors' && patch.minimumStars !== undefined)
      completeTourInteraction('filter-blue-factor-slider');
  }

  function remove(index: number): void {
    requirements = requirements.filter((_, entryIndex) => entryIndex !== index);
  }

  function setPriority(index: number, input: string | number): void {
    const parsed = Number(input);
    update(index, { priority: Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0 });
  }

  function addSelectedFactors(factorIds: number[], priority: number): void {
    const existing = new Set(requirements.map((requirement) => requirement.factorId));
    const additions = factorIds
      .filter((factorId) => factorId > 0 && !existing.has(factorId))
      .map((factorId) => ({
        factorId,
        minimumStars: 1,
        maximumStars: actualMaxStars,
        priority,
        operator: 'and' as const
      }));
    if (additions.length) requirements = [...requirements, ...additions];
  }
</script>

<section
  {id}
  class="factor-editor tone-{tone}"
  class:priority-mode={priorityMode}
  aria-label={label}
>
  <header class="editor-header">
    <span
      class="tone-mark"
      aria-hidden="true"
    ></span>
    <span class="heading-copy">
      <strong>{label}</strong>
      {#if priorityMode}
        <small>{priorityDetail}</small>
      {:else}
        <small>
          {requirements.length
            ? `${requirements.length} requirement${requirements.length === 1 ? '' : 's'}`
            : 'No requirements'}
        </small>
      {/if}
    </span>
  </header>
  <div class="requirements">
    {#if priorityMode && category === 'skills-races'}
      <WhiteFactorTypePicker
        id={`${id}-browser`}
        browseLabel={label.toLocaleLowerCase().includes('lineage')
          ? 'Find lineage white factors'
          : id.includes('main')
            ? 'Find main-parent white factors'
            : 'Find white factors'}
        selectedFactorIds={requirements.map((requirement) => requirement.factorId)}
        onadd={addSelectedFactors}
      />
    {/if}
    {#each requirements as requirement, index}
      <div
        class="requirement"
        class:with-priority={priorityMode}
        class:stars-only={!priorityMode && !supportsOccurrences}
      >
        {#if !priorityMode}
          <div
            class="relation"
            aria-label={index === 0 ? 'First requirement' : 'Combine with previous requirement'}
          >
            {#if index === 0}
              <span class="match-label">Match</span>
            {:else}
              <SegmentedControl
                label="Requirement operator"
                options={[
                  { value: 'and', label: 'AND' },
                  { value: 'or', label: 'OR' }
                ]}
                value={requirement.operator ?? 'and'}
                onchange={(operator) => update(index, { operator: operator as 'and' | 'or' })}
              />
            {/if}
          </div>
          {#if supportsOccurrences}
            <div class="relation factor-metric">
              <SegmentedControl
                label="Factor range metric"
                options={[
                  { value: 'stars', label: 'Total stars', icon: 'star' },
                  { value: 'occurrences', label: 'Parent occurrences', icon: 'close' }
                ]}
                value={requirement.metric ?? 'stars'}
                onchange={(metric) => update(index, { metric: metric as 'stars' | 'occurrences' })}
              />
            </div>
          {/if}
        {/if}
        {#if searchable}
          <Combobox
            id={`${id}-factor-${index}`}
            label="Factor"
            hideLabel
            emptyValue={category === 'unique' ? '0' : undefined}
            placeholder={category === 'unique' ? 'Search Green Factor' : 'Search White Factor'}
            {options}
            value={String(requirement.factorId)}
            onchange={(value) => update(index, { factorId: Number(value) })}
          />
        {:else}
          <SelectField
            id={`${id}-factor-${index}`}
            label="Factor"
            hideLabel
            {options}
            value={String(requirement.factorId)}
            onchange={(value) => update(index, { factorId: Number(value) })}
          />
        {/if}
        {#if priorityMode}
          <div
            class="priority-control"
            title="Priority group: 0 sorts first, larger numbers are lower-priority tiebreakers"
          >
            <span>P</span>
            <input
              type="number"
              inputmode="numeric"
              min="0"
              step="1"
              value={requirement.priority ?? 0}
              aria-label="Priority group"
              onchange={(event) => setPriority(index, event.currentTarget.value)}
            />
            <NumberStepper
              increaseLabel="Increase priority group number"
              decreaseLabel="Decrease priority group number"
              decreaseDisabled={(requirement.priority ?? 0) === 0}
              onstep={(direction) => setPriority(index, (requirement.priority ?? 0) + direction)}
            />
          </div>
        {/if}
        <IconButton
          icon="trash"
          label={`Remove ${options.find((option) => Number(option.value) === requirement.factorId)?.label ?? 'factor'}`}
          onclick={() => remove(index)}
        />
        {#if !priorityMode}
          {@const occurrences = supportsOccurrences && requirement.metric === 'occurrences'}
          <div class="factor-range">
            <Slider
              id={id + (occurrences ? '-occurrences-' : '-stars-') + index}
              label={occurrences ? 'Occurrence range' : 'Star range'}
              hideLabel
              min={occurrences ? 0 : 1}
              max={occurrences ? maxOccurrences : actualMaxStars}
              step={1}
              range
              value={occurrences ? (requirement.minimumOccurrences ?? 0) : requirement.minimumStars}
              endValue={occurrences
                ? (requirement.maximumOccurrences ?? maxOccurrences)
                : (requirement.maximumStars ?? actualMaxStars)}
              {tone}
              showOutput={false}
              showTicks
              showTickLabels
              tickLabels={Array.from(
                { length: occurrences ? maxOccurrences + 1 : actualMaxStars },
                (_, value) => (occurrences ? value + '×' : value + 1 + '★')
              )}
              onchange={(minimum, maximum) =>
                update(
                  index,
                  occurrences
                    ? {
                        minimumOccurrences:
                          minimum === 0 && maximum === maxOccurrences ? undefined : minimum,
                        maximumOccurrences:
                          minimum === 0 && maximum === maxOccurrences ? undefined : maximum
                      }
                    : { minimumStars: minimum, maximumStars: maximum }
                )}
            />
          </div>
        {/if}
      </div>
    {/each}
    <button
      class="add-row"
      type="button"
      aria-label={addLabel}
      onclick={add}
    >
      <span>
        <Icon
          name="add"
          size={15}
        />
      </span>
      <strong>{addLabel}</strong>
    </button>
  </div>
</section>

<style>
  @import './factor-filter-editor.css';
</style>
