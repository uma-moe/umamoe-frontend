<script lang="ts">
  import type { HpBillLine, hpBill } from './hp-needed';
  import { signed, whole } from './hp-result';

  interface Props {
    bill: NonNullable<ReturnType<typeof hpBill>>;
    /** The result has a distribution over many races, so the bill is the median race's. */
    median: boolean;
    /** The race decided the last spurt at a known HP. */
    decided: boolean;
  }

  let { bill, median, decided }: Props = $props();
</script>

{#snippet line(item: HpBillLine)}
  <tr
    class:start={item.start}
    class:total={item.total}
    class:plus={!item.start && !item.total && item.hp > 0}
  >
    <th scope="row">{item.label}</th>
    <td>{item.start || item.total ? whole(item.hp) : signed(item.hp)}</td>
  </tr>
{/snippet}

<div class="bill">
  <h3>{median ? 'Where her HP goes in the median race' : 'Where her HP goes'}</h3>
  <table>
    <caption>{bill.after.length ? 'Up to the spurt check' : 'The whole race'}</caption>
    <tbody>
      {#each bill.before as item}{@render line(item)}{/each}
      {#if bill.decision && decided}<tr class="decision">
          <th scope="row">Top-speed spurt needs</th>
          <td>{whole(bill.decision.need)}</td>
        </tr>{/if}
    </tbody>
  </table>
  {#if bill.after.length}<table>
      <caption>The last spurt</caption>
      <tbody>
        {#each bill.after as item}{@render line(item)}{/each}
      </tbody>
    </table>{/if}
</div>

<style>
  @container hp-result (min-width: 900px) {
    :global(.hp-result) > .bill {
      grid-column: 2;
      grid-row: 4 / span 4;
    }
  }
  /* The bill: the two parts of the race side by side. */
  .bill {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px 16px;
    align-items: start;
  }
  .bill h3 {
    grid-column: 1 / -1;
    margin: 0;
    font-size: 12px;
    font-weight: 650;
  }
  .bill table:only-of-type {
    grid-column: 1 / -1;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  caption {
    padding-bottom: 2px;
    border-bottom: 1px solid var(--border-subtle);
    font-size: 11px;
    color: var(--text-secondary);
    text-align: left;
  }
  th,
  td {
    padding: 2px 0;
    font-weight: 400;
    text-align: left;
    white-space: nowrap;
  }
  td {
    padding-left: 8px;
    text-align: right;
  }
  .plus td {
    color: var(--accent-success);
  }
  .start th,
  .start td,
  .decision th,
  .decision td {
    color: var(--text-secondary);
  }
  .total th,
  .total td {
    border-top: 1px solid var(--border-primary);
    font-weight: 700;
  }
</style>
