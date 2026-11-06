<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import { seekTimeLabel } from './diagnostics-format';

  let { time, onseek }: { time: number; onseek: (time: number) => void } = $props();

  const label = $derived(seekTimeLabel(time));
</script>

<span class="seek-time">
  <Button
    variant="secondary"
    size="sm"
    ariaLabel={'Review ' + label + ' in the replay'}
    onclick={() => onseek(time)}
  >
    {label}
  </Button>
</span>

<style>
  .seek-time {
    display: inline-flex;
  }
  /* Specific enough to outrank the race page's general small-button rule. */
  .seek-time :global(.ui-button.ui-button--sm.ui-button--secondary:not(.ui-button--ghost)) {
    min-width: 66px;
    min-height: 22px;
    justify-content: center;
    padding: 0 6px;
    font-size: 11px;
    font-weight: 600;
    line-height: 1.2;
    font-variant-numeric: tabular-nums;
  }
</style>
