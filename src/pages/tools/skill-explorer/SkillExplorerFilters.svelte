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
    DEFAULT_SKILL_RARITIES,
    toggleType,
    type ShowLimit,
    type SkillRarity,
    type UniqueVersion,
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
    /** True when the current scope carries per-section win rates, enabling the WR proc-point axis. */
    hasSectionWins: boolean;
    yMode: YMode;
    rarities: ReadonlySet<SkillRarity>;
    /** The rarities the shown skills have; only these get a filter. */
    rarityOptions: readonly SkillRarity[];
    uniqueVersion: UniqueVersion;
    /** The shown skills hold both versions of uniques, so the version gets a toggle. */
    bothUniqueVersions: boolean;
    /** The shown skills include evolved skills, giving them a quick visibility toggle. */
    hasEvolved: boolean;
    kinds: ReadonlySet<SkillKind>;
    search: string;
    umaCardId: number | undefined;
    show: ShowLimit;
    bestOfFamily: boolean;
    showDayBound: boolean;
    /** A CM with a known day: its day decides which day-bound skills show. */
    dayFromMeeting: boolean;
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
    hasSectionWins,
    yMode = $bindable(),
    rarities = $bindable(),
    rarityOptions,
    uniqueVersion = $bindable(),
    bothUniqueVersions,
    hasEvolved,
    kinds = $bindable(),
    search = $bindable(),
    umaCardId = $bindable(),
    show = $bindable(),
    bestOfFamily = $bindable(),
    showDayBound = $bindable(),
    dayFromMeeting,
    procScaled = $bindable(),
    umas,
    surfaceOptions,
    distanceOptions,
    courseOptions,
    meetingOptions,
    onmeetingchange
  }: Props = $props();

  let raceAnchor = $state<HTMLDivElement>();
  let displayOpen = $state(false);
  let filtersOpen = $state(false);

  const xAxisOptions = $derived<SelectOption[]>(
    hasSectionWins
      ? [
          { value: 'position', label: 'Activation point' },
          { value: 'wrPosition', label: 'Avg WR proc' },
          { value: 'cost', label: 'SP efficiency' }
        ]
      : [
          { value: 'position', label: 'Activation point' },
          { value: 'cost', label: 'SP efficiency' }
        ]
  );
  const styleOptions = (['all', '1', '2', '3', '4'] as const).map((value) => ({
    value,
    label: value === 'all' ? 'All' : STYLE_NAMES[value],
    title: value === 'all' ? STYLE_NAMES.all : undefined
  }));
  const yModeOptions: { value: YMode; label: string }[] = [
    { value: 'value', label: 'In build' },
    { value: 'forced', label: 'Optimal' },
    { value: 'alone', label: 'Alone' }
  ];
  const Y_MODE_LABELS: Record<YMode, string> = {
    value: 'In build',
    forced: 'Optimal',
    alone: 'Alone'
  };
  const Y_MODE_NOTES: Record<YMode, string> = {
    value: "Added win rate across the style's representative CM ace builds.",
    forced: 'Same as In build, with gated skills forced at their best tested timing.',
    alone: 'Win rate added to a runner carrying no other skills.'
  };
  const scaleOptions = [
    { value: 'normalized', label: 'Normalized' },
    { value: 'per-proc', label: 'Per proc' }
  ];
  const SCALE_NOTES = {
    normalized: 'Weighted by activation rate (value × proc rate) to compare expected impact.',
    perProc: 'Win rate gained only in races where the skill actually activates.'
  } as const;
  const showOptions: { value: ShowLimit; label: string }[] = [
    { value: '25', label: 'Top 25' },
    { value: '50', label: 'Top 50' },
    { value: '100', label: 'Top 100' },
    { value: 'all', label: 'All' }
  ];
  const RARITY_NAMES: Record<SkillRarity, string> = {
    white: 'White',
    gold: 'Gold',
    evolved: 'Evolved',
    inherited: 'Inherited unique',
    personal: 'Own unique'
  };
  const uniqueVersionOptions: { value: UniqueVersion; label: string; title: string }[] = [
    { value: 'inherited', label: 'Inherited', title: 'Inherited uniques' },
    { value: 'own', label: 'Own', title: 'Own uniques' }
  ];
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
  const displayChanged = $derived(yMode !== 'value' || !procScaled || show !== '100');
  const raritiesChanged = $derived(
    rarities.size !== DEFAULT_SKILL_RARITIES.length ||
      DEFAULT_SKILL_RARITIES.some((rarity) => !rarities.has(rarity))
  );
  const changedFilters = $derived(
    Number(raritiesChanged) +
      Number(kinds.size !== SKILL_KINDS.length) +
      Number(surface !== 'all') +
      Number(distance !== 'all') +
      Number(bestOfFamily) +
      Number(!showDayBound)
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

  function resetDisplay() {
    yMode = 'value';
    procScaled = true;
    show = '100';
  }

  function resetFilters() {
    surface = 'all';
    distance = 'all';
    rarities = new Set(DEFAULT_SKILL_RARITIES);
    kinds = new Set(SKILL_KINDS);
    bestOfFamily = false;
    showDayBound = true;
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
    <div class="bar-primary">
      <div class="style-control">
        <SegmentedControl
          label="Running style"
          compact
          options={styleOptions}
          bind:value={style}
        />
      </div>

      <span
        class="bar-divider"
        aria-hidden="true"
      ></span>

      <div
        class="axis-select"
        title="Horizontal axis"
      >
        <SelectField
          id="skill-explorer-axis"
          label="Horizontal axis"
          hideLabel
          prefixIcon="chart"
          options={xAxisOptions}
          bind:value={xMode}
        />
      </div>

      {#if bothUniqueVersions}
        <div class="inline-control unique-control">
          <span class="inline-label">Uniques</span>
          <SegmentedControl
            label="Unique version"
            compact
            options={uniqueVersionOptions}
            bind:value={uniqueVersion}
          />
        </div>
      {/if}
    </div>

    <div class="bar-actions">
      {#if hasEvolved}
        <button
          type="button"
          class="evo-toggle"
          class:active={rarities.has('evolved')}
          aria-pressed={rarities.has('evolved')}
          title="Show all evolved skills on the chart"
          onclick={() => (rarities = toggleType(rarities, 'evolved'))}
        >
          <Icon
            name="star"
            size={13}
          />
          <span>Evolved</span>
        </button>
      {/if}

      <div
        class="menu-popover display-menu"
        class:active={displayOpen || displayChanged}
      >
        <InspectPopover
          label="Chart display"
          align="end"
          onopenchange={(open) => (displayOpen = open)}
        >
          {#snippet trigger()}
            <span class="menu-trigger">
              <Icon
                name="tune"
                size={15}
              />
              <span class="display-summary">
                <span>{Y_MODE_LABELS[yMode]}</span>
                <span
                  class="summary-tail"
                  class:summary-default={procScaled}
                >
                  <span class:summary-muted={procScaled}>
                    {procScaled ? 'Normalized' : 'Per proc'}
                  </span>
                </span>
              </span>
              {#if show !== '100'}
                <span class="menu-badge">{show === 'all' ? 'All' : show}</span>
              {/if}
              <Icon
                name="chevron"
                size={14}
              />
            </span>
          {/snippet}
          {#snippet children()}
            <div class="filter-panel display-panel">
              <header><h3>Chart display</h3></header>
              <div class="filter-group">
                <span class="group-label">Skill value</span>
                <SegmentedControl
                  label="Skill value"
                  compact
                  options={yModeOptions}
                  bind:value={yMode}
                />
                <p class="group-note">{Y_MODE_NOTES[yMode]}</p>
              </div>
              <div class="filter-group">
                <span class="group-label">Proc-rate scaling</span>
                <SegmentedControl
                  label="Proc-rate scaling"
                  compact
                  options={scaleOptions}
                  value={procScaled ? 'normalized' : 'per-proc'}
                  onchange={(next) => (procScaled = next === 'normalized')}
                />
                <p class="group-note">
                  {procScaled ? SCALE_NOTES.normalized : SCALE_NOTES.perProc}
                </p>
              </div>
              <div class="filter-group">
                <span class="group-label">Skills shown</span>
                <SegmentedControl
                  label="Skills shown"
                  compact
                  options={showOptions}
                  bind:value={show}
                />
              </div>
              <footer>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!displayChanged}
                  onclick={resetDisplay}
                >
                  Reset display
                </Button>
              </footer>
            </div>
          {/snippet}
        </InspectPopover>
      </div>

      <div
        class="menu-popover filter-menu"
        class:active={filtersOpen || changedFilters > 0}
      >
        <InspectPopover
          label="Skill filters"
          align="end"
          onopenchange={(open) => (filtersOpen = open)}
        >
          {#snippet trigger()}
            <span class="menu-trigger">
              <Icon
                name="filter"
                size={15}
              />
              <span>Filters</span>
              {#if changedFilters > 0}
                <span class="menu-badge">{changedFilters}</span>
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
                <span class="group-label">Track</span>
                <SegmentedControl
                  label="Track"
                  compact
                  options={surfaceOptions}
                  bind:value={surface}
                  onchange={keepCourseInScope}
                />
              </div>
              <div class="filter-group">
                <span class="group-label">Distance</span>
                <SegmentedControl
                  label="Distance"
                  compact
                  options={distanceOptions}
                  bind:value={distance}
                  onchange={keepCourseInScope}
                />
              </div>
              <TypeFilters
                label="Rarity"
                all={rarityOptions}
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
                  label="Ground, weather, season and night skills"
                  ariaLabel="Ground, weather, season and night skills"
                  description={dayFromMeeting
                    ? "Set by the CM's race day: shown when it matches"
                    : 'Valued as if the race day had their condition, marked Forced'}
                  disabled={dayFromMeeting}
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
</div>

<style>
  @import './skill-explorer-filters.css';
</style>
