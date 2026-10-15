<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import Icon from '@/components/Icon.svelte';
  import { formatRaceTime } from '@/lib/race/replay/race-display';
  import type { PlanMarker } from '../../../setup/hp/hp-plan';
  import HpChart from './HpChart.svelte';
  import type { StaminaResult } from '../../../simulator-repository';
  import { goldRecoveryNeeded, hpBill, hpSpread, hpVerdict, type HpRunner } from './hp-needed';
  import { signed, whole } from './hp-result';
  import HpBill from './HpBill.svelte';
  import HpFinishHistogram from './HpFinishHistogram.svelte';

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
  const percent = (count: number, of: number) => (count / Math.max(1, of)) * 100 + '%';

  const spread = $derived(result && runner ? hpSpread(result, runner, forced) : undefined);
  const verdict = $derived(spread ? hpVerdict(spread, forced) : undefined);
  const bill = $derived(result ? hpBill(result) : undefined);
  const needed = $derived(spread?.needed);
  // Enough for nine races in ten, for the median race, or not even that.
  const cover = $derived.by(() => {
    if (!needed || !runner) {
      return '';
    }

    if (runner.stamina >= needed.p90) {
      return 'good';
    }

    if (runner.stamina >= needed.p50) {
      return 'warn';
    }

    return 'bad';
  });

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

  <HpFinishHistogram {result} />

  {#if distance}<HpChart
      {distance}
      {markers}
      band={result?.distribution?.hp_band}
      max={result?.max_hp}
      {decision}
    />{/if}

  <!-- The bill: the median race's HP to the spurt decision, then to the finish. -->
  {#if result && bill}<HpBill
      {bill}
      median={!!result.distribution}
      decided={!!decision}
    />
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
  @import './stamina-result.css';
</style>
