<script lang="ts">
  import { itemIconPath } from '@/lib/game-assets/item-icons';
  import type { PlannerIncomeProjection } from './planner-income-edits';
  import Icon from '@/components/Icon.svelte';

  interface Props {
    startDate: string;
    income: PlannerIncomeProjection;
    loading: boolean;
  }

  let { startDate, income, loading }: Props = $props();

  const dateFormatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  });

  const period = $derived(
    `${dateFormatter.format(new Date(startDate + 'T00:00:00Z'))} – ${dateFormatter.format(new Date(income.through + 'T00:00:00Z'))}`
  );
</script>

<section
  class="income-overview"
  aria-label="Projected income"
  aria-busy={loading}
>
  <header class="panel-heading">
    <div>
      <strong>Projected income</strong>
      <span>
        {period}{income.preview ? ' (30-day preview)' : ', until your last planned pull'}
      </span>
    </div>
  </header>
  <p>
    Includes selected income, estimates, custom entries and dated rewards in this period. Excludes
    your starting balance and pull spending.
  </p>
  {#if loading}
    <p>Loading income…</p>
  {:else}
    {#if income.resources.length}
      <dl class="income-resources">
        {#each income.resources as item (item.currency)}
          <div data-currency={item.currency}>
            <img
              src={itemIconPath(item.itemId)}
              width="24"
              height="24"
              alt=""
            />
            <dt>{item.label}</dt>
            <dd class:deduction={item.amount < 0}>{item.formatted}</dd>
          </div>
        {/each}
      </dl>
    {:else}
      <p class="income-empty">
        No income is scheduled in this period. Selected sources count when their payouts fall within
        these dates.
      </p>
    {/if}
    {#if income.sources.length}
      <details class="income-breakdown">
        <summary>
          <span>
            Included sources <small>{income.sources.length}</small>
          </span>
          <Icon
            name="chevron"
            size={16}
          />
        </summary>
        <ul>
          {#each income.sources as source}
            <li>
              <strong>{source.label}</strong>
              <span>{source.amountLabel}</span>
            </li>
          {/each}
        </ul>
      </details>
    {/if}
  {/if}
</section>

<style>
  @import './planner-income-sections.css';
  @import './planner-income-overview.css';
</style>
