<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from '../Icon.svelte';
  import SegmentedControl from '../controls/SegmentedControl.svelte';

  interface Props {
    title?: string;
    activeCount?: number;
    modes?: string[];
    mode?: string;
    expanded?: boolean;
    tools?: Snippet;
    children: Snippet;
    onclear?: () => void;
    onmodechange?: (mode: string) => void;
  }

  let {
    title = 'Filters',
    activeCount = 0,
    modes = ['Basic', 'Advanced'],
    mode = $bindable('Basic'),
    expanded = $bindable(true),
    tools,
    children,
    onclear,
    onmodechange
  }: Props = $props();

  const options = $derived(modes.map((item) => ({ value: item.toLowerCase(), label: item })));

  function selectMode(value: string): void {
    mode = value;
    onmodechange?.(value);
  }
</script>

<section
  class="filter-shell"
  class:open={expanded}
>
  <header>
    <button
      class="filter-heading"
      type="button"
      aria-expanded={expanded}
      onclick={() => (expanded = !expanded)}
    >
      <span class="chevron">
        <Icon
          name="chevron"
          size={16}
        />
      </span>
      <strong>{title}</strong>
    </button>
    <div class="filter-tools">
      {#if tools}
        {@render tools()}
      {/if}<SegmentedControl
        label="Filter mode"
        {options}
        bind:value={mode}
        onchange={selectMode}
      />
    </div>
  </header>
  {#if expanded}
    <div class="filter-content">{@render children()}</div>
  {/if}
</section>

<style>
  .filter-shell {
    min-width: 0;
  }
  header {
    min-height: 58px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 8px;
    padding: 8px 12px;
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    background: var(--surface-1);
    transition: background-color var(--duration-normal);
  }
  header:hover {
    background: rgb(var(--accent-primary-rgb) / 0.08);
  }
  .filter-heading {
    min-height: 40px;
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1 1 auto;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--text-primary);
    cursor: pointer;
  }
  .filter-heading strong {
    font-size: 16px;
    font-weight: 600;
  }
  .chevron {
    display: grid;
    color: var(--color-blue);
    transform: rotate(0);
    transition: transform 300ms ease-in-out;
  }
  .open .chevron {
    transform: rotate(180deg);
  }
  .filter-tools {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
  }
  .filter-content {
    min-width: 0;
  }
  .filter-tools :global(.segments) {
    height: 34px;
    box-sizing: border-box;
    align-items: center;
    gap: 2px;
    padding: 2px;
    border-color: var(--filter-mode-toggle-border);
    border-radius: var(--radius-sm);
    background: var(--filter-mode-toggle-bg);
  }
  .filter-tools :global(.segments button) {
    min-width: 72px;
    min-height: 28px;
    padding-inline: 12px;
    border-radius: calc(var(--radius-sm) - 2px);
    font-size: 12px;
  }
  .filter-tools :global(.segments button.selected) {
    background: var(--filter-mode-active-bg);
    color: var(--filter-mode-active-color);
    box-shadow: var(--filter-mode-active-shadow);
  }
  @media (max-width: 640px) {
    header {
      min-height: 54px;
      flex-wrap: wrap;
      padding: 7px 8px;
    }
    .filter-shell:not(.open) .filter-tools :global(.segments) {
      display: none;
    }
    .filter-heading {
      min-width: 0;
    }
    .filter-tools {
      display: contents;
    }
    .filter-tools :global(.presets) {
      flex: 0 0 auto;
      margin-left: auto;
    }
    .filter-tools :global(.segments) {
      width: 100%;
      flex: 1 0 100%;
      order: 3;
    }
    .filter-tools :global(.segments button) {
      min-width: 0;
      min-height: 32px;
      flex: 1 1 0;
      padding-inline: 6px;
    }
  }
  @media (max-width: 767px) {
    header {
      min-height: 40px;
      padding: 4px 8px;
      margin-bottom: 6px;
    }
    .filter-heading {
      min-height: 30px;
      font-size: 12px;
    }
    .filter-tools :global(.presets > summary) {
      height: 28px;
      min-height: 28px;
      padding: 4px 6px;
      font-size: 11px;
    }
  }
</style>
