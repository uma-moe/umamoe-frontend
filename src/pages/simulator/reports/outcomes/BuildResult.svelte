<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import ChartFrame from '@/components/charts/ChartFrame.svelte';
  import Icon from '@/components/Icon.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import { skillImage } from '@/lib/catalog/skill-catalog';
  import type {
    OptimizeEstimate,
    OptimizeFinalist,
    OptimizeResult
  } from '../../simulator-repository';
  import type { PricedOffer } from '../../setup/skill-offers';

  /**
   * A build search, answer first: the skills to buy within the budget and what they gain her, then what each one adds
   * to the build. Below, every skill on offer as screened (alone, and as the last one in with everything else) and the
   * builds close behind. In real CM fields a gain is runners she beats more of; with the fixed pack, seconds saved.
   */
  let {
    result,
    raw = '',
    offers = [],
    budget,
    where = '',
    busy = false,
    error = '',
    stale = false,
    onretry
  }: {
    result?: OptimizeResult;
    raw?: string;
    /** The skills on offer the search ran with, in purchase order. */
    offers?: PricedOffer[];
    budget?: number;
    /** Where she raced, in words. */
    where?: string;
    busy?: boolean;
    error?: string;
    /** The setup changed since this search. */
    stale?: boolean;
    onretry?: () => void;
  } = $props();

  /** The first optimizer that races her alone and screens every skill. */
  const SCREEN_SCHEMA = 5;
  /** Optimize responses from schema 7 leave out skills that can never fire for her. */
  const INERT_SCHEMA = 7;
  /** How sure a skill must be to cost time before the search leaves SP unspent on it (the server's rule). */
  const SURE = 3;

  let rawOpen = $state(false);
  /** She raced real CM fields, so gains are runners beaten, not seconds. */
  const field = $derived(result?.objective === 'field_place');
  /** An older service answers in a shape this page can't read honestly, so it says so instead of guessing. */
  const outdated = $derived(!!result && result.report.schema_version < SCREEN_SCHEMA);
  const finalists = $derived(outdated ? [] : (result?.report.finalists ?? []));
  const best = $derived(finalists[0]);

  /** Seconds a build saves her a race: the fresh races' estimate when there is one. */
  const gainOf = (finalist: OptimizeFinalist): OptimizeEstimate | undefined =>
    finalist.validation_gain ?? finalist.gain;
  /** `0.42 s`, signed when it costs time; in real fields `+0.42`, runners beaten. */
  const amount = (value: number) =>
    field
      ? signed(value)
      : (value < 0 ? '−' : '') +
        (Math.abs(value) < 0.005 ? '0.00' : Math.abs(value).toFixed(2)) +
        ' s';
  /** `+0.42`, for columns that say their unit once. */
  const signed = (value: number) =>
    (value < 0 ? '−' : '+') + (Math.abs(value) < 0.005 ? '0.00' : Math.abs(value).toFixed(2));
  /** Surely costs her: time with the pack, places in real fields. */
  const surelyWorse = (estimate: OptimizeEstimate) =>
    estimate.mean + SURE * estimate.standard_error < 0;
  const worse = $derived(field ? 'costs her places' : 'makes her slower');
  /** What a runner-up buys that the best does not, and the other way round. */
  function difference(finalist: OptimizeFinalist) {
    const mine = new Set(finalist.build.purchases),
      top = new Set(best?.build.purchases ?? []);
    return {
      adds: [...mine].filter((index) => !top.has(index)).map((index) => offers[index]?.skill.name),
      drops: [...top].filter((index) => !mine.has(index)).map((index) => offers[index]?.skill.name)
    };
  }

  const bought = $derived(new Set(best?.build.purchases ?? []));
  const bestGain = $derived(best ? gainOf(best) : undefined);
  /**
   * The best build's skills, each with the time it adds on its own. An upgrade replaces the skill it builds on, so the
   * two are one row: the skill she ends up with, both costs, and both gains.
   */
  const adds = $derived.by(() => {
    const steps = (best?.contributions ?? [])
      .map((step) => ({
        offers: step.purchases.map((index) => offers[index]).filter((offer) => !!offer),
        base: [] as PricedOffer[],
        gain: { ...step.gain }
      }))
      .filter((step) => step.offers.length);
    // Down each chain (a gold on its ◎ on its ○) until every skill she builds on is in the row of what replaces it.
    let merged: boolean;
    do {
      merged = false;
      for (const step of steps) {
        for (const offer of [...step.offers, ...step.base]) {
          const on = offer.buildsOn;
          if (!on || on.owned) continue;
          const lower = steps.find(
            (other) =>
              other !== step && other.offers.some((item) => item.skillId === on.skill.skill_id)
          );
          if (!lower) continue;
          step.base.push(...lower.offers, ...lower.base);
          step.gain = {
            ...step.gain,
            mean: step.gain.mean + lower.gain.mean,
            standard_error: Math.hypot(step.gain.standard_error, lower.gain.standard_error)
          };
          lower.offers = [];
          lower.base = [];
          merged = true;
        }
      }
    } while (merged);
    return steps.filter((step) => step.offers.length);
  });
  /** What rules a skill out, in words: it needs another track, distance, running style and so on. */
  const RULED_OUT: Record<string, string> = {
    track: 'another racecourse',
    distance: 'another distance',
    ground: 'another surface',
    going: 'other going',
    season: 'another season',
    weather: 'other weather',
    direction: 'the other direction',
    'race grade': 'another race grade',
    'running style': 'another running style',
    slope: 'a slope this course lacks',
    corners: 'corners this course lacks'
  };
  /** Skills on offer that can never fire for her here, left out of the search, grouped by what rules them out. */
  const inert = $derived(
    (outdated ? [] : (result?.inert ?? []))
      .map((item) => ({
        ...item,
        offer: offers[item.purchase],
        reason: item.why.map((why) => RULED_OUT[why] ?? why).join(' and ')
      }))
      .filter((item) => !!item.offer)
  );
  /** A simulator older than schema 7 never rules out skills that cannot fire for her, so it may buy them. */
  const unfiltered = $derived(!!result && !outdated && result.schema_version < INERT_SCHEMA);
  const inertSet = $derived(new Set(inert.map((item) => item.purchase)));
  const inertGroups = $derived.by(() => {
    const groups = new Map<string, string[]>();
    for (const item of inert) {
      groups.set(item.reason, [...(groups.get(item.reason) ?? []), item.offer!.skill.name]);
    }
    return [...groups].map(
      ([reason, names]) => names.join(', ') + (names.length === 1 ? ' needs ' : ' need ') + reason
    );
  });
  /** Every skill on offer as screened, the most useful first. */
  const impacts = $derived(
    (outdated ? [] : (result?.report.impacts ?? []))
      .map((impact) => ({ ...impact, offer: offers[impact.purchase] }))
      .filter((impact) => !!impact.offer)
      .sort(
        (a, b) =>
          (b.together ?? b.alone).mean - (a.together ?? a.alone).mean || a.purchase - b.purchase
      )
  );
  /** What buying an offer costs on top of the best build: its price and every skill down its chain not bought yet. */
  function chainCost(index: number): number {
    const offer = offers[index]!;
    const on = offer.buildsOn;
    const lower =
      on && !on.owned ? offers.findIndex((other) => other.skillId === on.skill.skill_id) : -1;
    return offer.cost + (lower >= 0 && !bought.has(lower) ? chainCost(lower) : 0);
  }
  /** SP the best build leaves, and the skills it could still afford: the search only skips one that surely costs. */
  const leftover = $derived.by(() => {
    if (!best || budget === undefined) return undefined;
    const left = budget - best.sp_cost;
    const affordable = offers
      .map((offer, index) => {
        if (bought.has(index) || inertSet.has(index)) return undefined;
        return chainCost(index) <= left ? index : undefined;
      })
      .filter((index): index is number => index !== undefined);
    const screened = new Map(impacts.map((impact) => [impact.purchase, impact]));
    const slower = affordable.filter((index) => {
      const impact = screened.get(index);
      return !!impact && surelyWorse(impact.together ?? impact.alone);
    });
    return {
      left,
      all: bought.size >= offers.length,
      slower: slower.map((index) => offers[index]!.skill.name),
      unexplained: affordable.length > slower.length
    };
  });
  const saves = $derived(!!best?.build.purchases.length);
  /** The impacts carry what real CM races say about each skill. */
  const evidence = $derived(impacts.some((impact) => !!impact.evidence));
  /** A value raced on fewer than every search seed stopped once more races could not change the pick. */
  const short = (estimate: OptimizeEstimate) =>
    estimate.samples < (result?.report.search_seeds.length ?? 0);
  const anyShort = $derived(
    impacts.some((impact) => short(impact.alone) || (!!impact.together && short(impact.together)))
  );
  /** How sure a raced value is, on hover. */
  const spread = (estimate: OptimizeEstimate) =>
    '± ' +
    estimate.standard_error.toFixed(2) +
    ' over ' +
    estimate.samples.toLocaleString() +
    (estimate.samples === 1 ? ' race' : ' races');
  const screen = $derived(outdated ? undefined : result?.report.screen);
  /** How much racing it took, in one line. */
  const tally = $derived.by(() => {
    if (!result || outdated) return '';
    const report = result.report;
    const fresh = report.validation_seeds.length;
    return [
      (screen?.builds ?? report.candidates_evaluated).toLocaleString() + ' builds raced',
      report.simulations.toLocaleString() + ' races',
      fresh ? 'checked on ' + fresh + ' fresh races' : ''
    ]
      .filter(Boolean)
      .join(' · ');
  });
</script>

<ChartFrame
  id="build-result"
  title="Result"
  slim
  description={field
    ? 'She races in real CM fields: CM races recorded in game, her in place of a runner of her style, one field per race and the same fields for every build. A build is judged by how many of the other eight runners she beats, counting a close finish as part of one, so field skills, blocking and debuffs count. What hundreds of thousands of CM races say each skill adds is weighed against what these races measure, so it settles what a few races cannot tell apart. The search races every skill on offer alone and taken out of the full build, picks the best combination within her SP and races the closest ones head to head. SP left at the end of a career buys nothing, so a skill is only skipped when it surely costs her places. The best few are raced again on fresh seeds against her as she is.'
    : 'She races with a fixed pack of eight runners without skills, the same for every build, so every number is the time she runs. The search races her with every skill on offer, then each skill alone and taken out of the full build, picks the best combination within her SP from those measurements, and races the closest combinations head to head, swapping skills until nothing faster is left. SP left at the end of a career buys nothing, so a skill is only skipped when it surely makes her slower. The best few are raced again on fresh seeds against her as she is.'}
>
  {#snippet actions()}{#if result && raw}<Button
        size="sm"
        variant="ghost"
        onclick={() => (rawOpen = true)}
      >
        Raw data
      </Button>{/if}{/snippet}
  <div
    class="build-result"
    class:stale={stale && !!result && !busy}
    aria-busy={busy}
  >
    <div
      class="answer"
      class:bad={(!!error || outdated) && !busy}
      role="status"
    >
      {#if busy}
        <p class="headline">Searching builds…</p>
        <p class="detail">
          Racing her with every skill on offer, then the best combinations; this can take a minute.
        </p>
      {:else if error}
        <p class="headline">
          <Icon
            name="warning"
            size={20}
          />Couldn’t search
        </p>
        <p class="detail">{error}</p>
        {#if onretry}<Button
            size="sm"
            variant="secondary"
            icon="refresh"
            onclick={onretry}
          >
            Try again
          </Button>{/if}
      {:else if outdated}
        <p class="headline">
          <Icon
            name="warning"
            size={20}
          />Optimizer out of date
        </p>
        <p class="detail">
          The simulator service answering this page is an older build: it races her against other
          runners and can’t measure what each skill saves her. Rebuild and restart it, then search
          again.
        </p>
      {:else if result && best}
        <p class="headline">
          {saves
            ? 'Buy ' + adds.length + (adds.length === 1 ? ' skill' : ' skills')
            : 'Buying nothing scores best'}
        </p>
        {#if saves}
          <p class="spend">
            <strong>{best.sp_cost.toLocaleString()} SP</strong>
            {#if budget}of {budget.toLocaleString()} · {(budget - best.sp_cost).toLocaleString()} left{/if}
          </p>
          {#if bestGain && field}<p class="metric">
              Beats <strong>{Math.abs(bestGain.mean).toFixed(2)}</strong>
              {bestGain.mean < 0 ? 'fewer' : 'more'} of the 8 runners a race
              <small>± {bestGain.standard_error.toFixed(2)}</small>
            </p>{:else if bestGain}<p class="metric">
              Saves <strong>{amount(bestGain.mean)}</strong>
              a race
              <small>± {bestGain.standard_error.toFixed(2)}</small>
            </p>{/if}
          {#if leftover && leftover.left > 0}<p class="detail">
              {leftover.all
                ? 'Buys everything on offer.'
                : leftover.slower.length
                  ? 'Leaves ' +
                    leftover.left.toLocaleString() +
                    ' SP: ' +
                    leftover.slower.join(', ') +
                    (leftover.slower.length === 1 ? ' ' : ' all ') +
                    worse +
                    '.'
                  : leftover.unexplained
                    ? 'Leaves ' + leftover.left.toLocaleString() + ' SP.'
                    : 'Nothing else on offer fits the ' +
                      leftover.left.toLocaleString() +
                      ' SP left.'}
            </p>{/if}
          {#if inert.length}<p class="detail">
              Left out because they can never fire for her here: {inertGroups.join('; ')}.
            </p>{/if}
          {#if unfiltered}<p class="detail">
              The simulator answering is an older build that can buy skills which never fire for her
              here (another running style, distance or track). Rebuild and restart it to rule those
              out.
            </p>{/if}
        {:else}
          <p class="detail">
            {leftover?.slower.length
              ? 'Every skill she can afford ' + worse + ' in these races, so she keeps the SP.'
              : field
                ? 'None of the skills on offer beat more runners in these races.'
                : 'None of the skills on offer saved her any time in these races.'}
          </p>
        {/if}
        {#if adds.length}<ol
            class="buy"
            aria-label="Skills to buy"
          >
            {#each adds as step, index (index)}
              <li>
                <span class="icons">
                  {#each step.offers as offer (offer.skillId)}<img
                      src={skillImage(offer.skill.icon)}
                      alt=""
                      width="22"
                      height="22"
                    />{/each}
                </span>
                <span class="name">
                  {step.offers.map((offer) => offer.skill.name).join(' + ')}
                  {#if step.base.length}<small class="via">
                      via {step.base.map((offer) => offer.skill.name).join(', ')}
                    </small>{/if}
                </span>
                <small>
                  {[...step.offers, ...step.base].reduce((sum, offer) => sum + offer.cost, 0)} SP
                </small>
                <span
                  class="gain"
                  class:loss={step.gain.mean < 0}
                  title={(field ? 'Runners it beats more of' : 'Time it adds') +
                    ' on its own; an upgrade counts with the skill it replaces'}
                >
                  {signed(step.gain.mean)}{field ? '' : ' s'}
                </span>
              </li>
            {/each}
          </ol>{/if}
        {#if stale}<p class="stale-note">
            Setup changed since this search
            {#if onretry}<Button
                size="sm"
                variant="secondary"
                icon="refresh"
                onclick={onretry}
              >
                Search again
              </Button>{/if}
          </p>{/if}
      {:else if result}
        <p class="headline">No build came back</p>
        <p class="detail">Add skills on offer or raise the budget, then search again.</p>
      {:else}
        <p class="headline idle">Which skills should she buy?</p>
        <p class="detail">Set her up, add the skills on offer and press Find the best build.</p>
      {/if}
    </div>

    {#if finalists.length > 1}
      <section
        class="others"
        aria-label="Close behind"
      >
        <h3>Close behind</h3>
        <ol>
          {#each finalists.slice(1) as finalist, index}
            {@const change = difference(finalist)}
            {@const gain = gainOf(finalist)}
            <li>
              <span class="place">{index + 2}</span>
              <span class="change">
                {#each change.adds as name}<span class="add">+ {name}</span>{/each}
                {#each change.drops as name}<span class="drop">− {name}</span>{/each}
                {#if !change.adds.length && !change.drops.length}<span>Same skills</span>{/if}
              </span>
              <span class="numbers">
                <strong>{gain ? amount(gain.mean) : '—'}</strong>
                <small>{finalist.sp_cost.toLocaleString()} SP</small>
              </span>
            </li>
          {/each}
        </ol>
      </section>
    {/if}

    {#if impacts.length || inert.length}
      <section
        class="impacts"
        aria-label="Every skill on offer"
      >
        <h3>Every skill on offer</h3>
        <p class="note">
          {field ? 'Runners each one beats more of' : 'Seconds each saves her'}: bought alone, and
          as the last one in with everything else on offer.
          {#if evidence}CM is what recorded CM races say it adds, before any race here.{/if}
          {#if anyShort}Grey values stopped racing early, once more races could not change the pick.{/if}
          {#if screen}With everything ({screen.full_cost.toLocaleString()} SP) {field
              ? 'she beats ' +
                Math.abs(screen.full.mean).toFixed(2) +
                (screen.full.mean < 0 ? ' fewer' : ' more') +
                ' runners'
              : 'she saves ' + amount(screen.full.mean)}.{/if}
        </p>
        <div
          class="impact-table"
          role="table"
          aria-label="Skill impacts"
        >
          <div
            class="impact-row head"
            class:evidence
            role="row"
          >
            <span
              class="skill"
              role="columnheader"
            >
              Skill
            </span>
            <span role="columnheader">Alone</span>
            <span role="columnheader">With all</span>
            {#if evidence}<span role="columnheader">CM</span>{/if}
          </div>
          {#each impacts as impact (impact.purchase)}
            <div
              class="impact-row"
              class:bought={bought.has(impact.purchase)}
              class:evidence
              role="row"
            >
              <span
                class="skill"
                role="cell"
              >
                <img
                  src={skillImage(impact.offer!.skill.icon)}
                  alt=""
                  width="18"
                  height="18"
                />
                <span>{impact.offer!.skill.name}</span>
                {#if bought.has(impact.purchase)}<Icon
                    name="check"
                    size={14}
                    label="Bought"
                  />{/if}
              </span>
              <span
                role="cell"
                class:short={short(impact.alone)}
                class:loss={surelyWorse(impact.alone)}
                title={spread(impact.alone)}
              >
                {signed(impact.alone.mean)}
              </span>
              <span
                role="cell"
                class:short={!!impact.together && short(impact.together)}
                class:loss={!!impact.together && surelyWorse(impact.together)}
                title={impact.together ? spread(impact.together) : undefined}
              >
                {impact.together ? signed(impact.together.mean) : '—'}
              </span>
              {#if evidence}<span
                  role="cell"
                  class="cm"
                  title={impact.evidence
                    ? 'What recorded CM races say it adds, ± ' + impact.evidence.error.toFixed(2)
                    : undefined}
                >
                  {impact.evidence ? signed(impact.evidence.mean) : '—'}
                </span>{/if}
            </div>
          {/each}
          {#each inert as item (item.purchase)}
            <div
              class="impact-row inert"
              class:evidence
              role="row"
            >
              <span
                class="skill"
                role="cell"
              >
                <img
                  src={skillImage(item.offer!.skill.icon)}
                  alt=""
                  width="18"
                  height="18"
                />
                <span>{item.offer!.skill.name}</span>
              </span>
              <span
                role="cell"
                class="never"
              >
                Never fires here: needs {item.reason}
              </span>
            </div>
          {/each}
        </div>
      </section>
    {/if}

    {#if result}<p class="fine">
        {#if where && !outdated}{where}
          <br />{/if}
        {tally}
      </p>{/if}
  </div>
</ChartFrame>

<Dialog
  bind:open={rawOpen}
  title="Raw optimizer response"
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
  /* The frame's chart height is for charts; this is text, so it takes only what it needs. */
  :global(.chart-frame .plot:has(> .build-result)) {
    min-height: 0;
  }
  .build-result {
    display: grid;
    gap: 12px;
    min-width: 0;
  }
  .answer {
    display: grid;
    gap: 4px;
    justify-items: start;
  }
  .answer p {
    margin: 0;
  }
  .headline {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 24px;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.2;
    color: var(--text-primary);
  }
  .headline.idle {
    font-size: 17px;
    font-weight: 650;
  }
  .bad .headline {
    color: var(--accent-error);
  }
  .detail,
  .spend,
  .metric {
    font-size: 13px;
    color: var(--text-secondary);
  }
  .spend strong,
  .metric strong {
    color: var(--text-primary);
    font-variant-numeric: tabular-nums;
  }
  .metric strong {
    font-size: 18px;
    color: var(--accent-success);
  }
  .metric small {
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
  }
  .answer :global(.ui-button) {
    margin-top: 6px;
  }
  .buy {
    display: grid;
    gap: 4px;
    width: 100%;
    margin: 6px 0 0;
    padding: 0;
    list-style: none;
  }
  .buy li {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto 56px;
    align-items: center;
    gap: 8px;
    padding: 4px 8px;
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    background: var(--surface-2);
    font-size: 12px;
    font-weight: 600;
  }
  .buy .icons {
    display: flex;
    gap: 2px;
  }
  .buy img {
    width: 22px;
    height: 22px;
    object-fit: contain;
  }
  .buy small {
    font-weight: 400;
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
  }
  .buy .gain {
    color: var(--accent-success);
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
  .buy .gain.loss {
    color: var(--text-secondary);
  }
  .answer .stale-note {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px 10px;
    margin-top: 6px;
    font-size: 12px;
    color: var(--accent-warning);
  }
  .answer .stale-note :global(.ui-button) {
    margin-top: 0;
  }
  .stale .spend,
  .stale .metric,
  .stale .buy,
  .stale .others {
    opacity: 0.5;
  }
  .impacts h3 {
    margin: 0 0 2px;
    font-size: 12px;
    font-weight: 650;
    color: var(--text-secondary);
  }
  .impacts .note {
    margin: 0 0 6px;
    font-size: 11px;
    color: var(--text-secondary);
  }
  .impact-table {
    display: grid;
    font-size: 12px;
  }
  .impact-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 52px 60px;
    align-items: center;
    gap: 8px;
    padding: 3px 0;
    border-top: 1px solid var(--border-subtle);
    font-variant-numeric: tabular-nums;
  }
  .impact-row.evidence {
    grid-template-columns: minmax(0, 1fr) 52px 60px 52px;
  }
  .impact-row > span:not(.skill) {
    text-align: right;
  }
  /* Evidence from recorded races, set apart from what this search raced. */
  .impact-row .cm {
    color: var(--text-secondary);
  }
  /* A skill that cannot fire here: its reason spans the number columns. */
  .impact-row.inert {
    color: var(--text-secondary);
  }
  .impact-row .never {
    grid-column: 2 / -1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .impact-row.head {
    border-top: 0;
    font-size: 11px;
    color: var(--text-secondary);
  }
  .impact-row .skill {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .impact-row .skill span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .impact-row .skill img {
    flex: none;
    width: 18px;
    height: 18px;
    object-fit: contain;
  }
  .impact-row .skill :global(svg) {
    flex: none;
    color: var(--accent-success);
  }
  .impact-row.bought .skill span {
    font-weight: 650;
  }
  /* Raced only until more races could not change the pick. */
  .impact-row .short {
    color: var(--text-secondary);
  }
  .impact-row .loss {
    color: var(--accent-error);
  }
  .stale .impacts {
    opacity: 0.5;
  }
  .others h3 {
    margin: 0 0 6px;
    font-size: 12px;
    font-weight: 650;
    color: var(--text-secondary);
  }
  .others ol {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .others li {
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr) auto;
    align-items: start;
    gap: 8px;
    padding: 6px 0;
    border-top: 1px solid var(--border-subtle);
    font-size: 12px;
  }
  .place {
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
  }
  .change {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 8px;
    min-width: 0;
  }
  .add {
    color: var(--accent-success);
  }
  .drop {
    color: var(--accent-error);
  }
  .numbers {
    display: grid;
    justify-items: end;
    font-variant-numeric: tabular-nums;
  }
  .numbers small {
    color: var(--text-secondary);
  }
  .fine {
    margin: 0;
    font-size: 11px;
    color: var(--text-secondary);
  }
  .via {
    margin-left: 6px;
    font-size: 11px;
    font-weight: 400;
    color: var(--text-secondary);
  }
  pre {
    max-height: 60dvh;
    overflow: auto;
    font-size: 11px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
</style>
