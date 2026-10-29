<script
  module
  lang="ts"
>
  const dateFormatter = new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  });
</script>

<script lang="ts">
  import {
    isPaidBanner,
    paidBannerSteps,
    plannerCardKind
  } from '@/lib/carat-planner/gacha/planner-paid-banners';
  import { itemIconPath } from '@/lib/game-assets/item-icons';
  import type { TimelineRecord } from '@/pages/timeline/timeline-repository';
  import {
    findGacha,
    type PlannerDataBundle,
    type PlannerTarget,
    type TargetProjection
  } from '@/lib/carat-planner/carat-planner';
  import { plannerPickupOptions } from '@/lib/carat-planner/presentation/planner-presentation';
  import type { TimelinePickupCatalog } from '@/lib/timeline/events/timeline-pickups';
  import { plannerStepOptions } from './planner-target-steps';
  import PlannerTargetGoals from '../PlannerTargetGoals.svelte';
  import PlannerTargetActions from './PlannerTargetActions.svelte';
  import PlannerTargetAtPull from './PlannerTargetAtPull.svelte';
  import PlannerTargetRecords from './PlannerTargetRecords.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Icon from '@/components/Icon.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import TextField from '@/components/controls/TextField.svelte';

  interface Props {
    target: PlannerTarget;
    past?: boolean;
    projection?: TargetProjection;
    resources: PlannerDataBundle;
    events: TimelineRecord[];
    catalog: TimelinePickupCatalog;
    pickupCopyMemory: Map<string, number>;
    onupdate: (mutator: (target: PlannerTarget) => void) => void;
    onremove: () => void;
  }

  let {
    target,
    past = false,
    projection,
    resources,
    events,
    catalog,
    pickupCopyMemory,
    onupdate,
    onremove
  }: Props = $props();

  const gacha = $derived(findGacha(target, resources));
  const paidOnly = $derived(isPaidBanner(target, gacha));
  const cardKind = $derived(plannerCardKind(target, gacha));
  const maxPulls = $derived(
    paidOnly ? paidBannerSteps(gacha).reduce((sum, step) => sum + step.pulls, 0) : 5000
  );

  const stepUp = $derived(gacha?.step_up);
  const pickupOptions = $derived(plannerPickupOptions(target, gacha, events, catalog));
  const stepOptions = $derived(plannerStepOptions(stepUp));

  function dateLabel(value?: string): string {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) ? dateFormatter.format(date) : 'Unknown';
  }

  function setPulls(pulls: number): void {
    onupdate(
      (value) =>
        (value.plannedPulls = Math.max(
          0,
          Math.min(maxPulls, paidOnly ? Math.floor(pulls / 10) * 10 || 0 : Math.trunc(pulls) || 0)
        ))
    );
  }
</script>

<article
  class="target"
  class:past
  data-target-id={target.id}
>
  <div
    class="target-title"
    class:has-image={Boolean(target.imagePath)}
  >
    <div class="banner-media">
      {#if target.imagePath}
        <img
          src={target.imagePath}
          width="512"
          height="125"
          loading="lazy"
          alt=""
        />
      {/if}
    </div>
    <div class="target-info">
      <div class="banner-identity">
        <strong class:paid={paidOnly}>
          {#if paidOnly}
            <span
              aria-label="Paid banner"
              title="Paid banner"
            >
              <Icon
                name="paid"
                size={17}
              />
            </span>
          {/if}{target.title}
        </strong>
        <small class="date">
          <Icon
            name="calendar"
            size={13}
          />{dateLabel(target.bannerStart)} – {dateLabel(target.bannerEnd ?? target.bannerStart)}
        </small>
      </div>
      <PlannerTargetRecords
        {target}
        {stepUp}
        {stepOptions}
        {maxPulls}
        {paidOnly}
        {cardKind}
        {pickupOptions}
        {onupdate}
      />
      {#if projection}
        <PlannerTargetAtPull
          {target}
          {projection}
          {gacha}
          {paidOnly}
          {cardKind}
        />
      {/if}
      {#if target.notes}
        <span
          class="note-preview"
          title={target.notes}
        >
          {target.notes}
        </span>
      {/if}
    </div>
  </div>
  <div class="target-controls">
    <div
      class="pull-count"
      class:step-progress={Boolean(stepUp)}
    >
      <div class="pull-heading">
        <span>Planned pulls</span>
      </div>
      {#if stepUp}
        <SelectField
          id={`step-${target.id}`}
          label="Step-up progress"
          hideLabel
          options={stepOptions}
          value={String(target.plannedPulls)}
          onchange={(value) => setPulls(Number(value))}
        />
      {:else}
        <div
          class="stepper"
          role="group"
          aria-label="Planned pulls"
        >
          <Button
            variant="secondary"
            size="sm"
            ariaLabel="Add 100 pulls"
            disabled={target.plannedPulls >= maxPulls}
            onclick={() => setPulls(target.plannedPulls + 100)}
          >
            +100
          </Button><Button
            variant="secondary"
            size="sm"
            ariaLabel="Add 10 pulls"
            disabled={target.plannedPulls >= maxPulls}
            onclick={() => setPulls(target.plannedPulls + 10)}
          >
            +10
          </Button><TextField
            id={`pulls-${target.id}`}
            label="Planned pulls"
            hideLabel
            type="number"
            min={0}
            max={maxPulls}
            step={10}
            value={String(target.plannedPulls)}
            oninput={(event) => setPulls(Number((event.currentTarget as HTMLInputElement).value))}
          /><Button
            variant="secondary"
            size="sm"
            ariaLabel="Remove 10 pulls"
            disabled={target.plannedPulls <= 0}
            onclick={() => setPulls(target.plannedPulls - 10)}
          >
            −10
          </Button><Button
            variant="secondary"
            size="sm"
            ariaLabel="Remove 100 pulls"
            disabled={target.plannedPulls <= 0}
            onclick={() => setPulls(target.plannedPulls - 100)}
          >
            −100
          </Button>
        </div>
      {/if}
    </div>
    {#if cardKind === 'support' && !stepUp}
      <div
        class="crystal-plan"
        role="group"
        aria-label="Uncap Crystals to use on this banner"
      >
        <span title="Replace extra copies after the first">
          <strong>Uncap crystals</strong>
          <small>Replace extra copies after the first</small>
        </span>
        <div class="crystal-controls">
          {#each ['rainbow', 'gold'] as kind}
            {@const name = kind === 'rainbow' ? 'Rainbow' : 'Gold'}{@const key =
              kind === 'rainbow' ? 'rainbowCrystalsPlanned' : 'goldCrystalsPlanned'}
            <div class="crystal-control">
              <span>
                <img
                  src={itemIconPath(kind === 'rainbow' ? 144 : 145)}
                  width="24"
                  height="24"
                  alt=""
                />
                <span>
                  <strong>{name}</strong>
                  <small>{kind === 'rainbow' ? 'SSR' : 'SR'} cards</small>
                </span>
              </span>
              <div
                class="crystal-stepper"
                role="group"
                aria-label={`${name} Uncap Crystals to use on this banner`}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  icon="minus"
                  ariaLabel={`Use one fewer ${name} Uncap Crystal`}
                  disabled={!target[key]}
                  onclick={() =>
                    onupdate((value) => (value[key] = Math.max(0, (value[key] ?? 0) - 1)))}
                />
                <output aria-label={`${name} Uncap Crystals planned`}>{target[key] ?? 0}</output>
                <Button
                  variant="ghost"
                  size="sm"
                  icon="add"
                  ariaLabel={`Use one more ${name} Uncap Crystal`}
                  disabled={(target[key] ?? 0) >= 20}
                  onclick={() =>
                    onupdate((value) => (value[key] = Math.min(20, (value[key] ?? 0) + 1)))}
                />
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
    <PlannerTargetActions
      {target}
      {paidOnly}
      {onupdate}
      {onremove}
    />
  </div>
  {#if past}
    <div
      class="past-note"
      role="note"
    >
      <Icon
        name="timeline"
        size={16}
      />
      <span>
        <strong>Before plan start</strong>
        <small>Kept for editing, but excluded from this projection.</small>
      </span>
    </div>
  {/if}
  {#if paidOnly && !past && !maxPulls}
    <div
      class="past-note"
      role="status"
    >
      <Icon
        name="warning"
        size={16}
      />
      <span>
        Paid banner costs are unavailable. Funding and odds will appear when its data loads.
      </span>
    </div>
  {:else if !past && projection}
    <PlannerTargetGoals
      {target}
      {projection}
      {resources}
      {events}
      {catalog}
      {pickupCopyMemory}
      {onupdate}
    />
  {/if}
</article>

<style>
  @import './planner-target-row.css';
</style>
