<script lang="ts">
  import type { Snippet } from 'svelte';

  let { single = false, children }: { single?: boolean; children: Snippet } = $props();
</script>

<div
  class="builds"
  class:single
>
  {@render children()}
</div>

<style>
  .builds {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px 12px;
    min-width: 0;
  }
  .single {
    grid-template-columns: minmax(0, 1fr);
  }
  @media (min-width: 1001px) {
    .builds:not(.single) {
      grid-template-rows: repeat(7, auto);
    }
    .builds:not(.single) :global(.build-card) {
      display: grid;
      grid-row: 1 / span 7;
      grid-template-rows: subgrid;
    }
    .builds:not(.single) :global(.build.compact) {
      grid-row: span 7;
      grid-template-rows: subgrid;
      gap: 8px;
      container-type: normal;
    }
    .builds:not(.single) :global(.build-content) {
      display: contents;
    }
    .builds:not(.single) :global(.build-identity) {
      grid-row: 1;
      container-type: inline-size;
    }
    .builds:not(.single) :global(.stat-overview) {
      grid-row: 2;
    }
    .builds:not(.single) :global(.aptitude-overview) {
      grid-row: 3;
    }
    .builds:not(.single) :global(.skills-section) {
      grid-row: 4;
    }
    .builds:not(.single) :global(.stat-overview),
    .builds:not(.single) :global(.aptitude-overview),
    .builds:not(.single) :global(.skills-section) {
      margin-inline: 10px;
      align-content: start;
    }
    .builds:not(.single) :global(.training) {
      grid-row: 5 / span 3;
      grid-template-rows: subgrid;
      gap: 8px;
      margin-inline: 10px;
      padding: 10px 0;
      border-top: 1px solid var(--border-subtle);
    }
    .builds:not(.single) :global(.support-section) {
      grid-row: 1;
    }
    .builds:not(.single) :global(.inheritance-section) {
      grid-row: 2;
    }
    .builds:not(.single) :global(.parent-factors) {
      grid-row: 3;
    }
  }
  .single :global(.build-identity) {
    padding: 4px 0 10px;
  }
  .single :global(.build-content) {
    padding: 0;
    gap: 12px;
  }
  @media (min-width: 851px) {
    .single :global(.build-content) {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
      column-gap: 24px;
    }
    .single :global(.stat-overview),
    .single :global(.aptitude-overview),
    .single :global(.build-metrics),
    .single :global(.skills-section) {
      grid-column: 1;
    }
    .single :global(.training) {
      grid-column: 2;
      grid-row: 1 / span 4;
      border-left: 1px solid var(--border-subtle);
      padding-left: 20px;
    }
  }
  @media (max-width: 1000px) {
    .builds {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  @media (max-width: 520px) {
    .single :global(.build-content) {
      padding-inline: 10px;
    }
  }
</style>
