<script lang="ts">
  import { calloutText, type RunnerCallout } from './replay-callouts';

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
    <span
      class="callout"
      class:mode={callout.kind === 'mode'}
    >
      {calloutText(callout, timers)}
    </span>
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
    line-height: 14px;
    font-variant-numeric: tabular-nums;
    text-overflow: ellipsis;
    white-space: nowrap;
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.25);
  }
  .callout.mode {
    border-color: color-mix(in srgb, #69b7ee 55%, transparent);
    background: color-mix(in srgb, var(--surface-1) 82%, #69b7ee);
  }
  .callout.more {
    border-color: var(--border-subtle);
    background: var(--surface-2);
    color: var(--text-secondary);
    font-weight: 500;
  }
</style>
