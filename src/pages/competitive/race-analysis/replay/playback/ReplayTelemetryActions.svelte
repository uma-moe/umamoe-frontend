<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import ToggleButton from '@/components/controls/ToggleButton.svelte';
  import Icon from '@/components/Icon.svelte';
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';
  import type { RaceRunner } from '@/lib/race/capture/race-capture-parser';
  import ReplayCompareRunners from './ReplayCompareRunners.svelte';

  let {
    metric = $bindable('combined'),
    compare = $bindable(false),
    chartEvents = $bindable(true),
    hiddenRunners = $bindable([]),
    runners,
    followed,
    detailed,
    ensemble,
    menu = false,
    onexpand
  }: {
    metric?: string;
    compare?: boolean;
    chartEvents?: boolean;
    /** Runner indices left off the comparison. */
    hiddenRunners?: number[];
    /** In finish order, for choosing who to compare. */
    runners: RaceRunner[];
    followed: number;
    detailed: boolean;
    ensemble: boolean;
    /** Puts the whole chart view behind one button, for a toolbar without room to show it. */
    menu?: boolean;
    /** Offered inside the menu, which then holds every chart control. */
    onexpand?: () => void;
  } = $props();

  const metrics = $derived([
    { value: 'combined', label: 'Combined' },
    { value: 'speed', label: 'Speed' },
    { value: 'hp', label: 'HP' },
    { value: 'gap', label: 'Gap' },
    ...(detailed ? [{ value: 'target', label: 'Target speed' }] : []),
    ...(ensemble ? [] : [{ value: 'acceleration', label: 'Acceleration' }])
  ]);

  const comparedCount = $derived(
    runners.filter((runner) => runner.index === followed || !hiddenRunners.includes(runner.index))
      .length
  );
</script>

{#snippet optionsTrigger()}
  <span class="options-trigger">
    <Icon
      name="tune"
      size={16}
    />
  </span>
{/snippet}

{#snippet comparedTrigger()}
  <span class="options-trigger compared-trigger">
    {comparedCount} / {runners.length}
    <Icon
      name="chevron"
      size={14}
    />
  </span>
{/snippet}

{#snippet compareRunners()}
  <ReplayCompareRunners
    {runners}
    {followed}
    bind:hidden={hiddenRunners}
  />
{/snippet}

{#snippet displaySwitches()}
  <div class="switch-rows">
    <ToggleButton
      icon="users"
      label="Compare runners"
      pressed={compare}
      onclick={() => (compare = !compare)}
    />
    {#if !ensemble}
      <ToggleButton
        icon="activity"
        label="Race events"
        pressed={chartEvents}
        onclick={() => (chartEvents = !chartEvents)}
      />
    {/if}
  </div>
  {#if compare}
    {@render compareRunners()}
  {/if}
{/snippet}

{#if menu}
  <InspectPopover
    label="Telemetry display options"
    align="end"
    trigger={optionsTrigger}
  >
    <div class="options-panel">
      <h3>Telemetry display</h3>
      <div class="metric-grid">
        <SegmentedControl
          options={metrics}
          bind:value={metric}
          label="Telemetry metric"
        />
      </div>
      {@render displaySwitches()}
      {#if onexpand}
        <Button
          variant="secondary"
          size="sm"
          icon="expand"
          onclick={onexpand}
        >
          Expand Race telemetry
        </Button>
      {/if}
    </div>
  </InspectPopover>
{:else}
  <span class="metric-select">
    <SelectField
      id="telemetry-metric"
      label="Telemetry metric"
      hideLabel
      options={metrics}
      bind:value={metric}
    />
  </span>
  <span class="desktop-chart-options">
    <span
      class="compare-control"
      class:joined={compare}
    >
      <ToggleButton
        icon="users"
        label="Compare"
        ariaLabel="Compare runners"
        pressed={compare}
        onclick={() => (compare = !compare)}
      />
      {#if compare}
        <InspectPopover
          label="Choose compared runners"
          align="end"
          trigger={comparedTrigger}
        >
          {@render compareRunners()}
        </InspectPopover>
      {/if}
    </span>
    {#if !ensemble}
      <ToggleButton
        icon="activity"
        label="Events"
        ariaLabel="Race events"
        pressed={chartEvents}
        onclick={() => (chartEvents = !chartEvents)}
      />
    {/if}
  </span>
  <span class="mobile-chart-options">
    <InspectPopover
      label="Telemetry display options"
      align="end"
      trigger={optionsTrigger}
    >
      <div class="options-panel">
        <h3>Telemetry display</h3>
        {@render displaySwitches()}
      </div>
    </InspectPopover>
  </span>
{/if}

<style>
  /* Drawn as a button, like the expand button beside it. */
  .options-trigger {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    box-sizing: border-box;
    min-width: 32px;
    min-height: 32px;
    padding: 0 8px;
    border: 1px solid var(--toolbar-control-border, var(--factor-field-border));
    border-radius: 6px;
    background: var(--factor-field-bg);
    color: var(--color-text);
  }
  .options-trigger:hover {
    border-color: var(--border-secondary);
  }
  .compared-trigger {
    font-size: 12px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  /* The count reads as the compare switch's own menu: joined to it, sharing one outline. */
  .compare-control {
    --inspect-popover-width: 232px;
    /* The title's line box centres on the popover's close button; its letters sit 10px in like the sides. */
    --inspect-popover-padding: 7px 10px 8px;

    display: flex;
    align-items: center;
  }
  .compare-control.joined :global(.ui-toggle) {
    border-start-end-radius: 0;
    border-end-end-radius: 0;
  }
  /* Highlighted like the pressed switch it belongs to. */
  .compare-control .compared-trigger {
    margin-left: -1px;
    border-color: rgb(var(--accent-primary-rgb) / 0.64);
    border-start-start-radius: 0;
    border-end-start-radius: 0;
    background: rgb(var(--accent-primary-rgb) / 0.15);
    color: var(--accent-primary);
  }
  .compare-control .compared-trigger:hover {
    background: rgb(var(--accent-primary-rgb) / 0.22);
  }
  /* A settings sheet: the metric as a two-column choice, then a list of switches and the expand action. */
  .options-panel {
    display: grid;
    gap: 10px;
    min-width: 0;
  }
  h3 {
    margin: 0;
    padding-right: 32px;
    font-size: 14px;
    line-height: 24px;
  }
  .metric-grid :global(.segments) {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: 100%;
    height: auto;
  }
  .metric-grid :global(.segments button) {
    min-height: 30px;
    padding-inline: 6px;
    font-size: 12px;
    font-weight: 600;
  }
  /* Rows of a list rather than buttons: the switch carries the state, so a row stays quiet when on. */
  .switch-rows {
    display: grid;
    border-block: 1px solid var(--color-border);
  }
  .switch-rows :global(.toggle-field .ui-toggle),
  .switch-rows :global(.toggle-field .ui-toggle.pressed) {
    width: 100%;
    height: 40px;
    min-height: 40px;
    justify-content: flex-start;
    gap: 8px;
    padding-inline: 2px;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: var(--color-text);
    font-size: 13px;
    font-weight: 600;
  }
  .switch-rows :global(.toggle-field + .toggle-field .ui-toggle) {
    border-top: 1px solid var(--color-border);
  }
  .switch-rows :global(.toggle-field .ui-toggle > span) {
    color: var(--color-text);
  }
  .switch-rows :global(.ui-toggle .switch) {
    margin-left: auto;
  }
  .options-panel > :global(.ui-button) {
    width: 100%;
    min-height: 36px;
  }
  .desktop-chart-options {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .mobile-chart-options {
    display: none;
  }
  .metric-select :global(.field) {
    width: 132px;
  }
  @container playback (max-width: 1100px) {
    :global(.playback-actions-options) .desktop-chart-options {
      display: none;
    }
    :global(.playback-actions-options) .mobile-chart-options {
      display: inline-flex;
    }
  }
  @media (max-width: 700px) {
    .desktop-chart-options {
      display: none;
    }
    .mobile-chart-options {
      display: inline-flex;
    }
  }
</style>
