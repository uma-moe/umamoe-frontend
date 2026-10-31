<script lang="ts">
  import LazyContent from '@/components/LazyContent.svelte';
  import type { TimelineRecord } from '@/pages/timeline/timeline-repository';
  import {
    enabledPlannerTargets,
    type CaratPlan,
    type PlannerDataBundle,
    type PlannerTarget,
    type TargetProjection
  } from '@/lib/carat-planner/carat-planner';
  import { plannerPullPlanItems } from '@/lib/carat-planner/presentation/planner-presentation';
  import type { TimelinePickupCatalog } from '@/lib/timeline/events/timeline-pickups';
  import PlannerTargetRow from './row/PlannerTargetRow.svelte';
  import Icon from '@/components/Icon.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';

  interface Props {
    plan: CaratPlan;
    activeTargets: PlannerTarget[];
    projectionByTarget: Map<string, TargetProjection>;
    resources: PlannerDataBundle;
    events: TimelineRecord[];
    catalog: TimelinePickupCatalog;
    oncommit: (mutator: (plan: CaratPlan) => void) => void;
    onremove: (id: string) => void;
  }

  let {
    plan,
    activeTargets,
    projectionByTarget,
    resources,
    events,
    catalog,
    oncommit,
    onremove
  }: Props = $props();

  const pickupCopyMemory = new Map<string, number>();

  const pullItems = $derived(plannerPullPlanItems(plan, events));
  const globalPullTiming = $derived.by(() => {
    const timings = new Set(activeTargets.map((target) => target.pullTiming));
    const timing = activeTargets[0]?.pullTiming;
    return timings.size === 1 && (timing === 'start' || timing === 'end') ? timing : '';
  });

  const regularTargets = $derived(activeTargets.filter((target) => target.bannerKind !== 'paid'));
  const globalPaidCarats = $derived(
    regularTargets.length &&
      regularTargets.every(
        (target) => target.allowPaidJewels === regularTargets[0]!.allowPaidJewels
      )
      ? regularTargets[0]!.allowPaidJewels
        ? 'allow'
        : 'free-only'
      : ''
  );

  function applyGlobalPullTiming(timing: string): void {
    if (timing !== 'start' && timing !== 'end') return;
    oncommit((value) => {
      for (const target of enabledPlannerTargets(value)) {
        target.pullTiming = timing;
        target.customPullDate = undefined;
      }
    });
  }

  function applyGlobalPaidCarats(selection: string): void {
    if (selection !== 'allow' && selection !== 'free-only') return;
    oncommit((value) => {
      for (const target of enabledPlannerTargets(value))
        if (target.bannerKind !== 'paid') target.allowPaidJewels = selection === 'allow';
    });
  }

  function updateTarget(id: string, mutator: (target: PlannerTarget) => void): void {
    oncommit((value) => {
      const target = value.targets.find((item) => item.id === id);
      if (target) mutator(target);
    });
  }
</script>

<section class="targets">
  <header>
    <div>
      <h2>Pull plan</h2>
      <p>Earliest pull first. Open a row to change rate-up goals or inspect the odds.</p>
    </div>
    <div class="target-heading-actions">
      <span>{activeTargets.length} {activeTargets.length === 1 ? 'target' : 'targets'}</span>
      {#if activeTargets.length}
        <div
          class="target-bulk"
          role="group"
          aria-label="Apply settings to every planned banner"
        >
          <span class="bulk-title">
            <Icon
              name="tune"
              size={15}
            />
            <strong>All banners</strong>
          </span>
          <SelectField
            id="planner-all-timing"
            label="Pull on"
            options={[
              { value: '', label: 'Individual' },
              { value: 'start', label: 'Banner start' },
              { value: 'end', label: 'Banner end' }
            ]}
            value={globalPullTiming}
            onchange={applyGlobalPullTiming}
          />
          <SelectField
            id="planner-all-paid"
            label={regularTargets.length < activeTargets.length
              ? 'Paid Carats (regular banners)'
              : 'Paid Carats'}
            disabled={!regularTargets.length}
            options={[
              { value: '', label: 'Mixed' },
              { value: 'free-only', label: 'Do not use' },
              { value: 'allow', label: 'Allowed' }
            ]}
            value={globalPaidCarats}
            onchange={applyGlobalPaidCarats}
          />
        </div>
      {/if}
    </div>
  </header>
  {#if !activeTargets.length}
    <div class="empty-targets">
      <span>
        <Icon
          name="calendar"
          size={24}
        />
      </span>
      <div>
        <strong>Your plan is ready for its first banner</strong>
        <p>
          Search above to add one. Regular banners start with 200 pulls, paid banners with one draw,
          and Step-Ups with one round.
        </p>
      </div>
    </div>
  {:else}
    <div class="target-list">
      {#each pullItems as item, index (item.id)}
        {#if item.kind === 'anniversary'}
          <div
            class="anniversary-marker"
            role="separator"
            aria-label={`${item.label} on ${item.date}`}
          >
            <span></span>
            <strong>
              <Icon
                name="cake"
                size={14}
              />{item.label}
            </strong>
            <span></span>
          </div>
        {:else}
          {@const target = item.target}<LazyContent
            height={150}
            eager={index < 2}
          >
            <PlannerTargetRow
              {target}
              past={item.past}
              projection={projectionByTarget.get(target.id)}
              {resources}
              {events}
              {catalog}
              {pickupCopyMemory}
              onupdate={(mutator) => updateTarget(target.id, mutator)}
              onremove={() => onremove(target.id)}
            />
          </LazyContent>
        {/if}
      {/each}
    </div>
    <p class="disclaimer">
      <Icon name="info" /> Each pickup uses its published rate. Uncap Crystals replace copies after the
      first. Available exchange copies are shared across selected goals after the pulls.
    </p>
  {/if}
</section>

<style>
  @import './planner-pull-plan.css';
</style>
