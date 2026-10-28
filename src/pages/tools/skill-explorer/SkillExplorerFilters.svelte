<script lang="ts">
  import Checkbox from '@/components/controls/Checkbox.svelte';
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
  import TypeChips from './TypeChips.svelte';
  import UmaSelect from './umas/UmaSelect.svelte';
  import type { ExplorerUma } from './umas/uma-skills';

  interface Props {
    style: StyleKey;
    surface: string;
    distance: string;
    courseId: string;
    /** The picked Champions Meeting's number, or empty. */
    meetingNumber: string;
    xMode: XMode;
    yMode: YMode;
    rarities: ReadonlySet<SkillRarity>;
    kinds: ReadonlySet<SkillKind>;
    search: string;
    /** The uma whose skills are highlighted, or none. */
    umaCardId: number | undefined;
    show: ShowLimit;
    bestOfFamily: boolean;
    showDayBound: boolean;
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
    umas,
    surfaceOptions,
    distanceOptions,
    courseOptions,
    meetingOptions,
    onmeetingchange
  }: Props = $props();

  const styleOptions = (['all', '1', '2', '3', '4'] as const).map((value) => ({
    value,
    label: STYLE_NAMES[value]
  }));
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

  // A course belongs to one surface and length; narrowing either clears a course outside it, and its meeting.
  function keepCourseInScope() {
    if (courseOptions.some((option) => option.value === courseId)) return;

    courseId = '';
    meetingNumber = '';
  }
</script>

<div class="explorer-filters">
  <div class="scope">
    <SelectField
      id="skill-explorer-meeting"
      label="Champions Meeting"
      options={meetingOptions}
      value={meetingNumber}
      onchange={onmeetingchange}
    />
    <SelectField
      id="skill-explorer-surface"
      label="Surface"
      options={surfaceOptions}
      bind:value={surface}
      onchange={keepCourseInScope}
    />
    <SelectField
      id="skill-explorer-distance"
      label="Length"
      options={distanceOptions}
      bind:value={distance}
      onchange={keepCourseInScope}
    />
    <SelectField
      id="skill-explorer-course"
      label="Course"
      options={courseOptions}
      bind:value={courseId}
      onchange={() => (meetingNumber = '')}
    />
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

  <div class="view">
    <SegmentedControl
      label="Running style"
      options={styleOptions}
      bind:value={style}
    />
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
      label="Value"
      compact
      options={[
        { value: 'value', label: 'In build' },
        { value: 'alone', label: 'Alone' }
      ]}
      bind:value={yMode}
    />
    <SegmentedControl
      label="Skills shown"
      compact
      options={[
        { value: '25', label: 'Top 25' },
        { value: '50', label: 'Top 50' },
        { value: '100', label: 'Top 100' },
        { value: 'all', label: 'All' }
      ]}
      bind:value={show}
    />
    <Checkbox
      id="skill-explorer-best-of-family"
      label="Best version only"
      description="One of ○, ◎ and gold"
      bind:checked={bestOfFamily}
    />
    <Checkbox
      id="skill-explorer-day-bound"
      label="Ground, weather and season skills"
      description="Valued as if their day holds"
      bind:checked={showDayBound}
    />
  </div>

  <div class="types">
    <TypeChips
      label="Rarity"
      all={SKILL_RARITIES}
      names={RARITY_NAMES}
      bind:selected={rarities}
    />
    <TypeChips
      label="Effect"
      all={SKILL_KINDS}
      names={KIND_NAMES}
      bind:selected={kinds}
    />
  </div>
</div>

<style>
  .explorer-filters {
    display: grid;
    gap: 0.75rem;
  }

  .scope {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 0.75rem;
  }

  .view {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1.25rem;
    align-items: center;
  }

  .types {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1.75rem;
  }
</style>
