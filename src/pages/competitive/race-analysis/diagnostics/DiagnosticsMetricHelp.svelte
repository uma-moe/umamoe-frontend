<script lang="ts">
  import { raceMetricHelp } from '@/lib/race/race-diagnostics';
  import Icon from '@/components/Icon.svelte';
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';

  let { label }: { label: string } = $props();

  const help = $derived(raceMetricHelp[label]);
</script>

{#if help}
  <span class="metric-help">
    <InspectPopover
      label={'About ' + label}
      openOnHover
    >
      {#snippet trigger()}
        <Icon
          name="info"
          size={12}
        />
      {/snippet}
      <p>{help}</p>
    </InspectPopover>
  </span>
{/if}

<style>
  p {
    margin: 0;
    font-size: 11px;
    color: var(--text-secondary);
    line-height: 1.5;
  }
  .metric-help {
    display: inline-flex;
    vertical-align: middle;
    margin-left: 4px;
    color: var(--text-secondary);
    --inspect-popover-width: 310px;
  }
  .metric-help :global(.trigger) {
    display: grid;
    place-items: center;
    min-width: 20px;
    min-height: 24px;
  }
  .metric-help p {
    margin: 0;
    font-size: 11px;
    line-height: 1.6;
    font-weight: 400;
    white-space: normal;
  }
</style>
