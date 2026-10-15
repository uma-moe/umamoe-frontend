<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import ChartFrame from '@/components/charts/ChartFrame.svelte';
  import Icon from '@/components/Icon.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import { skillImage } from '@/lib/game-data/skills/skills';
  import type { OptimizeResult } from '../../../simulator-repository';
  import type { PricedOffer } from '../../../setup/build/skill-offers';
  import BuildResultFinalists from './BuildResultFinalists.svelte';
  import BuildResultImpacts from './BuildResultImpacts.svelte';
  import {
    INERT_SCHEMA,
    SCREEN_SCHEMA,
    amount as formatAmount,
    buildAdds,
    gainOf,
    inertGroups,
    inertOffers,
    leftoverSp,
    screenedImpacts,
    searchTally,
    signed
  } from './build-result';

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

  let rawOpen = $state(false);
  /** She raced real CM fields, so gains are runners beaten, not seconds. */
  const field = $derived(result?.objective === 'field_place');
  /** An older service answers in a shape this page can't read honestly, so it says so instead of guessing. */
  const outdated = $derived(result !== undefined && result.report.schema_version < SCREEN_SCHEMA);
  const finalists = $derived(outdated ? [] : (result?.report.finalists ?? []));
  const best = $derived(finalists[0]);
  const amount = (value: number) => formatAmount(value, field);
  const worse = $derived(field ? 'costs her places' : 'makes her slower');

  const bought = $derived(new Set(best?.build.purchases ?? []));
  const bestGain = $derived(best ? gainOf(best) : undefined);
  const adds = $derived(buildAdds(best, offers));
  /** Skills on offer that can never fire for her here, left out of the search, grouped by what rules them out. */
  const inert = $derived(inertOffers(outdated ? [] : result?.inert, offers));
  /** A simulator older than schema 7 never rules out skills that cannot fire for her, so it may buy them. */
  const unfiltered = $derived(
    result !== undefined && !outdated && result.schema_version < INERT_SCHEMA
  );

  const inertSet = $derived(new Set(inert.map((item) => item.purchase)));
  const inertReasons = $derived(inertGroups(inert));
  const impacts = $derived(screenedImpacts(outdated ? [] : result?.report.impacts, offers));
  const leftover = $derived(leftoverSp(best, budget, offers, bought, inertSet, impacts));
  const saves = $derived(Boolean(best?.build.purchases.length));
  const screen = $derived(outdated ? undefined : result?.report.screen);
  const tally = $derived(!result || outdated ? '' : searchTally(result));
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
              Left out because they can never fire for her here: {inertReasons.join('; ')}.
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
      <BuildResultFinalists
        {finalists}
        {offers}
        {field}
      />
    {/if}

    {#if impacts.length || inert.length}
      <BuildResultImpacts
        {impacts}
        {inert}
        {bought}
        {field}
        {screen}
        seeds={result?.report.search_seeds.length ?? 0}
      />
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
  @import './build-result.css';
</style>
