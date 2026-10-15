<script lang="ts">
  import { virtualScroll, type VirtualRange } from '@/lib/virtual-scroll';
  import Icon from '@/components/Icon.svelte';
  import SelectFieldSlim from '@/components/controls/SelectFieldSlim.svelte';
  import NumberStepper from '@/components/controls/NumberStepper.svelte';
  import {
    buildWhiteFactorCatalog,
    familyLabels,
    matchWhiteFactors,
    type BrowseableFactor,
    type CategoryFamily
  } from './white-factor-catalog';

  interface Props {
    id: string;
    browseLabel?: string;
    selectedFactorIds?: number[];
    mode?: 'add' | 'hide' | 'browse';
    onadd?: (factorIds: number[], priority: number) => void;
    onremove?: (factorId: number) => void;
  }

  let {
    id,
    browseLabel = 'Find white factors',
    selectedFactorIds = [],
    mode = 'add',
    onadd,
    onremove
  }: Props = $props();

  let normalRange = $state<VirtualRange>({ start: 0, end: 0 }),
    upgradedRange = $state<VirtualRange>({ start: 0, end: 0 });
  let expanded = $state(false);
  let searchTerm = $state('');
  let priority = $state(0);
  let selectedCategoryKeys = $state<string[]>([]);
  let browseFamily = $state<CategoryFamily | null>(null);

  const catalog = $derived(buildWhiteFactorCatalog());
  const standardCategories = $derived(
    catalog.categories.filter(
      (category) =>
        category.variant !== 'upgraded' ||
        !catalog.categories.some((entry) => entry.key === 'special')
    )
  );
  const hiding = $derived(mode === 'hide');
  const browsing = $derived(mode === 'browse');
  const hasCriteria = $derived(
    browsing || Boolean(searchTerm.trim()) || selectedCategoryKeys.length > 0
  );
  const matchingFactors = $derived(
    hasCriteria
      ? matchWhiteFactors(
          catalog.factors,
          searchTerm,
          selectedCategoryKeys,
          browsing ? browseFamily : null
        )
      : []
  );
  const normalMatches = $derived(
    selectedCategoryKeys.includes('special')
      ? matchingFactors.filter((factor) => factor.categoryKey !== 'special-upgraded')
      : matchingFactors
  );
  const upgradedMatches = $derived(
    selectedCategoryKeys.includes('special')
      ? matchingFactors.filter((factor) => factor.categoryKey === 'special-upgraded')
      : []
  );

  function openFamily(family: CategoryFamily | null) {
    browseFamily = family;
    selectedCategoryKeys = [];
  }

  function toggleCategory(key: string): void {
    if (selectedCategoryKeys.includes(key))
      selectedCategoryKeys = selectedCategoryKeys.filter(
        (entry) => entry !== key && !(key === 'special' && entry === 'special-upgraded')
      );
    else selectedCategoryKeys = [...selectedCategoryKeys, key];
  }

  function clearCriteria(): void {
    searchTerm = '';
    selectedCategoryKeys = [];
  }

  function setPriority(value: number): void {
    priority = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  }

  function addFactor(factor: BrowseableFactor): void {
    if (!selectedFactorIds.includes(factor.id)) onadd?.([factor.id], priority);
    else if (hiding) onremove?.(factor.id);
  }
</script>

{#snippet factorResult(factor: BrowseableFactor, index: number)}
  {@const selected = selectedFactorIds.includes(factor.id)}
  <button
    data-virtual-index={index}
    type="button"
    class="factor-result"
    class:selected
    disabled={selected && !hiding}
    aria-pressed={hiding ? selected : undefined}
    title={selected
      ? hiding
        ? 'Show this spark again'
        : 'Already selected'
      : hiding
        ? 'Hide'
        : browsing
          ? 'Add spark'
          : `Add to P${priority}`}
    onclick={() => addFactor(factor)}
  >
    {#if factor.icon}
      <img
        src={factor.icon}
        alt=""
        loading="lazy"
      />
    {:else}
      <Icon
        name="star"
        size={16}
      />
    {/if}
    <span>{factor.text}</span>
    <Icon
      name={hiding ? (selected ? 'eye-off' : 'eye') : selected ? 'check' : 'add'}
      size={15}
    />
  </button>
{/snippet}

<div
  class="white-factor-browser"
  class:expanded={expanded || hiding || browsing}
  class:hide-mode={hiding}
  class:browse-mode={browsing}
>
  {#if !hiding && !browsing}
    <button
      class="browser-toggle"
      type="button"
      aria-expanded={expanded}
      aria-controls="{id}-panel"
      onclick={() => (expanded = !expanded)}
    >
      <span class="browser-toggle-copy">
        <Icon
          name="filter"
          size={16}
        />
        <span>{browseLabel}</span>
      </span>
      {#if selectedCategoryKeys.length}
        <span class="browser-toggle-summary">
          {selectedCategoryKeys.length}
          {selectedCategoryKeys.length === 1 ? 'type' : 'types'}
        </span>
      {/if}
      <span class="browser-toggle-chevron">
        <Icon
          name="chevron"
          size={16}
        />
      </span>
    </button>
  {/if}

  {#if expanded || hiding || browsing}
    <div
      id="{id}-panel"
      class="browser-panel"
    >
      {#if browsing}
        <label class="factor-search">
          <Icon
            name="search"
            size={16}
          />
          <input
            type="search"
            bind:value={searchTerm}
            placeholder="Skill, race or scenario name…"
            aria-label="Search skills and races"
          />
        </label>
        <div
          class="browse-families"
          role="group"
          aria-label="Skill and race categories"
        >
          <button
            type="button"
            class:selected={!browseFamily}
            aria-pressed={!browseFamily}
            onclick={() => openFamily(null)}
          >
            All
          </button>
          {#each ['active', 'passive', 'race', 'scenario'] as key}
            {@const family = key as CategoryFamily}
            <button
              type="button"
              class:selected={browseFamily === family}
              aria-pressed={browseFamily === family}
              onclick={() => openFamily(family)}
            >
              {familyLabels[family]}
            </button>
          {/each}
        </div>
        {#if browseFamily === 'active' || browseFamily === 'passive'}
          <div class="browse-subtype">
            <SelectFieldSlim
              id={id + '-type'}
              label="Spark type"
              hideLabel
              value={selectedCategoryKeys[0] ?? ''}
              options={[
                { value: '', label: 'All ' + familyLabels[browseFamily].toLowerCase() },
                ...standardCategories
                  .filter((category) => category.family === browseFamily)
                  .map((category) => ({ value: category.key, label: category.label }))
              ]}
              onchange={(value) => (selectedCategoryKeys = value ? [value] : [])}
            />
          </div>
        {/if}
      {:else}
        <div class="browser-controls">
          <label class="factor-search">
            <Icon
              name="search"
              size={16}
            />
            <input
              type="search"
              bind:value={searchTerm}
              placeholder="Search white factors"
              aria-label="Search white factors"
            />
          </label>
          {#if !hiding}
            <label
              class="browser-priority"
              title="New factors are added to this priority group. P0 sorts first."
            >
              <span>Add to</span>
              <span class="priority-value">
                <strong>P</strong>
                <input
                  type="number"
                  inputmode="numeric"
                  min="0"
                  step="1"
                  value={priority}
                  aria-label="Priority group for newly added factors"
                  onchange={(event) => setPriority(Number(event.currentTarget.value))}
                />
                <NumberStepper
                  increaseLabel="Increase priority group"
                  decreaseLabel="Decrease priority group"
                  decreaseDisabled={priority === 0}
                  onstep={(direction) => setPriority(priority + direction)}
                />
              </span>
            </label>
          {/if}
        </div>

        <section
          class="effect-section"
          aria-label="White factor effect types"
        >
          <span class="effect-section-label">Types</span>
          <div class="effect-grid">
            {#each standardCategories as category (category.key)}
              <button
                type="button"
                class="effect-button {category.tone}"
                class:selected={selectedCategoryKeys.includes(category.key)}
                aria-label={category.label}
                aria-pressed={selectedCategoryKeys.includes(category.key)}
                title="{category.label} · {category.factorCount} factors"
                onclick={() => toggleCategory(category.key)}
              >
                {#if category.icon}
                  <img
                    src={category.icon}
                    alt=""
                    loading="lazy"
                  />
                {:else}
                  <Icon
                    name={category.family === 'race' ? 'trophy' : 'star'}
                    size={21}
                  />
                {/if}
              </button>
            {/each}
            {#if hasCriteria}
              <button
                type="button"
                class="clear-button"
                aria-label="Clear skill filters"
                title="Clear skill filters"
                onclick={clearCriteria}
              >
                <Icon
                  name="refresh"
                  size={17}
                />
              </button>
            {/if}
          </div>
        </section>
      {/if}

      {#if hasCriteria}
        <div class="result-summary">
          <strong>{matchingFactors.length}</strong>
          {matchingFactors.length === 1 ? 'factor' : 'factors'}
        </div>
        {#if matchingFactors.length}
          <div class="factor-result-groups">
            <div
              class="factor-results"
              use:virtualScroll={{
                items: normalMatches,
                key: (factor) => factor.id,
                root: 'closest',
                estimate: 40,
                onrange: (range) => (normalRange = range)
              }}
            >
              {#each normalMatches.slice(normalRange.start, normalRange.end) as factor, index (factor.id)}
                {@render factorResult(factor, normalRange.start + index)}
              {/each}
            </div>

            {#if upgradedMatches.length}
              <section class="upgraded-result-section">
                <div class="result-section-divider"><span>Upgraded</span></div>
                <div
                  class="factor-results"
                  use:virtualScroll={{
                    items: upgradedMatches,
                    key: (factor) => factor.id,
                    root: 'closest',
                    estimate: 40,
                    onrange: (range) => (upgradedRange = range)
                  }}
                >
                  {#each upgradedMatches.slice(upgradedRange.start, upgradedRange.end) as factor, index (factor.id)}
                    {@render factorResult(factor, upgradedRange.start + index)}
                  {/each}
                </div>
              </section>
            {/if}
          </div>
        {:else}
          <div class="empty-browser-state">
            <Icon
              name="search"
              size={17}
            />
            <span>No white factors match these types and search terms.</span>
          </div>
        {/if}
      {/if}
    </div>
  {/if}
</div>

<style>
  @import './white-factor-type-picker.css';
</style>
