<script lang="ts">
  import { virtualScroll } from '@/lib/virtual-scroll';
  import type { VeteranDisplayRecord } from '@/lib/profile/veterans/profile-veterans';
  import type { VeteranQueryMatch } from '@/lib/profile/veterans/profile-veteran-query';
  import { veteranDatabaseUrl } from '@/lib/veterans/records/veteran-links';
  import type { VeteranUiRecord } from '@/components/game/veteran-ui-types';
  import Button from '@/components/controls/Button.svelte';
  import EmptyState from '@/components/feedback/EmptyState.svelte';
  import LineageTree from '@/components/lineage/LineageTree.svelte';
  import type { ProfileVeteran } from '../../../profile-repository';
  import ProfileVeteranCard from '../../ProfileVeteranCard.svelte';
  import ProfileVeteransTable from './ProfileVeteransTable.svelte';
  import type { RosterCharacters } from '../roster-characters.svelte';
  import type { RosterCollection } from '../roster-collection.svelte';
  import type { RosterFilters } from '../filters/roster-filters.svelte';
  import type { VeteranLineage } from '../roster-records';
  import type { RosterView } from '../roster-view.svelte';

  interface Props {
    accountId: string;
    compact: boolean;
    filters: RosterFilters;
    view: RosterView;
    picks: RosterCharacters;
    collection: RosterCollection;
    displayed: VeteranDisplayRecord[];
    start: number;
    virtual: Parameters<typeof virtualScroll<ProfileVeteran>>[1];
    queryMatches: Map<ProfileVeteran, VeteranQueryMatch[]>;
    summaryOf: (item: VeteranDisplayRecord) => VeteranUiRecord;
    lineageOf: (veteran: ProfileVeteran) => VeteranLineage;
    ondetails: (veteran: ProfileVeteran) => void;
  }

  let {
    accountId,
    compact,
    filters,
    view,
    picks,
    collection,
    displayed,
    start,
    virtual,
    queryMatches,
    summaryOf,
    lineageOf,
    ondetails
  }: Props = $props();

  function openDetailPlanner(veteran: ProfileVeteran): void {
    try {
      localStorage.setItem(
        'planner_transfer',
        JSON.stringify({ veteran, veteranPosition: 'p1', targetCharaId: picks.targetId })
      );
    } catch {
      /* Legacy transfer is best effort. */
    }

    window.open('/tools/lineage-planner?from=profile', '_blank', 'noopener');
  }
</script>

{#if collection.filtered.length === 0}
  <EmptyState
    compact
    icon="filter"
    title="No veterans match your filters."
    description="Try another name or distance."
  >
    {#snippet actions()}
      <Button
        variant="secondary"
        onclick={() => filters.clearFilters()}
      >
        Clear all filters
      </Button>
    {/snippet}
  </EmptyState>
{:else if view.displayTab === 'inheritance'}
  <div
    class="inheritance-list"
    use:virtualScroll={virtual}
  >
    {#each displayed as item, index (item.veteran.trained_chara_id ?? item.veteran.id)}
      {@const tree = lineageOf(item.veteran)}
      <article data-virtual-index={start + index}>
        <LineageTree
          root={tree.root}
          branches={tree.branches}
          onselect={() => ondetails(item.veteran)}
        /><Button
          variant="secondary"
          size="sm"
          onclick={() => openDetailPlanner(item.veteran)}
          icon="external"
        >
          Open in planner
        </Button>
      </article>
    {/each}
  </div>
{:else if view.viewMode === 'grid'}
  <div
    class="veteran-grid"
    use:virtualScroll={virtual}
    style={'--grid-columns:' + (compact ? 3 : view.gridColumns)}
  >
    {#each displayed as item, index (item.veteran.trained_chara_id ?? item.veteran.id)}
      <div data-virtual-index={start + index}>
        <ProfileVeteranCard
          veteran={item.veteran}
          summary={summaryOf(item)}
          legacyUrl={veteranDatabaseUrl(item.veteran, accountId, picks.targetId)}
          skillCatalog={collection.skillCatalog}
          expandedSection={view.expandedSection}
          sparkSource={view.sparkSource}
          baseStats={view.statView === 'base'}
          mood={Number(view.cardMood)}
          selectedFactors={filters.selectedFactors}
          selectedSkills={filters.selectedSkills}
          queryMatches={queryMatches.get(item.veteran) ?? []}
          onfactor={compact ? undefined : (filter) => filters.addFactor(filter)}
          onskill={compact ? undefined : (id) => filters.addSkill(id)}
          ondetails={() => ondetails(item.veteran)}
        />
      </div>
    {/each}
  </div>
{:else}
  <ProfileVeteransTable
    {displayed}
    {start}
    {virtual}
    {filters}
    spByVeteran={collection.spByVeteran}
    target={picks.target}
    {queryMatches}
    {summaryOf}
    {ondetails}
  />
{/if}

<style>
  .veteran-grid > [data-virtual-index] {
    display: grid;
    min-width: 0;
  }
  .veteran-grid {
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(var(--grid-columns), minmax(0, 1fr));
    align-items: stretch;
    gap: 12px;
  }
  .inheritance-list {
    min-width: 0;
    display: grid;
    gap: 16px;
  }
  .inheritance-list > article {
    min-width: 0;
    overflow-x: auto;
    padding: 16px;
    border: 1px solid var(--border-primary);
    border-radius: 12px;
    background: var(--card-surface-bg);
  }
  .inheritance-list > article > :global(.ui-button) {
    margin-top: 12px;
  }
  @container veteran-results (max-width:1190px) {
    .veteran-grid {
      grid-template-columns: repeat(min(3, var(--grid-columns)), minmax(0, 1fr));
    }
  }
  @container veteran-results (max-width:870px) {
    .veteran-grid {
      grid-template-columns: repeat(min(2, var(--grid-columns)), minmax(0, 1fr));
    }
  }
  @container veteran-results (max-width:570px) {
    .veteran-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  @media (max-width: 767px) {
    .veteran-grid,
    :global(.compact-roster) .veteran-grid {
      grid-template-columns: minmax(0, 1fr);
      gap: 12px;
    }
  }
</style>
