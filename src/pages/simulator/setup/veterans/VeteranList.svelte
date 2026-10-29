<script lang="ts">
  import AptitudeGrade from '@/components/game/AptitudeGrade.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Checkbox from '@/components/controls/Checkbox.svelte';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import SelectFieldSlim from '@/components/controls/SelectFieldSlim.svelte';
  import StatStrip, { type StatStripItem } from '@/components/game/StatStrip.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import EmptyState from '@/components/feedback/EmptyState.svelte';
  import Icon from '@/components/Icon.svelte';
  import type { RaceCourse } from '@/lib/game-data/racing/courses';
  import ProfileVeteranIdentity from '@/pages/profile/veterans/ProfileVeteranIdentity.svelte';
  import { courseAptitudeItems, type VeteranEntry } from './veteran-entries';
  import { STYLES, SORTS, STATS, shownVeterans } from './veteran-list';

  /**
   * A collection of Veterans to choose from, drawn like the Veterans table: search, filter by running style and sort,
   * with each one's stats, learned skills and her aptitudes on this course. One is chosen with a click, or several are
   * ticked.
   */
  let {
    entries,
    course,
    mode = 'single',
    selected = $bindable([]),
    max,
    compact = false,
    onchoose
  }: {
    entries: VeteranEntry[];
    course?: RaceCourse;
    mode?: 'single' | 'multi';
    /** The ticked Veterans' keys, in multi mode. */
    selected?: string[];
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
  const full = $derived(max !== undefined && selected.length >= max);
  const allShown = $derived(shown.length > 0 && shown.every((entry) => ticked.has(entry.key)));

  function toggle(entry: VeteranEntry, on: boolean) {
    if (!on) {
      selected = selected.filter((key) => key !== entry.key);
      return;
    }

    if (!ticked.has(entry.key) && !full) selected = [...selected, entry.key];
  }

  function tickShown() {
    if (allShown) {
      const drop = new Set(shown.map((entry) => entry.key));
      selected = selected.filter((key) => !drop.has(key));
      return;
    }

    const next = [...selected];
    for (const entry of shown) {
      if (max !== undefined && next.length >= max) break;
      if (!ticked.has(entry.key)) next.push(entry.key);
    }

    selected = next;
  }

  /** Her five stats, then what she learned and the sum, as the Veterans table lists them. */
  function statItems(entry: VeteranEntry): StatStripItem[] {
    return [
      ...STATS.map(([key, icon, label]) => ({
        id: key,
        label,
        value: entry.uma.trainee[key].toLocaleString(),
        icon: '/assets/images/icon/stats/' + icon + '.webp'
      })),
      { id: 'skills', label: 'Skills', value: entry.learnedSkills },
      { id: 'sp', label: 'SP', value: entry.skillPoints?.toLocaleString() ?? '-' },
      { id: 'total', label: 'Total', value: entry.total.toLocaleString() }
    ];
  }
</script>

{#snippet details(entry: VeteranEntry)}
  <span class="identity">
    <ProfileVeteranIdentity
      summary={entry.summary}
      rarity={entry.rarity}
      score={entry.score}
      rankPlacement="details"
    />
  </span>
  {#if !compact}
    <span class="stats">
      <StatStrip
        label={entry.uma.name + ' stats'}
        items={statItems(entry)}
        compact
        presentation="icons"
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
        title={aptitude.group + ': ' + aptitude.label + ' ' + aptitude.grade}
      >
        <AptitudeGrade
          grade={aptitude.grade}
          label={aptitude.group + ' ' + aptitude.label}
          size="sm"
        />
        <small>{aptitude.label}</small>
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
      {#if mode === 'multi' && shown.length}
        <Button
          variant="ghost"
          size="sm"
          onclick={tickShown}
        >
          {allShown ? 'Untick all' : 'Tick all'}
        </Button>
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
        <li
          class="row"
          class:on
          class:off={mode === 'multi' && !on && full}
        >
          {#if mode === 'multi'}
            <span class="tick">
              <Checkbox
                id="{uid}-{entry.key}"
                label={'Tick ' + entry.uma.name}
                hideLabel
                checked={on}
                disabled={!on && full}
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
