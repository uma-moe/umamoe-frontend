<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import Icon from '@/components/Icon.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
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
    searchTally,
    type TheorizedResult
  } from './build-result';

  /**
   * A theorized build, answer first: how many skills to buy, their SP and what they are worth to her. Under it the
   * builds the theory found as cards of their skills, side by side, the most worth first (by her win rate in races of
   * her real fields when races ranked them), each skill by what it adds; then every skill on offer by what it is worth
   * on her own. How the theory valued them opens from the info button beside the builds.
   */
  let {
    result,
    theorized,
    raw = '',
    offers = [],
    budget,
    where = [],
    busy = false,
    error = '',
    stale = false,
    onretry
  }: {
    result?: OptimizeResult;
    /** The result as the theory valued it, its builds the most worth first: the pick. */
    theorized?: TheorizedResult;
    raw?: string;
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
  } = $props();

  const THEORY_METHOD =
    'Every skill is valued by theory before any race: where its conditions let it fire on this course and how often for her, what its effect does there in her race by the game’s own speed, HP and last-spurt rules, and how her skills combine, such as a skill that waits for others to fire, a heal that only counts once her HP runs short, or two that do the same. Skills that act on the field (the start, lanes, vision, debuffs on others) are valued from recorded CM races instead. Worth is in lengths of 2.5 m over her build as it is: a build’s is its own, its skills’ synergies included, and a skill’s is what the build loses without it.';

  let rawOpen = $state(false);

  /** The check races measured runners beaten in real CM fields, not seconds. */
  const field = $derived(result?.objective === 'field_place');
  /** An older service answers without a theory, so the page says so instead of guessing. */
  const outdated = $derived(result !== undefined && theorized === undefined);
  const builds = $derived(theorized?.builds ?? []);
  const pickBuild = $derived(builds[0]);
  const pick = $derived(pickBuild?.finalist);

  const inertSet = $derived(inertPurchases(outdated ? [] : result?.inert));
  /** Skills on offer that can never fire for her here, so the theory never valued them. */
  const ruledOut = $derived(ruledOutSkills(outdated ? [] : result?.inert, offers));
  const leftover = $derived(
    leftoverSp({ pick, budget, offers, inert: inertSet, skills: theorized?.skills ?? [] })
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
      <span class="about">
        <Icon
          name="info"
          size={14}
        />
      </span>
    {/snippet}
    <p class="about-text">{about}</p>
  </InspectPopover>
  {#if raw}
    <Button
      size="sm"
      variant="ghost"
      onclick={() => (rawOpen = true)}
    >
      Raw data
    </Button>
  {/if}
{/snippet}

<section
  class="build-result"
  class:stale={stale && !!result && !busy}
  aria-label="Result"
  aria-busy={busy}
>
  <div
    class="answer"
    class:bad={(!!error || outdated) && !busy}
    role="status"
  >
    {#if busy}
      <p class="headline">Theorizing builds…</p>
      <p class="detail">
        Working out where each skill fires on this course and what it adds, then racing the best
        builds against each other in her real CM fields; this takes up to half a minute.
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
    {:else if outdated}
      <p class="headline">
        <Icon
          name="warning"
          size={20}
        />Optimizer out of date
      </p>
      <p class="detail">
        The simulator service answering this page is an older build: it can’t theorize what skills
        are worth. Rebuild and restart it, then search again.
      </p>
    {:else if result && pickBuild && pick}
      <BuildSummary
        count={pickBuild.count}
        spCost={pick.sp_cost}
        {budget}
        lengths={pickBuild.lengths}
        winRate={pickBuild.raced?.win_rate}
      />
      {#if buys && leftover && leftover.left > 0 && !leftover.all && leftover.useless.length}
        <p class="detail">
          {leftover.useless.join(', ')}
          {leftover.useless.length === 1 ? 'adds' : 'add'} nothing here, so {leftover.left.toLocaleString(
            'en-US'
          )}
          SP stay unspent.
        </p>
      {/if}
      {#if !buys}
        <p class="detail">No skill on offer gains her a length in these races.</p>
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
        scale={theorized.scale}
        phaseBounds={theorized.phaseBounds}
        {field}
        {checkRaces}
        {tools}
      />
      <SkillScores
        skills={theorized.skills}
        {ruledOut}
        scale={theorized.scale}
        phaseBounds={theorized.phaseBounds}
      />
    </div>
  {/if}
</section>

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
