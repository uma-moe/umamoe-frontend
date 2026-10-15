<script lang="ts">
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import ToggleButton from '@/components/controls/ToggleButton.svelte';
  import Icon from '@/components/Icon.svelte';
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';

  let {
    metric = $bindable('combined'),
    compare = $bindable(false),
    chartEvents = $bindable(true),
    detailed,
    ensemble
  }: {
    metric?: string;
    compare?: boolean;
    chartEvents?: boolean;
    detailed: boolean;
    ensemble: boolean;
  } = $props();
</script>

<SegmentedControl
  compact
  options={[
    { value: 'combined', label: 'Combined' },
    { value: 'speed', label: 'Speed' },
    { value: 'hp', label: 'HP' },
    { value: 'gap', label: 'Gap' },
    ...(detailed
      ? [
          { value: 'target', label: 'Target speed' },
          { value: 'acceleration', label: 'Acceleration' }
        ]
      : [])
  ]}
  bind:value={metric}
  label="Telemetry metric"
/>
<span class="desktop-chart-options">
  <ToggleButton
    icon="users"
    label="Compare runners"
    pressed={compare}
    onclick={() => (compare = !compare)}
  />{#if !ensemble}
    <ToggleButton
      icon="activity"
      label="Race events"
      pressed={chartEvents}
      onclick={() => (chartEvents = !chartEvents)}
    />
  {/if}
</span>
<span class="mobile-chart-options">
  <InspectPopover
    label="Telemetry display options"
    align="end"
  >
    {#snippet trigger()}
      <span class="guide-trigger">
        <Icon
          name="tune"
          size={16}
        />
      </span>
    {/snippet}
    <h3>Telemetry display</h3>
    <ToggleButton
      icon="users"
      label="Compare runners"
      pressed={compare}
      onclick={() => (compare = !compare)}
    />{#if !ensemble}
      <ToggleButton
        icon="activity"
        label="Race events"
        pressed={chartEvents}
        onclick={() => (chartEvents = !chartEvents)}
      />
    {/if}
  </InspectPopover>
</span>

<style>
  .guide-trigger {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    color: var(--text-secondary);
    min-height: 30px;
    box-sizing: border-box;
    padding: 5px 8px;
  }
  .desktop-chart-options {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  @container playback (max-width:1250px) {
    :global(.playback-actions-options) .desktop-chart-options {
      display: none;
    }
    :global(.playback-actions-options) .mobile-chart-options {
      display: inline-flex;
    }
  }
  .mobile-chart-options {
    display: none;
  }
  @media (max-width: 700px) {
    .desktop-chart-options {
      display: none;
    }
    .mobile-chart-options {
      display: inline-flex;
    }
    :global(.telemetry) .mobile-chart-options :global(.popover .ui-toggle) {
      min-height: 36px;
    }
  }
</style>
