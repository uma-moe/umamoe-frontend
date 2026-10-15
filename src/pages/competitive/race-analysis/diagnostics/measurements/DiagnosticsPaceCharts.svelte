<script lang="ts">
  import LazyEChartsSurface from '@/components/charts/LazyEChartsSurface.svelte';
  import { theme } from '@/stores/theme';
  import DiagnosticsMetricHelp from '../DiagnosticsMetricHelp.svelte';
  import {
    count,
    rngLimit,
    signed,
    type DiagnosticsSampleRow,
    type DiagnosticsSectionRow
  } from '../diagnostics-format';
  import { paceChartOption, sectionChartOption } from './diagnostics-charts';

  let {
    sampleRows,
    sectionRows,
    onseek
  }: {
    sampleRows: DiagnosticsSampleRow[];
    sectionRows: DiagnosticsSectionRow[];
    onseek: (time: number) => void;
  } = $props();

  const averageRng = $derived(
    sectionRows.length
      ? sectionRows.reduce((total, row) => total + row.rng, 0) / sectionRows.length
      : 0
  );

  const sectionChart = $derived(
    sectionChartOption(sectionRows, rngLimit(sectionRows), $theme === 'dark')
  );

  const paceChart = $derived(paceChartOption(sampleRows, $theme === 'dark'));

  function seekSection(value: number) {
    const time = sectionRows[Math.round(value)]?.time;
    if (typeof time === 'number') onseek(time);
  }
</script>

<div class="measurement-grid">
  <section class="report-block pace-report">
    <header class="section-heading">
      <h4>
        Pace over time<DiagnosticsMetricHelp label="Pace over time" />
        <small>{count(sampleRows.length, 'sample')}</small>
      </h4>
    </header>
    <div class="measurement-legend">
      <span class="target-key">Target speed (m/s)</span>
      <span class="accel-key">Acceleration (m/s²)</span>
      <small>Select a time to watch it in replay.</small>
    </div>
    {#if sampleRows.some((row) => typeof row.targetSpeed === 'number' || typeof row.acceleration === 'number')}
      <div class="pace-chart">
        <LazyEChartsSurface
          option={paceChart}
          label="Simulator pace over time"
          height={180}
          onaxisclick={onseek}
        />
      </div>
    {:else}
      <p class="empty">No pace samples recorded.</p>
    {/if}
  </section>
  {#if sectionRows.length}
    <section class="report-block section-speeds">
      <header class="section-heading">
        <h4>
          Base target speed<DiagnosticsMetricHelp label="Base target speed" />
          <small>{count(sectionRows.length, 'section')}</small>
        </h4>
      </header>
      <div class="section-chart">
        <span class="chart-lane-label speed">Target speed (m/s)</span>
        <span class="chart-lane-label rng">RNG adjustment (%)</span>
        <LazyEChartsSurface
          option={sectionChart}
          label="Base target speed and RNG by course section"
          height={200}
          onaxisclick={seekSection}
        />
      </div>
      <div class="rng-summary">
        <span class="rng-key">
          <span class="rng-value negative">− Slower</span>
          <span class="rng-value positive">+ Faster</span>
        </span>
        <span>
          Average RNG <strong
            class="rng-value"
            class:positive={averageRng > 0}
            class:negative={averageRng < 0}
          >
            {signed(averageRng)}%
          </strong>
        </span>
      </div>
    </section>
  {/if}
</div>

<style>
  @import '../diagnostics-section.css';
  @import './measurements.css';
  @import './diagnostics-pace-charts.css';
</style>
