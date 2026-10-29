<script lang="ts">
  import { clubMetrics, defaultClubConfig, type ClubDisplayConfig } from '@/lib/clubs/club-display';
  import Button from '@/components/controls/Button.svelte';
  import Checkbox from '@/components/controls/Checkbox.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';

  let {
    open = $bindable(false),
    config,
    onsave
  }: {
    open?: boolean;
    config: ClubDisplayConfig;
    onsave: (config: ClubDisplayConfig) => void;
  } = $props();

  let draft = $state({ ...defaultClubConfig });

  $effect(() => {
    if (open) draft = { ...config };
  });
</script>

<Dialog
  id="club-display-settings"
  bind:open
  title="Member List Settings"
  icon="tune"
  maxWidth="500px"
  maxHeight="85dvh"
  mobileInset="16px"
>
  <div class="settings-content">
    <SelectField
      id="club-member-metric"
      label="Sorting & Primary Metric"
      help="Determines sorting order and highlighted metric."
      options={clubMetrics.map((metric) => ({
        value: metric.value,
        label:
          metric.value === 'avg_daily_gain'
            ? 'Avg Daily Gain (7d)'
            : metric.value === 'daily_avg'
              ? 'Daily Avg (Month)'
              : metric.label
      }))}
      bind:value={draft.selectedCalculation}
    />
    <fieldset>
      <legend>Visible Columns</legend>
      <p>Select which metrics to display for each member.</p>
      <div class="checkbox-grid">
        <Checkbox
          id="club-showTotalFans"
          label="Total Fans"
          bind:checked={draft.showTotalFans}
        />
        <Checkbox
          id="club-showTodayGain"
          label="Today"
          bind:checked={draft.showTodayGain}
        />
        <Checkbox
          id="club-showSevenDayAvg"
          label="7 Day Average"
          bind:checked={draft.showSevenDayAvg}
        />
        <Checkbox
          id="club-showDailyAvg"
          label="Daily Average (Month)"
          bind:checked={draft.showDailyAvg}
        />
        <Checkbox
          id="club-showDailyGain"
          label="Daily Gain"
          bind:checked={draft.showDailyGain}
        />
        <Checkbox
          id="club-showWeeklyGain"
          label="Weekly Gain"
          bind:checked={draft.showWeeklyGain}
        />
        <Checkbox
          id="club-showProjectedMonthly"
          label="Projected Monthly"
          bind:checked={draft.showProjectedMonthly}
        />
        <Checkbox
          id="club-showMonthlyGain"
          label="Monthly Gain"
          bind:checked={draft.showMonthlyGain}
        />
      </div>
    </fieldset>
  </div>
  {#snippet actions()}
    <Button
      variant="secondary"
      size="sm"
      onclick={() => (open = false)}
    >
      Cancel
    </Button><Button
      size="sm"
      onclick={() => {
        onsave({ ...draft });
        open = false;
      }}
    >
      Apply
    </Button>
  {/snippet}
</Dialog>

<style>
  .settings-content {
    display: grid;
    gap: 20px;
  }
  fieldset {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }
  legend {
    padding: 0;
    color: var(--text-primary);
    font-size: var(--font-sm);
    font-weight: 600;
  }
  p {
    margin: 6px 0 8px;
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.4;
  }
  .checkbox-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px 16px;
  }
  @media (max-width: 360px) {
    .checkbox-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
