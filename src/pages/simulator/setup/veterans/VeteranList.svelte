<script lang="ts">
  import AptitudeGrade from '@/components/game/AptitudeGrade.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Checkbox from '@/components/controls/Checkbox.svelte';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import SelectFieldSlim from '@/components/controls/SelectFieldSlim.svelte';
  import SkillPoints, { LEARNED_SKILL_POINTS_NOTE } from '@/components/game/SkillPoints.svelte';
  import StatStrip, { type StatStripItem } from '@/components/game/StatStrip.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import EmptyState from '@/components/feedback/EmptyState.svelte';
  import Icon from '@/components/Icon.svelte';
  import RankBadge from '@/components/game/RankBadge.svelte';
  import type { RaceCourse } from '@/lib/game-data/racing/courses';
  import { courseAptitudeItems, type VeteranEntry } from './veteran-entries';
  import { STYLES, SORTS, STATS, shownVeterans } from './veteran-list';

  /**
   * A collection of Veterans to choose from, one dense line each: search, filter by running style and sort, with each
   * one's stats, learned skills and her aptitudes on this course. One is chosen with a click, or several are ticked.
   */
  let {
    entries,
    course,
    mode = 'single',
    selected = $bindable([]),
    added = [],
    max,
    compact = false,
    onchoose
  }: {
    entries: VeteranEntry[];
    course?: RaceCourse;
    mode?: 'single' | 'multi';
    /** The ticked Veterans' keys, in multi mode. */
    selected?: string[];
    /** Keys of Veterans already where the list adds to, such as the race field: marked, and never ticked again. */
    added?: string[];
    /** How many can be ticked at most. */
    max?: number;
    /** Leaves out the stats, for a narrow column. */
    compact?: boolean;
    onchoose?: (entry: VeteranEntry) => void;
  } = $props();

  const uid = $props.id();
  let query = $state(''),
    style = $state('all'),
    sort = $state('fit'),
    limit = $state(120);

  const shown = $derived(shownVeterans(entries, query, style, sort, course));
  const ticked = $derived(new Set(selected));
  const alreadyAdded = $derived(new Set(added));
  const full = $derived(max !== undefined && selected.length >= max);

  function toggle(entry: VeteranEntry, on: boolean) {
    if (!on) {
      selected = selected.filter((key) => key !== entry.key);
      return;
    }

    if (!ticked.has(entry.key) && !full) selected = [...selected, entry.key];
  }

  /** Her five stats and their sum. */
  function statItems(entry: VeteranEntry): StatStripItem[] {
    return [
      ...STATS.map(([key, icon, label]) => ({
        id: key,
        label,
        value: entry.uma.trainee[key].toLocaleString(),
        tone: icon,
        icon: '/assets/images/icon/stats/' + icon + '.webp'
      })),
      { id: 'total', label: 'Total', value: entry.total.toLocaleString() }
    ];
  }
</script>

{#snippet details(entry: VeteranEntry)}
  <span
    class="identity"
    title={entry.summary.scenario}
  >
    <span class="portrait">
      {#if entry.summary.image}
        <img
          src={entry.summary.image}
          alt=""
          loading="lazy"
        />
      {/if}
    </span>
    <span class="name">{entry.uma.name}</span>
    <span class="details">
      {#if alreadyAdded.has(entry.key)}
        <span class="added-tag">Added</span>
      {/if}
      {#if entry.summary.detail}
        <span>{entry.summary.detail}</span>
      {/if}
      {#if entry.score !== undefined}
        <span class="rank">
          <RankBadge
            score={entry.score}
            size="xs"
          />
          {entry.score.toLocaleString()}
        </span>
      {/if}
      {#if entry.rarity}
        <span
          class="rarity"
          aria-label={entry.rarity + ' rarity stars'}
        >
          {'★'.repeat(Math.min(5, entry.rarity))}
        </span>
      {/if}
    </span>
  </span>
  {#if !compact}
    <span class="stats">
      <StatStrip
        label={entry.uma.name + ' stats'}
        items={statItems(entry)}
        presentation="values"
        compact
      />
    </span>
    <span class="learned">
      <span>
        <strong>{entry.learnedSkills}</strong>
        {entry.learnedSkills === 1 ? 'skill' : 'skills'}
      </span>
      <SkillPoints
        value={entry.skillPoints}
        note={LEARNED_SKILL_POINTS_NOTE}
      />
    </span>
  {/if}
  <span
    class="fit"
    role="list"
    aria-label={course ? 'Aptitudes on this course' : 'Aptitudes'}
  >
    {#each courseAptitudeItems(entry.uma, course) as aptitude (aptitude.id)}
      <span
        class="course-aptitude"
        role="listitem"
        style:--aptitude-color="var(--aptitude-{aptitude.grade.toLowerCase()})"
        title={aptitude.group + ': ' + aptitude.label + ' ' + aptitude.grade}
      >
        <span class="aptitude-label">
          <small>{aptitude.group}</small>
          {aptitude.label}
        </span>
        <AptitudeGrade
          grade={aptitude.grade}
          label={aptitude.group + ' ' + aptitude.label}
          size="sm"
        />
      </span>
    {/each}
  </span>
  {#if mode === 'single'}
    <span
      class="go"
      aria-hidden="true"
    >
      <Icon
        name="arrow-right"
        size={16}
      />
    </span>
  {/if}
{/snippet}

<div
  class="veteran-list"
  class:compact
  class:multi={mode === 'multi'}
>
  <!-- Search, filters and the column heads stay in view while the list scrolls. -->
  <div class="controls">
    <div class="tools">
      <div class="search">
        <TextField
          id="{uid}-search"
          label="Search Veterans"
          hideLabel
          prefixIcon="search"
          placeholder="Search by name…"
          bind:value={query}
        />
      </div>
      <SegmentedControl
        label="Running style"
        compact
        options={STYLES}
        bind:value={style}
      />
      <div class="sort">
        <SelectFieldSlim
          id="{uid}-sort"
          label="Sort Veterans"
          hideLabel
          options={SORTS}
          bind:value={sort}
        />
      </div>
    </div>

    <div class="summary-line">
      <span class="count">
        {shown.length === entries.length
          ? entries.length + (entries.length === 1 ? ' Veteran' : ' Veterans')
          : shown.length + ' of ' + entries.length}
      </span>
      {#if mode === 'multi' && max !== undefined && max < entries.length}
        <span
          class="room"
          class:full
        >
          {selected.length} of {max} ticked
        </span>
      {/if}
    </div>

    {#if shown.length}
      <div
        class="head"
        aria-hidden="true"
      >
        <span class="identity-head">Veteran</span>
        {#if !compact}
          <span class="stats-head">Stats</span>
          <span class="learned-head">Skills</span>
        {/if}
        <span class="fit-head">{course ? 'On this course' : 'Aptitudes'}</span>
      </div>
    {/if}
  </div>

  {#if shown.length}
    <ul
      class="rows"
      aria-label="Veterans"
    >
      {#each shown.slice(0, limit) as entry (entry.key)}
        {@const on = ticked.has(entry.key)}
        {@const isAdded = alreadyAdded.has(entry.key)}
        <li
          class="row"
          class:on
          class:added={isAdded}
          class:off={mode === 'multi' && !on && !isAdded && full}
        >
          {#if mode === 'multi'}
            <span class="tick">
              <Checkbox
                id="{uid}-{entry.key}"
                label={isAdded ? entry.uma.name + ' is already added' : 'Tick ' + entry.uma.name}
                hideLabel
                checked={on || isAdded}
                disabled={isAdded || (!on && full)}
                onchange={(checked) => toggle(entry, checked)}
              />
            </span>
            {@render details(entry)}
          {:else}
            {@render details(entry)}
            <button
              type="button"
              class="choose"
              aria-label={'Choose ' + entry.uma.name}
              onclick={() => onchoose?.(entry)}
            ></button>
          {/if}
        </li>
      {/each}
    </ul>
    {#if shown.length > limit}
      <span class="more">
        <Button
          variant="ghost"
          size="sm"
          onclick={() => (limit += 200)}
        >
          Show {Math.min(200, shown.length - limit)} more of {shown.length - limit}
        </Button>
      </span>
    {/if}
  {:else if entries.length}
    <EmptyState
      compact
      icon="search"
      title="No matching Veterans"
      description="No Veterans match these filters."
    />
  {:else}
    <EmptyState
      compact
      icon="veterans"
      title="No Veterans to race"
      description="No Veterans with trained stats in this collection."
    />
  {/if}
</div>

<style>
  @import './veteran-list.css';
</style>
