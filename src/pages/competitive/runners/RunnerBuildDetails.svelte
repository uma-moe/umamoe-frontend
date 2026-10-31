<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { RaceRunner } from '@/lib/race/capture/race-capture-parser';
  import RunnerBuild from './RunnerBuild.svelte';

  let {
    runner,
    skillNames,
    outfit,
    color,
    framed = false,
    content = 'full',
    raceContext,
    metrics: contentMetrics,
    inlineMetrics = false,
    training,
    headerActions
  }: {
    runner: RaceRunner;
    skillNames?: Map<number, string>;
    outfit?: string;
    color?: string;
    framed?: boolean;
    /** A summary keeps the identity, stats and race aptitudes, for a page that lists the skills itself. */
    content?: 'full' | 'summary';
    raceContext?: { surface?: number; distance?: number };
    metrics?: Snippet;
    /** Short metrics share the identity line instead of a row of their own. */
    inlineMetrics?: boolean;
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
    {inlineMetrics}
    expanded={content === 'full'}
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
  /* A framed card opens with one band: who the runner is and how they did, tinted with their running style. */
  .build-card.framed :global(.build.compact > .build-identity) {
    padding: 8px 10px 10px;
    border-bottom: 1px solid var(--border-subtle);
    background: color-mix(in srgb, var(--runner-color) 7%, transparent);
  }
  .build-card.framed :global(.build.compact > .build-content) {
    padding-top: 8px;
  }
  .build-card :global(.race-style) {
    color: var(--runner-color);
  }
</style>
