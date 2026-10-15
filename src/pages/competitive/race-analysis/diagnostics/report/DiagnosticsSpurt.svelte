<script lang="ts">
  import type { ParsedRaceCapture } from '@/lib/race/race-capture-parser';
  import type { DiagnosticRow, HorseDiagnostics } from '@/lib/race/race-diagnostics';
  import Button from '@/components/controls/Button.svelte';
  import Icon from '@/components/Icon.svelte';
  import DiagnosticsEventTable from '../DiagnosticsEventTable.svelte';
  import DiagnosticsMetricHelp from '../DiagnosticsMetricHelp.svelte';
  import { count, display, number, signed } from '../diagnostics-format';

  let {
    id,
    spurt,
    capture,
    index,
    horse,
    skillNames,
    onseek,
    onselect,
    spurtOpen = $bindable(false)
  }: {
    id: string;
    spurt: DiagnosticRow;
    capture: ParsedRaceCapture;
    index: number;
    horse: HorseDiagnostics;
    skillNames: Map<number, string>;
    onseek: (time: number) => void;
    onselect: (index: number) => void;
    spurtOpen?: boolean;
  } = $props();

  const spurtSelected = $derived(
    spurt.result === 'True' || spurt.result === 'TrueExceedNeedMaximumHp'
  );
  const spurtHpBalance = $derived(
    typeof spurt.checkHp === 'number' && typeof spurt.fullSpurtNeedHp === 'number'
      ? spurt.checkHp - spurt.fullSpurtNeedHp
      : undefined
  );
</script>

<section
  class="report-block spurt-report"
  aria-label="Last-spurt decision"
>
  <header class="section-heading">
    <h3>Last-spurt decision</h3>
    {#if typeof spurt.time === 'number'}
      <Button
        variant="ghost"
        size="sm"
        onclick={() => onseek(Number(spurt.time))}
      >
        {spurt.time.toFixed(3)} s ↗
      </Button>
    {/if}
    <button
      class="calculation-toggle"
      type="button"
      aria-label="Last-spurt calculation"
      aria-expanded={spurtOpen}
      aria-controls={id + '-spurt-calculation'}
      onclick={() => (spurtOpen = !spurtOpen)}
    >
      Calculation <span class:opened={spurtOpen}>
        <Icon
          name="chevron"
          size={12}
        />
      </span>
    </button>
  </header>
  {#if !spurtOpen}
    <dl class="spurt-summary">
      <div>
        <dt>HP at decision<DiagnosticsMetricHelp label="HP at decision" /></dt>
        <dd>{number(spurt.checkHp)}</dd>
      </div>
      <div>
        <dt>HP for full spurt<DiagnosticsMetricHelp label="HP for full spurt" /></dt>
        <dd>{number(spurt.fullSpurtNeedHp)}</dd>
      </div>
      <div>
        <dt>Full spurt speed<DiagnosticsMetricHelp label="Full spurt speed" /></dt>
        <dd>
          {number(spurt.fullSpurtTargetSpeed, 2)}
          <small>m/s</small>
        </dd>
      </div>
    </dl>
    {#if typeof spurt.checkHp === 'number' && typeof spurt.fullSpurtNeedHp === 'number'}
      <p
        class="decision-note"
        class:caution={spurt.checkHp < spurt.fullSpurtNeedHp}
      >
        {spurt.checkHp < spurt.fullSpurtNeedHp
          ? number(spurt.fullSpurtNeedHp - spurt.checkHp) + ' HP short of a full spurt'
          : 'Enough HP for a full spurt'}{#if spurt.speedPenalty}
          ; speed reduced
        {/if}{#if spurt.delayPenalty}
          ; spurt delayed
        {/if}
      </p>
    {/if}
  {/if}
  <div
    class="spurt-calculation"
    id={id + '-spurt-calculation'}
    hidden={!spurtOpen}
  >
    {#if spurtHpBalance !== undefined}
      <div
        class="hp-equation"
        aria-label="HP available minus HP required for a full spurt"
      >
        <span>
          <small>Available HP</small>
          <strong>{number(spurt.checkHp, 2)}</strong>
        </span>
        <b aria-hidden="true">−</b>
        <span>
          <small>Required HP</small>
          <strong>{number(spurt.fullSpurtNeedHp, 2)}</strong>
        </span>
        <b aria-hidden="true">=</b>
        <span class:shortfall={spurtHpBalance < 0}>
          <small>{spurtHpBalance < 0 ? 'HP shortfall' : 'HP spare'}</small>
          <strong>{signed(spurtHpBalance)}</strong>
        </span>
      </div>
    {/if}
    <table class="spurt-comparison">
      <caption class="sr-only">Full and selected spurt</caption>
      <thead>
        <tr>
          <th scope="col">Spurt</th>
          <th scope="col">Full</th>
          <th scope="col">Selected</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th scope="row">
            Start <small>m</small>
          </th>
          <td>{number(spurt.checkDistance, 2)}</td>
          <td>{spurtSelected ? number(spurt.selectedStartDistance, 2) : '—'}</td>
        </tr>
        <tr>
          <th scope="row">
            Speed <small>m/s</small>
          </th>
          <td>{number(spurt.fullSpurtTargetSpeed, 2)}</td>
          <td>{spurtSelected ? number(spurt.selectedTargetSpeed, 2) : '—'}</td>
        </tr>
      </tbody>
    </table>
    <p class="spurt-result">
      <strong>
        {spurtSelected
          ? spurt.speedPenalty || spurt.delayPenalty
            ? 'Reduced spurt selected'
            : display(spurt.result, 'result')
          : display(spurt.result, 'result')}
      </strong>
      {#if spurtSelected && typeof spurt.selectedStartDistance === 'number' && typeof spurt.checkDistance === 'number'}
        <span>
          {spurt.delayPenalty
            ? number(spurt.selectedStartDistance - spurt.checkDistance, 2) + ' m delay'
            : 'No delay'}
        </span>
      {/if}
      {#if spurtSelected && typeof spurt.selectedTargetSpeed === 'number' && typeof spurt.fullSpurtTargetSpeed === 'number'}
        <span>
          {spurt.speedPenalty
            ? number(spurt.fullSpurtTargetSpeed - spurt.selectedTargetSpeed, 2) + ' m/s slower'
            : 'Full speed'}
        </span>
      {/if}
      {#if typeof spurt.calculationCount === 'number'}
        <span>
          {count(spurt.calculationCount, 'calculation')}
        </span>
      {/if}
    </p>
    {#if (horse.lastSpurtDecisions?.length ?? 0) > 1}
      <h4>Decision history</h4>
      <DiagnosticsEventTable
        value={horse.lastSpurtDecisions}
        title="Last-spurt decisions"
        columns={[
          { key: 'time', label: 'Time (s)' },
          { key: 'checkDistance', label: 'Distance (m)', numeric: true },
          { key: 'checkHp', label: 'HP available', numeric: true },
          { key: 'fullSpurtNeedHp', label: 'HP required', numeric: true },
          { key: 'fullSpurtTargetSpeed', label: 'Full speed (m/s)', numeric: true },
          { key: 'selectedStartDistance', label: 'Start (m)', numeric: true },
          { key: 'selectedTargetSpeed', label: 'Speed (m/s)', numeric: true },
          { key: 'result', label: 'Result' },
          { key: 'delayPenalty', label: 'Delayed' },
          { key: 'speedPenalty', label: 'Slower' },
          { key: 'calculationCount', label: 'Calculations', numeric: true }
        ]}
        {capture}
        {index}
        {skillNames}
        {onseek}
        {onselect}
      />
    {/if}
  </div>
</section>

<style>
  @import '../diagnostics-section.css';
  @import './diagnostics-spurt.css';
</style>
