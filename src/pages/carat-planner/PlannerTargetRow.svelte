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
  import { tick } from 'svelte';
  import {
    isPaidBanner,
    paidBannerSteps,
    plannerCardKind
  } from '@/lib/timeline/planner-paid-banners';
  import { itemIconPath } from '@/lib/catalog/item-icons';
  import type { TimelineRecord } from '@/pages/timeline/timeline-repository';
  import {
    availableCrystals,
    findGacha,
    plannerPickupGoals,
    recordedPlannerCount,
    type PlannerDataBundle,
    type PlannerTarget,
    type TargetProjection
  } from '@/lib/timeline/carat-planner';
  import { plannerPickupOptions } from '@/lib/timeline/planner-presentation';
  import type { TimelinePickupCatalog } from '@/lib/timeline/timeline-pickups';
  import PlannerTargetGoals from './PlannerTargetGoals.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Checkbox from '@/components/controls/Checkbox.svelte';
  import Icon from '@/components/Icon.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';

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

  let notesOpen = $state(false);
  let resultsOpen = $state(false);

  async function openEditor(kind: 'notes' | 'results', trigger: HTMLButtonElement) {
    trigger.focus({ preventScroll: true });
    if (kind === 'notes') notesOpen = true;
    else resultsOpen = true;
    await tick();
    document
      .getElementById(`${kind === 'notes' ? 'notes' : 'actual-pulls'}-${target.id}`)
      ?.focus({ preventScroll: true });
  }

  const gacha = $derived(findGacha(target, resources));
  const paidOnly = $derived(isPaidBanner(target, gacha));
  const cardKind = $derived(plannerCardKind(target, gacha));
  const maxPulls = $derived(
    paidOnly ? paidBannerSteps(gacha).reduce((sum, step) => sum + step.pulls, 0) : 5000
  );
  const stepUp = $derived(gacha?.step_up);
  const pickupOptions = $derived(plannerPickupOptions(target, gacha, events, catalog));
  const actualGoals = $derived(
    stepUp
      ? [{ key: 'chosen', name: 'Chosen card', image: '', desiredCopies: target.desiredCopies }]
      : plannerPickupGoals(target).map((goal) => {
          const option = pickupOptions.find((option) => option.pickupId === goal.pickupId);
          return {
            key: String(goal.pickupId),
            name: option?.name ?? `Pickup ${goal.pickupId}`,
            image: option?.image ?? '',
            desiredCopies: goal.desiredCopies
          };
        })
  );
  const stepOptions = $derived.by(() => {
    let pulls = 0,
      cost = 0;
    const options = [{ value: '0', label: 'No pulls' }];
    if (stepUp)
      for (let round = 1; round <= stepUp.rounds; round++) {
        for (const [index, step] of stepUp.steps.entries()) {
          pulls += step.pulls;
          cost += step.cost;
          options.push({
            value: String(pulls),
            label: `${stepUp.rounds > 1 ? 'Round ' + round + ', ' : ''}Step ${index + 1} · ${pulls} pulls · ${cost.toLocaleString()} paid Carats`
          });
        }
      }
    return options;
  });
  const ticketKind = $derived(
    (findGacha(target, resources)?.ticket_currency ??
      (cardKind === 'support' && !stepUp ? 'support_ticket' : 'uma_ticket')) === 'support_ticket'
      ? 'support'
      : 'uma'
  );
  const ticketCount = $derived(
    projection?.balanceBefore[ticketKind === 'support' ? 'supportTickets' : 'umaTickets'] ?? 0
  );
  const ticketLabel = $derived(
    `${ticketCount} ${ticketKind === 'support' ? 'support' : 'Trainee'} tickets available at pull; ${projection?.ticketPulls ? `${projection.ticketPulls} used and ${ticketCount - projection.ticketPulls} remaining` : 'none used'}`
  );
  const caratsBefore = $derived(
    (projection?.balanceBefore.freeJewels ?? 0) + (projection?.balanceBefore.paidJewels ?? 0)
  );
  const caratsAfter = $derived(
    (projection?.freeJewelsAfter ?? 0) + (projection?.paidJewelsAfter ?? 0)
  );
  const caratLabel = $derived(
    projection
      ? `${caratsBefore.toLocaleString()} Carats at pull (${projection.balanceBefore.freeJewels.toLocaleString()} free, ${projection.balanceBefore.paidJewels.toLocaleString()} paid); ${(caratsBefore - caratsAfter).toLocaleString()} spent; ${caratsAfter.toLocaleString()} remaining${!paidOnly && !target.allowPaidJewels && projection.balanceBefore.paidJewels > 0 ? '; paid Carats are reserved and will not be spent' : ''}`
      : ''
  );

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

  function setActualPulls(raw: string): void {
    const count = recordedPlannerCount(raw);
    onupdate(
      (value) =>
        (value.actualPulls =
          count === undefined
            ? undefined
            : Math.min(maxPulls, paidOnly ? Math.floor(count / 10) * 10 : count))
    );
  }

  function setActualCopies(key: string, raw: string): void {
    const count = recordedPlannerCount(raw);
    onupdate((value) => {
      const copies = { ...value.actualCopies };
      if (count === undefined) delete copies[key];
      else copies[key] = count;
      value.actualCopies = Object.keys(copies).length ? copies : undefined;
    });
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
      <div
        class="banner-actions"
        role="group"
        aria-label={`Notes and results for ${target.title}`}
      >
        <button
          type="button"
          class="action-trigger notes-trigger"
          class:recorded={Boolean(target.notes)}
          title={target.notes || 'Add notes'}
          aria-label={`Edit notes for ${target.title}`}
          aria-haspopup="dialog"
          aria-expanded={notesOpen}
          onclick={(event) => openEditor('notes', event.currentTarget)}
        >
          <Icon
            name="edit"
            size={16}
          />
          <span>Notes</span>
          {#if target.notes}
            <i aria-label="Has notes"></i>
          {/if}
        </button>
        <Dialog
          bind:open={notesOpen}
          title="Banner notes"
          maxWidth="420px"
          maxHeight="calc(100dvh - 16px)"
          mobileInset="16px"
        >
          <div class="notes-editor">
            <textarea
              id={`notes-${target.id}`}
              aria-label={`Notes for ${target.title}`}
              rows="4"
              maxlength="2000"
              placeholder="e.g. LB3, +1 selector; usable at LB2"
              value={target.notes ?? ''}
              oninput={(event) =>
                onupdate(
                  (value) => (value.notes = event.currentTarget.value || undefined)
                )}></textarea>
            <footer>
              <small>Saved automatically</small>
              <Button
                variant="secondary"
                size="sm"
                icon="save"
                ariaLabel={`Save notes for ${target.title}`}
                onclick={() => (notesOpen = false)}
              >
                Save
              </Button>
            </footer>
          </div>
        </Dialog>
        <button
          type="button"
          class="action-trigger results-trigger"
          class:recorded={target.actualPulls !== undefined || Boolean(target.actualCopies)}
          title="Actual results"
          aria-label={`Actual results for ${target.title}`}
          aria-haspopup="dialog"
          aria-expanded={resultsOpen}
          onclick={(event) => openEditor('results', event.currentTarget)}
        >
          <Icon
            name={target.actualPulls !== undefined || target.actualCopies ? 'check' : 'clipboard'}
            size={16}
          />
          <span>Results</span>
        </button>
        <Dialog
          bind:open={resultsOpen}
          title="Actual results"
          description="Your original plan stays unchanged."
          maxWidth="420px"
          maxHeight="calc(100dvh - 16px)"
          mobileInset="16px"
        >
          <div class="results-editor">
            <div
              class="result-entry"
              class:step-up={Boolean(stepUp)}
            >
              <span class="result-label">
                <strong>Pulls done</strong>
                <small>{target.plannedPulls} planned · include free pulls &amp; tickets</small>
              </span>
              {#if stepUp}
                <SelectField
                  id={`actual-pulls-${target.id}`}
                  label="Actual step-up progress"
                  hideLabel
                  options={[{ value: '', label: 'Not recorded' }, ...stepOptions]}
                  value={String(target.actualPulls ?? '')}
                  onchange={setActualPulls}
                />
              {:else}
                <TextField
                  id={`actual-pulls-${target.id}`}
                  label="Actual pulls done"
                  hideLabel
                  type="number"
                  min={0}
                  max={maxPulls}
                  step={paidOnly ? 10 : 1}
                  placeholder="—"
                  value={String(target.actualPulls ?? '')}
                  oninput={(event) =>
                    setActualPulls((event.currentTarget as HTMLInputElement).value)}
                />
              {/if}
            </div>
            {#if actualGoals.length}
              <div class="result-copies">
                <strong>
                  Copies received <small>Optional</small>
                </strong>
                {#each actualGoals as goal (goal.key)}
                  <div class="result-entry">
                    <span class="result-name">
                      <span class="result-art">
                        {#if goal.image}
                          <img
                            src={goal.image}
                            width="30"
                            height="30"
                            loading="lazy"
                            alt=""
                            onerror={(event) =>
                              ((event.currentTarget as HTMLImageElement).hidden = true)}
                          />
                        {/if}<Icon
                          name={cardKind === 'support' ? 'grid' : 'user'}
                          size={20}
                        />
                      </span>
                      <span>
                        <strong>{goal.name}</strong>
                        <small>{goal.desiredCopies} planned copies</small>
                      </span>
                    </span>
                    <TextField
                      id={`actual-copies-${target.id}-${goal.key}`}
                      label={`Actual copies of ${goal.name}`}
                      hideLabel
                      type="number"
                      min={0}
                      max={5000}
                      step={1}
                      placeholder="—"
                      value={String(target.actualCopies?.[goal.key] ?? '')}
                      oninput={(event) =>
                        setActualCopies(goal.key, (event.currentTarget as HTMLInputElement).value)}
                    />
                  </div>
                {/each}
                <small>Include exchanges, exclude Uncap Crystals.</small>
              </div>
            {/if}
            <p>Saved automatically. Clear pulls to use your planned budget.</p>
          </div>
        </Dialog>
      </div>
      {#if projection}
        <div
          class="at-pull"
          aria-label={`At pull date: ${caratLabel}${paidOnly ? '' : '; ' + ticketLabel}`}
        >
          <small>At pull</small>
          <span
            class="carat-balance"
            title={caratLabel}
          >
            <img
              src={itemIconPath(43)}
              width="18"
              height="18"
              alt="Carats"
            />
            <b>{caratsBefore.toLocaleString()}</b>
            <em>→ {caratsAfter.toLocaleString()}</em>
          </span>
          {#if !paidOnly}
            <span title={ticketLabel}>
              <img
                src={itemIconPath(ticketKind === 'support' ? 111 : 41)}
                width="18"
                height="18"
                alt=""
              />
              <b>{ticketCount}</b>
              {#if projection.ticketPulls}
                <em>→ {ticketCount - projection.ticketPulls}</em>
              {/if}
            </span>
            {#if cardKind === 'support' && !stepUp}
              {#each ['rainbow', 'gold'] as kind}
                <span
                  title={`${kind === 'rainbow' ? 'Rainbow' : 'Gold'} Uncap Crystals available at pull`}
                >
                  <img
                    src={itemIconPath(kind === 'rainbow' ? 144 : 145)}
                    width="18"
                    height="18"
                    alt=""
                  />
                  <b>
                    {kind === 'rainbow'
                      ? availableCrystals(
                          projection.balanceBefore.rainbowFullCrystals,
                          projection.balanceBefore.rainbowCrystals
                        )
                      : availableCrystals(
                          projection.balanceBefore.goldFullCrystals,
                          projection.balanceBefore.goldCrystals
                        )}
                  </b>
                </span>
              {/each}
            {/if}
          {/if}
        </div>
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
    <div
      class="target-actions"
      role="group"
      aria-label={`Actions for ${target.title}`}
    >
      <InspectPopover
        label="Target options"
        align="end"
      >
        {#snippet trigger()}
          <span class="options-trigger">
            <Icon
              name="tune"
              size={16}
            />
          </span>
        {/snippet}
        <div class="target-options">
          <strong>Target options</strong>
          <small>
            {paidOnly
              ? 'This banner uses paid Carats only.'
              : 'The recommended defaults use tickets first and pull at banner end.'}
          </small>
          <SelectField
            id={`timing-${target.id}`}
            label="Pull on"
            options={[
              { value: 'start', label: 'Banner start' },
              { value: 'end', label: 'Banner end' },
              { value: 'custom', label: 'Custom date' }
            ]}
            value={target.pullTiming}
            onchange={(value) =>
              onupdate((item) => (item.pullTiming = value as PlannerTarget['pullTiming']))}
          />{#if target.pullTiming === 'custom'}
            <TextField
              id={`pull-date-${target.id}`}
              label="Pull date"
              type="date"
              value={target.customPullDate ?? ''}
              oninput={(event) =>
                onupdate(
                  (value) =>
                    (value.customPullDate = (event.currentTarget as HTMLInputElement).value)
                )}
            />
          {/if}{#if !paidOnly}
            <Checkbox
              id={`tickets-${target.id}`}
              label="Use tickets first"
              checked={target.useTickets}
              onchange={(checked) => onupdate((value) => (value.useTickets = checked))}
            /><Checkbox
              id={`paid-${target.id}`}
              label="Allow paid Carats"
              checked={target.allowPaidJewels}
              onchange={(checked) => onupdate((value) => (value.allowPaidJewels = checked))}
            />{#if target.useTickets}
              <TextField
                id={`ticket-limit-${target.id}`}
                label="Ticket limit"
                type="number"
                min={0}
                placeholder="No limit"
                value={String(target.ticketLimit ?? '')}
                oninput={(event) =>
                  onupdate(
                    (value) =>
                      (value.ticketLimit =
                        (event.currentTarget as HTMLInputElement).value === ''
                          ? undefined
                          : Math.max(
                              0,
                              Number((event.currentTarget as HTMLInputElement).value) || 0
                            ))
                  )}
              />
            {/if}
          {/if}
        </div>
      </InspectPopover>
      <Button
        variant="secondary"
        size="sm"
        icon="trash"
        ariaLabel={`Remove ${target.title}`}
        onclick={onremove}
      />
    </div>
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
