<script lang="ts">
  import type { ParsedRaceCapture } from '@/lib/race/race-capture-parser';
  import type { HorseDiagnostics } from '@/lib/race/race-diagnostics';
  import Disclosure from '@/components/overlays/Disclosure.svelte';
  import DiagnosticsEventTable from '../DiagnosticsEventTable.svelte';
  import {
    count,
    display,
    number,
    percentPosition,
    rushingPeriods as rushingPeriodsOf
  } from '../diagnostics-format';

  let {
    id,
    capture,
    index,
    horse,
    rushingPeriods,
    skillNames,
    onseek,
    onselect
  }: {
    id: string;
    capture: ParsedRaceCapture;
    index: number;
    horse: HorseDiagnostics;
    rushingPeriods: ReturnType<typeof rushingPeriodsOf>;
    skillNames: Map<number, string>;
    onseek: (time: number) => void;
    onselect: (index: number) => void;
  } = $props();

  const rushing = $derived(horse.temptationDecision);
</script>

<section class="detail-panel rushing-details">
  <Disclosure
    id={id + '-rushing'}
    title="Rushing details"
    description={count(rushingPeriods.length, 'period')}
    compact
    open
  >
    {#if rushing}
      <div class="rushing-summary">
        <div class="rushing-status">
          <strong>
            {rushing.enabled
              ? 'Rushing enabled'
              : rushing.preventedByModifier
                ? 'Prevented by modifier'
                : 'No rushing'}
          </strong>
          <small>
            {rushing.enabled
              ? 'Check passed'
              : rushing.preventedByModifier
                ? 'Modifier prevented activation'
                : 'Check failed'}
          </small>
        </div>
        <div class="rushing-roll">
          <div>
            <span>
              Check <strong>
                {number(rushing.roll, 2)}% {typeof rushing.roll === 'number' &&
                typeof rushing.threshold === 'number'
                  ? rushing.roll < rushing.threshold
                    ? '<'
                    : '≥'
                  : ''}
              </strong>
            </span>
            <span>
              Rushing chance <strong>{number(rushing.threshold, 2)}%</strong>
            </span>
          </div>
          <span
            class="roll-meter"
            aria-hidden="true"
          >
            <span style:width={percentPosition(rushing.threshold) + '%'}></span>
            <i style:left={percentPosition(rushing.roll) + '%'}></i>
          </span>
          <small>The check must be below the rushing chance to pass.</small>
        </div>
        <dl class="rushing-facts">
          <div>
            <dt>Start section</dt>
            <dd>
              {typeof rushing.startSection === 'number' && rushing.startSection > 0
                ? 'Section ' + rushing.startSection
                : 'Not scheduled'}
            </dd>
          </div>
          <div>
            <dt>Prevented by modifier</dt>
            <dd>{display(rushing.preventedByModifier)}</dd>
          </div>
        </dl>
      </div>
    {/if}
    {#if rushingPeriods.length}
      <div class="detail-table">
        <DiagnosticsEventTable
          value={rushingPeriods}
          title="Rushing periods"
          columns={[
            { key: 'startTime', label: 'Start (s)' },
            { key: 'endTime', label: 'End (s)' },
            { key: 'duration', label: 'Active (s)', numeric: true },
            { key: 'mode', label: 'Mode' }
          ]}
          {capture}
          {index}
          {skillNames}
          {onseek}
          {onselect}
        />
      </div>
    {/if}
  </Disclosure>
</section>

<style>
  @import './detail-panel.css';
  @import './diagnostics-rushing.css';
</style>
