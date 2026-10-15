<script lang="ts">
  import type { StatisticsFilters } from '@/lib/statistics/statistics';
  import Button from '@/components/controls/Button.svelte';
  import Tabs, { type TabItem } from '@/components/navigation/Tabs.svelte';
  import { selectionSummary as summarizeSelection } from '../statistics-selection';

  interface Props {
    activeSection: string;
    filters: StatisticsFilters;
    filtersChanged: boolean;
    onfilters: () => void;
    onreset: () => void;
  }

  let {
    activeSection = $bindable(),
    filters,
    filtersChanged,
    onfilters,
    onreset
  }: Props = $props();

  const sections: TabItem[] = [
    { id: 'overview', label: 'Overview', icon: 'grid' },
    { id: 'supports', label: 'Supports', icon: 'cards' },
    { id: 'skills', label: 'Skills', icon: 'star' },
    { id: 'stats', label: 'Stats', icon: 'chart' },
    { id: 'characters', label: 'Characters', icon: 'community' }
  ];

  const selectionSummary = $derived(summarizeSelection(filters));

  function openFilters(event: MouseEvent): void {
    (event.currentTarget as HTMLButtonElement).focus({ preventScroll: true });
    onfilters();
  }
</script>

<div class="workspace-navigation">
  <Tabs
    variant="pills"
    id="statistics-tabs"
    label="Statistics sections"
    items={sections}
    bind:value={activeSection}
    controls="statistics-panel"
  />
  <div class="scope-bar">
    <div class="scope-controls">
      <Button
        variant={filtersChanged ? 'primary' : 'secondary'}
        size="sm"
        icon="tune"
        onclick={openFilters}
      >
        Filters
      </Button>
      <span
        class="scope-copy"
        title={selectionSummary}
      >
        {selectionSummary}
      </span>
    </div>
    {#if filtersChanged}
      <Button
        variant="ghost"
        size="sm"
        icon="refresh"
        onclick={onreset}
      >
        Reset filters
      </Button>
    {/if}
  </div>
</div>

<style>
  .workspace-navigation {
    position: sticky;
    top: var(--utility-height);
    z-index: 10;
    background: var(--document-bg);
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0 14px;
  }
  .workspace-navigation :global(.tabs) {
    flex: 0 1 auto;
  }
  .scope-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 0;
    flex: 1 1 300px;
    justify-content: flex-end;
  }
  .scope-controls {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .scope-copy {
    min-width: 0;
    color: var(--text-secondary);
    font-size: 11px;
    line-height: 1.5;
  }
  .scope-controls > :global(button) {
    flex: none;
  }
  @container statistics (max-width:950px) {
    .scope-bar {
      justify-content: space-between;
    }
  }
  @media (max-width: 600px) {
    .scope-bar {
      padding: 4px 0;
      gap: 4px;
      justify-content: space-between;
    }
    .scope-controls {
      gap: 8px;
    }
    .scope-copy {
      font-size: 10px;
      max-height: 42px;
      overflow: auto;
    }
    .scope-bar > :global(button) {
      font-size: 10px;
      flex: none;
      padding-inline: 6px;
    }
    .workspace-navigation {
      gap: 0;
    }
  }
</style>
