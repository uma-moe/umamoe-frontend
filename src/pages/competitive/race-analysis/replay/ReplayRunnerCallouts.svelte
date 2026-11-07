<script lang="ts">
  import RaceSkill from '@/pages/competitive/runners/RaceSkill.svelte';
  import { calloutText, calloutTimer, type RunnerCallout } from './replay-callouts';

  let {
    callouts,
    timers
  }: {
    callouts: RunnerCallout[];
    timers: boolean;
  } = $props();
</script>

<span
  class="runner-callouts"
  aria-hidden="true"
>
  {#each callouts as callout (callout.key)}
    {#if callout.kind === 'skill'}
      <span class="callout skill">
        <RaceSkill
          id={callout.skillId}
          name={callout.label}
          level={calloutTimer(callout, timers)}
          withIcon={false}
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
    width: max-content;
    pointer-events: none;
  }
  .callout {
    padding: 1px 5px;
    border: 1px solid color-mix(in srgb, #e8ad63 55%, transparent);
    border-radius: 4px;
    background: color-mix(in srgb, var(--surface-1) 82%, #e8ad63);
    color: var(--text-primary);
    font-size: 10px;
    font-weight: 600;
    line-height: 16px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .callout.mode {
    border-color: color-mix(in srgb, #69b7ee 55%, transparent);
    background: color-mix(in srgb, var(--surface-1) 82%, #69b7ee);
  }
  /* The report's rarity chip without its icon. An opaque backing keeps the course from showing
     through its translucent rarity colours. */
  .callout.skill {
    position: relative;
    isolation: isolate;
    display: flex;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: var(--surface-1);
    line-height: inherit;
  }
  .callout.skill :global(.skill-chip.compact) {
    min-height: 18px;
    font-size: 10px;
  }
  .callout.skill :global(.skill-chip.compact .skill-body) {
    min-height: 18px;
    padding: 1px 6px;
  }
  .callout.skill :global(.skill-name) {
    overflow: visible;
  }
</style>
