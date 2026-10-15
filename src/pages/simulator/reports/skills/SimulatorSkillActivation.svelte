<script lang="ts">
  import ChartFrame from '@/components/charts/ChartFrame.svelte';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import RaceSkill from '@/pages/competitive/runners/RaceSkill.svelte';
  import SimulatorRunnerFace from '../SimulatorRunnerFace.svelte';
  import { activationRows, type ActivationCell } from './skill-activation';
  import { runnerColor, reportNumber as n } from '../simulation-report';
  import type { MonteCarloResult } from '../../simulator-repository';
  import type { SimulatorUma } from '../../simulator-uma';

  /**
   * How often every learned skill activates, least reliable first: one row per skill and one cell per runner shown, the
   * cell's share of races written in it and tinted the more often the skill fails to fire. Wide cards split the list into
   * side-by-side columns. Where a skill fires is on the race timeline's heatmap and what it is worth is in the ranking
   * below, so this only answers "does it fire".
   */
  let {
    result,
    umas,
    sources
  }: { result: MonteCarloResult; umas: SimulatorUma[]; sources: number[] } = $props();

  let show = $state('all'),
    width = $state(0);

  const rows = $derived(activationRows(result, umas, sources));
  const visible = $derived(show === 'all' ? rows : rows.filter((row) => row.lowest < 95));
  const flagged = $derived(rows.filter((row) => row.lowest < 95).length);

  const phone = $derived(width > 0 && width < 600);
  const cell = $derived(phone ? 46 : 62),
    skill = $derived(phone ? 124 : 200),
    gutter = 20;

  // As many side-by-side lists as fit, but never so many that each is only a few rows long.
  const columns = $derived(
    Math.max(
      1,
      Math.min(
        Math.floor((width + gutter) / (skill + sources.length * (cell + 2) + gutter)),
        Math.ceil(visible.length / 8),
        4
      )
    )
  );

  const lists = $derived.by(() => {
    const size = Math.ceil(visible.length / columns);
    return Array.from({ length: columns }, (_, index) =>
      visible.slice(index * size, (index + 1) * size)
    );
  });

  const rate = (value: number) => {
    if (value === 0) {
      return 'Never';
    }

    if (value >= 99.95) {
      return '100%';
    }

    if (value < 1) {
      return '<1%';
    }

    return value.toFixed(0) + '%';
  };

  // Reliable skills stay quiet; the rarer a skill fires, the stronger the amber, and never firing is red.
  const fill = (value: number) => {
    if (value >= 95) {
      return 'color-mix(in srgb, var(--text-secondary) 9%, transparent)';
    }

    if (value === 0) {
      return 'color-mix(in srgb, var(--activation-never) 62%, transparent)';
    }

    return (
      'color-mix(in srgb, var(--activation-rare) ' +
      Math.round(16 + ((95 - value) / 95) * 52) +
      '%, transparent)'
    );
  };

  const name = (source: number) => umas[source]!.name;
  const lasts = (cell: ActivationCell) => {
    if (cell.row.passive) {
      return 'passive';
    }

    if (cell.row.duration != null) {
      return 'lasts ' + n(cell.row.duration) + ' s';
    }

    if (cell.row.instant) {
      return 'instant';
    }

    return '';
  };

  const tooltip = (source: number, cell: ActivationCell | undefined) => {
    if (!cell) return name(source) + ' has not learned it';
    const parts = [
      name(source) +
        ': activates in ' +
        cell.row.triggered +
        ' of ' +
        result.runs +
        ' races (95%: ' +
        n(cell.row.interval[0], 0) +
        '–' +
        n(cell.row.interval[1], 0) +
        '%)'
    ];

    if (cell.row.triggered)
      parts.push((cell.row.total / result.runs).toFixed(2) + ' activations per race');
    const length = lasts(cell);
    if (length) parts.push(length);
    return parts.join(' · ');
  };
</script>

<ChartFrame
  id="simulation-skill-activation"
  title="Skill activation"
  slim
  description={'How often each learned skill activates over the ' +
    result.runs +
    ' races, least reliable first. Each cell is the share of races in which that runner activated the skill at least once. Skills that fire almost every race stay grey; the less often one fires, the stronger its amber, and red means it never fired. “—” means she has not learned it. Hover a cell for the exact count, its 95% interval and how long the skill lasts. Where each skill fires is on the heatmap under the race timeline; what it is worth is in the ranking below.'}
>
  {#snippet actions()}<SegmentedControl
      compact
      label="Skills shown"
      options={[
        { value: 'all', label: 'All ' + rows.length },
        {
          value: 'unreliable',
          label: 'Not always · ' + flagged,
          title: 'Skills at least one runner activates in fewer than 95% of races'
        }
      ]}
      bind:value={show}
    />{/snippet}
  {#if !result.skill_procs}<p class="empty">
      This batch did not collect skill activations. Run the simulation again to see them.
    </p>
  {:else}
    <div
      class="activation"
      bind:clientWidth={width}
      style:--skill={skill + 'px'}
      style:--cell={cell + 'px'}
      style:--runners={sources.length}
    >
      {#if !visible.length}<p class="empty">
          Every skill activates in at least 95% of races for every runner shown.
        </p>{/if}
      {#each lists as list, index (index)}
        {#if list.length}<div
            class="list"
            role="table"
            aria-label={'Skill activation' + (columns > 1 ? ', part ' + (index + 1) : '')}
          >
            <div
              class="line head"
              role="row"
            >
              <span
                class="skill-head"
                role="columnheader"
              >
                Skill
              </span>
              <small
                class="unit"
                aria-hidden="true"
              >
                % of races
              </small>
              {#each sources as source (source)}<span
                  class="runner"
                  role="columnheader"
                  style:--runner={runnerColor(source)}
                  title={name(source)}
                >
                  <SimulatorRunnerFace
                    cardId={umas[source]!.cardId}
                    size={26}
                  />
                  <span class="sr-only">{name(source)}</span>
                </span>{/each}
            </div>
            {#each list as row (row.id)}
              <div
                class="line"
                role="row"
              >
                <span
                  class="skill"
                  role="rowheader"
                >
                  <RaceSkill
                    id={row.id}
                    fill
                  />
                </span>
                {#each sources as source (source)}
                  {@const owned = row.cells.get(source)}
                  {#if owned}<span
                      class="rate"
                      class:never={owned.row.rate === 0}
                      class:rare={owned.row.rate > 0 && owned.row.rate < 50}
                      role="cell"
                      style:background={fill(owned.row.rate)}
                      title={tooltip(source, owned)}
                    >
                      {rate(owned.row.rate)}
                    </span>{:else}<span
                      class="rate none"
                      role="cell"
                      title={tooltip(source, undefined)}
                    >
                      —
                    </span>{/if}
                {/each}
              </div>
            {/each}
          </div>{/if}
      {/each}
    </div>
    <p class="key">
      <span>
        <i
          class="swatch"
          style:background={fill(100)}
          aria-hidden="true"
        ></i>
        fires almost every race
      </span>
      <span>
        <i
          class="swatch ramp"
          aria-hidden="true"
        ></i>
        less often
      </span>
      <span>
        <i
          class="swatch"
          style:background={fill(0)}
          aria-hidden="true"
        ></i>
        never
      </span>
      <span>
        <b>—</b>
        not learned
      </span>
    </p>
  {/if}
</ChartFrame>

<style>
  .activation {
    --activation-rare: #e2a03f;
    --activation-never: #e66767;
    display: flex;
    gap: 20px;
    align-items: flex-start;
    max-height: 620px;
    overflow: auto;
    scrollbar-width: thin;
    min-width: 0;
  }
  :global(:root[data-theme='light']) .activation {
    --activation-rare: #e08a00;
    --activation-never: #e34948;
  }
  .list {
    flex: 1;
    min-width: 0;
  }
  .line {
    display: grid;
    grid-template-columns: minmax(var(--skill), 1fr) repeat(var(--runners), var(--cell));
    align-items: center;
    gap: 2px;
    margin-top: 2px;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .line.head {
    position: sticky;
    top: 0;
    z-index: 2;
    margin-top: 0;
    padding-bottom: 2px;
    grid-template-rows: auto auto;
    align-items: end;
    background: var(--card-surface-bg, var(--surface-1));
    font-size: 10px;
    font-weight: 500;
    color: var(--text-secondary);
  }
  .skill-head {
    grid-row: 1 / 3;
    padding-bottom: 4px;
  }
  .unit {
    grid-column: 2 / -1;
    font-size: 10px;
    text-align: center;
    white-space: nowrap;
  }
  .runner {
    display: flex;
    justify-content: center;
    border-bottom: 2px solid var(--runner);
    padding-bottom: 2px;
  }
  /* Every chip is the same width, so the names line up down the list. */
  .skill {
    display: flex;
    width: var(--skill);
    max-width: 100%;
    min-width: 0;
  }
  .skill :global(.skill-chip) {
    max-width: 100%;
  }
  .rate {
    display: grid;
    place-items: center;
    height: 26px;
    border-radius: 4px;
    font-weight: 600;
    color: var(--text-primary);
  }
  .rate.never {
    font-size: 11px;
    font-weight: 700;
  }
  .rate.none {
    font-weight: 400;
    color: var(--text-secondary);
    opacity: 0.5;
  }
  .line:not(.head):hover .skill :global(.skill-chip) {
    outline: 1px solid var(--border-primary);
  }
  .empty {
    font-size: 12px;
    color: var(--text-secondary);
    padding: 10px 6px;
  }
  .key {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 4px 14px;
    flex-wrap: wrap;
    margin: 6px 0 0;
    font-size: 10px;
    color: var(--text-secondary);
  }
  .key span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    white-space: nowrap;
  }
  .key b {
    font-weight: 650;
    color: var(--text-primary);
  }
  .swatch {
    width: 16px;
    height: 10px;
    border-radius: 2px;
  }
  .swatch.ramp {
    width: 28px;
    background: linear-gradient(
      to right,
      color-mix(in srgb, var(--activation-rare) 16%, transparent),
      color-mix(in srgb, var(--activation-rare) 68%, transparent)
    );
  }
  .key {
    --activation-rare: #e2a03f;
    --activation-never: #e66767;
  }
  :global(:root[data-theme='light']) .key {
    --activation-rare: #e08a00;
    --activation-never: #e34948;
  }
</style>
