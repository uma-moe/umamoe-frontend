<script lang="ts">
  import type { ParsedRaceCapture } from '@/lib/race/race-capture-parser';
  import { raceMetricHelp, type HorseDiagnostics } from '@/lib/race/race-diagnostics';
  import DataTable from '@/components/data/DataTable.svelte';
  import Button from '@/components/controls/Button.svelte';
  import RaceSkill from '@/pages/competitive/runners/RaceSkill.svelte';
  import DiagnosticsMetricHelp from '../DiagnosticsMetricHelp.svelte';
  import { skillRows } from '../diagnostics-format';

  let {
    capture,
    index,
    horse,
    skillNames,
    onseek
  }: {
    capture: ParsedRaceCapture;
    index: number;
    horse: HorseDiagnostics | undefined;
    skillNames: Map<number, string>;
    onseek: (time: number) => void;
  } = $props();

  const runner = $derived(capture.runners.find((r) => r.index === index));
  const rows = $derived(skillRows(capture, index, horse, runner));
  const activationThresholds = $derived([
    ...new Set(rows.flatMap((row) => (typeof row.threshold === 'number' ? [row.threshold] : [])))
  ]);
  const sharedThreshold = $derived(
    activationThresholds.length === 1 ? activationThresholds[0] : undefined
  );
  const activatedSkills = $derived(rows.filter((row) => row.status === 'Activated').length);
</script>

<section
  class="report-block skills-report"
  aria-label="Runner skill performance"
>
  <header class="section-heading">
    <h3>
      Skill performance <small>{activatedSkills}/{rows.length} activated</small>
    </h3>
    {#if sharedThreshold !== undefined}
      <span class="activation-threshold">
        Wit checks pass below <strong>{sharedThreshold.toFixed(2)}%</strong>
        <DiagnosticsMetricHelp label="Wit check threshold" />
      </span>
    {/if}
  </header>
  <DataTable
    columnHelp={raceMetricHelp}
    plain
    compact
    caption="Runner skill analysis"
    {rows}
    columns={[
      { key: 'id', label: 'Skill' },
      { key: 'status', label: 'Outcome' },
      { key: 'count', label: 'Triggers', numeric: true },
      { key: 'first', label: 'First (s)', numeric: true },
      ...(horse
        ? [
            { key: 'duration', label: 'Active (s)', numeric: true },
            { key: 'roll', label: 'Wit check', numeric: true }
          ]
        : [])
    ]}
  >
    {#snippet cell(row, column)}
      {#if column.key === 'id'}
        <RaceSkill
          id={Number(row.id)}
          name={skillNames.get(Number(row.id))}
        />
      {:else if column.key === 'status'}
        <span
          class="skill-status"
          class:activated={row.status === 'Activated'}
          class:failed={row.status === 'Wit check failed'}
          class:caution={row.status === 'Passed wit check, failed condition'}
        >
          {row.status}
        </span>
      {:else if column.key === 'roll'}
        <span
          class="wit-check"
          class:failed={row.witRequired === 1 && row.witPassed === 0}
        >
          {#if row.witRequired !== 1}
            <span
              class="muted"
              title="No wit check required"
            >
              —
            </span>
          {:else if typeof row.roll === 'number' && typeof row.threshold === 'number'}
            {Number(row.roll).toFixed(2)}%{#if sharedThreshold === undefined}
              <small>
                Pass below {Number(row.threshold).toFixed(2)}%
              </small>
            {/if}
          {:else}
            <span class="muted">Not recorded</span>
          {/if}
        </span>
      {:else if column.key === 'first' && typeof row.first === 'number'}
        <Button
          variant="ghost"
          size="sm"
          onclick={() => onseek(Number(row.first))}
        >
          {Number(row.first).toFixed(3)} s ↗
        </Button>
      {:else}
        {typeof row[column.key] === 'number'
          ? Number(row[column.key]).toFixed(column.key === 'count' ? 0 : 2)
          : row[column.key]}
      {/if}
    {/snippet}
  </DataTable>
</section>

<style>
  @import '../diagnostics-section.css';
  h3 {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
  }
  h3 small {
    margin-left: 5px;
    color: var(--text-secondary);
    font-size: 10px;
    font-weight: 400;
  }
  .report-block {
    min-width: 0;
  }
  .section-heading > h3 {
    margin-right: auto;
  }
  .activation-threshold {
    font-size: 10px;
    color: var(--text-secondary);
    white-space: nowrap;
  }
  .activation-threshold strong {
    font-weight: 500;
    color: var(--text-primary);
    font-variant-numeric: tabular-nums;
  }
  .muted {
    color: var(--text-secondary);
  }
  .skills-report :global(th:nth-child(2)) {
    width: 28%;
  }
  .skills-report :global(th:last-child) {
    width: 112px;
  }
  .skill-status {
    color: var(--text-secondary);
  }
  .skill-status.activated {
    color: var(--accent-secondary);
  }
  .skill-status.failed {
    color: var(--accent-error);
  }
  .wit-check {
    display: inline-grid;
    justify-items: end;
    font-variant-numeric: tabular-nums;
  }
  .wit-check small {
    color: var(--text-secondary);
    font-size: 10px;
  }
  .wit-check.failed {
    color: var(--accent-error);
  }
  .skill-status.caution {
    color: var(--accent-warning);
  }
  .skills-report :global(.skill-chip) {
    vertical-align: middle;
  }
</style>
