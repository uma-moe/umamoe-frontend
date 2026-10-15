<script lang="ts">
  import type {
    CaratPlan,
    PlannerCurrency,
    PlannerIncomeCadence
  } from '@/lib/carat-planner/carat-planner';
  import Button from '@/components/controls/Button.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import TextField from '@/components/controls/TextField.svelte';

  interface Props {
    plan: CaratPlan;
    oncommit: (mutator: (plan: CaratPlan) => void) => void;
  }

  let { plan, oncommit }: Props = $props();

  const currencyOptions = [
    { value: 'free_jewels', label: 'Carats' },
    { value: 'uma_ticket', label: 'Uma ticket' },
    { value: 'support_ticket', label: 'Support ticket' },
    { value: 'rainbow_crystal', label: 'Rainbow Crystal Shard' },
    { value: 'gold_crystal', label: 'Gold Crystal Shard' },
    { value: 'rainbow_full_crystal', label: 'Rainbow Uncap Crystal' },
    { value: 'gold_full_crystal', label: 'Gold Uncap Crystal' }
  ];
  const cadenceOptions = [
    { value: 'once', label: 'Once' },
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' }
  ];

  function addCustom(): void {
    oncommit((value) =>
      value.customIncome.push({
        id: 'income-' + crypto.randomUUID(),
        label: 'Custom income',
        currency: 'free_jewels',
        amount: 0,
        cadence: 'once',
        startDate: value.projectionStartDate,
        every: 1
      })
    );
  }
</script>

<section aria-labelledby="custom-income-heading">
  <header class="panel-heading">
    <div>
      <strong id="custom-income-heading">Custom income</strong>
      <span>{plan.customIncome.length || 'No'} custom sources</span>
    </div>
    <Button
      size="sm"
      variant="secondary"
      icon="add"
      onclick={addCustom}
    >
      Add income
    </Button>
  </header>
  {#if plan.customIncome.length}
    <div class="custom-list">
      {#each plan.customIncome as item (item.id)}
        <div class="custom">
          <TextField
            id={`income-name-${item.id}`}
            label="Income name"
            maxlength={100}
            value={item.label}
            oninput={(event) =>
              oncommit(
                (value) =>
                  (value.customIncome.find((entry) => entry.id === item.id)!.label = (
                    event.currentTarget as HTMLInputElement
                  ).value.slice(0, 100))
              )}
          />
          <TextField
            id={`income-amount-${item.id}`}
            label="Amount"
            type="number"
            min={0}
            value={String(item.amount)}
            oninput={(event) =>
              oncommit(
                (value) =>
                  (value.customIncome.find((entry) => entry.id === item.id)!.amount =
                    Number((event.currentTarget as HTMLInputElement).value) || 0)
              )}
          />
          <SelectField
            id={'income-currency-' + item.id}
            label="Resource"
            options={currencyOptions}
            value={item.currency}
            onchange={(selected) =>
              oncommit(
                (value) =>
                  (value.customIncome.find((entry) => entry.id === item.id)!.currency =
                    selected as PlannerCurrency)
              )}
          />
          <SelectField
            id={'income-cadence-' + item.id}
            label="Frequency"
            options={cadenceOptions}
            value={item.cadence}
            onchange={(selected) =>
              oncommit(
                (value) =>
                  (value.customIncome.find((entry) => entry.id === item.id)!.cadence =
                    selected as PlannerIncomeCadence)
              )}
          />
          <TextField
            id={`income-start-${item.id}`}
            label="Starts"
            type="date"
            value={item.startDate}
            oninput={(event) =>
              oncommit(
                (value) =>
                  (value.customIncome.find((entry) => entry.id === item.id)!.startDate = (
                    event.currentTarget as HTMLInputElement
                  ).value)
              )}
          />
          <Button
            size="sm"
            variant="danger"
            icon="close"
            ariaLabel={'Remove custom income ' + item.label}
            onclick={() =>
              oncommit(
                (value) =>
                  (value.customIncome = value.customIncome.filter((entry) => entry.id !== item.id))
              )}
          />
        </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  @import './planner-income-sections.css';
  .custom-list {
    display: grid;
    gap: 6px;
  }
  .custom {
    display: grid;
    grid-template-columns:
      minmax(150px, 1.5fr) minmax(80px, 0.7fr) minmax(130px, 1fr) minmax(100px, 1fr)
      minmax(120px, 1fr) 36px;
    align-items: end;
    gap: 6px;
  }
  .custom :global(.ui-button) {
    min-width: 36px;
    padding-inline: 0;
  }
  @media (max-width: 980px) {
    .custom {
      grid-template-columns: 2fr 1fr 1fr;
    }
  }
  @media (max-width: 600px) {
    .custom {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .custom > :global(.field:first-child) {
      grid-column: 1/-1;
    }
    .custom :global(.ui-button) {
      grid-column: 2;
      min-width: var(--touch-target);
    }
  }
</style>
