<script lang="ts">
  import { tick } from 'svelte';
  import {
    plannerPickupGoals,
    recordedPlannerCount,
    type PlannerStepUp,
    type PlannerTarget
  } from '@/lib/carat-planner/carat-planner';
  import type { plannerPickupOptions } from '@/lib/carat-planner/presentation/planner-presentation';
  import Button from '@/components/controls/Button.svelte';
  import Icon from '@/components/Icon.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';

  interface Props {
    target: PlannerTarget;
    stepUp?: PlannerStepUp;
    stepOptions: { value: string; label: string }[];
    maxPulls: number;
    paidOnly: boolean;
    cardKind: 'support' | 'character';
    pickupOptions: ReturnType<typeof plannerPickupOptions>;
    onupdate: (mutator: (target: PlannerTarget) => void) => void;
  }

  let {
    target,
    stepUp,
    stepOptions,
    maxPulls,
    paidOnly,
    cardKind,
    pickupOptions,
    onupdate
  }: Props = $props();

  let notesOpen = $state(false);
  let resultsOpen = $state(false);

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

  async function openEditor(kind: 'notes' | 'results', trigger: HTMLButtonElement) {
    trigger.focus({ preventScroll: true });
    if (kind === 'notes') notesOpen = true;
    else resultsOpen = true;
    await tick();
    document
      .getElementById(`${kind === 'notes' ? 'notes' : 'actual-pulls'}-${target.id}`)
      ?.focus({ preventScroll: true });
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
        placeholder="e.g. LB3 with a +1 selector, usable at LB2"
        value={target.notes ?? ''}
        oninput={(event) =>
          onupdate((value) => (value.notes = event.currentTarget.value || undefined))}></textarea>
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
          <small>{target.plannedPulls} planned, including free pulls and tickets</small>
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
            oninput={(event) => setActualPulls((event.currentTarget as HTMLInputElement).value)}
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
                      onerror={(event) => ((event.currentTarget as HTMLImageElement).hidden = true)}
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

<style>
  @import './planner-target-records.css';
</style>
