<script lang="ts">
  import type { VeteranQueryMatch } from '@/lib/profile/profile-veteran-query';
  import SparkItem from '@/components/sparks/SparkItem.svelte';

  let { matches }: { matches: VeteranQueryMatch[] } = $props();
</script>

{#if matches.length}
  <section
    class="query-matches"
    aria-label="UQL matches"
  >
    <strong>UQL matches</strong>
    <div>
      {#each matches as match}
        {#if match.factor}
          <SparkItem
            name={match.label}
            level={match.factor.level}
            tone={match.factor.tone}
            matched
            compact
          />
        {:else}
          <span class="query-value">
            <span>{match.label}</span>
            <b>{match.value}</b>
          </span>
        {/if}
      {/each}
    </div>
  </section>
{/if}

<style>
  .query-matches {
    min-width: 0;
    display: grid;
    gap: 5px;
  }
  strong {
    color: var(--color-text-muted);
    font-size: 10px;
    font-weight: 500;
  }
  .query-matches > div {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .query-value {
    max-width: 100%;
    overflow-wrap: anywhere;
    display: inline-flex;
    flex-wrap: wrap;
    gap: 5px;
    padding: 3px 6px;
    border: 1px solid var(--color-gold);
    border-radius: var(--radius-sm);
    color: var(--color-text-muted);
    font-size: 11px;
  }
  b {
    color: var(--color-text);
    font-weight: 600;
  }
</style>
