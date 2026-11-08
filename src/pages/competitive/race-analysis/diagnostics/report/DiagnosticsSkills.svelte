<script lang="ts">
  import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
  import { raceMetricHelp, type HorseDiagnostics } from '@/lib/race/capture/race-diagnostics';
  import { ordinalPlace } from '@/lib/race/replay/race-display';
  import DataTable, { type TableColumn } from '@/components/data/DataTable.svelte';
  import IconButton from '@/components/controls/IconButton.svelte';
  import InfoIcon from '@/components/feedback/InfoIcon.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import Icon from '@/components/Icon.svelte';
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';
  import type { IconName } from '@/components/icon-types';
  import RaceSkill from '@/pages/competitive/runners/RaceSkill.svelte';
  import { signedLengths, signedSeconds } from '@/pages/simulator/reports/simulation-comparison';
  import { isSkillOutcome, skillRows, type SkillOutcome } from '../diagnostics-format';
  import {
    runnerSkillGains,
    skillGainHelp,
    skillGainSwings,
    type SkillGain
  } from '../../simulation/skill-impact';
  import { skillImpactsInContext } from '../../simulation/skill-impact.svelte';

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

  const skillImpacts = skillImpactsInContext();
  const columnHelp = { ...raceMetricHelp, Gain: skillGainHelp };

  let skillsWidth = $state(0);
  let sortKey = $state('');
  let sortDirection = $state<'ascending' | 'descending'>('ascending');

  const runner = $derived(capture.runners.find((r) => r.index === index));
  const impact = $derived(skillImpacts?.of(capture));
  const gains = $derived(
    impact?.status === 'ready' ? runnerSkillGains(capture, impact.impact, index) : undefined
  );
  const rows = $derived.by(() => {
    const outcomes = skillRows(capture, index, horse, runner);
    if (!gains) return outcomes;

    return outcomes.map((row) => ({ ...row, gain: shownGain(row)?.lengths ?? '—' }));
  });
  const columns = $derived.by(() => {
    const shown: TableColumn[] = [
      { key: 'id', label: 'Skill' },
      { key: 'status', label: 'Outcome' }
    ];

    return impact ? [...shown, { key: 'gain', label: 'Gain', numeric: true }] : shown;
  });
  const skillColumns = $derived.by(() => {
    const ordered = sortKey ? [...rows].sort(compareRows) : rows;

    if (skillsWidth < 680 || ordered.length < 2) return [ordered];

    const midpoint = Math.ceil(ordered.length / 2);
    return [ordered.slice(0, midpoint), ordered.slice(midpoint)];
  });
  const activationTimes = $derived.by(() => {
    const timesBySkill = new Map<number, number[]>();
    for (const event of capture.events) {
      if (event.type !== 3 || event.params[0] !== index || event.params[1] === undefined) continue;
      const times = timesBySkill.get(event.params[1]);
      if (times) times.push(event.frameTime);
      else timesBySkill.set(event.params[1], [event.frameTime]);
    }

    return timesBySkill;
  });
  const activatedSkills = $derived(rows.filter((row) => row.status === 'Activated').length);

  const outcomeTones: Record<SkillOutcome, OutcomeTone> = {
    Activated: 'activated',
    'Precondition failed': 'caution',
    'Condition failed': 'caution',
    'Wit check failed': 'failed',
    Impossible: 'failed',
    'Not recorded': 'idle'
  };

  const toneIcons: Record<OutcomeTone, IconName> = {
    activated: 'check',
    caution: 'warning',
    failed: 'close',
    idle: 'minus'
  };

  /** Skills that never took effect gained exactly nothing, so they show no gain at all. */
  function shownGain(row: Record<string, string | number>): SkillGain | undefined {
    const gain = gains?.get(Number(row.id));
    if (gain === undefined) return undefined;

    const changedNothing = gain.lengths === 0 && gain.seconds === 0;
    return changedNothing && row.status !== 'Activated' ? undefined : gain;
  }

  function compareRows(a: Record<string, string | number>, b: Record<string, string | number>) {
    if (sortKey === 'gain') {
      // Unmeasured skills stay below measured ones in either direction, as DataTable keeps them.
      if (typeof a.gain !== 'number') return typeof b.gain === 'number' ? 1 : 0;
      if (typeof b.gain !== 'number') return -1;
    }

    let comparison: number;
    if (sortKey === 'id') comparison = Number(a.id) - Number(b.id);
    else if (sortKey === 'gain') comparison = Number(a.gain) - Number(b.gain);
    else comparison = String(a.status).localeCompare(String(b.status));

    return sortDirection === 'ascending' ? comparison : -comparison;
  }

  function gainTone(lengths: number) {
    const rounded = Number(lengths.toFixed(1));
    if (rounded > 0) return 'gained';
    if (rounded < 0) return 'lost';

    return 'even';
  }

  function gainDescription(gain: SkillGain) {
    if (gain.place === gain.placeWithout)
      return 'Same place without this skill. ' + skillGainSwings;

    const places = ordinalPlace(gain.place) + ', ' + ordinalPlace(gain.placeWithout);
    return 'Finished ' + places + ' without this skill. ' + skillGainSwings;
  }

  function outcomeTone(status: unknown): OutcomeTone {
    return isSkillOutcome(status) ? outcomeTones[status] : 'idle';
  }

  function witDescription(row: Record<string, string | number>) {
    if (row.status === 'Not recorded') return 'Activation data not recorded.';
    if (row.witRequired !== 1) return 'No wit check required.';
    if (typeof row.roll !== 'number' || typeof row.threshold !== 'number')
      return 'Wit check not recorded.';

    return `Wit check: ${row.roll.toFixed(2)}%. Pass below ${row.threshold.toFixed(2)}%.`;
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
    {#if impact?.status === 'running'}
      <span class="impact-status">
        <Spinner
          size={14}
          label="Measuring skill gains"
        />
        Measuring gains
      </span>
    {:else if impact?.status === 'failed'}
      <span
        class="impact-status failed"
        title={impact.reason}
      >
        Gains unavailable
        <IconButton
          icon="refresh"
          label="Measure skill gains again"
          size="sm"
          onclick={() => skillImpacts?.retry(capture)}
        />
      </span>
    {/if}
  </header>
  <div
    class="skill-columns"
    bind:clientWidth={skillsWidth}
  >
    {#each skillColumns as columnRows, columnIndex}
      <DataTable
        {columnHelp}
        plain
        compact
        caption={skillColumns.length === 1
          ? 'Runner skill analysis'
          : `Runner skill analysis, column ${columnIndex + 1}`}
        rows={columnRows}
        bind:sortKey
        bind:sortDirection
        emptyMessage="No skill data recorded for this runner."
        {columns}
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
            <span
              class="skill-status {tone}"
              title={witDescription(row)}
            >
              {#if row.status === 'Activated'}
                <span class="activation-checks">
                  {#each activationTimes.get(Number(row.id)) ?? [] as time, activationIndex}
                    <button
                      type="button"
                      class="status-icon activation-trigger"
                      title={'Review activation at ' + time.toFixed(3) + ' s'}
                      aria-label={'Review ' +
                        (skillNames.get(Number(row.id)) ?? 'skill ' + row.id) +
                        ' activation ' +
                        (activationIndex + 1) +
                        ' at ' +
                        time.toFixed(3) +
                        ' seconds'}
                      onclick={() => onseek(time)}
                    >
                      <Icon
                        name="check"
                        size={12}
                      />
                    </button>
                  {:else}
                    <span
                      class="status-icon"
                      aria-hidden="true"
                    >
                      <Icon
                        name="check"
                        size={12}
                      />
                    </span>
                  {/each}
                </span>
                {Number(row.count) > 1 ? row.count + '× activated' : 'Activated'}
              {:else}
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
              {/if}
            </span>
            {#if row.reason}
              <span class="impossible-help">
                <InspectPopover
                  label={'Why ' +
                    (skillNames.get(Number(row.id)) ?? 'skill ' + row.id) +
                    ' is impossible'}
                  openOnHover
                >
                  {#snippet trigger()}
                    <InfoIcon />
                  {/snippet}
                  <p>{row.reason}</p>
                </InspectPopover>
              </span>
            {/if}
          {:else if column.key === 'gain'}
            {@const gain = shownGain(row)}
            {#if gain}
              <span
                class="skill-gain {gainTone(gain.lengths)}"
                title={gainDescription(gain)}
              >
                <span class="gain-lengths">{signedLengths(gain.lengths)}</span>
                <span class="gain-seconds">{signedSeconds(-gain.seconds)}</span>
              </span>
            {:else if impact?.status === 'running'}
              <span
                class="gain-missing"
                aria-label="Measuring"
              >
                …
              </span>
            {:else}
              <span class="gain-missing">—</span>
            {/if}
          {/if}
        {/snippet}
      </DataTable>
    {/each}
  </div>
</section>

<style>
  @import '../diagnostics-section.css';
  @import '../report-card.css';
  @import './report-section.css';
  @import '../../../runners/skill-chip-cell.css';
  /* The skills scroll inside whatever height the analysis gives this card. */
  .skills-report {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .skill-columns {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 330px), 1fr));
    gap: 0 20px;
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--border-secondary) transparent;
  }
  .skills-report :global(th:first-child) {
    width: 50%;
  }
  /* A wide single table lets long skill names use its room, up to 260px. */
  .skill-chip-cell {
    --skill-chip-width: max(176px, min(100%, 260px));
    display: inline-flex;
    width: 100%;
    vertical-align: middle;
  }
  /* A phone's chip fills its half of the table; outcomes wrap to a gain's two lines so the gain stays in view. */
  @media (max-width: 767px) {
    .skills-report :global(.skill-chip-cell) {
      --skill-chip-width: min(100%, 260px);
    }
    .skill-status {
      white-space: normal;
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
  .activation-checks {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 3px;
    max-width: 96px;
  }
  .activation-trigger {
    border: 0;
    padding: 0;
    cursor: pointer;
  }
  .activation-trigger:hover {
    filter: brightness(1.15);
  }
  .activation-trigger:focus-visible {
    outline: 2px solid var(--accent-primary);
    outline-offset: 2px;
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
  .skill-status.caution {
    --status-color: var(--accent-warning);
  }
  .impact-status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--text-secondary);
    font-size: 11px;
  }
  .impact-status.failed {
    color: var(--accent-warning);
  }
  .skill-gain {
    display: inline-flex;
    flex-direction: column;
    align-items: flex-end;
    line-height: 1.15;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .gain-lengths {
    font-weight: 600;
  }
  .gain-seconds {
    color: var(--text-secondary);
    font-size: 10px;
  }
  .skill-gain.gained .gain-lengths {
    color: var(--accent-success);
  }
  .skill-gain.lost .gain-lengths {
    color: var(--accent-error);
  }
  .skill-gain.even .gain-lengths,
  .gain-missing {
    color: var(--text-secondary);
  }
  .impossible-help {
    display: inline-flex;
    vertical-align: middle;
    margin-left: 3px;
  }
  .impossible-help :global(.trigger) {
    display: grid;
    place-items: center;
    min-width: 20px;
    min-height: 24px;
  }
  .impossible-help p {
    margin: 0;
    font-size: 11px;
    line-height: 1.6;
    white-space: normal;
  }
</style>
