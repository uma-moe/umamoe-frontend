<script lang="ts">
  import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
  import DataTable from '@/components/data/DataTable.svelte';
  import SeekTimeButton from '../SeekTimeButton.svelte';
  import RaceSkill from '@/pages/competitive/runners/RaceSkill.svelte';
  import { number, signed } from '../diagnostics-format';
  import { hpReport } from './hp-report';

  let {
    capture,
    index,
    skillNames,
    onseek,
    onspurt
  }: {
    capture: ParsedRaceCapture;
    index: number;
    skillNames: Map<number, string>;
    onseek: (time: number) => void;
    onspurt?: () => void;
  } = $props();

  let effectsWidth = $state(0);
  let sortKey = $state('');
  let sortDirection = $state<'ascending' | 'descending'>('ascending');

  const report = $derived(hpReport(capture, index));
  const effectColumns = $derived.by(() => {
    const key = sortKey;
    const ordered =
      key === 'time' || key === 'skillId' || key === 'change'
        ? [...report.effects].sort((a, b) => {
            const comparison = a[key] - b[key];
            return sortDirection === 'ascending' ? comparison : -comparison;
          })
        : report.effects;

    if (effectsWidth < 700 || ordered.length < 2) return [ordered];

    const midpoint = Math.ceil(ordered.length / 2);
    return [ordered.slice(0, midpoint), ordered.slice(midpoint)];
  });
</script>

<section
  class="report-block report-card hp-report"
  aria-label="Runner HP"
>
  <header class="section-heading"><h3>HP &amp; spurt</h3></header>
  <dl class="hp-summary">
    <div>
      <dt>HP at finish</dt>
      <dd
        class:negative={report.hp.finish !== undefined && report.hp.finish <= 0}
        class:positive={report.hp.finish !== undefined && report.hp.finish > 0}
      >
        {number(report.hp.finish)} HP
        {#if typeof report.exhaustedDistance === 'number'}
          <span>- exhausted at {number(report.exhaustedDistance)} m</span>
        {/if}
      </dd>
    </div>
    <div>
      <dt>Spurt check</dt>
      <dd>
        {#if report.balance === undefined}
          Not recorded
        {:else}
          <span>{number(report.checkHp)} HP / {number(report.requiredHp)} required</span>
          <span
            class:negative={report.balance < 0}
            class:positive={report.balance > 0}
          >
            ({signed(report.balance, 0)})
          </span>
        {/if}
      </dd>
    </div>
    <div>
      <dt>Spurt</dt>
      <dd>
        <span
          class:negative={report.spurt.noSpurt || (report.spurt.delay ?? 0) >= 0.05}
          class:positive={!report.spurt.noSpurt &&
            report.spurt.delay !== undefined &&
            report.spurt.delay < 0.05}
        >
          {report.spurt.noSpurt ? 'No spurt' : number(report.spurt.delay, 1) + ' m delay'}
        </span>
        {#if report.spurt.speed !== undefined}
          <span>
            - <span
              class:negative={report.spurt.speedPenalty}
              class:positive={!report.spurt.speedPenalty}
            >
              {number(report.spurt.speed, 2)} m/s{#if (report.spurt.reduction ?? 0) >= 0.005}
                {' '}(-{number(report.spurt.reduction, 2)}){/if}
            </span>
          </span>
        {/if}
        {#if onspurt}
          <button
            type="button"
            class="breakdown"
            onclick={onspurt}
            aria-haspopup="dialog"
            aria-label="Open last-spurt breakdown"
          >
            Details
          </button>
        {/if}
      </dd>
    </div>
    <div>
      <dt>HP lost to skills</dt>
      <dd>
        {#if report.totalLoss === undefined}
          Not recorded
        {:else}
          <span>
            <span class:negative={report.totalLoss > 0}>{number(report.totalLoss, 2)} HP</span>
            total
          </span>
          {#if report.totalLoss > 0}
            {#if report.lossBeforeCheck === undefined}
              <span>- timing not recorded</span>
            {:else if report.lossBeforeCheck === report.totalLoss}
              <span>- all before spurt check</span>
            {:else}
              <span>
                - <span class:negative={report.lossBeforeCheck > 0}>
                  {number(report.lossBeforeCheck, 2)} HP
                </span>
                before spurt check
              </span>
            {/if}
          {/if}
        {/if}
      </dd>
    </div>
  </dl>
  {#if report.effects.length}
    <div
      class="effect-columns"
      bind:clientWidth={effectsWidth}
    >
      {#each effectColumns as effects, columnIndex}
        <DataTable
          plain
          compact
          caption={effectColumns.length === 1
            ? 'HP change details'
            : `HP change details, column ${columnIndex + 1}`}
          rows={effects}
          bind:sortKey
          bind:sortDirection
          maxHeight={effects.length > 6 ? 210 : undefined}
          columns={[
            { key: 'time', label: 'Time', helpKey: 'Time (s)', numeric: true },
            { key: 'skillId', label: 'Skill' },
            { key: 'change', label: 'HP change', numeric: true }
          ]}
        >
          {#snippet cell(row, column)}
            {#if column.key === 'time'}
              <SeekTimeButton
                time={Number(row.time)}
                {onseek}
              />
            {:else if column.key === 'skillId'}
              <span class="skill-chip-cell">
                <RaceSkill
                  id={Number(row.skillId)}
                  name={skillNames.get(Number(row.skillId))}
                  fill
                />
              </span>
            {:else if column.key === 'change'}
              <span
                class="hp-change"
                class:negative={Number(row.change) < 0}
                class:positive={Number(row.change) > 0}
                title={Math.abs(Number(row.requested) - Number(row.change)) >= 0.005
                  ? 'Requested ' + signed(Number(row.requested)) + ' HP'
                  : undefined}
              >
                {signed(Number(row.change))} HP{#if typeof row.percent === 'number'}
                  <span>({signed(row.percent, 1)}%)</span>{/if}
              </span>
            {/if}
          {/snippet}
        </DataTable>
      {/each}
    </div>
  {/if}
</section>

<style>
  @import '../report-card.css';
  @import './report-section.css';
  @import '../../../runners/skill-chip-cell.css';
  @import './diagnostics-hp.css';
</style>
