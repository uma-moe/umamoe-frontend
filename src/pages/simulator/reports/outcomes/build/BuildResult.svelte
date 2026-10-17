<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import ChartFrame from '@/components/charts/ChartFrame.svelte';
  import Icon from '@/components/Icon.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import type { OptimizeResult } from '../../../simulator-repository';
  import type { PricedOffer } from '../../../setup/build/skill-offers';
  import BuildCards from './BuildCards.svelte';
  import BuildSummary from './BuildSummary.svelte';
  import BuyList from './BuyList.svelte';
  import SkipList from './SkipList.svelte';
  import {
    INERT_SCHEMA,
    SCREEN_SCHEMA,
    gainOf,
    inertPurchases,
    leftoverSp,
    ruledOutSkills,
    screenedImpacts,
    searchTally,
    skillLists,
    statCells,
    valueScale
  } from './build-result';

  /**
   * An optimized build, answer first: how many skills to buy and their SP beside what they gain her and how she races.
   * Under it the skills to buy as the game lists them, each with a bar for what it adds, then the skills left out on
   * the same scale; the builds that came close stand beside them. How it was measured opens from the title. In real CM
   * fields a gain is runners she beats more of; with the fixed pack, seconds saved.
   */
  let {
    result,
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

  const FIELD_METHOD =
    'She races real Champions Meeting races recorded in the game, in place of a runner of her running style, and every build races the same ones. A build scores by how many of the other 8 runners she finishes ahead of; a close finish counts as part of a runner, so field skills, blocking and debuffs all count. The search races each skill on its own and taken out of the full set, picks the best mix within her SP, then races the closest mixes against each other. What hundreds of thousands of recorded CM races say about each skill is weighed in, so a few lucky races cannot decide it. Unspent SP is lost after the career, so a skill is only left out when it surely costs her places.';

  const PACK_METHOD =
    'She races the simulator’s own pack of 8 runners without skills, the same in every race, so a build scores by her finish time alone. The search races each skill on its own and taken out of the full set, picks the best mix within her SP, then races the closest mixes against each other until nothing faster is left. Unspent SP is lost after the career, so a skill is only left out when it surely makes her slower. When the simulator has CM data, what recorded CM races say each skill adds is weighed in too, turned into seconds on this course: the CM races say how the skills compare, her own races what that is worth here.';

  const CM_IN_SECONDS =
    'Each skill’s value also weighs what recorded CM races say it adds, turned into seconds on this course.';

  let rawOpen = $state(false);

  /** She raced real CM fields, so gains are runners beaten, not seconds. */
  const field = $derived(result?.objective === 'field_place');
  /** An older service answers in a shape this page can't read honestly, so it says so instead of guessing. */
  const outdated = $derived(result !== undefined && result.report.schema_version < SCREEN_SCHEMA);
  const finalists = $derived(outdated ? [] : (result?.report.finalists ?? []));
  const best = $derived(finalists[0]);
  const bestGain = $derived(best ? gainOf(best) : undefined);
  const worse = $derived(field ? 'costs her places' : 'makes her slower');

  const bought = $derived(new Set(best?.build.purchases ?? []));
  /** A simulator older than schema 7 never rules out skills that cannot fire for her, so it may buy them. */
  const unfiltered = $derived(
    result !== undefined && !outdated && result.schema_version < INERT_SCHEMA
  );

  const inertSet = $derived(inertPurchases(outdated ? [] : result?.inert));
  /** Skills on offer that can never fire for her here, so the search never raced them. */
  const ruledOut = $derived(ruledOutSkills(outdated ? [] : result?.inert, offers));
  const impacts = $derived(screenedImpacts(outdated ? [] : result?.report.impacts, offers));
  const leftover = $derived(leftoverSp(best, budget, offers, bought, inertSet, impacts));
  const lists = $derived(skillLists(best, offers, impacts));
  /** One scale for every skill's bar, bought or left out, so they compare. */
  const scale = $derived(valueScale([...lists.buy, ...lists.left]));
  const stats = $derived(statCells(finalists));
  const saves = $derived(Boolean(best?.build.purchases.length));

  /** A timed race still weighed what CM races say each skill adds, turned into seconds by the simulator. */
  const cmWeighedIntoTime = $derived(
    !field && (result?.report.impacts ?? []).some((impact) => impact.evidence !== undefined)
  );

  /** How it was measured, behind the title's info button: the method, where she raced and how much racing it took. */
  const about = $derived.by(() => {
    const method = field ? FIELD_METHOD : PACK_METHOD;
    if (!result || outdated) return method;

    const recorded = cmWeighedIntoTime ? [CM_IN_SECONDS] : [];
    return [method, ...where, ...recorded, searchTally(result)].join(' ');
  });
</script>

<ChartFrame
  id="build-result"
  title="Result"
  slim
  description={about}
>
  {#snippet actions()}
    {#if result && raw}
      <Button
        size="sm"
        variant="ghost"
        onclick={() => (rawOpen = true)}
      >
        Raw data
      </Button>
    {/if}
  {/snippet}
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
          The simulator service answering this page is an older build: it races her against other
          runners and can’t measure what each skill saves her. Rebuild and restart it, then search
          again.
        </p>
      {:else if result && best}
        <BuildSummary
          count={lists.buy.length}
          spCost={best.sp_cost}
          {budget}
          gain={bestGain}
          {field}
          stats={stats[0] ?? []}
        />
        {#if saves && leftover && leftover.left > 0 && !leftover.all && leftover.slower.length}
          <p class="detail">
            {leftover.slower.join(', ')}
            {leftover.slower.length === 1 ? worse : 'all ' + worse}, so {leftover.left.toLocaleString(
              'en-US'
            )}
            SP stay unspent.
          </p>
        {/if}
        {#if !saves}
          <p class="detail">
            {leftover?.slower.length
              ? 'Every skill she can afford ' + worse + ' in these races.'
              : field
                ? 'No skill on offer beats more runners in these races.'
                : 'No skill on offer saves her time in these races.'}
          </p>
        {/if}
        {#if unfiltered}
          <p class="detail">
            An older simulator answered: it can buy skills that never fire for her here. Rebuild and
            restart it to rule those out.
          </p>
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

    {#if result && best}
      <div
        class="body"
        class:with-close={finalists.length > 1}
      >
        <div class="skills">
          <ul
            class="key"
            aria-label="What the bars show"
          >
            <li>{field ? 'Runners beaten per race' : 'Seconds saved per race'}</li>
            <li>
              <span class="swatch helps"></span>
              Helps
            </li>
            <li>
              <span class="swatch"></span>
              Not sure
            </li>
            <li>
              <span class="swatch loss"></span>
              Costs her
            </li>
          </ul>
          {#if saves}
            <BuyList
              rows={lists.buy}
              {scale}
              {field}
            />
          {/if}
          <SkipList
            left={lists.left}
            {ruledOut}
            {scale}
            {field}
          />
        </div>
        {#if finalists.length > 1}
          <BuildCards
            {finalists}
            {offers}
            {stats}
            {field}
          />
        {/if}
      </div>
    {/if}
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
