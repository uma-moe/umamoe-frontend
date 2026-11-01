<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import ToggleButton from '@/components/controls/ToggleButton.svelte';
  import Icon from '@/components/Icon.svelte';
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';

  let {
    metric = $bindable('combined'),
    compare = $bindable(false),
    chartEvents = $bindable(true),
    detailed,
    ensemble,
    menu = false,
    onexpand
  }: {
    metric?: string;
    compare?: boolean;
    chartEvents?: boolean;
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
</script>

{#snippet optionsTrigger()}
  <span class="options-trigger">
    <Icon
      name="tune"
      size={16}
    />
  </span>
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
  <span class="metric-tabs">
    <SegmentedControl
      compact
      options={metrics}
      bind:value={metric}
      label="Telemetry metric"
    />
  </span>
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
    display: grid;
    place-items: center;
    box-sizing: border-box;
    min-width: 32px;
    min-height: 32px;
    padding: 0 8px;
    border: 1px solid var(--factor-field-border);
    border-radius: 6px;
    background: var(--factor-field-bg);
    color: var(--color-text);
  }
  .options-trigger:hover {
    border-color: var(--border-secondary);
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
  @container playback (max-width:1250px) {
    :global(.playback-actions-options) .desktop-chart-options {
      display: none;
    }
    :global(.playback-actions-options) .mobile-chart-options {
      display: inline-flex;
    }
  }
  .mobile-chart-options,
  .metric-select {
    display: none;
  }
  .metric-tabs {
    display: contents;
  }
  .metric-select :global(.field) {
    width: 132px;
  }
  .metric-select :global(.field button),
  .metric-select :global(.field select) {
    min-height: 32px;
    padding-block: 4px;
  }
  /* The metric list needs most of a row, so narrower toolbars use a menu. */
  @container playback (max-width:1100px) {
    .metric-tabs {
      display: none;
    }
    .metric-select {
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
    .metric-tabs {
      display: none;
    }
    .metric-select {
      display: inline-flex;
    }
  }
</style>
