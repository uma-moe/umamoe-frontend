<script lang="ts">
  import type { ParsedRaceCapture } from '@/lib/race/race-capture-parser';
  import {
    raceMetricHelp,
    type hpChangeEvents,
    type HorseDiagnostics
  } from '@/lib/race/race-diagnostics';
  import DataTable from '@/components/data/DataTable.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Disclosure from '@/components/overlays/Disclosure.svelte';
  import Artwork from '@/components/game/Artwork.svelte';
  import RaceSkill from '@/pages/competitive/runners/RaceSkill.svelte';
  import { portrait } from '@/pages/competitive/analysis-view';
  import DiagnosticsEventTable from '../DiagnosticsEventTable.svelte';
  import DiagnosticsRunnerReference from '../DiagnosticsRunnerReference.svelte';
  import {
    count,
    number,
    rows,
    runnerName,
    rushingPeriods as rushingPeriodsOf,
    seekRow,
    signed
  } from '../diagnostics-format';
  import DiagnosticsRushing from './DiagnosticsRushing.svelte';

  let {
    id,
    capture,
    index,
    horse,
    hpRows,
    rushingPeriods,
    skillNames,
    onseek,
    onselect
  }: {
    id: string;
    capture: ParsedRaceCapture;
    index: number;
    horse: HorseDiagnostics;
    hpRows: ReturnType<typeof hpChangeEvents>;
    rushingPeriods: ReturnType<typeof rushingPeriodsOf>;
    skillNames: Map<number, string>;
    onseek: (time: number) => void;
    onselect: (index: number) => void;
  } = $props();
</script>

<div class="detail-traces">
  <section class="detail-panel reference-panel">
    {#each [{ title: 'Position keeping', spans: horse.positionKeepReferenceSpans ?? [], key: 'referenceHorseIndex' }, { title: 'Race pacemakers', spans: capture.detailed?.annotations.paceMakerSpans ?? [], key: 'horseIndex' }] as group}
      <div class="reference-group">
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
                    variant="ghost"
                    size="sm"
                    onclick={() => onseek(span.startTime)}
                  >
                    {span.startTime.toFixed(3)}–{span.endTime.toFixed(3)} s ↗
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
      </div>
    {/each}
  </section>
  <section class="detail-panel detail-table position-decisions">
    <Disclosure
      id={id + '-position-decisions'}
      title="Position-keep decisions"
      description={count(horse.positionKeepDecisions?.length ?? 0, 'decision')}
      compact
      open
    >
      <DiagnosticsEventTable
        value={horse.positionKeepDecisions ?? []}
        title="Position-keep decisions"
        columns={[
          { key: 'time', label: 'Time (s)' },
          { key: 'attemptedMode', label: 'Mode' },
          { key: 'outcome', label: 'Result' },
          { key: 'referenceHorseIndex', label: 'Reference' },
          { key: 'roll', label: 'Check / chance', numeric: true }
        ]}
        {capture}
        {index}
        {skillNames}
        {onseek}
        {onselect}
      />
    </Disclosure>
  </section>
  {#if horse.hpSkillApplications?.length}
    <section class="detail-panel detail-table hp-application-details">
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
            { key: 'time', label: 'Time (s)' },
            { key: 'skillId', label: 'Skill' },
            { key: 'casterHorseIndex', label: 'Source' },
            { key: 'before', label: 'HP before → after', numeric: true },
            { key: 'appliedHpDelta', label: 'HP change', numeric: true }
          ]}
          maxHeight={hpRows.length > 8 ? 300 : undefined}
          onrowclick={(row) => seekRow(row, onseek)}
        >
          {#snippet cell(row, column)}
            {#if column.key === 'time'}
              <Button
                variant="ghost"
                size="sm"
                onclick={() => onseek(Number(row.time))}
              >
                {Number(row.time).toFixed(3)} s ↗
              </Button>
            {:else if column.key === 'skillId'}
              <RaceSkill
                id={Number(row.skillId)}
                name={skillNames.get(Number(row.skillId))}
              />
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
  {#if horse.temptationDecision || horse.temptationSpans?.length}
    <DiagnosticsRushing
      {id}
      {capture}
      {index}
      {horse}
      {rushingPeriods}
      {skillNames}
      {onseek}
      {onselect}
    />
  {/if}
</div>

<style>
  @import '../runner-reference.css';
  @import './detail-panel.css';
  @import './diagnostics-traces.css';
</style>
