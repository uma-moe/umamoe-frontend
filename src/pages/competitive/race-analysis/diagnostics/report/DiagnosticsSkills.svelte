<script lang="ts">
  import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
  import { raceMetricHelp, type HorseDiagnostics } from '@/lib/race/capture/race-diagnostics';
  import DataTable from '@/components/data/DataTable.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Icon from '@/components/Icon.svelte';
  import type { IconName } from '@/components/icon-types';
  import RaceSkill from '@/pages/competitive/runners/RaceSkill.svelte';
  import DiagnosticsMetricHelp from '../DiagnosticsMetricHelp.svelte';
  import { isSkillOutcome, skillRows, type SkillOutcome } from '../diagnostics-format';

  type OutcomeTone = 'activated' | 'caution' | 'failed' | 'idle';

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

  const outcomeTones: Record<SkillOutcome, OutcomeTone> = {
    Activated: 'activated',
    'Passed wit check, failed condition': 'caution',
    'Wit check failed': 'failed',
    'Not triggered': 'idle',
    'Not recorded': 'idle'
  };

  const toneIcons: Record<OutcomeTone, IconName> = {
    activated: 'check',
    caution: 'warning',
    failed: 'close',
    idle: 'minus'
  };

  function outcomeTone(status: unknown): OutcomeTone {
    return isSkillOutcome(status) ? outcomeTones[status] : 'idle';
  }
</script>

<section
  class="report-block report-card skills-report"
  aria-label="Runner skill procs"
>
  <header class="section-heading">
    <h3>
      Skill procs <small>{activatedSkills}/{rows.length} activated</small>
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
        <span class="skill-chip-cell">
          <RaceSkill
            id={Number(row.id)}
            name={skillNames.get(Number(row.id))}
            fill
          />
        </span>
      {:else if column.key === 'status'}
        {@const tone = outcomeTone(row.status)}
        <span class="skill-status {tone}">
          <span
            class="status-icon"
            aria-hidden="true"
          >
            <Icon
              name={toneIcons[tone]}
              size={12}
            />
          </span>
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
          variant="secondary"
          size="sm"
          onclick={() => onseek(Number(row.first))}
        >
          {Number(row.first).toFixed(3)} s
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
  @import '../report-card.css';
  @import './report-section.css';
  @import '../../../runners/skill-chip-cell.css';
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
  .skill-chip-cell {
    display: inline-flex;
    vertical-align: middle;
  }
  /* A phone keeps one line per skill, with the pinned chip narrow enough to leave most of the width to scroll. */
  @media (max-width: 767px) {
    .skills-report :global(.skill-chip-cell) {
      --skill-chip-width: 8rem;
    }
    .skills-report :global(th:nth-child(2)) {
      width: auto;
    }
  }
  /* The icon carries the outcome at a glance; its colour repeats it for readers who scan by tone. */
  .skill-status {
    --status-color: var(--text-secondary);
    display: inline-flex;
    align-items: center;
    gap: 7px;
    color: var(--status-color);
  }
  /* A solid badge in the outcome's colour, so the result reads at a glance. */
  .status-icon {
    display: inline-grid;
    place-items: center;
    flex: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--status-color);
    color: var(--surface-1);
  }
  .skill-status.activated,
  .skill-status.failed,
  .skill-status.caution {
    font-weight: 600;
  }
  .skill-status.activated {
    --status-color: var(--accent-success);
  }
  .skill-status.failed {
    --status-color: var(--accent-error);
  }
  .skill-status.idle .status-icon {
    background: var(--surface-2);
    color: var(--text-secondary);
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
    --status-color: var(--accent-warning);
  }
</style>
