<script lang="ts">
  import { tick } from 'svelte';
  import Button from '../controls/Button.svelte';
  import Combobox, { type ComboboxOption } from '../controls/Combobox.svelte';
  import IconButton from '../controls/IconButton.svelte';
  import SegmentedControl from '../controls/SegmentedControl.svelte';
  import ResourceLoadStatus from '../feedback/ResourceLoadStatus.svelte';

  interface Props {
    id: string;
    label: string;
    options: (ComboboxOption & { type: number })[];
    loading?: boolean;
    cached?: boolean;
    error?: string;
    onadd: (value: string, level: number) => void;
  }

  let { id, label, options, loading = false, cached = false, error = '', onadd }: Props = $props();

  let open = $state(false),
    query = $state(''),
    level = $state('3');

  let root = $state<HTMLDivElement>();

  async function toggle(next: boolean): Promise<void> {
    open = next;
    query = '';
    await tick();
    root?.querySelector<HTMLElement>(next ? 'input' : '.ui-button')?.focus({ preventScroll: true });
  }

  $effect(() => {
    if (!root) return;
    const element = root;
    const escape = (event: KeyboardEvent) => {
      if (open && event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        void toggle(false);
      }
    };

    element.addEventListener('keydown', escape, true);
    return () => element.removeEventListener('keydown', escape, true);
  });
</script>

<div
  class="spark-add-control"
  bind:this={root}
>
  {#if open}
    <div class="spark-add">
      <Combobox
        {id}
        label={`Add spark to ${label}`}
        hideLabel
        placeholder="Search sparks..."
        {options}
        bind:query
        action
        popupAnchor={root}
        minQueryLength={1}
        maxResults={20}
        onchange={(value) => {
          onadd(value, Number(level));
          void toggle(false);
        }}
      >
        {#snippet optionContent(option)}
          {@const type = options.find((item) => item.value === option.value)?.type ?? 3}
          <span
            class="factor-name"
            class:blue={type === 0}
            class:pink={type === 1}
            class:green={type === 5}
          >
            {option.label}
          </span>
          <small aria-hidden="true">
            {['Stat', 'Aptitude', 'Race', 'Skill', 'Scenario', 'Unique Skill'][type] ?? 'Skill'}
          </small>
        {/snippet}
      </Combobox>
      <SegmentedControl
        label={`New spark stars for ${label}`}
        options={[
          { value: '1', label: '1★' },
          { value: '2', label: '2★' },
          { value: '3', label: '3★' }
        ]}
        bind:value={level}
      />
      {#if !query}
        <IconButton
          icon="close"
          size="sm"
          label={`Close spark editor for ${label}`}
          onclick={() => toggle(false)}
        />
      {/if}
    </div>
    <ResourceLoadStatus
      {loading}
      {cached}
      {error}
    />
  {:else}
    <Button
      variant="ghost"
      size="sm"
      icon="add"
      onclick={() => toggle(true)}
    >
      Add Spark
    </Button>
  {/if}
</div>

<style>
  .spark-add-control {
    --combobox-max-height: 180px;
    width: 100%;
    min-width: 0;
    container-type: inline-size;
  }
  .spark-add-control > :global(.ui-button) {
    min-height: 21px;
    padding: 2px 8px 2px 4px;
    border: 1px solid rgb(var(--on-surface-rgb) / 0.2);
    border-radius: 20px;
    color: var(--text-disabled);
    font: 500 0.7rem var(--font-sans);
    gap: 4px;
  }
  .spark-add-control > :global(.ui-button svg) {
    width: 14px;
    height: 14px;
  }
  .spark-add {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 6px;
    padding: 5px 8px;
    border: 1px solid var(--border-subtle);
    border-radius: 4px;
    background: var(--factor-field-bg);
  }
  .spark-add :global(input) {
    height: 26px;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: var(--text-primary);
    font:
      400 0.7rem Arial,
      sans-serif;
    box-shadow: none;
  }
  .spark-add :global(input::placeholder) {
    color: var(--text-disabled);
  }
  .spark-add :global(.segments) {
    padding: 0;
    gap: 2px;
    border: 0;
    border-radius: 0;
    background: transparent;
  }
  .spark-add :global(.segments button) {
    min-width: 28px;
    min-height: 22px;
    padding: 1px 5px;
    border: 1px solid rgb(var(--on-surface-rgb) / 0.1);
    border-radius: 3px;
    background: rgb(var(--on-surface-rgb) / 0.05);
    font:
      600 0.55rem Arial,
      sans-serif;
    color: var(--text-disabled);
  }
  .spark-add :global(.segments button.selected) {
    background: rgb(var(--accent-primary-rgb) / 0.15);
    border-color: var(--accent-primary);
    color: var(--accent-primary);
    box-shadow: none;
  }
  .spark-add > :global(.icon-button) {
    width: 20px;
    height: 20px;
    border: 0;
    background: transparent;
  }
  .spark-add :global(.combo-panel) {
    top: calc(100% + 8px);
    border-radius: 4px;
    border-color: var(--border-subtle);
    background: var(--bg-tertiary);
  }
  .spark-add :global(.combo-panel button) {
    min-height: 27px;
    gap: 8px;
    padding: 5px 10px;
    border-color: var(--border-subtle);
    font: 400 0.65rem/1.5 var(--font-sans);
  }
  .factor-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-muted);
    font-weight: 600;
  }
  small {
    flex: none;
    color: var(--text-disabled);
    font-size: 0.55rem;
    text-transform: uppercase;
    font-weight: 600;
    letter-spacing: 0.03em;
  }
  .blue {
    color: var(--accent-primary);
  }
  .pink {
    color: var(--color-pink);
  }
  .green {
    color: var(--accent-secondary);
  }
  @media (max-width: 767px) {
    .spark-add-control > :global(.ui-button),
    .spark-add :global(input),
    .spark-add :global(.segments button),
    .spark-add > :global(.icon-button) {
      min-height: var(--touch-target);
      min-width: var(--touch-target);
    }
    .spark-add :global(.combo-panel button) {
      min-height: var(--touch-target);
    }
    .spark-add {
      grid-template-columns: minmax(0, 1fr) auto;
    }
    .spark-add :global(.field) {
      grid-column: 1/-1;
    }
    @container (min-width:320px) {
      .spark-add {
        grid-template-columns: minmax(0, 1fr) auto auto;
      }
      .spark-add :global(.field) {
        grid-column: auto;
      }
    }
  }
</style>
