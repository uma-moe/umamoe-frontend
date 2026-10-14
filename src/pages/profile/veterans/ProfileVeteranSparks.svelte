<script lang="ts">
  import SparkItem from '@/components/sparks/SparkItem.svelte';
  import type { ResolvedVeteranFactor, VeteranFactorFilter } from '@/lib/profile/profile-veterans';
  import type { VeteranQueryMatch } from '@/lib/profile/profile-veteran-query';

  let {
    items,
    id,
    source = 'family',
    expanded = false,
    selectedFactors = [],
    queryMatches = [],
    onfactor,
    onmore
  }: {
    items: Array<ResolvedVeteranFactor & { ownStars?: number }>;
    id?: string;
    source?: 'family' | 'parent' | 'p1' | 'p2';
    expanded?: boolean;
    selectedFactors?: VeteranFactorFilter[];
    queryMatches?: VeteranQueryMatch[];
    onfactor?: (filter: VeteranFactorFilter) => void;
    onmore?: () => void;
  } = $props();

  const sourceLabel = $derived(
    { family: 'family total', parent: 'Own', p1: 'P1', p2: 'P2' }[source]
  );
  const white = $derived(items.filter((factor) => factor.tone === 'white'));

  const matched = (id: number) =>
    selectedFactors.some((filter) => filter.factorId === id) ||
    queryMatches.some((match) => match.factor?.id === id && match.factor.level > 0);
</script>

<div
  class="spark-groups"
  {id}
>
  {#each ['blue', 'pink', 'green', 'white'] as tone}
    {@const group = items.filter(
      (factor) =>
        factor.tone === tone &&
        (expanded || tone !== 'white' || white.length <= 3 || matched(factor.id))
    )}
    {#if group.length}
      <div
        class="spark-group"
        data-tone={tone}
      >
        {#each group as factor}
          {#snippet spark()}
            <SparkItem
              matched={matched(factor.id)}
              name={factor.name}
              level={factor.level}
              tone={factor.tone}
              mainStars={factor.ownStars ?? 0}
              compact
            />
          {/snippet}
          {#if onfactor}
            <button
              class="spark-filter"
              class:matched={matched(factor.id)}
              aria-label={`Filter by ${factor.name}: ${factor.level} stars (${sourceLabel})`}
              onclick={() =>
                onfactor?.({
                  factorId: factor.id,
                  minLevel: factor.level,
                  scope: source,
                  mode: 'total'
                })}
            >
              {@render spark()}
            </button>
          {:else}
            <span class="spark-filter">{@render spark()}</span>
          {/if}
        {/each}
      </div>
    {/if}
  {/each}
  {#if white.length > 3 && !expanded}
    {#snippet count()}
      <span class="white-count">
        <span aria-hidden="true">★</span>
        <strong>{white.length}</strong>
        white
      </span>
    {/snippet}
    {#if onmore}
      <button
        class="spark-filter"
        aria-label={`View all ${white.length} white sparks`}
        onclick={onmore}
      >
        {@render count()}
      </button>
    {:else}
      {@render count()}
    {/if}
  {/if}
</div>

<style>
  .spark-groups,
  .spark-group {
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .spark-group[data-tone='white'] {
    flex-basis: 100%;
  }
  .spark-filter {
    max-width: 100%;
    display: flex;
    align-items: center;
    min-height: 24px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }
  .spark-filter:not(button) {
    cursor: default;
  }
  .spark-filter :global(.name) {
    white-space: normal;
    overflow: visible;
    overflow-wrap: anywhere;
    line-height: 1.2;
  }
  .spark-filter:hover :global(.spark) {
    border-color: var(--spark-border-color, currentColor);
  }
  .white-count {
    display: inline-flex;
    align-items: center;
    align-self: center;
    gap: 3px;
    padding: 2px 4px;
    border: 1px solid rgb(158 158 158 / 0.5);
    border-radius: var(--radius-xs);
    color: var(--spark-white-text);
    background: rgb(158 158 158 / 0.15);
    font-size: 11px;
    font-weight: 500;
    line-height: 1.2;
    white-space: nowrap;
  }
  .white-count strong {
    font-weight: 600;
  }
  button.spark-filter:hover .white-count {
    border-color: currentColor;
  }
  button:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 1px;
  }
</style>
