<script lang="ts">
  import { supportTypeDistribution } from '@/lib/statistics/statistics';
  import ChartFrame from '@/components/charts/ChartFrame.svelte';
  import MetricBar from '@/components/data/MetricBar.svelte';
  import FilterChip from '@/components/filters/FilterChip.svelte';
  import StatisticsRanking from '../StatisticsRanking.svelte';
  import StatisticsSectionHeading from './StatisticsSectionHeading.svelte';
  import type { StatisticsView } from '../statistics-view.svelte';

  interface Props {
    view: StatisticsView;
    supportType: string;
  }

  let { view, supportType = $bindable() }: Props = $props();

  const supportTypes = $derived(
    [
      ...new Set(
        view.supportData.flatMap((item) => view.supportCatalog.get(item.id)?.tags[0] ?? [])
      )
    ].sort()
  );

  const filteredSupports = $derived(
    view.supportData.filter(
      (item) => supportType === 'all' || view.supportCatalog.get(item.id)?.tags[0] === supportType
    )
  );

  const supportTypeData = $derived(
    supportTypeDistribution(
      view.deckData,
      view.supports,
      (id) => view.supportCatalog.get(id)?.tags[0]?.toLowerCase() ?? 'other'
    )
  );
</script>

<section id="support-cards">
  <StatisticsSectionHeading
    title="Build your support deck"
    context="{view.supportData.length} cards · {view.deckData.length} builds"
  />
  <div
    class="type-filters"
    aria-label="Support type"
  >
    <FilterChip
      label="All types"
      selected={supportType === 'all'}
      onclick={() => (supportType = 'all')}
    />{#each supportTypes as type}
      <FilterChip
        label={type}
        selected={supportType === type}
        onclick={() => (supportType = type)}
      />
    {/each}
  </div>
  <div class="support-grid">
    <div class="stack">
      <StatisticsRanking
        id="support-ranking"
        title="Most Popular Support Cards"
        description="Share of all recorded card uses; a deck contributes multiple cards."
        items={filteredSupports}
        searchable
        searchLabel="Search support cards"
      />
    </div>
    <div class="stack">
      <StatisticsRanking
        id="deck-ranking"
        title="Most Used Deck Compositions"
        description="Share of recorded decks. Icons show each of the six support slots."
        items={view.deckData}
        searchable
        searchLabel="Search deck types"
        limit={5}
      />
      <ChartFrame
        id="support-types"
        title="Support type mix"
        description="Share of support slots in the selected decks."
      >
        <div class="type-metrics">
          {#each supportTypeData as item}
            <div>
              <span>{item.name}</span>
              <MetricBar value={Number((item.percentage ?? 0).toFixed(1))} />
            </div>
          {/each}{#if !supportTypeData.length}
            <p>No data available</p>
          {/if}
        </div>
      </ChartFrame>
    </div>
  </div>
</section>

<style>
  .support-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
    gap: 12px;
    align-items: start;
  }
  .type-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 12px;
  }
  .type-filters :global(button) {
    min-height: 32px;
    padding-inline: 10px;
    font-size: 11px;
  }
  .type-metrics {
    display: grid;
    gap: 10px;
    padding: 8px 2px;
  }
  .type-metrics > div {
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr);
    align-items: center;
    gap: 12px;
    font-size: 12px;
  }
  .type-metrics > p {
    color: var(--text-muted);
    font-size: 12px;
  }
  .stack {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .stack :global(.chart-frame) {
    padding: 12px;
  }
  .stack > :global(.ranking) {
    height: auto;
  }
  @container statistics (max-width:700px) {
    .support-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
