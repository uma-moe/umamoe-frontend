<script lang="ts">
  import { isPaidBanner, plannerCardKind } from '@/lib/carat-planner/planner-paid-banners';
  import {
    findGacha,
    type PlannerDataBundle,
    type PlannerTarget,
    type TargetProjection
  } from '@/lib/carat-planner/carat-planner';
  import type { TimelinePickupCatalog } from '@/lib/timeline/timeline-pickups';
  import type { TimelineRecord } from '@/pages/timeline/timeline-repository';
  import {
    oddsLabel,
    percent,
    plannerGoalOptions,
    plannerGoalViews,
    requirement,
    resultLabel
  } from './planner-goal-view';
  import PlannerGoalEditor from './PlannerGoalEditor.svelte';
  import PlannerGoalOdds from './PlannerGoalOdds.svelte';
  import PlannerPickupArt from './PlannerPickupArt.svelte';
  import Icon from '@/components/Icon.svelte';

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
  const options = $derived(plannerGoalOptions(target, gacha, cardKind, events, catalog));
  const goals = $derived(plannerGoalViews(target, stepUp, options, projection));
  const hasResults = $derived(target.actualPulls !== undefined || Boolean(target.actualCopies));
  const recordedGoals = $derived(goals.filter((goal) => goal.actualCopies !== undefined).length);
  const metGoals = $derived(goals.filter((goal) => goal.met).length);
  const ratesAvailable = $derived(
    goals.length > 0 && goals.every((goal) => goal.odds?.pickupRate !== undefined)
  );
  const inferred = $derived(gacha?.rates_confidence === 'inferred_standard');
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
  const savedPulls = $derived(
    projection.plannedPulls - (projection.actualPulls ?? projection.plannedPulls)
  );
</script>

<svelte:window bind:innerWidth={viewportWidth} />

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
          <PlannerPickupArt
            option={goal.option}
            size={30}
            fallbackImage={target.imagePath}
          />
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
      <PlannerGoalEditor
        {target}
        {options}
        {goals}
        {stepUp}
        {cardKind}
        {inferred}
        {hasResults}
        {pickupCopyMemory}
        bind:pickupSearch
        {onupdate}
      />
      {#if goals.length}
        <PlannerGoalOdds
          {projection}
          {gacha}
          {resources}
          {goals}
          {cardKind}
          {paidOnly}
          {hasResults}
          {ratesAvailable}
          {viewportWidth}
        />
      {/if}
    </div>
  {/if}
</details>

<style>
  @import './goal-summary.css';
  @import './planner-target-goals.css';
</style>
