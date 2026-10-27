<script lang="ts">
  import { raceMetricHelp } from '@/lib/race/capture/race-diagnostics';
  import DataTable from '@/components/data/DataTable.svelte';
  import Button from '@/components/controls/Button.svelte';
  import {
    count,
    number,
    rngLimit,
    seekRow,
    signed,
    type DiagnosticsSampleRow,
    type DiagnosticsSectionRow
  } from '../diagnostics-format';

  let {
    sampleRows,
    sectionRows,
    onseek
  }: {
    sampleRows: DiagnosticsSampleRow[];
    sectionRows: DiagnosticsSectionRow[];
    onseek: (time: number) => void;
  } = $props();

  const speedLimit = $derived(
    Math.max(
      1,
      ...sampleRows.map((row) => (typeof row.targetSpeed === 'number' ? row.targetSpeed : 0))
    )
  );

  const accelerationLimit = $derived(
    Math.max(
      1,
      ...sampleRows.map((row) =>
        typeof row.acceleration === 'number' ? Math.abs(row.acceleration) : 0
      )
    )
  );

  const sectionRngLimit = $derived(rngLimit(sectionRows));
</script>

<div class="measurement-details-grid">
  <section
    class="detail-panel pace-samples"
    aria-label="Exact telemetry samples"
  >
    <header class="section-heading">
      <h4>
        Pace samples <small>{count(sampleRows.length, 'sample')}</small>
      </h4>
      <span class="detail-hint">Select a time to replay</span>
    </header>
    <DataTable
      columnHelp={raceMetricHelp}
      plain
      compact
      caption="Simulator telemetry samples"
      rows={sampleRows}
      columns={[
        { key: 'time', label: 'Time (s)', numeric: true },
        { key: 'targetSpeed', label: 'Target (m/s)', numeric: true },
        { key: 'acceleration', label: 'Accel. (m/s²)', numeric: true }
      ]}
      maxHeight={300}
      onrowclick={(row) => seekRow(row, onseek)}
    >
      {#snippet cell(row, column)}
        {#if column.key === 'time'}
          <Button
            variant="secondary"
            size="sm"
            onclick={() => onseek(Number(row.time))}
          >
            {Number(row.time).toFixed(3)} s
          </Button>
        {:else if typeof row[column.key] === 'number'}
          <span class="sample-value">
            {#if column.key === 'targetSpeed'}
              <span
                class="speed-meter"
                aria-hidden="true"
              >
                <span style:width={(Number(row.targetSpeed) / speedLimit) * 100 + '%'}></span>
              </span>
            {:else}
              <span
                class="rng-meter acceleration-meter"
                aria-hidden="true"
              >
                <span
                  style:left={(Number(row.acceleration) < 0
                    ? 50 - (Math.abs(Number(row.acceleration)) / accelerationLimit) * 50
                    : 50) + '%'}
                  style:width={(Math.abs(Number(row.acceleration)) / accelerationLimit) * 50 + '%'}
                ></span>
              </span>
            {/if}
            <strong>
              {column.key === 'targetSpeed'
                ? Number(row.targetSpeed).toFixed(2)
                : signed(Number(row.acceleration))}
            </strong>
          </span>
        {:else}
          <span class="muted">—</span>
        {/if}
      {/snippet}
    </DataTable>
  </section>
  {#if sectionRows.length}
    <section
      class="detail-panel section-details"
      aria-label="Course section speed details"
    >
      <header class="section-heading">
        <h4>
          Base speed & RNG <small>{count(sectionRows.length, 'section')}</small>
        </h4>
        <span class="detail-hint">Select a section to replay</span>
      </header>
      <DataTable
        columnHelp={raceMetricHelp}
        plain
        compact
        caption="Base target speed by section"
        rows={sectionRows}
        columns={[
          { key: 'section', label: 'Section' },
          { key: 'start', label: 'Distance (m)' },
          { key: 'phase', label: 'Phase' },
          { key: 'speed', label: 'Target (m/s)', numeric: true },
          { key: 'rng', label: 'RNG (%)', numeric: true }
        ]}
        maxHeight={300}
      >
        {#snippet cell(row, column)}
          {#if column.key === 'section'}
            {#if typeof row.time === 'number'}
              <Button
                variant="secondary"
                size="sm"
                ariaLabel={'Watch section ' + row.section}
                onclick={() => onseek(Number(row.time))}
              >
                {row.section}
              </Button>
            {:else}
              {row.section}
            {/if}
          {:else if column.key === 'start'}
            <span class="muted">
              {number(row.start)}–{number(row.end)}
            </span>
          {:else if column.key === 'rng'}
            <span class="rng-cell">
              <span
                class="rng-meter"
                aria-hidden="true"
              >
                <span
                  class:negative={Number(row.rng) < 0}
                  style:left={(Number(row.rng) < 0
                    ? 50 - (Math.abs(Number(row.rng)) / sectionRngLimit) * 50
                    : 50) + '%'}
                  style:width={(Math.abs(Number(row.rng)) / sectionRngLimit) * 50 + '%'}
                ></span>
              </span>
              <span
                class="rng-value"
                class:positive={Number(row.rng) > 0}
                class:negative={Number(row.rng) < 0}
              >
                {signed(Number(row.rng))}%
              </span>
            </span>
          {:else if column.key === 'speed'}
            {Number(row.speed).toFixed(2)}
          {:else}
            {String(row[column.key]).replace(' race', '')}
          {/if}
        {/snippet}
      </DataTable>
    </section>
  {/if}
</div>

<style>
  @import '../diagnostics-section.css';
  @import './measurements.css';
  @import './detail-panel.css';
  @import './diagnostics-samples.css';
</style>
