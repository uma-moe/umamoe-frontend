<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { RaceRunner } from '@/lib/race/race-capture-parser';
  import RunnerBuild from './RunnerBuild.svelte';

  let {
    runner,
    skillNames,
    outfit,
    color,
    framed = false,
    raceContext,
    metrics: contentMetrics,
    training,
    headerActions
  }: {
    runner: RaceRunner;
    skillNames?: Map<number, string>;
    outfit?: string;
    color?: string;
    framed?: boolean;
    raceContext?: { surface?: number; distance?: number };
    metrics?: Snippet;
    training?: Snippet;
    headerActions?: Snippet;
  } = $props();
</script>

<article
  class="build-card"
  class:framed
  style:--runner-color={color ?? 'var(--accent-primary)'}
>
  <RunnerBuild
    {runner}
    {skillNames}
    {outfit}
    {raceContext}
    {training}
    {headerActions}
    expanded
    compact
  >
    {#snippet metrics()}
      {#if contentMetrics}
        <div class="build-metrics">
          {@render contentMetrics()}
        </div>
      {/if}
    {/snippet}
  </RunnerBuild>
</article>

<style>
  .build-card {
    min-width: 0;
    background: transparent;
  }
  .framed {
    background: var(--surface-2);
    border: 1px solid var(--card-surface-border);
    border-top: 2px solid var(--runner-color);
    border-radius: 0 0 var(--radius-md) var(--radius-md);
    overflow: hidden;
  }
  .build-metrics {
    min-width: 0;
  }
  .build-card :global(.race-style) {
    color: var(--runner-color);
  }
</style>
