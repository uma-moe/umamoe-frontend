<script lang="ts">
  import { onMount } from 'svelte';
  import type { Card, Requirement } from '../../../hakuraku-types';
  import { queryText, hasRequirement } from '../../../hakuraku-query';
  import {
    matcherValue,
    runnerChoices,
    selectionMatcher,
    styleChoices
  } from './archetype-matchers';
  import Button from '@/components/controls/Button.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import Combobox from '@/components/controls/Combobox.svelte';
  import Icon from '@/components/Icon.svelte';
  import CmArchetypeRules from './CmArchetypeRules.svelte';

  interface Props {
    cards: Record<number, Card>;
    colors: Record<number, string>;
    parsed: { slots: Requirement[]; error: string };
    activeFilters: number;
    query: string;
  }

  let { cards, colors, parsed, activeFilters, query = $bindable() }: Props = $props();

  let filtersOpen = $state(true);

  const umaChoices = $derived(runnerChoices(cards));

  function applySlots(slots: Requirement[]) {
    query = slots.some(hasRequirement) ? queryText(slots, cards) : '';
  }

  function filterSlot(index: number, key: 'card' | 'style', value: string) {
    const slots: Requirement[] = parsed.error ? [{}, {}, {}] : parsed.slots.map((s) => ({ ...s }));
    const slot = slots[index] ?? {},
      first = slot.anyOf?.[0] ?? slot;
    const matcher =
      key === 'card'
        ? selectionMatcher(cards, value, String(first.style ?? ''))
        : { ...first, style: value ? Number(value) : undefined };
    const choices = [matcher, ...(slot.anyOf?.slice(1) ?? [])].filter(hasRequirement);
    slots[index] = choices.length > 1 ? { anyOf: choices } : (choices[0] ?? {});
    applySlots(slots);
  }

  onMount(() => {
    const narrow = matchMedia('(max-width:1050px)');
    const adapt = () => (filtersOpen = !narrow.matches || Boolean(query));
    adapt();
    narrow.addEventListener('change', adapt);
    return () => narrow.removeEventListener('change', adapt);
  });

  $effect(() => {
    if (query) filtersOpen = true;
  });
</script>

<section class="filter-panel">
  <div class="filter-heading">
    <button
      type="button"
      class="filter-toggle"
      aria-label="Lineup filters"
      aria-expanded={filtersOpen}
      aria-controls="cm-lineup-filters"
      onclick={() => (filtersOpen = !filtersOpen)}
    >
      <Icon
        name="tune"
        size={16}
      />
      <strong>Lineup filters</strong>
      {#if activeFilters}
        <span class="filter-count">{activeFilters} active</span>
      {/if}
      <span
        class="filter-chevron"
        class:open={filtersOpen}
      >
        <Icon
          name="chevron"
          size={14}
        />
      </span>
    </button>
    <span class="filter-note">Match runners in any order</span>
    <Button
      variant="ghost"
      size="sm"
      disabled={!query}
      onclick={() => (query = '')}
    >
      Reset
    </Button>
  </div>
  <div
    id="cm-lineup-filters"
    hidden={!filtersOpen}
  >
    <div
      class="filter-columns"
      aria-hidden="true"
    >
      <span></span>
      <div>
        <span>Runner / outfit</span>
        <span>Running style</span>
      </div>
    </div>
    <div class="filters">
      {#each [0, 1, 2] as index}
        {@const first = parsed.slots[index]?.anyOf?.[0] ?? parsed.slots[index] ?? {}}
        <div
          class="filter-slot"
          role="group"
          aria-label={'Runner ' + (index + 1) + ' filter'}
          class:active={hasRequirement(parsed.slots[index] ?? {})}
        >
          <span class="slot-number">Runner {index + 1}</span>
          <div class="slot-controls">
            <Combobox
              id={'cm-filter-card-' + index}
              label={'Runner ' + (index + 1) + ' Uma'}
              hideLabel
              placeholder="Any Uma"
              prefixIcon="search"
              emptyValue=""
              value={matcherValue(first)}
              options={umaChoices}
              onchange={(v) => filterSlot(index, 'card', v)}
            />
            <SelectField
              id={'cm-filter-style-' + index}
              label={'Teammate ' + (index + 1) + ' style'}
              hideLabel
              value={String(first.style ?? '')}
              onchange={(v) => filterSlot(index, 'style', v)}
              options={styleChoices}
            />
          </div>
        </div>
      {/each}
    </div>
    <CmArchetypeRules
      {cards}
      {colors}
      {parsed}
      runnerChoices={umaChoices}
      onapply={applySlots}
    />
    {#if parsed.error}
      <p role="alert">{parsed.error}</p>
    {/if}
  </div>
</section>

<style>
  @import '../archetype-text.css';
  @import './cm-archetype-filters.css';
</style>
