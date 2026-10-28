<script lang="ts">
  import type { OptimizeFinalist } from '../../../simulator-repository';
  import type { PricedOffer } from '../../../setup/build/skill-offers';
  import BuildCard from './BuildCard.svelte';
  import { changesFromBest, compareRows, gainOf, type StatCell } from './build-result';

  /** The builds that came close to the best, each as a card with what it swaps from the best build. */
  interface Props {
    finalists: OptimizeFinalist[];
    offers: PricedOffer[];
    /** Each finalist's race stats, the best's first. */
    stats: StatCell[][];
    /** Gains are runners beaten in real CM fields, not seconds. */
    field: boolean;
  }

  let { finalists, offers, stats, field }: Props = $props();

  const differ = $derived(compareRows(finalists, offers).differ);
  const bestGain = $derived(finalists[0] ? gainOf(finalists[0]) : undefined);
  const ordinal = (rank: number) => (rank === 2 ? '2nd' : rank === 3 ? '3rd' : rank + 'th');
</script>

<section
  class="close"
  aria-labelledby="close-builds"
>
  <h3 id="close-builds">Close behind</h3>
  <div class="cards">
    {#each finalists.slice(1) as finalist, offset (offset)}
      {@const index = offset + 1}
      <BuildCard
        title={ordinal(index + 1)}
        spCost={finalist.sp_cost}
        gain={gainOf(finalist)}
        {bestGain}
        {field}
        stats={stats[index] ?? []}
        changes={changesFromBest(differ, index, offers)}
      />
    {/each}
  </div>
</section>

<style>
  .close {
    display: grid;
    gap: 8px;
    align-content: start;
    min-width: 0;
  }
  h3 {
    margin: 0;
    font-size: 12px;
    font-weight: 650;
    color: var(--text-secondary);
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr));
    gap: 8px;
  }
</style>
