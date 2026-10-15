<script lang="ts">
  import { virtualScroll } from '@/lib/virtual-scroll';
  import type { CharacterCatalogEntry } from '@/lib/catalog/character-catalog';
  import { veteranFactorTotals, type VeteranDisplayRecord } from '@/lib/profile/profile-veterans';
  import type { VeteranQueryMatch } from '@/lib/profile/profile-veteran-query';
  import type { VeteranUiRecord } from '@/components/game/veteran-ui-types';
  import AptitudeGrid from '@/components/game/AptitudeGrid.svelte';
  import Button from '@/components/controls/Button.svelte';
  import IconButton from '@/components/controls/IconButton.svelte';
  import StatStrip from '@/components/game/StatStrip.svelte';
  import ProfileVeteranAffinity from '../../ProfileVeteranAffinity.svelte';
  import ProfileVeteranIdentity from '../../ProfileVeteranIdentity.svelte';
  import ProfileVeteranQueryMatches from '../../ProfileVeteranQueryMatches.svelte';
  import ProfileVeteranSparks from '../../ProfileVeteranSparks.svelte';
  import type { ProfileVeteran } from '../../../profile-repository';
  import { statFields, statIcon } from '../roster-options';
  import { veteranAptitudes } from '../roster-records';
  import type { RosterFilters } from '../filters/roster-filters.svelte';

  interface Props {
    displayed: VeteranDisplayRecord[];
    start: number;
    virtual: Parameters<typeof virtualScroll<ProfileVeteran>>[1];
    filters: RosterFilters;
    spByVeteran: Map<ProfileVeteran, number | null>;
    target?: CharacterCatalogEntry;
    queryMatches: Map<ProfileVeteran, VeteranQueryMatch[]>;
    summaryOf: (item: VeteranDisplayRecord) => VeteranUiRecord;
    ondetails: (veteran: ProfileVeteran) => void;
  }

  let {
    displayed,
    start,
    virtual,
    filters,
    spByVeteran,
    target,
    queryMatches,
    summaryOf,
    ondetails
  }: Props = $props();

  const statSorted = $derived(
    filters.sortField === 'total' || statFields.some((field) => field.id === filters.sortField)
  );
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex (The comparison table supports keyboard scrolling.) -->
<div
  class="table-wrap"
  role="region"
  aria-label="Veteran comparison"
  tabindex="0"
>
  <table>
    <colgroup>
      <col class="character-column" />
      <col class="stats-column" />
      <col class="affinity-column" />
      <col class="aptitude-column" />
      <col />
      <col class="details-column" />
    </colgroup>
    <thead>
      <tr>
        <th scope="col">Veteran</th>
        <th
          scope="col"
          aria-sort={statSorted
            ? filters.sortDirection === 'asc'
              ? 'ascending'
              : 'descending'
            : 'none'}
        >
          <Button
            variant="ghost"
            size="sm"
            ariaLabel="Sort by Total Stats"
            onclick={() => filters.sortTable('total')}
          >
            Stats {statSorted ? (filters.sortDirection === 'asc' ? '↑' : '↓') : ''}
          </Button>
        </th>
        <th
          scope="col"
          title={target ? 'Affinity for ' + target.name : 'Veteran and parent affinity'}
          aria-sort={filters.sortField === 'affinity'
            ? filters.sortDirection === 'asc'
              ? 'ascending'
              : 'descending'
            : 'none'}
        >
          <Button
            variant="ghost"
            size="sm"
            onclick={() => filters.sortTable('affinity')}
          >
            Affinity {filters.sortField === 'affinity'
              ? filters.sortDirection === 'asc'
                ? '↑'
                : '↓'
              : ''}
          </Button>
        </th>
        <th scope="col">Aptitudes</th>
        <th
          scope="col"
          title="Combined stars from Own + P1 + P2"
        >
          Combined sparks
        </th>
        <th scope="col"><span class="sr-only">Details</span></th>
      </tr>
    </thead>
    <tbody use:virtualScroll={virtual}>
      {#each displayed as item, index (item.veteran.trained_chara_id ?? item.veteran.id)}
        {@const matches = queryMatches.get(item.veteran) ?? []}
        {@const summary = summaryOf(item)}
        {@const factors = veteranFactorTotals(item.veteran)}
        <tr data-virtual-index={start + index}>
          <th scope="row">
            <button
              class="table-character"
              aria-label={'View ' + item.name + ' details'}
              onclick={() => ondetails(item.veteran)}
            >
              <ProfileVeteranIdentity
                {summary}
                rarity={item.veteran.rarity}
                score={item.veteran.rank_score}
              />
            </button>
          </th>
          <td class="table-stats">
            <StatStrip
              label={item.name + ' stats'}
              items={[
                ...statFields.map((field) => ({
                  id: field.id,
                  label: field.label,
                  value: (item.veteran[field.id] ?? 0).toLocaleString(),
                  icon: statIcon(field.id)
                })),
                {
                  id: 'sp',
                  label: 'SP',
                  value: spByVeteran.get(item.veteran)?.toLocaleString() ?? '-'
                },
                { id: 'total', label: 'Total Stats', value: item.total.toLocaleString() }
              ]}
              compact
              presentation="icons"
            />
          </td>
          <td
            class="table-affinity"
            data-label="Affinity"
          >
            <ProfileVeteranAffinity
              {summary}
              compact
            />
          </td>
          <td
            class="table-aptitudes"
            data-label="Aptitudes"
          >
            <AptitudeGrid
              items={veteranAptitudes(item.veteran)}
              compact
              stretch
              gradeFirst
            />
          </td>
          <td
            class="table-factors"
            data-label="Combined sparks"
          >
            <ProfileVeteranSparks
              items={factors}
              selectedFactors={filters.selectedFactors}
              queryMatches={matches}
              onfactor={(filter) => filters.addFactor(filter)}
              onmore={() => ondetails(item.veteran)}
            />
          </td>
          <td class="table-details">
            <IconButton
              icon="arrow-right"
              label={'Open ' + item.name + ' details'}
              onclick={() => ondetails(item.veteran)}
            />
          </td>
        </tr>
        {#if matches.length}
          <tr
            class="query-row"
            data-virtual-index={start + index}
          >
            <td colspan="6"><ProfileVeteranQueryMatches {matches} /></td>
          </tr>
        {/if}
      {/each}
    </tbody>
  </table>
</div>

<style>
  @import './profile-veterans-table.css';
</style>
