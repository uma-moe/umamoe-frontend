<script lang="ts">
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import SelectFieldSlim from '@/components/controls/SelectFieldSlim.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import AptitudeGrade, { type AptitudeGradeValue } from '@/components/game/AptitudeGrade.svelte';
  import Icon from '@/components/Icon.svelte';
  import type { CourseCatalogEntry } from '@/lib/catalog/course-catalog';
  import { getRankInfoFromLabel } from '@/lib/rank';
  import SimulatorRunnerFace from '../../reports/SimulatorRunnerFace.svelte';
  import { courseAptitudes, type VeteranEntry } from './veteran-entries';
  import { STYLES, STYLE_NAMES, SORTS, STATS, shownVeterans } from './veteran-list';

  /**
   * A collection of Veterans to choose from: search, filter by running style and sort, with each one's stats and her
   * aptitudes on this course. One is chosen with a click, or several are ticked.
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
    course?: CourseCatalogEntry;
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

  function toggle(entry: VeteranEntry, on: boolean) {
    selected = on
      ? ticked.has(entry.key) || full
        ? selected
        : [...selected, entry.key]
      : selected.filter((key) => key !== entry.key);
  }
  const allShown = $derived(shown.length > 0 && shown.every((entry) => ticked.has(entry.key)));
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
  const rankColor = (rank: string) => getRankInfoFromLabel(rank).colorToken;
</script>

{#snippet details(entry: VeteranEntry)}
  {@const grades = courseAptitudes(entry.uma, course)}
  <SimulatorRunnerFace
    cardId={entry.uma.cardId}
    size={compact ? 30 : 36}
  />
  <span class="who">
    <strong>{entry.uma.name}</strong>
    <span class="meta">
      {STYLE_NAMES[entry.uma.trainee.runningStyle] ?? ''}
      {#if entry.rank}<span
          class="rank"
          style:--rank={rankColor(entry.rank)}
        >
          {entry.rank}
        </span>{/if}
    </span>
  </span>
  {#if !compact}
    <span
      class="stats"
      aria-label="Stats"
    >
      {#each STATS as [key, icon]}
        <span>
          <img
            src="/assets/images/icon/stats/{icon}.webp"
            alt=""
            width="14"
            height="14"
          />
          {entry.uma.trainee[key]}
        </span>
      {/each}
    </span>
  {/if}
  <span
    class="fit"
    aria-label="Distance {grades[0]}, surface {grades[1]}, style {grades[2]}"
  >
    {#each grades as grade, index}
      <AptitudeGrade
        grade={grade as AptitudeGradeValue}
        label={['Distance', 'Surface', 'Style'][index]}
        size="xs"
      />
    {/each}
  </span>
  {#if mode === 'single'}<span
      class="go"
      aria-hidden="true"
    >
      <Icon
        name="add"
        size={16}
      />
    </span>{/if}
{/snippet}

<div
  class="veteran-list"
  class:compact
>
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

  <div class="head">
    <span class="count">
      {shown.length === entries.length
        ? entries.length + (entries.length === 1 ? ' Veteran' : ' Veterans')
        : shown.length + ' of ' + entries.length}
      {#if mode === 'multi' && shown.length}<button
          type="button"
          class="tick-all"
          onclick={tickShown}
        >
          {allShown ? 'Untick all' : 'Tick all'}
        </button>{/if}
      {#if mode === 'multi' && max !== undefined && max < entries.length}<span
          class="room"
          class:full
        >
          {selected.length} of {max} ticked
        </span>{/if}
    </span>
    {#if !compact}<span
        class="stats-head"
        aria-hidden="true"
      >
        Stats
      </span>{/if}
    <span
      class="fit-head"
      aria-hidden="true"
    >
      {course ? 'On this course' : 'Aptitudes'}
    </span>
  </div>

  {#if shown.length}
    <ul
      class="rows"
      aria-label="Veterans"
    >
      {#each shown.slice(0, limit) as entry (entry.key)}
        {@const on = ticked.has(entry.key)}
        <li>
          {#if mode === 'multi'}
            <label
              class="row"
              class:on
              class:off={!on && full}
            >
              {#if mode === 'multi'}
                <input
                  type="checkbox"
                  checked={on}
                  disabled={!on && full}
                  aria-label={entry.uma.name}
                  onchange={(event) => toggle(entry, event.currentTarget.checked)}
                />
              {/if}
              {@render details(entry)}
            </label>
          {:else}
            <button
              type="button"
              class="row"
              aria-label={'Choose ' + entry.uma.name}
              onclick={() => onchoose?.(entry)}
            >
              {@render details(entry)}
            </button>
          {/if}
        </li>
      {/each}
    </ul>
    {#if shown.length > limit}
      <button
        type="button"
        class="more"
        onclick={() => (limit += 200)}
      >
        Show {Math.min(200, shown.length - limit)} more of {shown.length - limit}
      </button>
    {/if}
  {:else}
    <p class="empty">
      {entries.length ? 'No Veterans match.' : 'No Veterans with trained stats in this collection.'}
    </p>
  {/if}
</div>

<style>
  @import './veteran-list.css';
</style>
