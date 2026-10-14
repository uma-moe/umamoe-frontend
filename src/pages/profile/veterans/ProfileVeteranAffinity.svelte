<script lang="ts">
  import AffinityStat from '@/components/game/AffinityStat.svelte';
  import type { VeteranUiRecord } from '@/components/game/veteran-ui-types';

  let { summary, compact = false }: { summary: VeteranUiRecord; compact?: boolean } = $props();
</script>

<div
  class="affinity-sources"
  class:compact
  aria-label="Veteran parents"
>
  <div
    class="affinity-main"
    title={summary.affinityNote}
  >
    {#if compact && summary.image}
      <img
        src={summary.image}
        alt={summary.name}
        loading="lazy"
      />
    {/if}
    <span class="affinity-label">{summary.affinityTarget ? 'Target total' : 'Main total'}</span>
    {#if Number.isFinite(summary.affinity)}
      <AffinityStat
        value={summary.affinity}
        label={summary.affinityTarget ? 'Target affinity' : 'Main affinity'}
        compact
      />
    {:else}
      <span
        class="affinity-missing"
        aria-label={summary.affinityTarget
          ? 'Target affinity unavailable'
          : 'Main affinity unavailable'}
      >
        -
      </span>
    {/if}
  </div>
  <div class="affinity-parents">
    {#each ['P1', 'P2'] as slot}
      {@const parent = summary.parents?.find((parent) => parent.position === slot)}
      <div
        class="affinity-parent"
        title={parent?.name ?? slot + ' not recorded'}
      >
        <span class="parent-slot">{slot}</span>
        {#if parent?.image}
          <img
            src={parent.image}
            alt=""
            loading="lazy"
          />
        {/if}
        <span class="affinity-parent-name">{parent?.name ?? 'Not recorded'}</span>
        {#if parent && Number.isFinite(parent.affinity)}
          <AffinityStat
            value={parent.affinity}
            label={slot + ' affinity'}
            compact
          />
        {:else}
          <span
            class="affinity-missing"
            aria-label={slot + ' affinity unavailable'}
          >
            -
          </span>
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .affinity-sources {
    min-width: 0;
    display: grid;
    grid-template-columns: 80px minmax(0, 1fr);
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    background: var(--card-surface-bg);
    overflow: hidden;
  }
  .affinity-main {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 3px;
    padding: 4px;
    border-right: 1px solid var(--border-subtle);
    background: transparent;
  }
  .affinity-main :global(.affinity) {
    padding: 0;
    border: 0;
    background: transparent;
    gap: 5px;
  }
  .affinity-main :global(.affinity b) {
    font-family: inherit;
    font-size: 26px;
    font-weight: 650;
    line-height: 1;
  }
  .affinity-main :global(svg) {
    width: 20px;
    height: 20px;
    flex: none;
  }
  .affinity-label {
    white-space: nowrap;
    color: var(--color-text-muted);
    font-size: 10px;
    font-weight: 500;
    line-height: 1.2;
  }
  .affinity-parents {
    min-width: 0;
    display: grid;
    align-content: center;
    padding: 3px 6px;
  }
  .affinity-parent {
    min-width: 0;
    min-height: 34px;
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .affinity-parent + .affinity-parent {
    border-top: 1px solid var(--border-subtle);
  }
  .parent-slot {
    flex: none;
    color: var(--color-text-muted);
    font-size: 10px;
    font-weight: 500;
  }
  .affinity-parent img {
    flex: none;
    width: 28px;
    height: 32px;
    object-fit: contain;
  }
  .affinity-parent-name {
    min-width: 0;
    flex: 1;
    padding-block: 1px;
    color: var(--color-text);
    font-size: 12px;
    line-height: 1.25;
    overflow-wrap: anywhere;
  }
  .affinity-parent :global(.affinity),
  .affinity-parent .affinity-missing {
    flex: none;
    margin-left: auto;
  }
  .affinity-parent :global(.affinity b) {
    font-size: 14px;
  }
  .affinity-parent :global(.affinity svg) {
    width: 14px;
    height: 14px;
  }
  .affinity-missing {
    color: var(--color-text-muted);
    font-family: var(--font-mono);
    font-size: 11px;
    line-height: 21px;
  }
  .compact {
    grid-template-columns: minmax(0, 1fr);
    gap: 2px;
    border: 0;
    border-radius: 0;
    background: transparent;
  }
  .compact .affinity-main {
    flex-direction: row;
    justify-content: flex-start;
    min-height: 24px;
    gap: 3px;
    padding: 0;
    border: 0;
  }
  .compact .affinity-main :global(.affinity) {
    gap: 2px;
  }
  .compact .affinity-main :global(.affinity b) {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 700;
    line-height: normal;
  }
  .compact .affinity-main :global(svg) {
    width: 10px;
    height: 10px;
  }
  .compact .affinity-parents {
    padding: 0;
    gap: 2px;
  }
  .compact .affinity-parent {
    min-height: 24px;
    gap: 3px;
    border: 0;
  }
  .compact img {
    flex: none;
    width: 22px;
    height: 24px;
    object-fit: contain;
  }
  .compact .affinity-parent :global(.affinity) {
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    gap: 2px;
  }
  .compact .affinity-parent :global(.affinity b) {
    font-size: 11px;
  }
  .compact .affinity-parent :global(.affinity svg) {
    width: 10px;
    height: 10px;
  }
  .compact :is(.affinity-label, .parent-slot, .affinity-parent-name) {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
