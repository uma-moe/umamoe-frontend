<script lang="ts">
  import { raceMetricHelp } from '@/lib/race/race-diagnostics';
  import InspectPopover from '@/components/InspectPopover.svelte';
  import Icon from '@/components/Icon.svelte';
  let {label,description}:{label:string;description?:string}=$props();
  const help=$derived(description??raceMetricHelp[label]);
</script>
{#if help}<span class="metric-help"><InspectPopover label={'About '+label} openOnHover>{#snippet trigger()}<Icon name="info" size={12}/>{/snippet}<p>{help}</p></InspectPopover></span>{/if}
<style>
  .metric-help{display:inline-flex;vertical-align:middle;margin-left:4px;color:var(--text-secondary);--inspect-popover-width:310px}.metric-help :global(.trigger){display:grid;place-items:center;min-width:20px;min-height:24px}p{margin:0;font-size:11px;line-height:1.6;font-weight:400;white-space:normal}
</style>
