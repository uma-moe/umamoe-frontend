<script lang="ts">
  import {
    isPaidBanner,
    paidBannerSteps,
    plannerCardKind
  } from '@/lib/carat-planner/planner-paid-banners';
  import {
    findGacha,
    plannerPickupGoals,
    type PlannerDataBundle,
    type PlannerGoalProjection,
    type PlannerTarget,
    type TargetProjection
  } from '@/lib/carat-planner/carat-planner';
  import { plannerPickupOptions } from '@/lib/carat-planner/planner-presentation';
  import {
    calculatePullDistribution,
    pullOutcomeSegments
  } from '@/lib/carat-planner/planner-pull-probability';
  import type { TimelinePickupCatalog } from '@/lib/timeline/timeline-pickups';
  import type { TimelineRecord } from '@/pages/timeline/timeline-repository';
  import Button from '@/components/controls/Button.svelte';
  import Icon from '@/components/Icon.svelte';
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';

  interface Props {
    target: PlannerTarget;
    projection: TargetProjection;
    resources: PlannerDataBundle;
    events: TimelineRecord[];
    catalog: TimelinePickupCatalog;
    pickupCopyMemory: Map<string, number>;
    onupdate: (mutator: (target: PlannerTarget) => void) => void;
  }

  let { target, projection, resources, events, catalog, pickupCopyMemory, onupdate }: Props =
    $props();

  let expanded = $state(false);
  let pickupSearch = $state('');
  let viewportWidth = $state<number>();

  const gacha = $derived(findGacha(target, resources));
  const paidOnly = $derived(isPaidBanner(target, gacha));
  const cardKind = $derived(plannerCardKind(target, gacha));
  const stepUp = $derived(gacha?.step_up);
  const chosenCopies = $derived(
    paidBannerSteps(gacha)
      .slice(0, (projection.actualPulls ?? projection.plannedPulls) / 10)
      .filter((step) => step.selectable).length
  );
  const options = $derived(
    stepUp
      ? [
          {
            id: 'step-up-choice',
            pickupId: 0,
            kind: cardKind,
            image: '',
            name: 'Chosen card',
            subLabel: stepUp.selection_pool_size
              ? `From your pool of ${stepUp.selection_pool_size}`
              : 'From your selected pool',
            rate: stepUp.selection_pickup_rate,
            exchangeable: false
          }
        ]
      : plannerPickupOptions(target, gacha, events, catalog)
  );
  const filteredOptions = $derived(
    options.filter((option) =>
      `${option.name} ${option.subLabel}`
        .toLocaleLowerCase()
        .includes(pickupSearch.trim().toLocaleLowerCase())
    )
  );
  const goals = $derived(
    (stepUp
      ? [{ pickupId: 0, desiredCopies: target.desiredCopies }]
      : plannerPickupGoals(target)
    ).map((goal) => {
      const odds = projection.pickupGoals.find((odds) => odds.pickupId === goal.pickupId);
      const actualCopies = target.actualCopies?.[stepUp ? 'chosen' : String(goal.pickupId)];
      return {
        ...goal,
        option: options.find((option) => option.pickupId === goal.pickupId)!,
        odds,
        actualCopies,
        met:
          actualCopies !== undefined &&
          actualCopies >= (odds?.copiesNeededFromPulls ?? goal.desiredCopies)
      };
    })
  );
  const hasResults = $derived(target.actualPulls !== undefined || Boolean(target.actualCopies));
  const recordedGoals = $derived(goals.filter((goal) => goal.actualCopies !== undefined).length);
  const metGoals = $derived(goals.filter((goal) => goal.met).length);
  const ratesAvailable = $derived(
    goals.length > 0 && goals.every((goal) => goal.odds?.pickupRate !== undefined)
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
  const totalLabel = $derived(
    !goals.length
      ? 'Choose pickups'
      : hasResults
        ? !recordedGoals
          ? 'Copies not recorded'
          : recordedGoals < goals.length
            ? `${recordedGoals}/${goals.length} recorded`
            : metGoals === goals.length
              ? 'All goals met'
              : `${metGoals}/${goals.length} goals met`
        : !ratesAvailable
          ? 'Rates unavailable'
          : percent(projection.pickupProbability)
  );
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
  const fundingLabel = $derived(
    paidOnly
      ? `Paid Carats only · ${projection.shortfallJewels ? `Requires ${projection.shortfallJewels.toLocaleString()} paid Carats` : 'Paid cost covered'}`
      : [
          projection.shortfallJewels
            ? `${projection.shortfallJewels.toLocaleString()} Carats short`
            : '',
          `${projection.ticketPulls + projection.freeJewelPulls + projection.paidJewelPulls} from resources`,
          projection.freePullsUsed ? `${projection.freePullsUsed} free` : ''
        ]
          .filter(Boolean)
          .join(' · ')
  );
  const topRarity = $derived(cardKind === 'support' ? 'SSR' : '3★');
  const savedPulls = $derived(
    projection.plannedPulls - (projection.actualPulls ?? projection.plannedPulls)
  );

  function percent(value?: number, digits = 1): string {
    return value === undefined || !Number.isFinite(value)
      ? 'Unavailable'
      : `${(value * 100).toFixed(value > 0 && value < 0.001 ? 2 : digits)}%`;
  }

  function copies(value: number): string {
    return value.toFixed(value >= 10 ? 1 : 2).replace(/\.?0+$/, '');
  }

  function resultLabel(goal: (typeof goals)[number]): string {
    return goal.actualCopies === undefined ? 'Not recorded' : goal.met ? 'Met' : 'Not met';
  }

  function requirement(goal: (typeof goals)[number]): string {
    const count = goal.odds?.copiesNeededFromPulls ?? goal.desiredCopies;
    return `${count} ${count === 1 ? 'copy' : 'copies'} required${goal.odds?.crystalCopiesApplied ? ` + ${goal.odds.crystalCopiesApplied} ${goal.odds.crystalKind === 'gold' ? 'Gold' : 'Rainbow'} Uncap` : ''}`;
  }

  function oddsLabel(name: string, odds?: PlannerGoalProjection): string {
    if (odds?.probability === undefined) return `Odds unavailable for ${name}`;
    return `${percent(odds.probability)} chance of at least ${odds.copiesNeededFromPulls} ${odds.copiesNeededFromPulls === 1 ? 'copy' : 'copies'} of ${name}${odds.crystalCopiesApplied ? `; ${odds.crystalCopiesApplied} ${odds.crystalKind === 'gold' ? 'Gold' : 'Rainbow'} Uncap Crystals supply the remaining limit breaks toward ${odds.desiredCopies} copies` : ''}`;
  }

  function editGoal(pickupId: number, change?: number): void {
    onupdate((value) => {
      if (stepUp) {
        value.desiredCopies = Math.max(
          1,
          Math.min(cardKind === 'support' ? 5 : 20, value.desiredCopies + (change ?? 0))
        );
        return;
      }
      const selected = plannerPickupGoals(value);
      const index = selected.findIndex((goal) => goal.pickupId === pickupId);
      const key = `${value.id}:${pickupId}`;
      if (change !== undefined && index >= 0) {
        selected[index]!.desiredCopies = Math.max(
          1,
          Math.min(cardKind === 'support' ? 5 : 20, selected[index]!.desiredCopies + change)
        );
        pickupCopyMemory.set(key, selected[index]!.desiredCopies);
      } else if (index >= 0) {
        pickupCopyMemory.set(key, selected[index]!.desiredCopies);
        selected.splice(index, 1);
      } else selected.push({ pickupId, desiredCopies: pickupCopyMemory.get(key) ?? 1 });
      value.pickupGoals = selected;
      value.pickupId = selected[0]?.pickupId;
      value.desiredCopies = selected[0]?.desiredCopies ?? 1;
    });
  }

  function imageError(event: Event): void {
    const image = event.currentTarget as HTMLImageElement;
    if (
      !image.dataset.fallback &&
      target.imagePath &&
      image.getAttribute('src') !== target.imagePath
    ) {
      image.dataset.fallback = 'true';
      image.src = target.imagePath;
    } else image.hidden = true;
  }
</script>

<svelte:window bind:innerWidth={viewportWidth} />

{#snippet art(option: (typeof options)[number], size: number)}
  <span
    class="pickup-art"
    class:support={option.kind === 'support'}
    style:width={`${size}px`}
    style:height={`${size}px`}
  >
    {#if option.image}
      <img
        src={option.image}
        width={size}
        height={size}
        alt=""
        loading="lazy"
        onerror={imageError}
      />
    {/if}
    <Icon
      name={option.kind === 'support' ? 'grid' : 'user'}
      size={Math.min(size, 22)}
    />
  </span>
{/snippet}

<details
  class="pickup-details"
  bind:open={expanded}
>
  <summary
    class="pickup-summary"
    aria-label={`Pickup goals for ${target.title}`}
  >
    <span
      class="funding"
      class:short={projection.shortfallJewels > 0}
    >
      <Icon
        name={projection.shortfallJewels > 0 ? 'warning' : 'check'}
        size={16}
      />
      <span>
        <strong>
          {#if projection.actualPulls !== undefined}
            {projection.actualPulls} actual / {projection.plannedPulls}
            planned
          {:else if paidOnly}
            {projection.plannedPulls} planned pulls
          {:else}
            {projection.fundedPulls}{#if projection.shortfallJewels}
              / {projection.plannedPulls}
            {/if} funded
          {/if}
        </strong>
        <small>
          {#if projection.actualPulls !== undefined}
            <span
              class="result-delta"
              class:saved={savedPulls > 0}
              class:over={savedPulls < 0}
            >
              {savedPulls > 0
                ? `${savedPulls} pulls saved`
                : savedPulls < 0
                  ? `${-savedPulls} pulls over plan`
                  : 'As planned'}
            </span>
            ·
          {/if}{fundingLabel}{#if !paidOnly && projection.rewardCaratsGained > 0}
            <span class="reward-contribution">
              · +{projection.rewardCaratsGained.toLocaleString()} from rewards
            </span>
          {/if}
        </small>
      </span>
    </span>
    <small class="goals-label">Goals</small>
    <span class="goal-previews">
      {#each goals.slice(0, 3) as goal (goal.pickupId)}
        <span class="goal-preview">
          {@render art(goal.option, 30)}
          <span>
            <span>{goal.option.name}</span>
            <small>
              {#if goal.actualCopies !== undefined}
                {goal.desiredCopies} planned ·
                <strong class="actual-copies">
                  {goal.actualCopies} actual
                </strong>
              {:else}
                {requirement(goal)}
              {/if}
            </small>
          </span>
          <b
            class:met={hasResults && goal.met}
            aria-label={hasResults
              ? `${goal.option.name}: ${resultLabel(goal)}`
              : oddsLabel(goal.option.name, goal.odds)}
          >
            {hasResults
              ? goal.actualCopies === undefined
                ? '—'
                : resultLabel(goal)
              : percent(goal.odds?.probability)}
          </b>
        </span>
      {/each}
      {#if !goals.length}
        <small>Choose featured pickups</small>
      {/if}
      {#if goals.length > 3}
        <small class="more-desktop">+{goals.length - 3} more</small>
      {/if}
      {#if goals.length > 1}
        <small class="more-mobile">+{goals.length - 1} more</small>
      {/if}
    </span>
    <span
      class="goal-chance"
      class:strong={hasResults
        ? goals.length > 0 && metGoals === goals.length
        : (projection.pickupProbability ?? 0) >= 0.5}
    >
      {#if goals.length}
        <small>
          {#if hasResults}
            Results
          {:else}
            All goals{#if inferred}
              · estimated
            {:else if projection.sparkCopies}
              · {projection.sparkCopies} shared spark{projection.sparkCopies === 1 ? '' : 's'}
            {/if}
          {/if}
        </small>
      {/if}
      <strong>{totalLabel}</strong>
    </span>
    <Icon
      name="chevron"
      size={16}
    />
  </summary>
  {#if expanded}
    <div class="goal-workspace">
      <section
        class="goal-editor"
        aria-label={`${stepUp ? 'Step-Up' : 'Rate-up'} goals for ${target.title}`}
      >
        <header>
          <span>
            <strong>{stepUp ? 'Step-Up goal' : 'Rate-up goals'}</strong>
            <small>
              {stepUp
                ? 'Set how many copies of one chosen card you want.'
                : 'Choose who you want and how many copies.'}
            </small>
          </span>
          {#if !stepUp && options.length}
            <InspectPopover
              label="Choose rate-ups"
              align="end"
              onopenchange={(open) => {
                if (!open) pickupSearch = '';
              }}
            >
              {#snippet trigger()}
                <span class="picker-trigger">
                  <Icon
                    name="add"
                    size={16}
                  />
                  <span>Choose rate-ups</span>
                  <small>{goals.length} selected</small>
                </span>
              {/snippet}
              <div class="pickup-picker">
                <header>
                  <strong>Featured on this banner</strong>
                  <small>Select one or more pickups.</small>
                </header>
                {#if options.length > 6}
                  <input
                    class="pickup-search"
                    type="search"
                    aria-label="Search featured pickups"
                    placeholder="Search name or variant…"
                    bind:value={pickupSearch}
                  />
                {/if}
                <div class="pickup-options">
                  {#each filteredOptions as option (option.pickupId)}
                    {@const selected = goals.some((goal) => goal.pickupId === option.pickupId)}
                    <button
                      type="button"
                      class:selected
                      aria-pressed={selected}
                      aria-label={`${selected ? 'Remove' : 'Select'} ${option.name}`}
                      onclick={() => editGoal(option.pickupId)}
                    >
                      {@render art(option, 40)}
                      <span>
                        <strong>{option.name}</strong>
                        <small>
                          {option.subLabel} · {percent(option.rate, 2)}
                          {inferred ? 'estimated ' : ''}per pull
                        </small>
                      </span>
                      <Icon
                        name={selected ? 'check' : 'add'}
                        size={16}
                      />
                    </button>
                  {:else}
                    <p>No pickups match your search.</p>
                  {/each}
                </div>
                <small
                  class="picker-count"
                  role="status"
                >
                  {goals.length} selected · {options.length} available
                </small>
              </div>
            </InspectPopover>
          {/if}
        </header>
        <div class="selected-goals">
          {#each goals as goal (goal.pickupId)}
            <article
              class="selected-goal"
              aria-label={goal.option.name}
              data-pickup-id={goal.pickupId}
            >
              {@render art(goal.option, 40)}
              <span class="goal-name">
                <strong title={goal.option.name}>{goal.option.name}</strong>
                <small>
                  {#if hasResults}
                    {goal.actualCopies === undefined
                      ? 'Copies not recorded'
                      : `${goal.actualCopies} actual`} · {requirement(goal)}
                  {:else}
                    {goal.option.subLabel} · {percent(goal.odds?.pickupRate, 2)}
                    {stepUp ? 'per random pull' : inferred ? 'estimated per pull' : 'per pull'}
                  {/if}
                </small>
              </span>
              <div class="goal-copies">
                <small>Copies</small>
                <div
                  class="copy-stepper"
                  role="group"
                  aria-label={`Copies of ${goal.option.name}`}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    icon="minus"
                    ariaLabel={`Decrease desired copies of ${goal.option.name}`}
                    disabled={goal.desiredCopies <= 1}
                    onclick={() => editGoal(goal.pickupId, -1)}
                  />
                  <output aria-label={`${goal.desiredCopies} desired copies`}>
                    {goal.desiredCopies}
                  </output>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon="add"
                    ariaLabel={`Increase desired copies of ${goal.option.name}`}
                    disabled={goal.desiredCopies >= (cardKind === 'support' ? 5 : 20)}
                    onclick={() => editGoal(goal.pickupId, 1)}
                  />
                </div>
              </div>
              <strong
                class="individual-chance"
                class:met={hasResults && goal.met}
                aria-label={hasResults
                  ? `${goal.option.name}: ${resultLabel(goal)}`
                  : oddsLabel(goal.option.name, goal.odds)}
              >
                {hasResults
                  ? goal.actualCopies === undefined
                    ? '—'
                    : resultLabel(goal)
                  : percent(goal.odds?.probability)}
              </strong>
              {#if !stepUp}
                <Button
                  variant="ghost"
                  size="sm"
                  icon="close"
                  ariaLabel={`Remove ${goal.option.name} from rate-up goals`}
                  onclick={() => editGoal(goal.pickupId)}
                />
              {/if}
            </article>
          {:else}
            <p>
              No rate-up selected yet. Use <strong>Choose rate-ups</strong>
              to add one or more.
            </p>
          {/each}
        </div>
        {#if !options.length}
          <p>Featured pickup data is not available for this banner yet.</p>
        {/if}
      </section>
      {#if goals.length}
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
                {projection.actualPulls === undefined ? 'planned' : 'recorded'} pulls, including guaranteed
                draws.{#if projection.shortfallJewels}
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
      {/if}
    </div>
  {/if}
</details>

<style>
  @import './planner-target-goals.css';
</style>
