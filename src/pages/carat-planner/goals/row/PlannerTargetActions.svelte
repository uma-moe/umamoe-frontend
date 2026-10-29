<script lang="ts">
  import type { PlannerTarget } from '@/lib/carat-planner/carat-planner';
  import Button from '@/components/controls/Button.svelte';
  import Checkbox from '@/components/controls/Checkbox.svelte';
  import Icon from '@/components/Icon.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';

  interface Props {
    target: PlannerTarget;
    paidOnly: boolean;
    onupdate: (mutator: (target: PlannerTarget) => void) => void;
    onremove: () => void;
  }

  let { target, paidOnly, onupdate, onremove }: Props = $props();
</script>

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
              (value) => (value.customPullDate = (event.currentTarget as HTMLInputElement).value)
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
                      : Math.max(0, Number((event.currentTarget as HTMLInputElement).value) || 0))
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

<style>
  .target-actions {
    grid-column: 3;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
  }
  .target-options > small {
    color: var(--text-secondary);
    font-size: 10px;
  }
  .target-actions > :global(.ui-button) {
    width: 36px;
    padding: 0;
  }
  .options-trigger {
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    border: 1px solid var(--factor-field-border);
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    background: var(--factor-field-bg);
  }
  .target-options {
    display: grid;
    gap: 8px;
  }
  @container planner-targets (max-width:720px) {
    .target-actions {
      grid-column: 2;
      grid-row: 1;
    }
  }
  @media (max-width: 767px) {
    .target-actions {
      grid-column: 2;
      grid-row: 1;
    }
    .options-trigger,
    .target-actions > :global(.ui-button) {
      width: var(--touch-target);
      height: var(--touch-target);
    }
  }
</style>
