<script lang="ts">
  import SparkItem, { type SparkSource, type SparkTone } from './SparkItem.svelte';

  export interface SparkRecord {
    id: string;
    name: string;
    level: number;
    chance?: string;
    source?: SparkSource;
    matched?: boolean;
  }

  interface Props {
    tone: SparkTone;
    items: SparkRecord[];
    label?: string;
    typeLabel?: string;
    showType?: boolean;
    compact?: boolean;
  }

  let { tone, items, label, typeLabel, showType = true, compact = false }: Props = $props();

  const defaultTypeLabel = $derived(
    tone === 'blue'
      ? 'Stats'
      : tone === 'pink'
        ? 'Aptitude'
        : tone === 'green'
          ? 'Unique'
          : 'Skills / races'
  );
  const displayLabel = $derived(typeLabel ?? defaultTypeLabel);
  const accessibleLabel = $derived(label ?? `${displayLabel} sparks`);
</script>

<div
  class="spark-row"
  class:compact
  aria-label={accessibleLabel}
>
  {#if showType}
    <span
      class="type type--{tone}"
      aria-hidden="true"
      title={displayLabel}
    ></span>
  {/if}
  <div class="list">
    {#each items as item (item.id)}
      <SparkItem
        {...item}
        {tone}
        {compact}
      />
    {/each}
  </div>
</div>

<style>
  .spark-row {
    min-width: 0;
    display: flex;
    align-items: stretch;
    gap: 0.75rem;
  }
  .type {
    width: 3px;
    min-height: 100%;
    flex: 0 0 auto;
    border-radius: 2px;
    background: #9e9e9e;
  }
  .type--blue {
    background: #2196f3;
  }
  .type--pink {
    background: #e91e63;
  }
  .type--green {
    background: #4caf50;
  }
  .list {
    min-width: 0;
    max-width: 100%;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    padding: 0.125rem 0;
  }
  @media (max-width: 480px) {
    .spark-row {
      gap: 0.4rem;
    }
    .list {
      gap: 0.3rem;
    }
  }
  .spark-row.compact {
    gap: 5px;
  }
  .compact .list {
    gap: 3px;
    padding: 0;
  }
</style>
