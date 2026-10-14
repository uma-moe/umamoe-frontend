<script lang="ts">
  import ChartFrame from '@/components/charts/ChartFrame.svelte';
  import Icon from '@/components/Icon.svelte';
  import type { CourseCatalogEntry } from '@/lib/catalog/course-catalog';
  import { formatRaceTime } from '@/lib/race/race-display';
  import SimulatorRunnerFace from '../SimulatorRunnerFace.svelte';
  import { runnerColor } from '../simulation-report';
  import {
    formatMargin,
    headToHead,
    runnerOutcome,
    type MarginUnit,
    type VerdictTone
  } from '../simulation-comparison';
  import type { MonteCarloResult } from '../../simulator-repository';
  import type { SimulatorUma } from '../../simulator-uma';

  /** The whole field in one slim table: who wins, who keeps HP and spurts, and the baseline and comparison picks. */
  let {
    result,
    umas,
    course,
    selected,
    reference,
    unit = 'lengths',
    onreference,
    onchoose
  }: {
    result: MonteCarloResult;
    umas: SimulatorUma[];
    course?: CourseCatalogEntry;
    selected: number[];
    reference: number;
    unit?: MarginUnit;
    onreference: (source: number) => void;
    onchoose: (source: number) => void;
  } = $props();

  const LIMIT = 4;

  const distance = $derived(course?.distance ?? result.report?.distance_m.at(-1) ?? 2000);
  const outcomes = $derived(umas.map((_, source) => runnerOutcome(result, source)));
  const rows = $derived(
    outcomes
      .map((outcome) => ({
        outcome,
        pair:
          outcome.source === reference
            ? undefined
            : headToHead(result, outcome.source, reference, distance)
      }))
      .sort((a, b) => b.outcome.winRate - a.outcome.winRate || a.outcome.source - b.outcome.source)
  );

  // Large fields show the favourites and every pick; the rest is one click away.
  let expanded = $state(false);

  const collapsible = $derived(rows.length > 10);
  const visible = $derived(
    !collapsible || expanded
      ? rows
      : rows.filter((row, index) => index < 6 || selected.includes(row.outcome.source))
  );

  const pct = (value: number | null | undefined) =>
    value == null || !Number.isFinite(value)
      ? '—'
      : (value >= 99.95 || value <= 0.05 || value >= 10 ? value.toFixed(0) : value.toFixed(1)) +
        '%';
  const tone: Record<VerdictTone, string> = {
    good: 'clean',
    warn: 'warning',
    bad: 'error',
    neutral: ''
  };
  const name = (source: number) => umas[source]!.name;
</script>

<section
  id="simulation-field-overview"
  class="field-overview"
  aria-label="Field overview"
>
  <ChartFrame
    id="simulation-field-overview-card"
    slim
    title="The field"
    description={'Pick a baseline to measure everyone against, then tick up to ' +
      LIMIT +
      ' runners to compare in depth below. Bars show wins, extended to top-3 finishes; margins are typical finish margins to the baseline.'}
  >
    <div class="scroll">
      <table>
        <thead>
          <tr>
            <th
              scope="col"
              class="pick"
            >
              Baseline
            </th>
            <th
              scope="col"
              class="pick"
            >
              Compare
            </th>
            <th
              scope="col"
              class="runner"
            >
              Runner
            </th>
            <th
              scope="col"
              class="wins"
              title="Share of races won. The lighter part of the bar extends to top-3 finishes."
            >
              Wins <span class="key">
                <i></i>
                top 3
              </span>
            </th>
            <th
              scope="col"
              class="rate"
              title="Races where she can afford the full last spurt."
            >
              Full spurt
            </th>
            <th
              scope="col"
              class="rate"
              title="Races where she still has HP at the finish line."
            >
              HP lasts
            </th>
            <th
              scope="col"
              class="margin"
              title="Typical finish margin to the baseline in the same race: lengths (1 L = 2.5 m) and seconds, where negative seconds means she finishes earlier."
            >
              vs baseline
            </th>
            <th
              scope="col"
              class="finish"
              title="Typical (median) finish time across all sampled races."
            >
              Finish
            </th>
          </tr>
        </thead>
        <tbody>
          {#each visible as { outcome, pair } (outcome.source)}
            {@const source = outcome.source}
            {@const picked = selected.includes(source)}
            {@const full = !picked && selected.length >= LIMIT}
            <tr
              class:baseline={source === reference}
              class:picked
              style:--runner={runnerColor(source)}
            >
              <td class="pick">
                <input
                  type="radio"
                  name="simulation-baseline"
                  checked={source === reference}
                  aria-label={'Use ' + name(source) + ' as baseline'}
                  onchange={() => onreference(source)}
                />
              </td>
              <td class="pick">
                <input
                  id={'compare-runner-' + source}
                  type="checkbox"
                  checked={picked}
                  disabled={source === reference || full}
                  title={source === reference
                    ? 'The baseline is always compared'
                    : full
                      ? 'Untick a runner first: up to ' + LIMIT + ' at once'
                      : undefined}
                  aria-label={'Compare ' + name(source)}
                  onchange={() => onchoose(source)}
                />
              </td>
              <th
                scope="row"
                class="runner"
              >
                <label for={'compare-runner-' + source}>
                  <span class="dot"></span>
                  <SimulatorRunnerFace
                    cardId={umas[source]!.cardId}
                    size={20}
                  />
                  <span class="name">{name(source)}</span>
                  <small>#{source + 1}</small>
                </label>
              </th>
              <td class="wins">
                <div>
                  <span
                    class="bar"
                    aria-hidden="true"
                  >
                    <span
                      class="top3"
                      style:width={outcome.top3 + '%'}
                    ></span>
                    <span
                      class="win"
                      style:width={outcome.winRate + '%'}
                    ></span>
                  </span>
                  <strong title={'Top 3 in ' + pct(outcome.top3) + ' of races'}>
                    {pct(outcome.winRate)}
                  </strong>
                </div>
              </td>
              <td
                class={'rate ' + tone[outcome.spurt.tone]}
                title={outcome.spurt.label}
              >
                {pct(outcome.fullSpurtRate)}
              </td>
              <td
                class={'rate ' + tone[outcome.stamina.tone]}
                title={outcome.stamina.label +
                  (outcome.exhaustedAt != null
                    ? ', HP usually runs out from ' +
                      Math.round(outcome.exhaustedAt).toLocaleString('en-US') +
                      ' m'
                    : '')}
              >
                {outcome.exhaustedRate == null ? '—' : pct(100 - outcome.exhaustedRate)}
              </td>
              <td class="margin">
                {#if pair}
                  <span
                    class={pair.call === 'ahead' ? 'clean' : pair.call === 'behind' ? 'error' : ''}
                    title={'Finishes ahead of ' +
                      name(reference) +
                      ' in ' +
                      pct(pair.rate) +
                      ' of races'}
                  >
                    {formatMargin(pair.lengths.median, pair.seconds.median, unit)}
                  </span>
                {:else}
                  <small>Baseline</small>
                {/if}
              </td>
              <td class="finish">{formatRaceTime(outcome.finish.median, 2)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    {#if collapsible}
      <button
        type="button"
        class="more"
        aria-expanded={expanded}
        onclick={() => (expanded = !expanded)}
      >
        {expanded ? 'Show favourites and picks only' : 'Show all ' + rows.length + ' runners'}<Icon
          name="chevron"
          size={14}
        />
      </button>
    {/if}
  </ChartFrame>
</section>

<style>
  .field-overview {
    min-width: 0;
    scroll-margin-top: 8px;
  }
  .scroll {
    overflow-x: auto;
    scrollbar-width: thin;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  th,
  td {
    height: 24px;
    padding: 0 6px;
    border-top: 1px solid var(--border-subtle);
    text-align: left;
    white-space: nowrap;
    font-weight: 400;
  }
  thead th {
    height: 20px;
    border-top: 0;
    font-size: 10px;
    font-weight: 500;
    color: var(--text-secondary);
  }
  .pick {
    width: 1px;
    padding-inline: 4px;
    text-align: center;
  }
  thead .pick {
    font-size: 9px;
  }
  input {
    width: 14px;
    height: 14px;
    margin: 0;
    vertical-align: middle;
    accent-color: var(--accent-primary);
    cursor: pointer;
  }
  input:disabled {
    cursor: default;
  }
  .runner {
    width: 26%;
  }
  tbody .runner label {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    font-weight: 600;
    cursor: pointer;
  }
  .name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .dot {
    width: 8px;
    height: 8px;
    flex: none;
    border-radius: 50%;
    background: var(--runner);
  }
  small {
    font-size: 10px;
    font-weight: 400;
    color: var(--text-secondary);
  }
  .wins {
    width: 40%;
  }
  .wins > div {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .bar {
    position: relative;
    flex: 1;
    min-width: 40px;
    height: 6px;
    border-radius: 3px;
    background: var(--border-subtle);
    overflow: hidden;
  }
  .bar > span {
    position: absolute;
    inset: 0 auto 0 0;
    border-radius: 3px;
  }
  .top3 {
    background: color-mix(in srgb, var(--runner) 35%, transparent);
  }
  .win {
    background: var(--runner);
  }
  .wins strong {
    min-width: 34px;
    text-align: right;
    font-weight: 650;
  }
  .key {
    margin-left: 6px;
    font-weight: 400;
  }
  .key i {
    display: inline-block;
    width: 12px;
    height: 6px;
    margin-right: 4px;
    border-radius: 3px;
    background: color-mix(in srgb, var(--accent-primary) 35%, transparent);
    vertical-align: middle;
  }
  .rate,
  .margin,
  .finish {
    width: 1px;
    text-align: right;
  }
  .clean {
    color: var(--accent-success);
  }
  .warning {
    color: var(--accent-warning);
  }
  .error {
    color: var(--accent-error);
  }
  .rate.clean,
  .rate.warning,
  .rate.error {
    font-weight: 600;
  }
  tr.picked {
    background: color-mix(in srgb, var(--runner) 6%, transparent);
  }
  tr.baseline td:first-child {
    box-shadow: inset 2px 0 var(--accent-primary);
  }
  .more {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin: 4px 0 2px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent-primary);
    font: inherit;
    font-size: 11px;
    cursor: pointer;
  }
  .more[aria-expanded='true'] :global(svg) {
    transform: rotate(180deg);
  }
  /* Phones: every column stays on screen; the win bar gives way to the number. */
  @media (max-width: 600px) {
    .margin,
    .finish,
    .bar,
    .key,
    tbody .runner small {
      display: none;
    }
    th,
    td {
      padding-inline: 3px;
    }
    .pick {
      padding-inline: 2px;
    }
    thead .pick {
      font-size: 8px;
    }
    .wins,
    .runner {
      width: auto;
    }
    .wins strong {
      min-width: 0;
    }
    tbody .runner label {
      max-width: 110px;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 11px;
    }
    table {
      font-size: 11px;
    }
  }
</style>
