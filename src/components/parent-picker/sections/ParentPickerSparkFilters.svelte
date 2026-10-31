<script lang="ts">
  import { groupParentFilters, type ParentPickerState } from '@/lib/veterans/parents/parent-picker';
  import FilterChip from '@/components/filters/FilterChip.svelte';
  import Button from '@/components/controls/Button.svelte';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';

  interface Props {
    pickerState: ParentPickerState;
    sparkView: string;
    onedit: (index?: number) => void;
    onclear: () => void;
  }

  let { pickerState = $bindable(), sparkView = $bindable(), onedit, onclear }: Props = $props();

  const factorGroups = $derived(groupParentFilters(pickerState.factors));

  const groupLabels = {
    blue: 'Blue stats',
    pink: 'Aptitude',
    green: 'Unique',
    white: 'Skill / race'
  };
</script>

<div
  class="active-filters"
  aria-label="Spark filters"
>
  {#if factorGroups.length}
    <div class="spark-filter-groups">
      {#each factorGroups as group (group.tone)}
        <section
          class="spark-filter-group selected-factor--{group.tone}"
          aria-label={groupLabels[group.tone] + ' filters'}
        >
          <div class="group-filters">
            {#each group.entries as { filter: factor, index, resolved } (index)}
              {@const max = factor.maxLevel ?? (factor.scope === 'combined' ? 9 : 3)}
              <div
                class="selected-factor selected-factor--{resolved.tone}"
                role="group"
                aria-label={resolved.name + ' spark filter ' + (index + 1)}
              >
                <FilterChip
                  label={resolved.name +
                    ' ' +
                    factor.minLevel +
                    (max === factor.minLevel ? '' : '–' + max) +
                    '★ (' +
                    {
                      combined: 'Combined',
                      any: 'Any slot',
                      own: 'Own',
                      p1: 'P1',
                      p2: 'P2'
                    }[factor.scope] +
                    ')'}
                  selected
                  removable
                  onclick={() => onedit(index)}
                  onremove={() =>
                    (pickerState.factors = pickerState.factors.filter((_, i) => index !== i))}
                />
              </div>
            {/each}
          </div>
          {#if group.entries.length > 1}
            <SegmentedControl
              label={groupLabels[group.tone] + ' matching'}
              options={[
                { value: 'and', label: 'AND' },
                { value: 'or', label: 'OR' }
              ]}
              value={pickerState.factorOperators?.[group.tone] ?? 'and'}
              onchange={(value) =>
                (pickerState.factorOperators = {
                  ...pickerState.factorOperators,
                  [group.tone]: value as 'and' | 'or'
                })}
            />
          {/if}
        </section>
      {/each}
    </div>
  {/if}
  <div class="spark-search">
    <Button
      variant="secondary"
      size="sm"
      icon="add"
      onclick={() => onedit()}
    >
      Add Spark
    </Button>
  </div>
  <div class="spark-display">
    <SegmentedControl
      label="Parent spark display"
      options={[
        { value: 'split', label: 'Split' },
        { value: 'combined', label: 'Combined' }
      ]}
      bind:value={sparkView}
    />
  </div>
  {#if pickerState.factors.length}
    <div class="clear-sparks">
      <Button
        variant="ghost"
        size="sm"
        onclick={onclear}
      >
        Clear all
      </Button>
    </div>
  {/if}
</div>

<style>
  @import './parent-picker-spark-filters.css';
</style>
