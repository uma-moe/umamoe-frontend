<script lang="ts">
  import type { OptimizeFinalist } from '../../../simulator-repository';
  import type { PricedOffer } from '../../../setup/build/skill-offers';
  import { amount, difference, gainOf } from './build-result';

  interface Props {
    /** The best build first, then the builds close behind it. */
    finalists: OptimizeFinalist[];
    offers: PricedOffer[];
    /** Gains are runners beaten in real CM fields, not seconds. */
    field: boolean;
  }

  let { finalists, offers, field }: Props = $props();

  const best = $derived(finalists[0]);
</script>

<section
  class="others"
  aria-label="Close behind"
>
  <h3>Close behind</h3>
  <ol>
    {#each finalists.slice(1) as finalist, index}
      {@const change = difference(finalist, best, offers)}
      {@const gain = gainOf(finalist)}
      <li>
        <span class="place">{index + 2}</span>
        <span class="change">
          {#each change.adds as name}<span class="add">+ {name}</span>{/each}
          {#each change.drops as name}<span class="drop">− {name}</span>{/each}
          {#if !change.adds.length && !change.drops.length}<span>Same skills</span>{/if}
        </span>
        <span class="numbers">
          <strong>{gain ? amount(gain.mean, field) : '—'}</strong>
          <small>{finalist.sp_cost.toLocaleString()} SP</small>
        </span>
      </li>
    {/each}
  </ol>
</section>

<style>
  :global(.stale) .others {
    opacity: 0.5;
  }
  .others h3 {
    margin: 0 0 6px;
    font-size: 12px;
    font-weight: 650;
    color: var(--text-secondary);
  }
  .others ol {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .others li {
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr) auto;
    align-items: start;
    gap: 8px;
    padding: 6px 0;
    border-top: 1px solid var(--border-subtle);
    font-size: 12px;
  }
  .place {
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
  }
  .change {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 8px;
    min-width: 0;
  }
  .add {
    color: var(--accent-success);
  }
  .drop {
    color: var(--accent-error);
  }
  .numbers {
    display: grid;
    justify-items: end;
    font-variant-numeric: tabular-nums;
  }
  .numbers small {
    color: var(--text-secondary);
  }
</style>
