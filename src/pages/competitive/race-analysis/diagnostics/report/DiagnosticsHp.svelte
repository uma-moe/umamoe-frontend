<script lang="ts">
  import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
  import DataTable from '@/components/data/DataTable.svelte';
  import Disclosure from '@/components/overlays/Disclosure.svelte';
  import SeekTimeButton from '../SeekTimeButton.svelte';
  import RaceSkill from '@/pages/competitive/runners/RaceSkill.svelte';
  import { fixed, number, signed } from '../diagnostics-format';
  import { delayedSpurt, hpReport, spurtOutcome, spurtSelection } from './hp-report';
  import { hpColor, needColor } from './last-spurt-chart';
  import LastSpurtChart from './LastSpurtChart.svelte';
  import SpurtCalculation from './SpurtCalculation.svelte';

  let {
    capture,
    index,
    distance,
    skillNames,
    onseek
  }: {
    capture: ParsedRaceCapture;
    index: number;
    /** The race distance, where the HP chart ends. */
    distance: number;
    skillNames: Map<number, string>;
    onseek: (time: number) => void;
  } = $props();

  const calculationId = $props.id();

  let effectsWidth = $state(0);
  let sortKey = $state('');
  let sortDirection = $state<'ascending' | 'descending'>('ascending');

  const report = $derived(hpReport(capture, index));
  const spurt = $derived(report.spurt);
  const outcome = $derived(spurtOutcome(spurt));
  const spurtDelayed = $derived(delayedSpurt(spurt));
  const speedReduced = $derived((spurt.reduction ?? 0) >= 0.005);
  const finishHp = $derived(report.hp.finish);
  const selection = $derived(
    report.finalDecision === undefined ? undefined : spurtSelection(report.finalDecision)
  );

  // The chart marks the first check, which the facts beside it describe.
  const chartMarks = $derived({
    checkDistance: report.checkDistance,
    checkHp: report.checkHp,
    needHp: report.requiredHp,
    delayedStart: spurtDelayed ? spurt.start : undefined
  });

  const lossTiming = $derived.by(() => {
    const { totalLoss, lossBeforeCheck } = report;
    if (totalLoss === undefined || totalLoss <= 0) return undefined;
    if (lossBeforeCheck === undefined) return 'timing not recorded';
    if (lossBeforeCheck === totalLoss) return 'all before check';

    return number(lossBeforeCheck, 2) + ' before check';
  });

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
  <header class="section-heading">
    <h3>
      HP &amp; spurt
      {#if outcome}
        <small
          class:good={outcome.clean}
          class:bad={!outcome.clean}
        >
          {outcome.label}
        </small>
      {/if}
    </h3>
    {#if report.checkTime !== undefined}
      <span class="check-time">
        Spurt check
        <SeekTimeButton
          time={report.checkTime}
          {onseek}
        />
      </span>
    {/if}
  </header>
  <div class="hp-overview">
    <dl
      class="report-facts hp-facts"
      style:--hp-line={hpColor}
      style:--need-line={needColor}
    >
      <div>
        <dt>
          <i
            class="line-key hp-key"
            aria-hidden="true"
          ></i>
          HP at check
        </dt>
        <dd>
          {number(report.checkHp)}
          <small>HP</small>
        </dd>
      </div>
      <div>
        <dt>
          <i
            class="line-key need-key"
            aria-hidden="true"
          ></i>
          Needed for full spurt
        </dt>
        <dd>
          {number(report.requiredHp)}
          <small>HP</small>
        </dd>
      </div>
      {#if report.balance !== undefined}
        <div>
          <dt>{report.balance < 0 ? 'HP short' : 'HP spare'}</dt>
          <dd
            class:negative={report.balance < 0}
            class:positive={report.balance > 0}
          >
            {signed(report.balance, 0)}
            <small>HP</small>
          </dd>
        </div>
      {/if}
      <div>
        <dt>
          {#if spurtDelayed}
            <i
              class="line-key delay-key"
              aria-hidden="true"
            ></i>
          {/if}Spurt delay
        </dt>
        <dd
          class:negative={spurtDelayed}
          class:positive={spurt.delay !== undefined && !spurtDelayed}
        >
          {number(spurt.delay, 1)}
          <small>m</small>
        </dd>
      </div>
      <div>
        <dt>
          Spurt speed
          {#if speedReduced}
            <small>{fixed(spurt.reduction, 2)} under full</small>
          {/if}
        </dt>
        <dd
          class:negative={spurt.speedPenalty}
          class:positive={spurt.speed !== undefined && !spurt.speedPenalty}
        >
          {fixed(spurt.speed, 2)}
          <small>m/s</small>
        </dd>
      </div>
      <div>
        <dt>
          HP at finish
          {#if typeof report.exhaustedDistance === 'number'}
            <small>ran out at {number(report.exhaustedDistance)} m</small>
          {/if}
        </dt>
        <dd
          class:negative={finishHp !== undefined && finishHp <= 0}
          class:positive={finishHp !== undefined && finishHp > 0}
        >
          {number(finishHp)}
          <small>HP</small>
        </dd>
      </div>
      <div>
        <dt>
          HP lost to skills
          {#if lossTiming}
            <small>{lossTiming}</small>
          {/if}
        </dt>
        <dd class:negative={(report.totalLoss ?? 0) > 0}>
          {number(report.totalLoss, 2)}
          <small>HP</small>
        </dd>
      </div>
    </dl>
    <LastSpurtChart
      {capture}
      {index}
      {distance}
      marks={chartMarks}
      {onseek}
    />
  </div>
  {#if report.finalDecision}
    <div class="spurt-calculation">
      <Disclosure
        id={calculationId}
        title="Spurt calculation"
        compact
      >
        {#snippet heading()}
          <strong>Spurt calculation</strong>
          {#if selection}
            <small
              class="calculation-result"
              class:positive={selection.clean}
              class:negative={!selection.clean}
            >
              {selection.label}
            </small>
          {/if}
        {/snippet}
        <SpurtCalculation
          calculations={report.calculations}
          {onseek}
        />
      </Disclosure>
    </div>
  {/if}
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
                  <span class="hp-share">({signed(row.percent, 1)}%)</span>{/if}
              </span>
            {/if}
          {/snippet}
        </DataTable>
      {/each}
    </div>
  {/if}
</section>

<style>
  @import '../diagnostics-section.css';
  @import '../report-card.css';
  @import './report-section.css';
  @import './report-facts.css';
  @import '../../../runners/skill-chip-cell.css';
  @import './diagnostics-hp.css';
</style>
