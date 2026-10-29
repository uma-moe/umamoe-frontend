<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import Icon from '@/components/Icon.svelte';
  import TextField from '@/components/controls/TextField.svelte';

  type Category = 'common' | 'scenario' | 'race';

  type Metric = 'count' | 'stars';

  export interface WhiteCategoryValues {
    commonCount?: number;
    commonStars?: number;
    scenarioCount?: number;
    scenarioStars?: number;
    raceCount?: number;
    raceStars?: number;
  }

  interface Props {
    heading: string;
    values: WhiteCategoryValues;
    onchange?: (category: Category, metric: Metric, value: number | undefined) => void;
  }

  let { heading, values, onchange }: Props = $props();
  const panelId = $props.id();

  let expanded = $state<Category | null>(null);

  const details: Record<Category, { label: string; icon: 'star' | 'status' | 'trophy' }> = {
    common: { label: 'Common', icon: 'star' },
    scenario: { label: 'Scenario', icon: 'status' },
    race: { label: 'Race', icon: 'trophy' }
  };

  function key(category: Category, metric: Metric): keyof WhiteCategoryValues {
    return `${category}${metric === 'count' ? 'Count' : 'Stars'}` as keyof WhiteCategoryValues;
  }

  function current(category: Category, metric: Metric): number | undefined {
    return values[key(category, metric)];
  }

  function set(category: Category, metric: Metric, raw: string): void {
    const parsed = Number(raw);
    onchange?.(
      category,
      metric,
      raw !== '' && Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : undefined
    );
  }

  function setFromInput(category: Category, metric: Metric, event: Event): void {
    set(category, metric, (event.currentTarget as HTMLInputElement).value);
  }

  function summary(category: Category): string {
    const count = current(category, 'count');
    const stars = current(category, 'stars');
    return [count ? `${count} count` : '', stars ? `${stars}★` : ''].filter(Boolean).join(' · ');
  }

  function clear(category: Category): void {
    onchange?.(category, 'count', undefined);
    onchange?.(category, 'stars', undefined);
  }
</script>

<section
  class="category-filter"
  aria-label={heading}
>
  <header>
    <span>{heading}</span>
    <small>Minimum count or total stars</small>
  </header>
  <div
    class="tabs"
    role="group"
    aria-label={heading}
  >
    {#each Object.entries(details) as [id, detail]}
      {@const category = id as Category}
      <div
        class="category-trigger"
        class:selected={expanded === category}
      >
        <Button
          variant="secondary"
          size="sm"
          icon={detail.icon}
          ariaExpanded={expanded === category}
          ariaControls={panelId}
          onclick={() => (expanded = expanded === category ? null : category)}
        >
          <span class="category-label">
            {detail.label}{#if summary(category)}
              <small>{summary(category)}</small>
            {/if}<Icon
              name="chevron"
              size={14}
            />
          </span>
        </Button>
      </div>
    {/each}
  </div>
  {#if expanded}
    {@const category = expanded as Category}
    <div
      class="fields"
      id={panelId}
    >
      <TextField
        id={`${heading.replace(/\W+/g, '-').toLowerCase()}-${category}-count`}
        label={`Minimum ${details[category].label.toLowerCase()} count`}
        type="number"
        min={0}
        placeholder="0"
        value={String(current(category, 'count') ?? '')}
        oninput={(event) => setFromInput(category, 'count', event)}
      />
      <TextField
        id={`${heading.replace(/\W+/g, '-').toLowerCase()}-${category}-stars`}
        label={`Minimum ${details[category].label.toLowerCase()} stars`}
        type="number"
        min={0}
        placeholder="0"
        value={String(current(category, 'stars') ?? '')}
        oninput={(event) => setFromInput(category, 'stars', event)}
      />
      <Button
        variant="secondary"
        icon="refresh"
        disabled={!summary(category)}
        ariaLabel={`Clear ${details[category].label} filters`}
        onclick={() => clear(category)}
      />
    </div>
  {/if}
</section>

<style>
  .category-filter {
    min-width: 0;
    display: grid;
    gap: 6px;
    margin: 4px 0 10px;
  }
  header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }
  header span {
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 500;
  }
  header small {
    color: var(--text-muted);
    font-size: 10px;
  }
  .tabs {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 4px;
  }
  .category-trigger {
    min-width: 0;
  }
  .category-trigger :global(.ui-button) {
    width: 100%;
    min-height: var(--control-height);
    padding-inline: 6px;
    gap: 4px;
  }
  .category-trigger.selected :global(.ui-button) {
    border-color: var(--factor-field-focus-border);
    background: var(--factor-option-selected-bg);
  }
  .category-label {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
  }
  .category-label small {
    color: var(--text-secondary);
    font-size: 10px;
    white-space: nowrap;
  }
  .category-label :global(svg) {
    flex: none;
    color: var(--text-secondary);
  }
  .selected .category-label :global(svg) {
    transform: rotate(180deg);
  }
  .fields {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) var(--control-height);
    align-items: end;
    gap: 8px;
    padding-top: 2px;
  }
  .fields > :global(.ui-button) {
    width: var(--control-height);
    height: var(--control-height);
    min-height: var(--control-height);
    padding: 0;
  }
  @media (max-width: 600px) {
    header small,
    .category-label small {
      display: none;
    }
    .fields {
      gap: 5px;
    }
  }
</style>
