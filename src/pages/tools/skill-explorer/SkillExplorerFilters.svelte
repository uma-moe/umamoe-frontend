<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import Icon from '@/components/Icon.svelte';
  import Checkbox from '@/components/controls/Checkbox.svelte';
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';
  import Combobox, { type ComboboxOption } from '@/components/controls/Combobox.svelte';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import SelectField, { type SelectOption } from '@/components/controls/SelectField.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import { SKILL_KINDS, STYLE_NAMES, type SkillKind, type StyleKey } from './skill-explorer-data';
  import {
    SKILL_RARITIES,
    type ShowLimit,
    type SkillRarity,
    type XMode,
    type YMode
  } from './skill-explorer-view';
  import TypeFilters from './TypeFilters.svelte';
  import UmaSelect from './umas/UmaSelect.svelte';
  import type { ExplorerUma } from './umas/uma-skills';

  interface Props {
    style: StyleKey;
    surface: string;
    distance: string;
    courseId: string;
    meetingNumber: string;
    xMode: XMode;
    yMode: YMode;
    rarities: ReadonlySet<SkillRarity>;
    kinds: ReadonlySet<SkillKind>;
    search: string;
    umaCardId: number | undefined;
    show: ShowLimit;
    bestOfFamily: boolean;
    showDayBound: boolean;
    procScaled: boolean;
    umas: ExplorerUma[];
    surfaceOptions: SelectOption[];
    distanceOptions: SelectOption[];
    courseOptions: SelectOption[];
    meetingOptions: SelectOption[];
    onmeetingchange: (value: string) => void;
  }

  let {
    style = $bindable(),
    surface = $bindable(),
    distance = $bindable(),
    courseId = $bindable(),
    meetingNumber = $bindable(),
    xMode = $bindable(),
    yMode = $bindable(),
    rarities = $bindable(),
    kinds = $bindable(),
    search = $bindable(),
    umaCardId = $bindable(),
    show = $bindable(),
    bestOfFamily = $bindable(),
    showDayBound = $bindable(),
    procScaled = $bindable(),
    umas,
    surfaceOptions,
    distanceOptions,
    courseOptions,
    meetingOptions,
    onmeetingchange
  }: Props = $props();

  let raceAnchor = $state<HTMLDivElement>();
  let filtersOpen = $state(false);
  const styleOptions = (['all', '1', '2', '3', '4'] as const).map((value) => ({
    value,
    label: STYLE_NAMES[value]
  }));
  const showOptions: { value: ShowLimit; label: string }[] = [
    { value: '25', label: 'Top 25' },
    { value: '50', label: 'Top 50' },
    { value: '100', label: 'Top 100' },
    { value: 'all', label: 'All' }
  ];
  const RARITY_NAMES: Record<SkillRarity, string> = {
    white: 'White',
    gold: 'Gold',
    unique: 'Unique'
  };
  const KIND_NAMES: Record<SkillKind, string> = {
    speed: 'Speed',
    acceleration: 'Acceleration',
    recovery: 'Recovery',
    stat: 'Stats',
    debuff: 'Debuffs',
    other: 'Other'
  };
  const raceValue = $derived.by(() => {
    if (meetingNumber) return 'cm:' + meetingNumber;
    if (courseId) return 'course:' + courseId;

    return '';
  });
  const raceOptions = $derived<ComboboxOption[]>([
    { value: '', label: 'All matching courses', keywords: 'any all tracks' },
    ...meetingOptions
      .filter((option) => option.value)
      .map((option) => ({
        value: 'cm:' + option.value,
        label: option.label,
        keywords: 'Champions Meeting ' + (option.description ?? '')
      })),
    ...courseOptions
      .filter((option) => option.value)
      .map((option) => ({
        value: 'course:' + option.value,
        label: option.label,
        keywords: 'course track'
      }))
  ]);
  const raceNotes = $derived(
    new Map(meetingOptions.map((option) => ['cm:' + option.value, option.description]))
  );
  const changedFilters = $derived(
    Number(rarities.size !== SKILL_RARITIES.length) +
      Number(kinds.size !== SKILL_KINDS.length) +
      Number(surface !== 'all') +
      Number(distance !== 'all') +
      Number(bestOfFamily) +
      Number(showDayBound)
  );

  function chooseRace(value: string) {
    if (value.startsWith('cm:')) {
      onmeetingchange(value.slice(3));
      return;
    }

    meetingNumber = '';
    courseId = value.startsWith('course:') ? value.slice(7) : '';
  }

  // Narrowing the course list also clears a selected meeting outside that scope.
  function keepCourseInScope() {
    if (courseOptions.some((option) => option.value === courseId)) return;

    courseId = '';
    meetingNumber = '';
  }

  function resetFilters() {
    surface = 'all';
    distance = 'all';
    rarities = new Set(SKILL_RARITIES);
    kinds = new Set(SKILL_KINDS);
    bestOfFamily = false;
    showDayBound = false;
  }
</script>

<div class="explorer-filters">
  <div class="primary-controls">
    <div
      class="race-select"
      bind:this={raceAnchor}
    >
      <Combobox
        id="skill-explorer-race"
        label="Meeting or course"
        options={raceOptions}
        value={raceValue}
        placeholder="Search meetings or courses"
        emptyValue=""
        prefixIcon="search"
        popupAnchor={raceAnchor}
        onchange={chooseRace}
      >
        {#snippet optionContent(option)}
          <span class="race-option">
            <span>{option.label}</span>
            {#if raceNotes.get(option.value)}
              <small>{raceNotes.get(option.value)}</small>
            {/if}
          </span>
        {/snippet}
      </Combobox>
    </div>
    <TextField
      id="skill-explorer-search"
      label="Find skill"
      type="search"
      placeholder="Skill name"
      prefixIcon="search"
      bind:value={search}
    />
    <UmaSelect
      {umas}
      bind:cardId={umaCardId}
    />
  </div>

  <div class="view-controls">
    <div class="style-control">
      <SegmentedControl
        label="Running style"
        options={styleOptions}
        bind:value={style}
      />
    </div>
    <div class="plot-controls">
      <SegmentedControl
        label="Horizontal axis"
        compact
        options={[
          { value: 'position', label: 'Proc point' },
          { value: 'cost', label: 'SP cost' }
        ]}
        bind:value={xMode}
      />
      <SegmentedControl
        label="Skill value"
        compact
        options={[
          { value: 'value', label: 'In build' },
          { value: 'alone', label: 'Alone' }
        ]}
        bind:value={yMode}
      />
    </div>
    <div class="limit-segments">
      <SegmentedControl
        label="Skills shown"
        compact
        options={showOptions}
        bind:value={show}
      />
    </div>
    <div class="limit-select">
      <SelectField
        id="skill-explorer-limit"
        label="Skills shown"
        hideLabel
        options={showOptions}
        bind:value={show}
      />
    </div>
    <Checkbox
      variant="field"
      id="skill-explorer-proc-scaled"
      label="Scale by proc rate"
      bind:checked={procScaled}
    />
    <div
      class="filter-menu"
      class:active={filtersOpen || changedFilters > 0}
    >
      <InspectPopover
        label="Skill filters"
        align="end"
        onopenchange={(open) => (filtersOpen = open)}
      >
        {#snippet trigger()}
          <span class="filter-trigger">
            <Icon
              name="filter"
              size={16}
            />
            Filters
            {#if changedFilters > 0}
              <span class="filter-count">{changedFilters}</span>
            {/if}
            <Icon
              name="chevron"
              size={14}
            />
          </span>
        {/snippet}
        {#snippet children()}
          <div class="filter-panel">
            <header><h3>Skill filters</h3></header>
            <div class="filter-group">
              <span class="group-label">Surface</span>
              <SegmentedControl
                label="Surface"
                compact
                options={surfaceOptions}
                bind:value={surface}
                onchange={keepCourseInScope}
              />
            </div>
            <div class="filter-group">
              <span class="group-label">Length</span>
              <SegmentedControl
                label="Length"
                compact
                options={distanceOptions}
                bind:value={distance}
                onchange={keepCourseInScope}
              />
            </div>
            <TypeFilters
              label="Rarity"
              all={SKILL_RARITIES}
              names={RARITY_NAMES}
              bind:selected={rarities}
            />
            <TypeFilters
              label="Effect"
              all={SKILL_KINDS}
              names={KIND_NAMES}
              bind:selected={kinds}
            />
            <div class="condition-filters">
              <Checkbox
                variant="field"
                id="skill-explorer-best-of-family"
                label="Best version only"
                ariaLabel="Best version only"
                description="Keep the strongest of ○, ◎ and gold"
                bind:checked={bestOfFamily}
              />
              <Checkbox
                variant="field"
                id="skill-explorer-day-bound"
                label="Ground, weather and season skills"
                ariaLabel="Ground, weather and season skills"
                description="Assume their day conditions hold"
                bind:checked={showDayBound}
              />
            </div>
            <footer>
              <Button
                variant="secondary"
                size="sm"
                disabled={changedFilters === 0}
                onclick={resetFilters}
              >
                Reset filters
              </Button>
            </footer>
          </div>
        {/snippet}
      </InspectPopover>
    </div>
  </div>
</div>

<style>
  @import './skill-explorer-filters.css';
</style>
