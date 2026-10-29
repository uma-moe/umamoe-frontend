<script lang="ts">
  import {
    plannerPickupGoals,
    type PlannerStepUp,
    type PlannerTarget
  } from '@/lib/carat-planner/carat-planner';
  import {
    oddsLabel,
    percent,
    requirement,
    resultLabel,
    type PlannerGoalOption,
    type PlannerGoalView
  } from './planner-goal-view';
  import PlannerPickupArt from './PlannerPickupArt.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Icon from '@/components/Icon.svelte';
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';

  interface Props {
    target: PlannerTarget;
    options: PlannerGoalOption[];
    goals: PlannerGoalView[];
    stepUp?: PlannerStepUp;
    cardKind: 'support' | 'character';
    inferred: boolean;
    hasResults: boolean;
    pickupCopyMemory: Map<string, number>;
    pickupSearch: string;
    onupdate: (mutator: (target: PlannerTarget) => void) => void;
  }

  let {
    target,
    options,
    goals,
    stepUp,
    cardKind,
    inferred,
    hasResults,
    pickupCopyMemory,
    pickupSearch = $bindable(),
    onupdate
  }: Props = $props();

  const filteredOptions = $derived(
    options.filter((option) =>
      `${option.name} ${option.subLabel}`
        .toLocaleLowerCase()
        .includes(pickupSearch.trim().toLocaleLowerCase())
    )
  );

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
      const goal = selected[index];
      const key = `${value.id}:${pickupId}`;
      if (change !== undefined && goal) {
        goal.desiredCopies = Math.max(
          1,
          Math.min(cardKind === 'support' ? 5 : 20, goal.desiredCopies + change)
        );
        pickupCopyMemory.set(key, goal.desiredCopies);
      } else if (goal) {
        pickupCopyMemory.set(key, goal.desiredCopies);
        selected.splice(index, 1);
      } else selected.push({ pickupId, desiredCopies: pickupCopyMemory.get(key) ?? 1 });

      value.pickupGoals = selected;
      value.pickupId = selected[0]?.pickupId;
      value.desiredCopies = selected[0]?.desiredCopies ?? 1;
    });
  }
</script>

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
                <PlannerPickupArt
                  {option}
                  size={40}
                  fallbackImage={target.imagePath}
                />
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
        <PlannerPickupArt
          option={goal.option}
          size={40}
          fallbackImage={target.imagePath}
        />
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

<style>
  @import './goal-text.css';
  @import './planner-goal-editor.css';
</style>
