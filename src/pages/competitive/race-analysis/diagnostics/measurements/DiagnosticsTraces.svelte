<script lang="ts">
  import { MediaQuery } from 'svelte/reactivity';
  import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
  import {
    raceMetricHelp,
    type hpChangeEvents,
    type HorseDiagnostics
  } from '@/lib/race/capture/race-diagnostics';
  import DataTable from '@/components/data/DataTable.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Disclosure from '@/components/overlays/Disclosure.svelte';
  import Artwork from '@/components/game/Artwork.svelte';
  import RaceSkill from '@/pages/competitive/runners/RaceSkill.svelte';
  import { portrait } from '@/pages/competitive/analysis-view';
  import DiagnosticsEventTable from '../DiagnosticsEventTable.svelte';
  import DiagnosticsRunnerReference from '../DiagnosticsRunnerReference.svelte';
  import { count, number, rows, runnerName, seekRow, signed } from '../diagnostics-format';

  let {
    id,
    capture,
    index,
    horse,
    hpRows,
    skillNames,
    onseek,
    onselect
  }: {
    id: string;
    capture: ParsedRaceCapture;
    index: number;
    horse: HorseDiagnostics;
    hpRows: ReturnType<typeof hpChangeEvents>;
    skillNames: Map<number, string>;
    onseek: (time: number) => void;
    onselect: (index: number) => void;
  } = $props();

  // Matches diagnostics-traces.css, where the decisions sit beside the reference and HP column.
  const besideTraces = new MediaQuery('min-width: 1251px');

  let traceHeight = $state(0);
  let decisionPanel = $state<HTMLElement>();
  let decisionTable = $state<HTMLDivElement>();

  /** Beside the trace column the decisions scroll within its height instead of stopping at nine rows. */
  const decisionHeight = $derived.by(() => {
    if (!besideTraces.current || !decisionPanel || !decisionTable || !traceHeight) return undefined;

    // The table starts below the decisions heading and ends above the card's padding; neither inset
    // changes with the table's height.
    const tableBottom = decisionTable.offsetTop + decisionTable.offsetHeight;
    const bottomInset = decisionPanel.offsetHeight - tableBottom;
    return Math.max(240, traceHeight - decisionTable.offsetTop - bottomInset);
  });
</script>

<div class="detail-traces">
  <!-- The short reference lists leave room beside the decisions for the HP changes. -->
  <div
    class="trace-column"
    bind:clientHeight={traceHeight}
  >
    <div class="reference-panel">
      {#each [{ title: 'Position keeping', spans: horse.positionKeepReferenceSpans ?? [], key: 'referenceHorseIndex' }, { title: 'Race pacemakers', spans: capture.detailed?.annotations.paceMakerSpans ?? [], key: 'horseIndex' }] as group}
        <section class="detail-panel report-card reference-group">
          <Disclosure
            id={id + '-' + group.key}
            title={group.title}
            description={count(group.spans.length, 'period')}
            compact
            open
          >
            {#if group.spans.length}
              <ol
                class="reference-periods"
                aria-label={group.title + ' periods'}
              >
                {#each group.spans as span}
                  <li>
                    <Button
                      variant="secondary"
                      size="sm"
                      onclick={() => onseek(span.startTime)}
                    >
                      {span.startTime.toFixed(3)}–{span.endTime.toFixed(3)} s
                    </Button>
                    {#if Number(span[group.key]) >= 0}
                      <button
                        class="runner-reference"
                        type="button"
                        onclick={() => onselect(Number(span[group.key]))}
                      >
                        <Artwork
                          src={portrait(
                            capture.runners.find((r) => r.index === Number(span[group.key]))?.cardId
                          )}
                          alt=""
                          size="xs"
                        />{runnerName(capture, span[group.key])}
                      </button>
                    {:else}
                      <span>No reference runner</span>
                    {/if}
                    <small>{number(span.endTime - span.startTime, 2)} s</small>
                  </li>
                {/each}
              </ol>
            {:else}
              <p class="empty">
                No {group.title.toLowerCase()} periods recorded.
              </p>
            {/if}
          </Disclosure>
        </section>
      {/each}
    </div>
    {#if horse.hpSkillApplications?.length}
      <section class="detail-panel report-card detail-table hp-application-details">
        <Disclosure
          id={id + '-hp-applications'}
          title="Recovery & HP changes"
          description={count(hpRows.length, 'event')}
          compact
          open
        >
          <DataTable
            columnHelp={{
              ...raceMetricHelp,
              Source:
                'The runner who activated this skill. Self means the selected runner. Select a name to inspect that runner.'
            }}
            plain
            compact
            caption="HP change details"
            rows={rows(hpRows)}
            columns={[
              { key: 'time', label: 'Time (s)', numeric: true },
              { key: 'skillId', label: 'Skill' },
              { key: 'casterHorseIndex', label: 'Source' },
              { key: 'before', label: 'HP before → after', numeric: true },
              { key: 'appliedHpDelta', label: 'HP change', numeric: true }
            ]}
            maxHeight={hpRows.length > 9 ? 300 : undefined}
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
              {:else if column.key === 'skillId'}
                <span class="skill-chip-cell">
                  <RaceSkill
                    id={Number(row.skillId)}
                    name={skillNames.get(Number(row.skillId))}
                    fill
                  />
                </span>
              {:else if column.key === 'casterHorseIndex'}
                <DiagnosticsRunnerReference
                  {capture}
                  {index}
                  value={Number(row.casterHorseIndex)}
                  {onselect}
                />{#if Number(row.targetHorseIndex) !== index}
                  <span class="muted">
                    → {runnerName(capture, row.targetHorseIndex)}
                  </span>
                {/if}
              {:else if column.key === 'before'}
                <span class="detail-transition">
                  {typeof row.before === 'number' && typeof row.after === 'number'
                    ? `${row.estimated === 'Yes' ? '≈ ' : ''}${number(row.before)} → ${number(row.after)}`
                    : '—'}
                </span>
              {:else if column.key === 'appliedHpDelta'}
                <span
                  class="application-change"
                  class:recovery={Number(row.appliedHpDelta) > 0}
                  class:debuff={Number(row.appliedHpDelta) < 0}
                >
                  <span>
                    <strong>{signed(Number(row.appliedHpDelta))}</strong>
                    {#if typeof row.percent === 'number'}
                      <span class="change-percent">({signed(row.percent, 1)}%)</span>
                    {/if}
                  </span>
                  {#if signed(Number(row.requestedHpDelta)) !== signed(Number(row.appliedHpDelta))}
                    <small>
                      Requested {signed(Number(row.requestedHpDelta))}
                    </small>
                  {/if}
                </span>
              {/if}
            {/snippet}
          </DataTable>
          <p class="detail-footnote">≈ Estimated HP. Change percentages use maximum HP.</p>
        </Disclosure>
      </section>
    {/if}
  </div>
  <section
    class="detail-panel report-card detail-table position-decisions"
    bind:this={decisionPanel}
  >
    <Disclosure
      id={id + '-position-decisions'}
      title="Position-keep decisions"
      description={count(horse.positionKeepDecisions?.length ?? 0, 'decision')}
      compact
      open
    >
      <div bind:this={decisionTable}>
        <DiagnosticsEventTable
          value={horse.positionKeepDecisions ?? []}
          title="Position-keep decisions"
          columns={[
            { key: 'time', label: 'Time (s)', numeric: true },
            { key: 'attemptedMode', label: 'Mode' },
            { key: 'outcome', label: 'Result' },
            { key: 'referenceHorseIndex', label: 'Reference' },
            { key: 'roll', label: 'Check / chance', numeric: true }
          ]}
          {capture}
          {index}
          {skillNames}
          maxHeight={decisionHeight}
          {onseek}
          {onselect}
        />
      </div>
    </Disclosure>
  </section>
</div>

<style>
  @import '../runner-reference.css';
  @import '../report-card.css';
  @import './detail-panel.css';
  @import './diagnostics-traces.css';
  @import '../../../runners/skill-chip-cell.css';
  .skill-chip-cell {
    display: inline-flex;
    vertical-align: middle;
  }
</style>
