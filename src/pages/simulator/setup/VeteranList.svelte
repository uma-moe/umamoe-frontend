<script lang="ts">
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import SelectFieldSlim from '@/components/controls/SelectFieldSlim.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import AptitudeGrade, { type AptitudeGradeValue } from '@/components/game/AptitudeGrade.svelte';
  import Icon from '@/components/Icon.svelte';
  import type { CourseCatalogEntry } from '@/lib/catalog/course-catalog';
  import { getRankInfoFromLabel } from '@/lib/rank';
  import SimulatorRunnerFace from '../reports/SimulatorRunnerFace.svelte';
  import { courseAptitudes, courseFit, type VeteranEntry } from './veteran-entries';

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

  const STYLES = [
    { value: 'all', label: 'All' },
    { value: 'Nige', label: 'Front' },
    { value: 'Senko', label: 'Pace' },
    { value: 'Sashi', label: 'Late' },
    { value: 'Oikomi', label: 'End' }
  ];
  const STYLE_NAMES: Record<string, string> = {
    Nige: 'Front',
    Senko: 'Pace',
    Sashi: 'Late',
    Oikomi: 'End',
    Oonige: 'Runaway'
  };
  const SORTS = [
    { value: 'fit', label: 'Course fit' },
    { value: 'rank', label: 'Rank' },
    { value: 'total', label: 'Total stats' },
    { value: 'newest', label: 'Newest' }
  ];
  const STATS = [
    ['speed', 'speed'],
    ['stamina', 'stamina'],
    ['power', 'power'],
    ['guts', 'guts'],
    ['wisdom', 'wit']
  ] as const;

  const shown = $derived.by(() => {
    const words = query.trim().toLowerCase();
    const list = entries.filter(
      (entry) =>
        (style === 'all' ||
          entry.uma.trainee.runningStyle === style ||
          (style === 'Nige' && entry.uma.trainee.runningStyle === 'Oonige')) &&
        (!words || entry.uma.name.toLowerCase().includes(words))
    );
    const fit = new Map(list.map((entry) => [entry.key, courseFit(entry.uma, course)]));
    return list.sort(
      sort === 'rank'
        ? (a, b) => (b.score ?? 0) - (a.score ?? 0)
        : sort === 'total'
          ? (a, b) => b.total - a.total
          : sort === 'newest'
            ? (a, b) => b.created - a.created
            : (a, b) => fit.get(a.key)! - fit.get(b.key)! || (b.score ?? 0) - (a.score ?? 0)
    );
  });
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
  .veteran-list {
    display: grid;
    gap: 8px;
    min-width: 0;
    container: veteran-list / inline-size;
  }
  .tools {
    --control-height: 34px;
    display: flex;
    flex-wrap: wrap;
    gap: 6px 8px;
    align-items: center;
  }
  .search {
    flex: 1 1 180px;
    min-width: 0;
  }
  .search :global(input) {
    font-size: 13px;
  }
  .sort {
    flex: 0 1 190px;
    min-width: 150px;
  }
  .sort :global(button.select-control) {
    min-height: 34px;
    font-size: 12px;
  }
  /* Narrow: search and sort share a row, the styles take the next. */
  @container veteran-list (max-width: 520px) {
    .search {
      flex: 1 1 0;
    }
    .sort {
      flex: 0 0 136px;
      min-width: 0;
      order: 2;
    }
    .veteran-list .tools > :global(.segments) {
      order: 3;
      width: 100%;
    }
    .veteran-list .tools > :global(.segments button) {
      flex: 1;
    }
  }
  .head,
  .row {
    display: grid;
    grid-template-columns: var(--tick, 0) 36px minmax(0, 1fr) var(--stats, 290px) 62px var(--go, 0);
    column-gap: 10px;
    align-items: center;
  }
  .veteran-list:has(input[type='checkbox']) .head,
  .veteran-list:has(input[type='checkbox']) .row {
    --tick: 18px;
  }
  .veteran-list:has(.go) .head,
  .veteran-list:has(.go) .row {
    --go: 20px;
  }
  .compact .head,
  .compact .row {
    --stats: 0;
    grid-template-columns: var(--tick, 0) 30px minmax(0, 1fr) 62px var(--go, 0);
  }
  .head {
    padding: 0 8px;
    font-size: 11px;
    color: var(--text-secondary);
  }
  .head .count {
    grid-column: 1 / 4;
    display: flex;
    align-items: baseline;
    gap: 10px;
    white-space: nowrap;
  }
  .compact .head .count {
    grid-column: 1 / 4;
  }
  .room.full {
    color: var(--accent-warning);
  }
  .tick-all {
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent-primary);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .stats-head {
    grid-column: 4;
  }
  .fit-head {
    grid-column: -3;
    white-space: nowrap;
  }
  .rows {
    display: grid;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .row {
    width: 100%;
    min-height: 44px;
    padding: 4px 8px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: var(--text-primary);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .row:hover {
    background: var(--surface-2);
  }
  .row:focus-visible,
  .row:has(input:focus-visible) {
    outline: 2px solid var(--accent-primary);
    outline-offset: -2px;
  }
  .row.on {
    background: color-mix(in srgb, var(--accent-primary) 7%, transparent);
  }
  .row.off {
    opacity: 0.5;
    cursor: default;
  }
  .row input {
    width: 16px;
    height: 16px;
    margin: 0;
    accent-color: var(--accent-primary);
  }
  .who {
    display: grid;
    min-width: 0;
    line-height: 1.25;
  }
  .who strong {
    overflow: hidden;
    font-size: 13px;
    font-weight: 650;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--text-secondary);
  }
  .rank {
    padding: 0 4px;
    border: 1px solid var(--rank);
    border-radius: 4px;
    color: var(--rank);
    font-size: 10px;
    font-weight: 700;
    line-height: 14px;
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 8px;
    font-size: 12px;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
  }
  .stats span {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }
  .stats img {
    width: 14px;
    height: 14px;
    object-fit: contain;
  }
  .fit {
    display: flex;
    gap: 3px;
  }
  .go {
    display: grid;
    place-items: center;
    color: var(--accent-primary);
    opacity: 0;
  }
  .row:hover .go,
  .row:focus-visible .go {
    opacity: 1;
  }
  .more {
    justify-self: center;
    padding: 6px 10px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--accent-primary);
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }
  .more:hover {
    background: var(--surface-2);
  }
  .empty {
    margin: 0;
    padding: 16px 8px;
    font-size: 12px;
    color: var(--text-secondary);
    text-align: center;
  }
  /* Phone: the stats go under her name. */
  @media (max-width: 640px) {
    .head .stats-head {
      display: none;
    }
    .head,
    .row {
      grid-template-columns: var(--tick, 0) 36px minmax(0, 1fr) 62px var(--go, 0);
    }
    .row .stats {
      grid-column: 3 / -1;
      grid-row: 2;
    }
    .compact .row .stats {
      display: none;
    }
    .row {
      row-gap: 2px;
    }
    .go {
      opacity: 1;
    }
  }
</style>
