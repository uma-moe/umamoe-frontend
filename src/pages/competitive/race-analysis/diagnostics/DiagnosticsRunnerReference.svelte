<script lang="ts">
  import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
  import Artwork from '@/components/game/Artwork.svelte';
  import { portrait } from '@/pages/competitive/analysis-view';
  import { runnerName } from './diagnostics-format';

  let {
    capture,
    index,
    value,
    onselect
  }: {
    capture: ParsedRaceCapture;
    index: number;
    value: number;
    onselect: (index: number) => void;
  } = $props();
</script>

{#if value >= 0}
  <button
    class="runner-reference detail-runner"
    type="button"
    onclick={() => onselect(value)}
  >
    <Artwork
      src={portrait(capture.runners.find((r) => r.index === value)?.cardId)}
      alt=""
      size="xs"
    />{value === index ? 'Self' : runnerName(capture, value)}
  </button>
{:else}
  <span class="muted">None</span>
{/if}

<style>
  @import './runner-reference.css';
  .muted {
    color: var(--text-secondary);
  }
  .detail-runner {
    font-size: 10px;
    color: var(--text-secondary);
  }
  :global(.hp-application-details) .runner-reference {
    font-size: 11px;
  }
</style>
