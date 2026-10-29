<script lang="ts">
  import { tick } from 'svelte';
  import type { CharacterData } from '@/lib/game-data/characters';
  import type { SkillData } from '@/lib/game-data/skills/skills';
  import type { AncestorScope } from '@/lib/profile/veterans/profile-veterans';
  import FilterChip from '@/components/filters/FilterChip.svelte';
  import {
    allDistances,
    allStyles,
    aptitudeFields,
    distanceOptions,
    scopeLabels,
    statFields,
    styleOptions
  } from '../roster-options';
  import type { RosterFilters } from './roster-filters.svelte';
  import type { RosterView } from '../roster-view.svelte';

  interface Props {
    filters: RosterFilters;
    view: RosterView;
    characters: Map<number, CharacterData>;
    skillCatalog: Map<number, SkillData>;
    targetId?: number;
  }

  let { filters, view, characters, skillCatalog, targetId }: Props = $props();
</script>

{#if filters.activeCount}
  <div
    class="active-filter-chips"
    aria-label="Selected spark and skill filters"
  >
    {#each filters.selectedFactors as filter, index}
      {#if index}
        <span class="filter-operator">
          {filter.operator === 'or' ? 'OR' : 'AND'}
        </span>
      {/if}<FilterChip
        label={filters.sparkLabel(filter)}
        selected
        removable
        onclick={() => {
          view.openFilter('factors');
          filters.factorCategory = 'all';
          void tick().then(() =>
            document
              .getElementById('factor-stars-' + index + '-start')
              ?.focus({ preventScroll: true })
          );
        }}
        onremove={() => {
          filters.selectedFactors = filters.selectedFactors.filter((_, i) => i !== index);
        }}
      />
    {/each}
    {#each filters.selectedSkills as skillId}
      <FilterChip
        label={skillCatalog.get(skillId)?.name ?? `Skill ${skillId}`}
        selected
        removable
        onclick={() => view.openFilter('skills')}
        onremove={() => filters.removeSkill(skillId)}
      />
    {/each}
    {#if filters.query.trim()}
      <FilterChip
        label={`Name: ${filters.query.trim()}`}
        selected
        removable
        onremove={() => (filters.query = '')}
      />
    {/if}
    {#if filters.distance.length !== allDistances.length}
      <FilterChip
        label={filters.distance.length
          ? 'Distance: ' +
            distanceOptions
              .filter((item) => filters.distance.includes(item.value))
              .map((item) => item.label)
              .join(', ')
          : 'No distances selected'}
        selected
        removable
        onremove={() => (filters.distance = [...allDistances])}
      />
    {/if}
    {#if filters.style.length !== allStyles.length}
      <FilterChip
        label={filters.style.length
          ? 'Style: ' +
            styleOptions
              .filter((item) => filters.style.includes(item.value))
              .map((item) => item.label)
              .join(', ')
          : 'No styles selected'}
        selected
        removable
        onremove={() => (filters.style = [...allStyles])}
      />
    {/if}
    {#if filters.minSp || filters.maxSp}
      <FilterChip
        label={'SP total ' +
          (filters.minSp && filters.maxSp
            ? filters.minSp + '–' + filters.maxSp
            : filters.minSp
              ? '≥ ' + filters.minSp
              : '≤ ' + filters.maxSp)}
        selected
        removable
        onremove={() => {
          filters.minSp = '';
          filters.maxSp = '';
        }}
      />
    {/if}
    {#each [{ value: filters.minAffinity, label: targetId ? 'Target affinity' : 'Main affinity', clear: () => (filters.minAffinity = '') }, { value: filters.minWhites, label: 'White count', clear: () => (filters.minWhites = '') }] as filter}
      {#if filter.value}
        <FilterChip
          label={filter.label + ' ≥ ' + filter.value}
          selected
          removable
          onremove={filter.clear}
        />
      {/if}
    {/each}
    {#if filters.scenarioFilter}
      <FilterChip
        label={'Scenario: ' + filters.scenarioFilter}
        selected
        removable
        onremove={() => (filters.scenarioFilter = '')}
      />
    {/if}
    {#if filters.appliedUql}
      <FilterChip
        label="UQL query"
        selected
        removable
        onclick={() => view.openFilter('uql')}
        onremove={() => {
          filters.appliedUql = '';
          filters.uql = '';
        }}
      />
    {/if}
    {#if filters.minTotal}
      <FilterChip
        label={`Total stats ≥ ${filters.minTotal}`}
        selected
        removable
        onremove={() => (filters.minTotal = 0)}
      />
    {/if}
    {#each statFields as field}
      {#if filters.statChanged(field.id)}
        <FilterChip
          label={`${field.label}: ${filters.statValue(field.id)}–${filters.statValue(field.id, true)}`}
          selected
          removable
          onremove={() =>
            filters.changeStat(field.id, filters.bounds[field.id][0], filters.bounds[field.id][1])}
        />
      {/if}
    {/each}
    {#each aptitudeFields as field}
      {#if filters.aptitudeFilters[field.id]}
        <FilterChip
          label={`${field.label}: ${filters.aptitudeFilters[field.id]}+`}
          selected
          removable
          onremove={() => filters.setAptitude(field.id, '')}
        />
      {/if}
    {/each}
    {#each ['parent', 'grandparent', 'greatgrandparent'] as scope}
      {#each filters.include[scope as AncestorScope] ?? [] as id}
        <FilterChip
          label={`Include ${characters.get(id)?.name ?? id} · ${scopeLabels[scope as AncestorScope]}`}
          selected
          removable
          onremove={() => filters.removeAncestor(scope as AncestorScope, id)}
        />
      {/each}{#each filters.exclude[scope as AncestorScope] ?? [] as id}
        <FilterChip
          label={`Exclude ${characters.get(id)?.name ?? id} · ${scopeLabels[scope as AncestorScope]}`}
          selected
          removable
          onremove={() => filters.removeAncestor(scope as AncestorScope, id, true)}
        />
      {/each}
    {/each}
    {#if filters.selectedRaceIds.length}
      <FilterChip
        label={`Race wins: ${filters.selectedRaceIds.length}`}
        selected
        removable
        onremove={() => (filters.selectedRaceIds = [])}
      />
    {/if}
  </div>
{/if}

<style>
  .filter-operator {
    align-self: center;
    color: var(--color-text-muted);
    font-size: 10px;
  }
  .active-filter-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    min-width: 0;
  }
  .active-filter-chips :global(.wrap) {
    max-width: 100%;
  }
  .active-filter-chips :global(.wrap > button:first-child) {
    min-width: 0;
    white-space: normal;
    text-align: left;
  }
  .active-filter-chips :global(.remove) {
    flex-shrink: 0;
  }
  :global(.drawer-selected) .active-filter-chips {
    gap: 5px;
  }
  @media (max-width: 767px) {
    :global(.collection-header) > .active-filter-chips {
      flex-wrap: nowrap;
      overflow-x: auto;
      padding-bottom: 4px;
      scrollbar-width: thin;
    }
    :global(.collection-header) > .active-filter-chips :global(.wrap) {
      flex: none;
      max-width: 280px;
    }
    :global(.collection-header) > .active-filter-chips :global(.wrap > button:first-child) {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    :global(.drawer-selected) .active-filter-chips :global(.wrap) {
      max-width: 100%;
    }
  }
</style>
