<script lang="ts">
  import InfoIcon from '@/components/feedback/InfoIcon.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Icon from '@/components/Icon.svelte';
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';
  import type { OptimizeResult, OptimizeTheory } from '../../../simulator-repository';
  import type { PricedOffer } from '../../../setup/build/skill-offers';
  import BuildColumns from './BuildColumns.svelte';
  import BuildSummary from './BuildSummary.svelte';
  import SkillScores from './SkillScores.svelte';
  import {
    inertPurchases,
    leftoverSp,
    ruledOutSkills,
    raceTally,
    searchTally,
    v5Tally,
    type TheorizedBuild,
    type TheorizedResult
  } from './build-result';

  /** Purchase recommendation first, then internal comparisons and expandable supporting detail. */
  let {
    result,
    theorized,
    offers = [],
    budget,
    where = [],
    busy = false,
    error = '',
    stale = false,
    onretry,
    onrace,
    onraceall,
    raced = [],
    onopenrace,
    raceError = '',
    raceBlocked = ''
  }: {
    result?: OptimizeResult;
    /** The result as the theory valued it, its builds the most worth first: the pick. */
    theorized?: TheorizedResult;
    /** The skills on offer the search ran with, in purchase order. */
    offers?: PricedOffer[];
    budget?: number;
    /** Where and against whom she raced, as short sentences. */
    where?: string[];
    busy?: boolean;
    error?: string;
    /** The setup changed since this search. */
    stale?: boolean;
    onretry?: () => void;
    onrace?: (build: TheorizedBuild) => void;
    onraceall?: () => void;
    /** Indices of the builds already in the field. */
    raced?: number[];
    onopenrace?: () => void;
    raceError?: string;
    raceBlocked?: string;
  } = $props();

  const THEORY_METHOD =
    'Every skill is valued by theory before any race: where its conditions let it fire on this course and how often for her, what its effect does there in her race by the game’s own speed, HP and last-spurt rules, and how her skills combine, such as a skill that waits for others to fire, a heal that only counts once her HP runs short, or two that do the same. Skills that act on the field (the start, lanes, vision, debuffs on others) are valued from recorded CM races instead. Worth is in lengths of 2.5 m over her build as it is: a build’s is its own, its skills’ synergies included, and a skill’s is what the build loses without it.';

  /** The check races measured runners beaten in real CM fields, not seconds. */
  const field = $derived(result?.objective === 'field_place');
  /** Only report a compatibility problem when neither supported result format can be read. */
  const unavailable = $derived(result !== undefined && theorized === undefined);
  const builds = $derived(theorized?.builds ?? []);
  const pickBuild = $derived(builds[0]);
  const pick = $derived(pickBuild?.finalist);

  const inertSet = $derived(inertPurchases(unavailable ? [] : result?.inert));
  /** Skills on offer that can never fire for her here, so the theory never valued them. */
  const ruledOut = $derived(ruledOutSkills(unavailable ? [] : result?.inert, offers));
  const leftover = $derived(
    leftoverSp({
      pick,
      budget,
      offers,
      inert: inertSet,
      skills: theorized?.skills ?? [],
      skillUnit: theorized?.skillUnit
    })
  );
  const buys = $derived(Boolean(pick?.build.purchases.length));
  const checkRaces = $derived(result?.validation_runs_per_finalist_per_scenario ?? 0);

  /** What the theory takes her race to be beyond her own skills, in a sentence. */
  function fieldText(theory: OptimizeTheory) {
    const f = theory.field;
    const clauses = [
      f.position_fight_seconds > 0
        ? 'she fights for the lead for ' + f.position_fight_seconds.toFixed(1) + ' s'
        : '',
      'she gets rushed in ' + Math.round(f.rushed_chance * 100) + '% of races',
      'the field takes ' +
        (f.drain_mean * 100).toFixed(1) +
        ' ± ' +
        (f.drain_spread * 100).toFixed(1) +
        '% of her HP beyond that'
    ].filter(Boolean);
    const last = clauses.pop()!;
    return 'In her race here ' + [...clauses, 'and ' + last].join(', ') + '.';
  }

  /** How it was found, behind the info button: the method, her race, where she raced and the check. */
  const about = $derived.by(() => {
    if (!result || !theorized) return THEORY_METHOD;

    if (theorized.model) return [...where, v5Tally(result, theorized.model)].join(' ');
    if (!theorized.theory) return [...where, raceTally(result)].join(' ');
    return [
      THEORY_METHOD,
      fieldText(theorized.theory),
      ...where,
      searchTally(result, theorized.theory)
    ].join(' ');
  });
</script>

{#snippet tools()}
  <InspectPopover label="About the result">
    {#snippet trigger()}
      <InfoIcon />
    {/snippet}
    <p class="about-text">{about}</p>
  </InspectPopover>
{/snippet}

<section
  class="build-result"
  class:stale={stale && !!result && !busy}
  aria-label="Result"
  aria-busy={busy}
>
  <div
    class="answer"
    class:bad={(!!error || unavailable) && !busy}
    role="status"
  >
    {#if busy}
      <p class="headline">Optimizing builds…</p>
      <p class="detail">
        Building an initial skill set, testing changes in optimization rounds, and validating the
        finalists in raced fields.
      </p>
    {:else if error}
      <p class="headline">
        <Icon
          name="warning"
          size={20}
        />Couldn’t search
      </p>
      <p class="detail">{error}</p>
      {#if onretry}
        <Button
          size="sm"
          variant="secondary"
          icon="refresh"
          onclick={onretry}
        >
          Try again
        </Button>
      {/if}
    {:else if unavailable}
      <p class="headline">
        <Icon
          name="warning"
          size={20}
        />Optimizer report unavailable
      </p>
      <p class="detail">
        {result?.model?.error ??
          'The simulator returned a report this page cannot display. Check the simulator build and search again.'}
      </p>
    {:else if result && pickBuild && pick}
      <BuildSummary
        count={pickBuild.count}
        spCost={pick.sp_cost}
        {budget}
      />
      <p class="result-note">
        Scores and win rates are internal optimization results for comparing builds in the tested
        fields. They do not predict your Uma’s performance or win rate in game.
      </p>
      {#if buys && leftover && leftover.left > 0 && !leftover.all && leftover.useless.length}
        <p class="detail">
          {leftover.useless.join(', ')}
          {leftover.useless.length === 1 ? 'shows' : 'show'} no benefit in this optimization, so {leftover.left.toLocaleString(
            'en-US'
          )}
          SP stay unspent.
        </p>
      {/if}
      {#if !buys}
        <p class="detail">The optimizer selected no additional skills for this setup.</p>
      {/if}
      {#if stale}
        <p class="stale-note">
          Setup changed since this search
          {#if onretry}
            <Button
              size="sm"
              variant="secondary"
              icon="refresh"
              onclick={onretry}
            >
              Search again
            </Button>
          {/if}
        </p>
      {/if}
    {:else if result}
      <p class="headline">No build came back</p>
      <p class="detail">Add skills on offer or raise the budget, then search again.</p>
    {:else}
      <p class="headline idle">Which skills should she buy?</p>
      <p class="detail">Set her up, add the skills on offer and press Plan skills.</p>
    {/if}
  </div>

  {#if result && theorized && pick}
    <div class="body">
      <BuildColumns
        {builds}
        skillUnit={theorized.skillUnit}
        phaseBounds={theorized.phaseBounds}
        {field}
        {checkRaces}
        {tools}
        {onrace}
        {onraceall}
        {raced}
        {onopenrace}
        {raceError}
        {raceBlocked}
      />
      <SkillScores
        skills={theorized.skills}
        {ruledOut}
        skillUnit={theorized.skillUnit}
        phaseBounds={theorized.phaseBounds}
      />
    </div>
  {/if}
</section>

<style>
  @import './build-result.css';
</style>
