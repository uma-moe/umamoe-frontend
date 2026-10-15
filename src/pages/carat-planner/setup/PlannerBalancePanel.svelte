<script lang="ts">
  import { itemIconPath } from '@/lib/catalog/item-icons';
  import type { CaratPlan, PlannerBalances } from '@/lib/carat-planner/carat-planner';
  import { validPlannerDateKey } from '@/lib/carat-planner/planner-calendar';
  import TextField from '@/components/controls/TextField.svelte';
  import type { IconName } from '@/components/icon-types';

  let {
    plan,
    oncommit
  }: { plan: CaratPlan; oncommit: (mutator: (plan: CaratPlan) => void) => void } = $props();

  function updateBalance(key: keyof PlannerBalances, event: Event) {
    const value = Number((event.currentTarget as HTMLInputElement).value);
    oncommit(
      (plan) => (plan.balances[key] = Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0)
    );
  }
</script>

{#snippet amount(key: keyof PlannerBalances, label: string, icon?: IconName, itemId?: number)}
  <TextField
    id={`planner-balance-${key}`}
    {label}
    type="number"
    min={0}
    step={1}
    value={String(plan.balances[key])}
    prefixIcon={icon}
    prefixImage={itemId ? itemIconPath(itemId) : undefined}
    oninput={(event) => updateBalance(key, event)}
  />
{/snippet}

<div class="balance-panel">
  <TextField
    id="planner-start-date"
    label="Start date"
    type="date"
    value={plan.projectionStartDate}
    oninput={(event) => {
      const date = validPlannerDateKey((event.currentTarget as HTMLInputElement).value);
      if (date) oncommit((plan) => (plan.projectionStartDate = date));
    }}
  />
  <fieldset>
    <legend>Carats</legend>
    {@render amount('freeJewels', 'Free', 'diamond')}
    {@render amount('paidJewels', 'Paid', 'paid')}
  </fieldset>
  <fieldset>
    <legend>Tickets</legend>
    {@render amount('umaTickets', 'Uma', 'ticket')}
    {@render amount('supportTickets', 'Support', 'cards')}
  </fieldset>
  <fieldset>
    <legend>Uncap Crystals</legend>
    {@render amount('rainbowFullCrystals', 'Rainbow', undefined, 144)}
    {@render amount('goldFullCrystals', 'Gold', undefined, 145)}
  </fieldset>
  <fieldset>
    <legend>Crystal shards</legend>
    {@render amount('rainbowCrystals', 'Rainbow', undefined, 149)}
    {@render amount('goldCrystals', 'Gold', undefined, 150)}
  </fieldset>
</div>

<style>
  .balance-panel {
    display: grid;
    grid-template-columns: minmax(150px, 0.65fr) repeat(4, minmax(160px, 1fr));
    align-items: end;
    gap: 10px;
    min-width: 0;
  }
  fieldset {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: end;
    gap: 8px;
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }
  legend {
    margin: 0 0 3px;
    padding: 0;
    color: var(--text-secondary);
    font-size: 10px;
    font-weight: 650;
  }
  @container planner-setup (max-width:1300px) {
    .balance-panel {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .balance-panel > :global(.field) {
      grid-column: 1/-1;
    }
  }
  @media (max-width: 767px) {
    .balance-panel {
      --control-height: var(--touch-target);
      padding-inline: 2px;
    }
  }
  @container planner-setup (max-width:600px) {
    .balance-panel {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
