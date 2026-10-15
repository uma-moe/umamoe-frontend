<script lang="ts">
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import { theme } from '@/stores/theme';
  import StatisticsChartPanel from '../StatisticsChartPanel.svelte';
  import { histogramChart, statisticsChartStyle } from '../statistics-charts';
  import { statName, statOptions } from '../statistics-format';
  import type { StatDistribution } from '../statistics-repository';

  interface Props {
    values: Record<string, StatDistribution>;
    prefix: string;
    activeStat: string;
    histogramMode: string;
  }

  let { values, prefix, activeStat = $bindable(), histogramMode = $bindable() }: Props = $props();

  const chartStyle = $derived(statisticsChartStyle($theme));
</script>

<div class="distribution-controls">
  <SegmentedControl
    label="Stat to explore"
    options={statOptions}
    bind:value={activeStat}
  />
  <SegmentedControl
    label="Distribution scale"
    options={[
      { value: 'count', label: 'Count' },
      { value: 'percent', label: 'Percent' }
    ]}
    bind:value={histogramMode}
  />
</div>
<StatisticsChartPanel
  id={prefix + '-distribution'}
  title={statName(activeStat) + ' Stat Distribution'}
  description={histogramMode === 'count'
    ? 'Training samples in each stat range. Hover or tap a bar for the exact count.'
    : 'Share of recorded samples in each stat range. Each distribution totals 100%.'}
  option={histogramChart(chartStyle, values[activeStat], activeStat, histogramMode === 'percent')}
  height={260}
/>

<style>
  .distribution-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin: 12px 0 8px;
  }
  @media (max-width: 600px) {
    .distribution-controls {
      gap: 6px;
    }
    .distribution-controls > :global(.segments):first-child {
      width: 100%;
    }
    .distribution-controls :global(.segments button) {
      flex: 1;
      min-width: 0;
      padding-inline: 9px;
      font-size: 12px;
    }
  }
</style>
