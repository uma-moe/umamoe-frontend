<script lang="ts">
  import type { Snippet } from 'svelte';
  import ChartFrame from '@/components/charts/ChartFrame.svelte';
  import IconButton from '@/components/controls/IconButton.svelte';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import { formatRaceTime } from '@/lib/race/replay/race-display';
  import SimulatorRunnerFace from '../SimulatorRunnerFace.svelte';
  import { runnerColor } from '../simulation-report';
  import type { MonteCarloResult } from '../../simulator-repository';
  import type { SimulatorUma } from '../../simulator-uma';

  /**
   * Pick a race of the batch to watch: each picked runner's typical, fastest and slowest race, or any race from the
   * full list with its finishing order as portraits. The replay itself is passed in and shown under the picker.
   */
  let {
    result,
    umas,
    sources,
    active,
    busy = false,
    representative,
    onwatch,
    children
  }: {
    result: MonteCarloResult;
    umas: SimulatorUma[];
    /** The picked runners, baseline first. */
    sources: number[];
    /** The race being watched, if any. */
    active?: number;
    busy?: boolean;
    /** Race index of a runner's typical (0), fastest (1) or slowest (2) race. */
    representative: (source: number, kind: number) => number;
    onwatch: (race: number) => void;
    children?: Snippet;
  } = $props();

  const PAGE = 10;
  let view = $state('picks'),
    page = $state(0);

  const pages = $derived(Math.ceil(result.runs / PAGE));
  const races = $derived(
    Array.from(
      { length: Math.max(0, Math.min(PAGE, result.runs - page * PAGE)) },
      (_, index) => page * PAGE + index
    )
  );

  const KINDS = ['Typical', 'Fastest', 'Slowest'] as const;
  const name = (source: number) => umas[source]!.name;
  const time = (race: number, source: number) =>
    formatRaceTime(result.finish_times[race]?.[source], 2);

  const ordinal = (place: number) =>
    place +
    (['th', 'st', 'nd', 'rd'][place % 100 > 10 && place % 100 < 14 ? 0 : place % 10] ?? 'th');

  const place = (race: number, source: number) =>
    (result.finish_order[race]?.indexOf(source) ?? -1) + 1;

  // Jump the list to the page of a race opened from a quick pick, so it is highlighted there too.
  $effect(() => {
    if (active !== undefined) page = Math.floor(active / PAGE);
  });
</script>

<ChartFrame
  id="simulation-sample-races"
  title="Watch a race"
  description={'Replay any of the ' +
    result.runs +
    ' sampled races. Quick picks are each picked runner’s typical race (closest to her median finish), her fastest and her slowest. All races lists every race with its finishing order, left to right, and where the picked runners finished.'}
>
  {#snippet actions()}<SegmentedControl
      compact
      label="Races shown"
      options={[
        { value: 'picks', label: 'Quick picks' },
        { value: 'all', label: 'All ' + result.runs + ' races' }
      ]}
      bind:value={view}
    />{/snippet}
  {#if view === 'picks'}
    <div
      class="picks"
      role="table"
      aria-label="Typical, fastest and slowest race per runner"
    >
      <div
        class="pick-row head"
        role="row"
      >
        <span role="columnheader">Runner</span>
        {#each KINDS as kind}<span role="columnheader">{kind} race</span>{/each}
      </div>
      {#each sources as source (source)}
        <div
          class="pick-row"
          role="row"
          style:--runner={runnerColor(source)}
        >
          <span
            class="who"
            role="rowheader"
          >
            <i
              class="dot"
              aria-hidden="true"
            ></i>
            <SimulatorRunnerFace
              cardId={umas[source]!.cardId}
              size={24}
            />
            <span>{name(source)}</span>
          </span>
          {#each KINDS as kind, index}
            {@const race = representative(source, index)}
            <span role="cell">
              <button
                type="button"
                class="pick"
                class:active={active === race}
                aria-label={kind + ' race for ' + name(source)}
                disabled={busy}
                onclick={() => onwatch(race)}
              >
                <b>{time(race, source)}</b>
                <small>race {race + 1}</small>
              </button>
            </span>
          {/each}
        </div>
      {/each}
    </div>
  {:else}
    <div
      class="races"
      role="table"
      aria-label="Every sampled race"
      style:--runners={sources.length}
    >
      <div
        class="race-row head"
        role="row"
      >
        <span role="columnheader">Race</span>
        <span role="columnheader">Finishing order</span>
        {#each sources as source (source)}<span
            class="runner-head"
            role="columnheader"
            style:--runner={runnerColor(source)}
            title={name(source)}
          >
            <SimulatorRunnerFace
              cardId={umas[source]!.cardId}
              size={22}
            />
            <span class="sr-only">{name(source)}</span>
          </span>{/each}
        <span role="columnheader"><span class="sr-only">Watch</span></span>
      </div>
      {#each races as race (race)}
        <div
          class="race-row"
          class:active={active === race}
          role="row"
        >
          <span
            class="race"
            role="rowheader"
          >
            <b>{race + 1}</b>
            <small>{result.seeds[race]}</small>
          </span>
          <span
            class="order"
            role="cell"
          >
            {#each result.finish_order[race] ?? [] as runner, index (runner)}<span
                class="ring"
                class:picked={sources.includes(runner)}
                style:--runner={runnerColor(runner)}
                title={ordinal(index + 1) + ' ' + name(runner)}
              >
                <SimulatorRunnerFace
                  cardId={umas[runner]!.cardId}
                  size={22}
                />
              </span>{/each}
          </span>
          {#each sources as source (source)}
            {@const at = place(race, source)}
            <span
              class="result"
              class:won={at === 1}
              role="cell"
            >
              <b>{ordinal(at)}</b>
              <small>{time(race, source)}</small>
            </span>
          {/each}
          <span role="cell">
            <button
              type="button"
              class="watch"
              class:active={active === race}
              aria-label={'Watch race ' + (race + 1)}
              disabled={busy}
              onclick={() => onwatch(race)}
            >
              {active === race ? 'Watching' : 'Watch'}
            </button>
          </span>
        </div>
      {/each}
      <div class="pager">
        <IconButton
          icon="arrow-left"
          size="sm"
          label="Previous races"
          disabled={page === 0}
          onclick={() => page--}
        />
        <span>
          {page * PAGE + 1}–{Math.min(result.runs, (page + 1) * PAGE)} of {result.runs}
        </span>
        <IconButton
          icon="arrow-right"
          size="sm"
          label="Next races"
          disabled={page + 1 >= pages}
          onclick={() => page++}
        />
      </div>
    </div>
  {/if}
  {@render children?.()}
</ChartFrame>

<style>
  .pick-row,
  .race-row {
    display: grid;
    align-items: center;
    gap: 8px;
    min-height: 34px;
    border-top: 1px solid var(--border-subtle);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .head {
    min-height: 22px;
    border-top: 0;
    font-size: 10px;
    font-weight: 500;
    color: var(--text-secondary);
  }
  .head + div {
    border-top: 0;
  }
  /* Quick picks: one row per picked runner, her three races side by side. */
  .pick-row {
    grid-template-columns: minmax(150px, 220px) repeat(3, minmax(0, 1fr));
  }
  .who {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    font-weight: 600;
  }
  .who > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dot {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--runner);
  }
  .pick,
  .watch {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    min-height: 28px;
    padding: 4px 10px;
    border: 1px solid var(--border-primary);
    border-radius: 8px;
    background: transparent;
    color: var(--text-primary);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  .pick {
    width: 100%;
  }
  .pick b {
    font-weight: 650;
  }
  .pick small,
  .race small,
  .result small {
    font-size: 10px;
    color: var(--text-secondary);
  }
  .pick:hover:not(:disabled),
  .watch:hover:not(:disabled) {
    background: var(--tab-btn-hover-bg);
  }
  .pick.active,
  .watch.active {
    color: var(--accent-primary);
    background: rgb(var(--accent-primary-rgb) / 0.12);
    border-color: rgb(var(--accent-primary-rgb) / 0.3);
  }
  .pick:disabled,
  .watch:disabled {
    cursor: default;
    opacity: 0.6;
  }
  /* All races: the finishing order as portraits, the picked runners' places and times, and a watch button. */
  .race-row {
    grid-template-columns: 112px max-content repeat(var(--runners), minmax(70px, 1fr)) 84px;
  }
  .race-row.active {
    background: rgb(var(--accent-primary-rgb) / 0.06);
  }
  .race {
    display: grid;
    line-height: 1.15;
  }
  .race b {
    font-weight: 650;
  }
  .order {
    display: flex;
    align-items: center;
    gap: 3px;
    min-width: 0;
    padding-right: 12px;
  }
  .ring {
    display: inline-flex;
    flex: none;
    border-bottom: 2px solid var(--runner);
    opacity: 0.4;
  }
  .ring.picked {
    opacity: 1;
  }
  .runner-head {
    display: flex;
    justify-content: center;
    border-bottom: 2px solid var(--runner);
    padding-bottom: 2px;
  }
  .result {
    display: grid;
    justify-items: center;
    line-height: 1.15;
  }
  .result b {
    font-weight: 650;
  }
  .result.won b {
    color: var(--accent-success);
  }
  .watch {
    justify-content: center;
    width: 100%;
  }
  .pager {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    padding-top: 6px;
    border-top: 1px solid var(--border-subtle);
    font-size: 11px;
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
  }
  @media (max-width: 700px) {
    .pick-row {
      grid-template-columns: minmax(0, 1fr) repeat(3, 72px);
      gap: 4px;
    }
    .pick {
      display: grid;
      justify-items: center;
      gap: 0;
      padding: 2px 4px;
    }
    .who :global(.face) {
      display: none;
    }
    .race-row {
      grid-template-columns: 64px minmax(0, 1fr) 72px;
      gap: 6px;
    }
    .race-row > .result,
    .runner-head {
      display: none;
    }
    .race small {
      display: none;
    }
    .order {
      overflow: hidden;
      padding-right: 0;
    }
  }
</style>
