<script lang="ts">
  import RaceSkill from '@/pages/competitive/runners/RaceSkill.svelte';
  import { calloutText, calloutTimer, type RunnerCallout } from './replay-callouts';

  let {
    callouts,
    timers,
    limit = 3
  }: {
    callouts: RunnerCallout[];
    timers: boolean;
    /** Crowded fields keep the newest labels and count the rest. */
    limit?: number;
  } = $props();

  const shown = $derived(callouts.slice(-limit));
  const hidden = $derived(callouts.length - shown.length);
</script>

<span
  class="runner-callouts"
  aria-hidden="true"
>
  {#if hidden > 0}
    <span class="callout more">+{hidden}</span>
  {/if}
  {#each shown as callout (callout.key)}
    {#if callout.kind === 'skill'}
      <span class="callout skill">
        <RaceSkill
          id={callout.skillId}
          name={callout.label}
          level={calloutTimer(callout, timers)}
        />
      </span>
    {:else}
      <span class="callout mode">{calloutText(callout, timers)}</span>
    {/if}
  {/each}
</span>

<style>
  .runner-callouts {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    pointer-events: none;
  }
  .callout {
    max-width: 150px;
    padding: 1px 5px;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, #e8ad63 55%, transparent);
    border-radius: 4px;
    background: color-mix(in srgb, var(--surface-1) 82%, #e8ad63);
    color: var(--text-primary);
    font-size: 10px;
    font-weight: 600;
    line-height: 16px;
    font-variant-numeric: tabular-nums;
    text-overflow: ellipsis;
    white-space: nowrap;
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.25);
  }
  .callout.mode {
    border-color: color-mix(in srgb, #69b7ee 55%, transparent);
    background: color-mix(in srgb, var(--surface-1) 82%, #69b7ee);
  }
  /* The compact skill chip of the report, shrunk to label height. Only the name part is backed, so the
     course does not show through its translucent rarity colours while the icon keeps its own shape. */
  .callout.skill {
    position: relative;
    isolation: isolate;
    max-width: 170px;
    padding: 0;
    overflow: visible;
    border: 0;
    border-radius: 0;
    background: none;
    box-shadow: none;
    filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.45));
    font-weight: inherit;
    line-height: inherit;
  }
  .callout.skill::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: 6px;
    background: var(--surface-1);
  }
  .callout.skill:has(:global(.with-icon))::before {
    left: 18px;
    border-radius: 0 6px 6px 0;
  }
  .callout.skill :global(.skill-chip.compact) {
    min-height: 18px;
    font-size: 10px;
  }
  .callout.skill :global(.skill-chip.compact img) {
    width: 18px;
    height: 18px;
  }
  .callout.skill :global(.skill-chip.compact .skill-body) {
    min-height: 18px;
    padding: 1px 5px 1px 4px;
  }
  .callout.more {
    border-color: var(--border-subtle);
    background: var(--surface-2);
    color: var(--text-secondary);
    font-weight: 500;
  }
</style>
