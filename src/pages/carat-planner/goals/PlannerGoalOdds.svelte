<script lang="ts">
  import { paidBannerSteps } from '@/lib/carat-planner/gacha/planner-paid-banners';
  import type {
    PlannerDataBundle,
    PlannerGachaEntry,
    TargetProjection
  } from '@/lib/carat-planner/carat-planner';
  import {
    calculatePullDistribution,
    pullOutcomeSegments
  } from '@/lib/carat-planner/gacha/planner-pull-probability';
  import { copies, percent, type PlannerGoalView } from './planner-goal-view';
  import Icon from '@/components/Icon.svelte';

  interface Props {
    projection: TargetProjection;
    gacha?: PlannerGachaEntry;
    resources: PlannerDataBundle;
    goals: PlannerGoalView[];
    cardKind: 'support' | 'character';
    paidOnly: boolean;
    hasResults: boolean;
    ratesAvailable: boolean;
    viewportWidth?: number;
  }

  let {
    projection,
    gacha,
    resources,
    goals,
    cardKind,
    paidOnly,
    hasResults,
    ratesAvailable,
    viewportWidth
  }: Props = $props();

  const stepUp = $derived(gacha?.step_up);
  const chosenCopies = $derived(
    paidBannerSteps(gacha)
      .slice(0, (projection.actualPulls ?? projection.plannedPulls) / 10)
      .filter((step) => step.selectable).length
  );

  const inferred = $derived(gacha?.rates_confidence === 'inferred_standard');
  const source = $derived(gacha?.pickups ?? gacha?.featured_pickups ?? []);
  const distribution = $derived(
    calculatePullDistribution({
      pulls: projection.fundedPulls,
      rateUpRates: goals.map((goal) => goal.odds?.pickupRate ?? Number.NaN),
      allRateUpRates: source.map((pickup) => pickup.rate),
      topRarityRate: gacha?.rarity_rates?.find((rate) => rate.rarity === 3)?.rate,
      sparkPulls: gacha?.spark_pulls ?? resources.core.default_spark_pulls ?? 200,
      sparkExchangeable: goals.some((goal) => goal.option.exchangeable)
    })
  );

  const segments = $derived(pullOutcomeSegments(distribution));
  const allGoalsStatus = $derived(
    !projection.jointProbabilityExact
      ? 'Goal combination is too large to calculate exactly'
      : [
          projection.sparkCopies
            ? `${projection.sparkCopies} shared exchange ${projection.sparkCopies === 1 ? 'copy' : 'copies'}`
            : '',
          projection.rainbowCrystalsUsed + projection.goldCrystalsUsed
            ? `${projection.rainbowCrystalsUsed + projection.goldCrystalsUsed} Uncap Crystal${projection.rainbowCrystalsUsed + projection.goldCrystalsUsed === 1 ? '' : 's'}`
            : ''
        ]
          .filter(Boolean)
          .map((part, index, parts) => (index === parts.length - 1 ? `${part} included` : part))
          .join(' + ') || 'Exact joint chance'
  );

  const topRarity = $derived(cardKind === 'support' ? 'SSR' : '3★');
</script>

<details
  class="advanced-odds"
  class:recorded={hasResults}
  open={!hasResults && (viewportWidth ?? 1024) > 768}
>
  <summary>
    <span>
      <strong>{hasResults ? 'Odds comparison' : 'Detailed odds'}</strong>
      <small>
        {hasResults
          ? `Calculated for ${projection.fundedPulls} pulls`
          : paidOnly
            ? 'Includes guaranteed draws'
            : 'Pool rates, outcome ranges, and averages'}
      </small>
    </span>
    <strong>{percent(projection.pickupProbability)}</strong>
    <Icon
      name="chevron"
      size={16}
    />
  </summary>
  <div class="goal-rollup">
    {#if paidOnly && ratesAvailable}
      <p>
        Odds use all {projection.actualPulls ?? projection.plannedPulls}
        {projection.actualPulls === undefined ? 'planned' : 'recorded'} pulls, including guaranteed draws.{#if projection.shortfallJewels}
          {' '}Assumes you add the required paid Carats before pulling.
        {/if}
      </p>
    {:else if ratesAvailable}
      <header>
        <span>
          <h4>Selected pickup outcomes at {distribution.pulls.toLocaleString()} pulls</h4>
          <p>
            {#if inferred}
              Estimated from standard banner rates ·
            {/if}Only selected featured cards count here{#if distribution.guaranteedHits}
              · totals include {distribution.guaranteedHits} shared exchange {distribution.guaranteedHits ===
              1
                ? 'copy'
                : 'copies'}
            {/if}
          </p>
        </span>
        <span
          class="all-goals"
          class:strong={(projection.pickupProbability ?? 0) >= 0.5}
          role="status"
        >
          <span>{hasResults ? 'Chance of all goals' : 'All goals'}</span>
          <strong>{percent(projection.pickupProbability)}</strong>
          <small>{allGoalsStatus}</small>
        </span>
      </header>
      {#if distribution.pool}
        {@const pool = distribution.pool}
        <section
          class="pool-summary"
          aria-label={`Full ${topRarity} pool odds`}
        >
          <header>
            <span>
              <small>{inferred ? 'Estimated' : 'Full'} {topRarity} pool</small>
              <strong>
                {percent(pool.topRarityRate, 2)}
                <small>per pull</small>
              </strong>
            </span>
            <dl>
              <div>
                <dt>At least one</dt>
                <dd>{percent(pool.probabilityAtLeastOneTopRarity)}</dd>
              </div>
              <div>
                <dt>Average in {distribution.pulls.toLocaleString()}</dt>
                <dd>{copies(pool.expectedTopRarityHits)}</dd>
              </div>
            </dl>
          </header>
          <div
            class="pool-stack"
            role="img"
            aria-label={`${topRarity} pool: selected ${percent(pool.selectedRateUpRate, 2)}, other featured ${percent(pool.unselectedFeaturedRate, 2)}, off-banner ${percent(pool.offBannerTopRarityRate, 2)}`}
          >
            <span
              data-pool="selected"
              style:width={`${pool.topRarityRate ? (pool.selectedRateUpRate / pool.topRarityRate) * 100 : 0}%`}
            ></span>
            <span
              data-pool="featured"
              style:width={`${pool.topRarityRate ? (pool.unselectedFeaturedRate / pool.topRarityRate) * 100 : 0}%`}
            ></span>
            <span
              data-pool="off-banner"
              style:width={`${pool.topRarityRate ? (pool.offBannerTopRarityRate / pool.topRarityRate) * 100 : 0}%`}
            ></span>
          </div>
          <ul class="pool-legend">
            <li>
              <i data-pool="selected"></i>
              <span>Selected featured</span>
              <b>{percent(pool.selectedRateUpRate, 2)}</b>
              <small>{copies(pool.expectedSelectedRateUpHits)} avg</small>
            </li>
            {#if pool.unselectedFeaturedRate > 0}
              <li>
                <i data-pool="featured"></i>
                <span>Other featured</span>
                <b>{percent(pool.unselectedFeaturedRate, 2)}</b>
                <small>{copies(pool.expectedUnselectedFeaturedHits)} avg</small>
              </li>
            {/if}{#if pool.offBannerTopRarityRate > 0}
              <li>
                <i data-pool="off-banner"></i>
                <span>Off-banner</span>
                <b>{percent(pool.offBannerTopRarityRate, 2)}</b>
                <small>{copies(pool.expectedOffBannerTopRarityHits)} avg</small>
              </li>
            {/if}
          </ul>
        </section>
      {/if}
      <div
        class="outcome-stack"
        role="img"
        aria-label={`Selected pickup outcomes at ${distribution.pulls} pulls: ${segments.map((segment) => `${segment.semanticLabel}, ${segment.rangeLabel}: ${percent(segment.probability)}`).join('; ')}`}
      >
        {#each segments as segment}
          <span
            data-outcome={segment.tone}
            style:width={`${segment.width}%`}
            title={`${segment.semanticLabel} · ${segment.rangeLabel}: ${percent(segment.probability)}`}
          ></span>
        {/each}
      </div>
      <ul
        class="outcome-legend"
        aria-label="Selected rate-up outcome probabilities"
      >
        {#each segments as segment}
          <li>
            <i data-outcome={segment.tone}></i>
            <span>
              <strong>{segment.semanticLabel}</strong>
              <small>{segment.rangeLabel}</small>
            </span>
            <b>{percent(segment.probability)}</b>
          </li>
        {/each}
      </ul>
      <div class="outcome-summary">
        <span>
          <small>Avg selected copies</small>
          <strong>{copies(distribution.expectedHits)}</strong>
        </span>
        <span>
          <small>Median copies</small>
          <strong>{distribution.medianHits}</strong>
        </span>
        <span>
          <small>Median first rate-up</small>
          <strong>
            {distribution.medianFirstHitPull === undefined
              ? '-'
              : `Pull ${distribution.medianFirstHitPull}`}
          </strong>
        </span>
      </div>
    {:else}
      <p>Published pickup rates are unavailable for the selected goals.</p>
    {/if}
    {#if stepUp}
      <p>
        {#if chosenCopies}
          Choose that card at each reached selection step: {chosenCopies}
          {chosenCopies === 1 ? 'copy is' : 'copies are'} guaranteed.
        {:else}
          Your selected steps do not reach a guaranteed card choice.
        {/if}
      </p>
      <details class="step-costs">
        <summary>
          <span>
            Step costs and guarantees · {stepUp.rounds}
            {stepUp.rounds === 1 ? 'round' : 'rounds'} available
          </span>
          <Icon
            name="chevron"
            size={16}
          />
        </summary>
        <ol>
          {#each stepUp.steps as step, index}
            <li>
              <b>Step {index + 1}</b>
              · {step.cost.toLocaleString()} paid Carats · {step.pulls}
              pulls{#if step.selectable}
                · Choose the guaranteed {topRarity}
              {:else if step.guaranteed_rarity === 3}
                · Guaranteed {topRarity}
              {/if}
            </li>
          {/each}
        </ol>
      </details>
    {/if}
  </div>
</details>

<style>
  @import './goal-summary.css';
  @import './goal-text.css';
  @import './planner-goal-odds.css';
</style>
