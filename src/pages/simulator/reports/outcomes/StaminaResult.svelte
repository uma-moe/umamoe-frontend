<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import Icon from '@/components/Icon.svelte';
  import { formatRaceTime } from '@/lib/race/race-display';
  import type { PlanMarker } from '../../setup/hp/hp-plan';
  import HpChart from './HpChart.svelte';
  import type { StaminaResult } from '../../simulator-repository';
  import {
    goldRecoveryNeeded,
    hpBill,
    hpRaces,
    hpSpread,
    hpVerdict,
    type HpBillLine,
    type HpRunner
  } from './hp-needed';

  /**
   * One HP calculation over many races, answer first: how often she holds a full last spurt; the stamina that takes
   * and how the worst races go; her HP across the course; then where her HP goes in the median race.
   */
  let {
    result,
    raw = '',
    forced = false,
    busy = false,
    pending = false,
    error = '',
    oncalculate,
    blocked = '',
    runner,
    markers = [],
    distance
  }: {
    result?: StaminaResult;
    raw?: string;
    forced?: boolean;
    busy?: boolean;
    /** The inputs changed and a new result is on its way. */
    pending?: boolean;
    /** Why the last calculation failed, shown in place of the answer. */
    error?: string;
    /** Calculates: the first time, and after an error. */
    oncalculate?: () => void;
    /** Why it cannot calculate yet. */
    blocked?: string;
    /** Stamina with green skills (and `base` without them), running style and motivation the result used. */
    runner?: HpRunner & { base?: number };
    /** Where her skills and the situations between runners can happen, for the lanes under the chart. */
    markers?: PlanMarker[];
    distance?: number;
  } = $props();

  let rawOpen = $state(false);
  /** The smallest of 1, 2, 5, 10, 20, 50 … that is at least `value`. */
  const nice = (value: number) => {
    const power = 10 ** Math.floor(Math.log10(Math.max(1, value)));
    return [1, 2, 5, 10].map((step) => step * power).find((step) => step >= value) ?? 10 * power;
  };
  // HP at the finish over every race, in about 40 bins of a round width, so a narrow spread still shows its shape:
  // below zero is what she was short when it ran out. Round values along the bottom say where the bars are.
  const histogram = $derived.by(() => {
    if (!result?.distribution) return undefined;
    const values = hpRaces(result).map((race) => Math.round(race.finish));
    const low = Math.min(...values),
      high = Math.max(...values);
    const step = nice((high - low + 1) / 40),
      start = Math.floor(low / step) * step,
      end = (Math.floor(high / step) + 1) * step;
    const counts = Array.from({ length: (end - start) / step }, (_, index) => ({
      from: start + index * step,
      count: 0
    }));
    for (const value of values) counts[Math.floor((value - start) / step)]!.count++;
    const every = nice((end - start) / 5),
      ticks: number[] = [];
    for (let at = Math.ceil(start / every) * every; at <= end; at += every)
      // Clear of the lowest and highest values at the ends.
      if ((at - start) / (end - start) > 0.1 && (at - start) / (end - start) < 0.86)
        ticks.push(at || 0);
    return {
      counts,
      step,
      start,
      end,
      low,
      high,
      ticks,
      top: Math.max(...counts.map((bin) => bin.count)),
      races: values.length
    };
  });
  const whole = (value: number | null | undefined) =>
    value == null || !Number.isFinite(value) ? '—' : Math.round(value).toLocaleString();
  const signed = (value: number) =>
    (Math.round(value) > 0 ? '+' : Math.round(value) < 0 ? '−' : '') + whole(Math.abs(value));
  const percent = (count: number, of: number) => (count / Math.max(1, of)) * 100 + '%';

  const spread = $derived(result && runner ? hpSpread(result, runner, forced) : undefined);
  const verdict = $derived(spread ? hpVerdict(spread, forced) : undefined);
  const bill = $derived(result ? hpBill(result) : undefined);
  const needed = $derived(spread?.needed);
  // Enough for nine races in ten, for the median race, or not even that.
  const cover = $derived(
    !needed || !runner
      ? ''
      : runner.stamina >= needed.p90
        ? 'good'
        : runner.stamina >= needed.p50
          ? 'warn'
          : 'bad'
  );
  // Short in the worst races: the same HP as gold recovery skills, when a few would do.
  const golds = $derived(
    spread?.spare && result ? goldRecoveryNeeded(-spread.spare.p10, result.max_hp) : undefined
  );
  const decision = $derived(
    result && result.check_hp[0] != null && result.spurt_calculation_distances[0] != null
      ? {
          at: result.spurt_calculation_distances[0]!,
          check: result.check_hp[0]!,
          need: result.full_spurt_need_hp[0]!
        }
      : undefined
  );

  /** HP at the finish, or what she was short when it ran out. */
  const left = (value: number) => whole(Math.abs(value)) + (value < 0 ? ' HP short' : ' HP left');
</script>

{#snippet line(item: HpBillLine)}
  <tr
    class:start={item.start}
    class:total={item.total}
    class:plus={!item.start && !item.total && item.hp > 0}
  >
    <th scope="row">{item.label}</th>
    <td>{item.start || item.total ? whole(item.hp) : signed(item.hp)}</td>
  </tr>
{/snippet}

<div
  class="hp-result"
  aria-busy={busy}
>
  <header class="top">
    <h2>Result</h2>
    {#if pending && result && !error}<span class="updating">Updating…</span>{/if}
    {#if result && raw}<Button
        size="sm"
        variant="ghost"
        onclick={() => (rawOpen = true)}
      >
        Raw data
      </Button>{/if}
  </header>

  <!-- The answer: how often she holds a full spurt, and why. -->
  <div
    class="answer {error && !busy ? 'bad' : (verdict?.tone ?? '')}"
    role="status"
  >
    {#if error && !busy}
      <p class="title">
        <Icon
          name="warning"
          size={18}
        />Couldn’t calculate
      </p>
      <p class="detail">{error}</p>
    {:else if verdict && spread}
      <p class="title">
        <Icon
          name={verdict.tone === 'good' ? 'check' : 'warning'}
          size={18}
        />{verdict.title}
      </p>
      <p class="detail">{verdict.detail}</p>
      {#if spread.races > 1}<div
          class="split"
          aria-hidden="true"
        >
          <i
            class="full"
            style:width={percent(spread.full, spread.races)}
          ></i>
          <i
            class="reduced"
            style:width={percent(spread.reduced, spread.races)}
          ></i>
          <i
            class="none"
            style:width={percent(spread.none, spread.races)}
          ></i>
        </div>{/if}
    {:else}
      <p class="title idle">Does her HP last a full last spurt?</p>
      <p class="detail">
        {blocked ||
          (busy
            ? 'Racing her 100 times…'
            : 'Races her 100 times on this course. After the first time, the result follows every change.')}
      </p>
    {/if}
    {#if (!result || (error && !busy)) && oncalculate}<Button
        icon={error ? 'refresh' : 'battery'}
        variant={error ? 'secondary' : 'primary'}
        loading={busy}
        onclick={oncalculate}
      >
        {error ? 'Try again' : 'Calculate HP'}
      </Button>{/if}
  </div>

  <!-- What it takes, and how the worst races go. -->
  {#if spread && result}<dl class="facts">
      <div class={cover}>
        <dt>Stamina needed</dt>
        <dd>
          {#if needed}<strong>≈ {whole(needed.p50)}</strong>
            <small>
              {whole(needed.p90)} for 9 in 10 · has {whole(runner?.stamina)}
            </small>{:else}—{/if}
        </dd>
      </div>
      {#if spread.races > 1 && spread.spare}<div>
          <dt>Worst 1 in 10</dt>
          <dd>
            <strong class:bad={spread.spare.p10 < 0}>{signed(spread.spare.p10)}</strong>
            <small>at the decision ·</small>
            <strong class:bad={spread.finish.p10 < 0}>{left(spread.finish.p10)}</strong>
          </dd>
        </div>{/if}
      <div>
        <dt>Finish time</dt>
        <dd>
          <strong>{formatRaceTime(spread.time, 2)}</strong>
          {#if spread.races > 1}<small>
              median{spread.rushed ? ' · rushed in ' + spread.rushed + ' races' : ''}
            </small>{/if}
        </dd>
      </div>
    </dl>{/if}

  <!-- How her HP at the finish spreads over the races. -->
  {#if histogram}<figure class="histogram">
      <figcaption>HP at the finish, {histogram.races} races</figcaption>
      <div
        class="bars"
        role="img"
        aria-label={'HP at the finish: ' +
          histogram.counts.map((bin) => bin.count + ' races from ' + bin.from).join(', ')}
      >
        {#each histogram.counts as bin}<i
            class:short={bin.from + histogram.step <= 0}
            style:height={(bin.count / histogram.top) * 100 + '%'}
            title={bin.count +
              (bin.count === 1 ? ' race: ' : ' races: ') +
              (histogram.step === 1
                ? bin.from.toLocaleString()
                : bin.from.toLocaleString() +
                  ' to ' +
                  (bin.from + histogram.step - 1).toLocaleString()) +
              ' HP'}
          ></i>{/each}
      </div>
      <div class="ends">
        <span>{histogram.low.toLocaleString()}</span>
        {#each histogram.ticks as tick}<span
            class="tick"
            style:left={((tick - histogram.start) / (histogram.end - histogram.start)) * 100 + '%'}
          >
            {tick.toLocaleString()}
          </span>{/each}
        <span>{histogram.high.toLocaleString()} HP</span>
      </div>
    </figure>{/if}

  {#if distance}<HpChart
      {distance}
      {markers}
      band={result?.distribution?.hp_band}
      max={result?.max_hp}
      {decision}
    />{/if}

  <!-- The bill: the median race's HP to the spurt decision, then to the finish. -->
  {#if result && bill}<div class="bill">
      <h3>{result.distribution ? 'Where her HP goes in the median race' : 'Where her HP goes'}</h3>
      <table>
        <caption>{bill.after.length ? 'To the spurt decision' : 'The whole race'}</caption>
        <tbody>
          {#each bill.before as item}{@render line(item)}{/each}
          {#if bill.decision && decision}<tr class="decision">
              <th scope="row">Full spurt needs</th>
              <td>{whole(bill.decision.need)}</td>
            </tr>{/if}
        </tbody>
      </table>
      {#if bill.after.length}<table>
          <caption>The last spurt</caption>
          <tbody>
            {#each bill.after as item}{@render line(item)}{/each}
          </tbody>
        </table>{/if}
    </div>
    {#if cover && cover !== 'good' && needed && runner}<p class="fix">
        For a full spurt in 9 races in 10: about {whole(needed.p90 - runner.stamina)} more stamina{golds &&
        golds <= 3
          ? ', or ' + golds + ' more gold recovery skill' + (golds > 1 ? 's' : '') + ' in mid race'
          : ''}.
      </p>{/if}
    <p class="fine">
      {spread && spread.races > 1 ? spread.races + ' races' : 'One race'} on her own at base speed, each
      rolling her pace, where her skills land and whether she gets rushed{forced
        ? ', with the last spurt forced to full'
        : ''}.
    </p>{/if}
</div>

<Dialog
  bind:open={rawOpen}
  title="Raw simulator response"
  maxWidth="900px"
  maxHeight="90dvh"
>
  <pre>{raw}</pre>
  {#snippet actions()}
    <Button
      variant="secondary"
      onclick={() => (rawOpen = false)}
    >
      Close
    </Button>
  {/snippet}
</Dialog>

<style>
  .hp-result {
    display: grid;
    gap: 10px;
    min-width: 0;
  }
  /* Wide, as under the form: the answer and its numbers on the left, the course and the bill on the right. */
  @container hp-result (min-width: 900px) {
    .hp-result {
      grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
      column-gap: 24px;
      align-items: start;
      align-content: start;
    }
    .hp-result > * {
      grid-column: 1;
    }
    .hp-result > :global(.hp-chart) {
      grid-column: 2;
      grid-row: 1 / span 3;
    }
    .hp-result > .bill {
      grid-column: 2;
      grid-row: 4 / span 4;
    }
  }
  @supports (container-type: inline-size) {
    .hp-result {
      grid-auto-flow: row dense;
    }
  }
  .top {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 28px;
  }
  .top h2 {
    flex: 1;
    margin: 0;
    font-size: 14px;
    font-weight: 650;
  }
  .top :global(.ui-button) {
    height: 28px;
    min-height: 28px;
    font-size: 11px;
  }
  .updating {
    font-size: 11px;
    color: var(--text-secondary);
  }
  .updating:before {
    content: '';
    display: inline-block;
    width: 6px;
    height: 6px;
    margin-right: 5px;
    border-radius: 50%;
    background: var(--accent-primary);
    vertical-align: middle;
    animation: pulse 0.9s ease-in-out infinite alternate;
  }
  @keyframes pulse {
    from {
      opacity: 0.25;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .updating:before {
      animation: none;
    }
  }
  /* The answer leads: what she does, then why, then how the races split. */
  .answer {
    display: grid;
    gap: 3px;
    justify-items: start;
  }
  .answer p {
    margin: 0;
  }
  .title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 19px;
    font-weight: 700;
    letter-spacing: -0.01em;
    line-height: 1.2;
  }
  .title.idle {
    font-size: 15px;
    font-weight: 650;
  }
  .good .title {
    color: var(--accent-success);
  }
  .warn .title {
    color: var(--accent-warning);
  }
  .bad .title {
    color: var(--accent-error);
  }
  .detail {
    font-size: 12px;
    color: var(--text-secondary);
  }
  .answer :global(.ui-button) {
    margin-top: 6px;
  }
  /* Full, slower and no spurt, as shares of the races. */
  .split {
    display: flex;
    width: 100%;
    height: 6px;
    margin-top: 5px;
    overflow: hidden;
    border-radius: 3px;
    background: var(--surface-2);
  }
  .split i {
    display: block;
  }
  .split .full {
    background: var(--accent-success);
  }
  .split .reduced {
    background: var(--accent-warning);
  }
  .split .none {
    background: var(--accent-error);
  }
  /* A few facts, a line each. */
  .facts {
    display: grid;
    margin: 0;
    border-top: 1px solid var(--border-subtle);
  }
  .facts > div {
    display: grid;
    grid-template-columns: 104px minmax(0, 1fr);
    align-items: baseline;
    gap: 8px;
    padding: 4px 0;
    border-bottom: 1px solid var(--border-subtle);
  }
  .facts dt {
    font-size: 12px;
    color: var(--text-secondary);
  }
  .facts dd {
    margin: 0;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .facts strong {
    font-size: 14px;
    font-weight: 700;
  }
  .facts small {
    font-size: 11px;
    color: var(--text-secondary);
  }
  .facts .good strong {
    color: var(--accent-success);
  }
  .facts .warn strong {
    color: var(--accent-warning);
  }
  .facts .bad strong,
  .facts strong.bad {
    color: var(--accent-error);
  }
  /* The bill: the two parts of the race side by side. */
  .bill {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px 16px;
    align-items: start;
  }
  .bill h3 {
    grid-column: 1 / -1;
    margin: 0;
    font-size: 12px;
    font-weight: 650;
  }
  .bill table:only-of-type {
    grid-column: 1 / -1;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  caption {
    padding-bottom: 2px;
    border-bottom: 1px solid var(--border-subtle);
    font-size: 11px;
    color: var(--text-secondary);
    text-align: left;
  }
  th,
  td {
    padding: 2px 0;
    font-weight: 400;
    text-align: left;
    white-space: nowrap;
  }
  td {
    padding-left: 8px;
    text-align: right;
  }
  .plus td {
    color: var(--accent-success);
  }
  .start th,
  .start td,
  .decision th,
  .decision td {
    color: var(--text-secondary);
  }
  .total th,
  .total td {
    border-top: 1px solid var(--border-primary);
    font-weight: 700;
  }
  .fix,
  .fine {
    margin: 0;
    font-size: 12px;
  }
  .fine {
    font-size: 11px;
    color: var(--text-secondary);
  }
  .histogram {
    display: grid;
    gap: 3px;
    margin: 0;
  }
  .histogram figcaption {
    font-size: 11px;
    color: var(--text-secondary);
  }
  .bars {
    display: flex;
    align-items: flex-end;
    gap: 1px;
    height: 56px;
    border-bottom: 1px solid var(--border-primary);
  }
  .bars i {
    flex: 1;
    min-height: 1px;
    border-radius: 2px 2px 0 0;
    background: var(--accent-primary);
  }
  .bars i.short {
    background: var(--accent-error);
  }
  .ends {
    position: relative;
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
  }
  .ends .tick {
    position: absolute;
    transform: translateX(-50%);
  }
  pre {
    font-size: 11px;
    max-height: 60dvh;
    overflow: auto;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
</style>
