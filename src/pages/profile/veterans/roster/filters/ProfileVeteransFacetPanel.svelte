<script lang="ts">
  import { characterImagePath, type CharacterCatalogEntry } from '@/lib/catalog/character-catalog';
  import { skillImage, skillRarity } from '@/lib/catalog/skill-catalog';
  import { veteranDisplay } from '@/lib/profile/profile-veterans';
  import IncludeExcludePicker from '@/components/pickers/IncludeExcludePicker.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Combobox from '@/components/controls/Combobox.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import SelectFieldSlim from '@/components/controls/SelectFieldSlim.svelte';
  import Slider from '@/components/controls/Slider.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import FilterChip from '@/components/filters/FilterChip.svelte';
  import RaceBadge from '@/components/game/RaceBadge.svelte';
  import SkillChip from '@/components/game/SkillChip.svelte';
  import {
    aptitudeFields,
    generations,
    gradeOptions,
    rangeMarks,
    statFields,
    statIcon,
    type FilterTab
  } from '../roster-options';
  import type { RosterCharacters } from '../roster-characters.svelte';
  import type { RosterCollection } from '../roster-collection.svelte';
  import type { RosterFilters } from './roster-filters.svelte';

  interface Props {
    tab: FilterTab;
    filters: RosterFilters;
    picks: RosterCharacters;
    collection: RosterCollection;
    characters: Map<number, CharacterCatalogEntry>;
  }

  let { tab, filters, picks, collection, characters }: Props = $props();

  const skillOptions = $derived(
    [...collection.skillCatalog.values()]
      .filter((skill) => !filters.selectedSkills.includes(skill.skill_id))
      .map((skill) => ({
        value: String(skill.skill_id),
        label: skill.name,
        image: skillImage(skill.icon)
      }))
  );

  function umaItems(ids: number[] = []) {
    return ids.map((id) => ({
      id: String(id),
      label: characters.get(id)?.name ?? String(id),
      image: characterImagePath(id)
    }));
  }
</script>

<div
  class="facet-content"
  id={'facet-' + tab.id}
>
  {#if tab.help && tab.id !== 'skills'}
    <p class="filter-help">{tab.help}</p>
  {/if}
  {#if tab.id === 'stats'}
    <div
      class="stat-limits"
      role="group"
      aria-label="Stat limits"
    >
      {#each statFields as field}
        <div class="stat-limit">
          <img
            class="stat-icon"
            src={statIcon(field.id)}
            alt={field.label}
            title={field.label}
          />
          <Slider
            id={'veteran-' + field.id}
            label={field.label}
            hideLabel
            showOutput={false}
            showTicks
            tickValues={rangeMarks(...filters.bounds[field.id])}
            showValueLabels
            range
            min={filters.bounds[field.id][0]}
            max={filters.bounds[field.id][1]}
            step={50}
            value={filters.statValue(field.id)}
            endValue={filters.statValue(field.id, true)}
            tone={field.tone}
            onchange={(start, end) => filters.changeStat(field.id, start, end)}
          />
        </div>
      {/each}
      <div class="stat-limit">
        <span
          class="sp-icon"
          title="Skill point total"
          aria-hidden="true"
        >
          SP
        </span>
        <Slider
          id="filter-sp"
          label="SP total"
          hideLabel
          showOutput={false}
          showTicks
          tickValues={rangeMarks(0, collection.spCeiling)}
          showValueLabels
          range
          min={0}
          max={collection.spCeiling}
          step={50}
          tone="white"
          value={Number(filters.minSp) || 0}
          endValue={filters.maxSp ? Number(filters.maxSp) : collection.spCeiling}
          onchange={(start, end) => {
            filters.minSp = start ? String(start) : '';
            filters.maxSp = end != null && end < collection.spCeiling ? String(end) : '';
          }}
        />
      </div>
    </div>
    <div class="stat-totals">
      <span>Stat total ≥</span>
      <TextField
        id="veteran-min-total"
        label="Minimum stat total"
        hideLabel
        type="number"
        min={0}
        step={100}
        placeholder="Any"
        value={filters.minTotal ? String(filters.minTotal) : ''}
        oninput={(event) =>
          (filters.minTotal = Math.max(
            0,
            Number((event.currentTarget as HTMLInputElement).value) || 0
          ))}
      />
    </div>
  {:else if tab.id === 'aptitudes'}
    {#each ['Track', 'Distance', 'Style'] as group}
      <fieldset class="aptitude-filter-group">
        <legend>{group}</legend>
        <div class="aptitude-options">
          {#each aptitudeFields.filter((field) => field.group === group) as field}
            <div
              class="aptitude-choice"
              class:chosen={!!filters.aptitudeFilters[field.id]}
            >
              <span>{field.label}</span>
              <SelectFieldSlim
                id={'aptitude-' + field.id}
                label={field.label + ' minimum grade'}
                hideLabel
                imageOnly
                options={gradeOptions}
                value={filters.aptitudeFilters[field.id] ?? ''}
                onchange={(value) => filters.setAptitude(field.id, value)}
              />
            </div>
          {/each}
        </div>
      </fieldset>
    {/each}
  {:else if tab.id === 'skills'}
    <div class="filter-search">
      <Combobox
        id="veteran-skill-search"
        label="Find a learned skill"
        hideLabel
        placeholder="Search skills…"
        prefixIcon="search"
        options={skillOptions}
        bind:query={filters.skillQuery}
        action
        maxResults={12}
        emptyText="No unselected skills match."
        onchange={(value) => filters.addSkill(Number(value))}
      />
    </div>
    {#if filters.selectedSkills.length}
      <div class="selected-skills">
        {#each filters.selectedSkills as skillId}
          {@const skill = collection.skillCatalog.get(skillId)}<SkillChip
            name={skill?.name ?? `Skill ${skillId}`}
            icon={skillImage(skill?.icon)}
            rarity={skillRarity(skill, Boolean(skill?.inherited))}
            compact
            onremove={() => filters.removeSkill(skillId)}
          />
        {/each}
      </div>
    {/if}
    <p class="filter-help">{tab.help}</p>
  {:else if tab.id === 'parents'}
    <div class="uma-rules">
      {#each generations as generation}
        <IncludeExcludePicker
          compact
          label={generation.label}
          tone={generation.scope === 'greatgrandparent' ? 'purple' : 'blue'}
          included={umaItems(filters.include[generation.scope])}
          excluded={umaItems(filters.exclude[generation.scope])}
          onadd={(mode) => picks.editUmas(generation.scope, mode)}
          onremove={(mode, id) =>
            filters.removeAncestor(generation.scope, Number(id), mode === 'exclude')}
        />
      {/each}
    </div>
  {:else if tab.id === 'saddle'}
    <div class="schedule-filter">
      {#if filters.scheduleLoading}
        <p>Loading races…</p>
      {:else if filters.scheduleError}
        <Banner
          title={filters.scheduleError}
          tone="danger"
        >
          <Button
            variant="secondary"
            size="sm"
            onclick={() => filters.loadSchedule()}
          >
            Retry
          </Button>
        </Banner>
      {:else}
        <div class="filter-search race-search">
          <Combobox
            id="veteran-race-search"
            label="Find a race win"
            hideLabel
            placeholder="Race name or grade…"
            prefixIcon="search"
            options={filters.raceChoices
              .filter((race) => !filters.selectedRaceIds.includes(race.id))
              .map((race) => ({
                value: String(race.id),
                label: race.name,
                image: race.image,
                keywords: (race.grade ?? '') + ' ' + (race.searchText ?? '')
              }))}
            bind:query={filters.raceQuery}
            action
            maxResults={12}
            onchange={(value) => filters.toggleRace(value)}
          />
        </div>
      {/if}
      <div class="selected-list selected-races">
        {#each filters.selectedRaceIds as id}
          {@const race = filters.raceChoices.find((race) => race.id === id)}{#if race?.grade}
            <RaceBadge
              race={{ ...race, id: String(id), grade: race.grade }}
              compact
              presentation="inline"
              removable
              onremove={() => filters.toggleRace(String(id))}
            />
          {:else}
            <FilterChip
              label={race?.name ?? 'Race ' + id}
              selected
              removable
              onremove={() => filters.toggleRace(String(id))}
            />
          {/if}
        {/each}
      </div>
      <p>
        {filters.selectedRaceIds.length} selected race{filters.selectedRaceIds.length === 1
          ? ''
          : 's'}
      </p>
    </div>
  {:else if tab.id === 'database'}
    <div class="database-quick">
      <SelectField
        id="filter-scenario"
        label="Training scenario"
        options={[
          { value: '', label: 'Any scenario' },
          ...Array.from(
            new Set(
              collection.veterans.map((v) => v.scenario_id).filter((id): id is number => id != null)
            )
          ).map((id) => ({
            value: String(id),
            label: veteranDisplay(
              collection.veterans.find((v) => v.scenario_id === id)!,
              characters
            ).scenario
          }))
        ]}
        bind:value={filters.scenarioFilter}
      />
      <Slider
        id="filter-affinity"
        label="Minimum affinity"
        min={0}
        max={collection.affinityCeiling}
        step={1}
        value={Number(filters.minAffinity) || 0}
        tone="pink"
        onchange={(value) => (filters.minAffinity = value ? String(value) : '')}
      />
      <Slider
        id="filter-whites"
        label="Minimum unique white sparks"
        min={0}
        max={collection.whiteCeiling}
        step={1}
        value={Number(filters.minWhites) || 0}
        tone="white"
        onchange={(value) => (filters.minWhites = value ? String(value) : '')}
      />
    </div>
    <p class="filter-help">Totals include this veteran and both parents. Zero means any.</p>
    {#if collection.metricError}
      <p class="filter-help">
        {collection.metricError}
        <button
          class="retry-link"
          onclick={() => void collection.loadAffinity()}
        >
          Retry
        </button>
      </p>
    {/if}
  {/if}
</div>

<style>
  @import './profile-veterans-facet-panel.css';
</style>
