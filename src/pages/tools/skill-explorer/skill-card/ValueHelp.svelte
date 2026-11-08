<script lang="ts">
  import InfoIcon from '@/components/feedback/InfoIcon.svelte';
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';

  let { label, help }: { label: string; help: string } = $props();
</script>

<!-- A skill card value's explanation, shown on hover like race analysis's column help. -->
<span class="value-help">
  <InspectPopover
    label={'About ' + label}
    openOnHover
  >
    {#snippet trigger()}
      <InfoIcon />
    {/snippet}
    <p>{help}</p>
  </InspectPopover>
</span>

<style>
  .value-help {
    display: inline-flex;
    vertical-align: middle;
    margin-left: 2px;
    --inspect-popover-width: 280px;
  }
  /* The card's labels are small capitals: a full-size icon would make every tile taller. */
  .value-help :global(.info-icon) {
    width: 14px;
    height: 12px;
  }
  .value-help :global(.info-icon svg) {
    width: 12px;
    height: 12px;
  }
  p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 400;
    line-height: 1.6;
    letter-spacing: normal;
    text-transform: none;
    white-space: normal;
  }
</style>
