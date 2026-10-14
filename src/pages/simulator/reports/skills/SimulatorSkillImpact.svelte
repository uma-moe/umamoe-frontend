<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import Button from '@/components/controls/Button.svelte';
  import ChartFrame from '@/components/charts/ChartFrame.svelte';
  import EmptyState from '@/components/feedback/EmptyState.svelte';
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';
  import Icon from '@/components/Icon.svelte';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import RaceSkill from '@/pages/competitive/runners/RaceSkill.svelte';
  import {
    loadSkillCatalog,
    resolveEncodedSkill,
    skillPointTotal,
    skillRarity,
    type SkillCatalogEntry
  } from '@/lib/catalog/skill-catalog';
  import { skillDistributions } from './skill-distributions';
  import { runnerColor } from '../simulation-report';
  import {
    formatMargin,
    formatMarginValue,
    skillValue,
    type MarginUnit,
    type SkillValue
  } from '../simulation-comparison';
  import SimulatorRunnerFace from '../SimulatorRunnerFace.svelte';
  import { PRELIMINARY_RACES, type SkillImpactStore } from './skill-impact.svelte';
  import type { MonteCarloResult } from '../../simulator-repository';
  import type { SimulatorUma } from '../../simulator-uma';

  let {
    result,
    umas,
    sources,
    distance,
    impacts,
    unit = 'lengths',
    source = $bindable(),
    lead,
    children
  }: {
    result: MonteCarloResult;
    umas: SimulatorUma[];
    sources: number[];
    distance: number;
    impacts: SkillImpactStore;
    /** Leading unit for gains; the other unit follows in brackets. */
    unit?: MarginUnit;
    source?: number;
    /** Shown first, directly under the section heading. */
    lead?: Snippet;
    children?: Snippet;
  } = $props();

  let catalog = $state.raw(new Map<number, SkillCatalogEntry>());
  let sample = $state('quick');
  let sortKey = $state('value'),
    sortDirection = $state<'ascending' | 'descending'>('descending');
  onMount(() => {
    void loadSkillCatalog()
      .then((value) => (catalog = value))
      .catch(() => {});
  });

  const active = $derived(source !== undefined && sources.includes(source) ? source : sources[0]!);
  const races = $derived(
    sample === 'full' ? result.runs : Math.min(PRELIMINARY_RACES, result.runs)
  );
  const name = (id: number) => resolveEncodedSkill(catalog, id).skill?.name ?? 'Skill ' + id;
  const owned = (runner: number) => umas[runner]!.skills.map((skill) => skill.skillId);
  const unique = (id: number) => {
    const { skill, inherited } = resolveEncodedSkill(catalog, id);
    return skillRarity(skill, inherited) === 'unique-main';
  };
  const cost = (id: number) => (unique(id) ? null : skillPointTotal(catalog, [id]));
  const value = (runner: number, id: number): SkillValue | undefined => {
    const outcome = impacts.get(runner, id);
    return outcome ? skillValue(result, runner, distance, outcome) : undefined;
  };

  // Learned skills only: effect suppression requires the skill on the build.
  const rows = $derived.by(() => {
    const learned = owned(active);
    const observed = skillDistributions(result, active, learned).rows.filter((row) =>
      learned.includes(row.id)
    );
    return observed.map((row) => {
      const measured = value(active, row.id),
        sp = cost(row.id);
      return {
        id: row.id,
        rate: row.rate,
        triggered: row.triggered,
        value: measured?.lengths ?? Number.NEGATIVE_INFINITY,
        measured: measured ? 1 : 0,
        per100: measured && sp ? (measured.lengths / sp) * 100 : Number.NEGATIVE_INFINITY,
        per100Seconds: measured && sp ? (measured.seconds / sp) * 100 : 0,
        sp: sp ?? 0,
        win: measured?.winChange ?? Number.NEGATIVE_INFINITY,
        level: umas[active]!.skills.find((skill) => skill.skillId === row.id)?.level ?? 1
      };
    });
  });
  const unmeasured = $derived(
    rows.filter((row) => (impacts.get(active, row.id)?.count ?? 0) < races).length
  );
  const measuredRows = $derived(rows.filter((row) => row.measured));
  // Each runner's tab says how far her skills are measured, or her most valuable skill once they all are.
  const runnerSummary = (runner: number) => {
    const ids = owned(runner),
      done = ids.filter((id) => (impacts.get(runner, id)?.count ?? 0) >= races).length;
    const gains = ids.flatMap((id) => {
      const measured = value(runner, id);
      return measured ? [measured] : [];
    });
    if (!gains.length) return { badge: String(ids.length), title: ids.length + ' learned skills' };
    if (done < ids.length)
      return {
        badge: done + '/' + ids.length,
        title: done + ' of ' + ids.length + ' skills measured'
      };
    const top = gains.reduce((a, b) => (b.lengths > a.lengths ? b : a));
    const best = formatMarginValue(top.lengths, top.seconds, unit, 2);
    return { badge: best, title: 'Every skill measured; the most valuable gains ' + best };
  };

  // A gain axis with round steps covering every bar and 95% range in a list, always including zero.
  type Scale = { min: number; max: number; ticks: number[] };
  const makeScale = (points: { gain: number; low?: number; high?: number }[]): Scale => {
    const low = Math.min(0, ...points.map((row) => row.low ?? row.gain)),
      high = Math.max(0, ...points.map((row) => row.high ?? row.gain)),
      span = Math.max(high - low, unit === 'seconds' ? 0.05 : 0.5);
    const step =
      (unit === 'seconds'
        ? [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1]
        : [0.1, 0.2, 0.25, 0.5, 1, 2, 5]
      ).find((value) => span / value <= 6) ?? 5;
    const min = Math.floor(low / step) * step,
      max = Math.ceil(high / step) * step;
    return {
      min,
      max,
      ticks: Array.from({ length: Math.round((max - min) / step) + 1 }, (_, index) =>
        Number((min + index * step).toFixed(4))
      )
    };
  };
  const place = (axis: Scale, gain: number) =>
    ((gain - axis.min) / Math.max(Number.EPSILON, axis.max - axis.min)) * 100;

  // The selected runner's learned skills: measured ones sorted by the chosen column, unmeasured ones after them.
  const gainOf = (measured: SkillValue) => ({
    gain: unit === 'seconds' ? measured.seconds : measured.lengths,
    low: (unit === 'seconds' ? measured.lowSeconds : measured.low) ?? undefined,
    high: (unit === 'seconds' ? measured.highSeconds : measured.high) ?? undefined
  });
  const listed = $derived.by(() => {
    const direction = sortDirection === 'ascending' ? 1 : -1;
    const key = (row: (typeof rows)[number]) =>
      sortKey === 'id'
        ? name(row.id)
        : sortKey === 'per100'
          ? row.per100
          : sortKey === 'win'
            ? row.win
            : row.value;
    const measured = rows.filter((row) => row.measured),
      pending = rows.filter((row) => !row.measured);
    measured.sort((a, b) => {
      const x = key(a),
        y = key(b);
      return (typeof x === 'string' ? x.localeCompare(String(y)) : x - Number(y)) * direction;
    });
    return [...measured, ...pending.sort((a, b) => name(a.id).localeCompare(name(b.id)))];
  });
  const listScale = $derived(
    makeScale(
      measuredRows.flatMap((row) => {
        const measured = value(active, row.id);
        return measured ? [gainOf(measured)] : [];
      })
    )
  );
  const sortBy = (key: string) => {
    sortDirection =
      sortKey === key
        ? sortDirection === 'ascending'
          ? 'descending'
          : 'ascending'
        : key === 'id'
          ? 'ascending'
          : 'descending';
    sortKey = key;
  };
  const arrow = (key: string) =>
    sortKey === key ? (sortDirection === 'ascending' ? '↑' : '↓') : '↕';
  const range = (measured: SkillValue) =>
    measured.low != null
      ? '95%: ' +
        (unit === 'seconds'
          ? formatMarginValue(0, measured.highSeconds!, unit) +
            ' to ' +
            formatMarginValue(0, measured.lowSeconds!, unit)
          : formatMarginValue(measured.low, 0, unit, 2) +
            ' to ' +
            formatMarginValue(measured.high!, 0, unit, 2)) +
        ' · ' +
        measured.count +
        ' races'
      : measured.count + ' races';
  const tickLabel = (gain: number) =>
    Math.abs(gain) < 1e-9
      ? '0'
      : unit === 'seconds'
        ? (gain > 0 ? '−' : '+') + Math.abs(gain).toFixed(2) + ' s'
        : (gain > 0 ? '+' : '−') + Math.abs(gain) + ' L';

  const help = {
    Gain: 'What this skill’s effects are worth at the finish, measured against matched runs with those effects suppressed: lengths (1 L = 2.5 m) and seconds, where negative seconds means she finishes earlier. The small range is the 95% interval. Values are not additive across skills.',
    'Gain / 100 SP':
      'Gain divided by the base SP cost before hints. Owned uniques have no SP cost.',
    'Win rate change': 'Change in win rate, in percentage points, from having the skill.'
  };
</script>

{#snippet about(label: string, text: string)}<span class="column-help">
    <InspectPopover
      label={'About ' + label}
      openOnHover
      align="end"
    >
      {#snippet trigger()}<Icon
          name="info"
          size={12}
        />{/snippet}
      <p>{text}</p>
    </InspectPopover>
  </span>{/snippet}

<section
  id="simulation-skill-impact"
  class="report-section"
  aria-label="Skill impact"
>
  <header class="section-heading">
    <div>
      <h2>Skills</h2>
      <p>
        How often each learned skill activates and what it is worth. Where skills fire is on the
        heatmap under the race timeline.
      </p>
    </div>
    <span class="section-tools">
      <InspectPopover
        label="How skill impact is measured"
        align="end"
      >
        {#snippet trigger()}<span class="help">
            <Icon
              name="info"
              size={15}
            />
          </span>{/snippet}
        <h3>Skill effect comparisons</h3>
        <p>
          Each measurement reruns this batch’s seeds with one skill’s effects suppressed while the
          field, gates and conditions stay fixed. Skill checks, targeting and random values still
          run, but recovery, bonuses and dependent activation counters do not apply. Later
          state-dependent random draws can still diverge. Worth is the finish margin lost, in
          lengths at her finishing speed.
        </p>
        <p>
          Quick uses the first {Math.min(PRELIMINARY_RACES, result.runs)} races; Full uses all {result.runs}.
          Skills interact, so values do not add up to the build total.
        </p>
      </InspectPopover>
    </span>
  </header>
  {@render lead?.()}
  {#if impacts.error}<Banner
      title="Skill impact could not be measured"
      tone="danger"
      reportable={false}
      dismissible
    >
      {impacts.error}
    </Banner>{/if}
  {#if !result.skill_procs}
    <EmptyState
      icon="info"
      title="No skill observations"
      description="This response did not collect skill activations. Run the simulation again with the report collector."
    />
  {:else}
    <ChartFrame
      id="skill-impact-runner"
      title="Learned skills"
      slim
      description={impacts.available
        ? 'What each of ' +
          umas[active]!.name +
          '’s skills is worth at the finish, as a bar on one shared scale with its 95% range as a thin line. Measure to fill it in; once a runner is measured, her tab shows her most valuable skill. Click a column header to sort; * marks quick results.'
        : 'Skill impact needs a report-enabled simulation. Run the simulation again to measure skills.'}
    >
      {#snippet actions()}
        <SegmentedControl
          compact
          label="Races per skill"
          options={[
            {
              value: 'quick',
              label: 'Quick · ' + Math.min(PRELIMINARY_RACES, result.runs),
              title: 'Quick: ' + Math.min(PRELIMINARY_RACES, result.runs) + ' races per skill'
            },
            {
              value: 'full',
              label: 'All ' + result.runs,
              title: 'All ' + result.runs + ' races per skill'
            }
          ]}
          bind:value={sample}
        />
        {#if impacts.busy}
          <span
            class="progress"
            role="status"
          >
            Measuring {impacts.finished}/{impacts.queued}…
          </span>
          <Button
            size="sm"
            variant="ghost"
            onclick={() => impacts.cancel()}
          >
            Cancel
          </Button>
        {:else}
          <Button
            size="sm"
            variant={unmeasured ? 'primary' : 'secondary'}
            icon="chart"
            disabled={!impacts.available || !unmeasured}
            onclick={() => impacts.measure([{ source: active, ids: owned(active) }], races)}
          >
            {unmeasured
              ? 'Measure ' +
                unmeasured +
                ' skills · ' +
                (unmeasured * races).toLocaleString() +
                ' races'
              : 'All skills measured'}
          </Button>
        {/if}
      {/snippet}
      {#if sources.length > 1}<div
          class="runners"
          role="radiogroup"
          aria-label="Runner"
        >
          {#each sources as runner (runner)}
            {@const summary = runnerSummary(runner)}
            <button
              type="button"
              role="radio"
              aria-checked={runner === active}
              class="runner"
              class:active={runner === active}
              style:--runner={runnerColor(runner)}
              title={summary.title}
              onclick={() => (source = runner)}
            >
              <i
                class="dot"
                aria-hidden="true"
              ></i>
              <SimulatorRunnerFace
                cardId={umas[runner]!.cardId}
                size={24}
              />
              <span class="runner-name">{umas[runner]!.name}</span>
              <small>{summary.badge}</small>
            </button>
          {/each}
        </div>{/if}
      {#if !measuredRows.length}<div
          class="unmeasured"
          class:busy={impacts.busy}
        >
          <p class="notice">
            <Icon
              name="info"
              size={14}
            />
            {#if impacts.busy}Measuring {umas[active]!.name}’s skills… each gain fills in as its
              races finish.{:else}What each skill is worth needs its own run: Measure replays {races}
              races per skill with that skill switched off, {(rows.length * races).toLocaleString()} races
              for all
              {rows.length} of {umas[active]!.name}’s skills.{/if}
          </p>
          <div class="chip-grid">
            {#each listed as row (row.id)}<span class="placeholder">
                <RaceSkill
                  id={row.id}
                  fill
                  level={unique(row.id) || row.level > 1 ? 'Lv ' + row.level : undefined}
                />
                <i
                  class="skeleton bar-skeleton"
                  aria-hidden="true"
                  style:--length={35 + ((row.id * 37) % 50) + '%'}
                ></i>
                <i
                  class="skeleton value-skeleton"
                  aria-hidden="true"
                ></i>
              </span>{/each}
          </div>
        </div>
      {:else}
        <div
          class="gain-table"
          style:--runner={runnerColor(active)}
        >
          <div
            class="gain-list"
            role="table"
            aria-label={'Skill impact for ' + umas[active]!.name}
          >
            <div
              class="gain-row head"
              role="row"
            >
              <span role="columnheader">
                <button
                  type="button"
                  class="sort"
                  onclick={() => sortBy('id')}
                >
                  Skill <span aria-hidden="true">{arrow('id')}</span>
                </button>
              </span>
              <span
                class="gain-head"
                role="columnheader"
              >
                <button
                  type="button"
                  class="sort"
                  onclick={() => sortBy('value')}
                >
                  Gain <span aria-hidden="true">{arrow('value')}</span>
                </button>
                <small>line = 95% range</small>
                {@render about('Gain', help.Gain)}
              </span>
              {#each [['per100', 'Gain / 100 SP'], ['win', 'Win rate change']] as const as [key, label]}<span
                  class="num secondary"
                  role="columnheader"
                >
                  <button
                    type="button"
                    class="sort"
                    onclick={() => sortBy(key)}
                  >
                    {label}
                    <span aria-hidden="true">{arrow(key)}</span>
                  </button>
                  {@render about(label, help[label])}
                </span>{/each}
            </div>
            {#each listed as row (row.id)}
              {@const measured = value(active, row.id)}
              {@const bar = measured ? gainOf(measured) : undefined}
              <div
                class="gain-row"
                role="row"
                title={measured ? range(measured) : 'Not measured yet'}
              >
                <span
                  class="skill-name"
                  role="rowheader"
                >
                  <RaceSkill
                    id={row.id}
                    fill
                    level={unique(row.id) || row.level > 1 ? 'Lv ' + row.level : undefined}
                  />
                </span>
                <span
                  class="track"
                  role="cell"
                  aria-hidden="true"
                >
                  {#each listScale.ticks as tick}<i
                      class="grid"
                      class:zero={Math.abs(tick) < 1e-9}
                      style:left={place(listScale, tick) + '%'}
                    ></i>{/each}
                  {#if bar}<i
                      class="bar"
                      class:negative={bar.gain < 0}
                      style:left={place(listScale, Math.min(0, bar.gain)) + '%'}
                      style:width={Math.abs(place(listScale, bar.gain) - place(listScale, 0)) + '%'}
                    ></i>
                    {#if bar.low != null && bar.high != null}<i
                        class="range"
                        style:left={place(listScale, bar.low) + '%'}
                        style:width={Math.max(
                          0.3,
                          place(listScale, bar.high) - place(listScale, bar.low)
                        ) + '%'}
                      ></i>{/if}{/if}
                </span>
                <span
                  class="num value"
                  role="cell"
                >
                  {#if measured}<strong
                      class:clean={measured.low != null && measured.low > 0}
                      class:warning={measured.lengths < 0}
                    >
                      {formatMarginValue(
                        measured.lengths,
                        measured.seconds,
                        unit,
                        2
                      )}{#if measured.preliminary}<sup
                          title={'Quick measurement on ' +
                            measured.count +
                            ' races; switch to All and measure again to refine'}
                        >
                          *
                        </sup>{/if}
                    </strong>
                    <small>
                      {unit === 'seconds'
                        ? formatMarginValue(measured.lengths, 0, 'lengths', 2)
                        : formatMarginValue(0, measured.seconds, 'seconds')}
                    </small>{:else}<small title="Not measured yet">—</small>{/if}
                </span>
                <span
                  class="num secondary"
                  role="cell"
                >
                  {Number.isFinite(row.per100)
                    ? formatMarginValue(row.per100, row.per100Seconds, unit, 2)
                    : unique(row.id)
                      ? 'Unique'
                      : '—'}
                </span>
                <span
                  class="num secondary"
                  role="cell"
                >
                  {measured
                    ? (measured.winChange > 0 ? '+' : '') + measured.winChange.toFixed(1) + ' pp'
                    : '—'}
                </span>
              </div>
            {/each}
          </div>
          <div
            class="gain-axis"
            aria-hidden="true"
          >
            <div class="gain-row foot">
              <span></span>
              <span class="axis">
                {#each listScale.ticks as tick}<span
                    style:left={place(listScale, tick) + '%'}
                    class:start={place(listScale, tick) < 3}
                    class:end={place(listScale, tick) > 97}
                  >
                    {tickLabel(tick)}
                  </span>{/each}
              </span>
            </div>
          </div>
        </div>
      {/if}
    </ChartFrame>
  {/if}
  {@render children?.()}
</section>

<style>
  .help {
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    color: var(--text-secondary);
  }
  .report-section > :global(.chart-frame) + :global(.chart-frame) {
    margin-top: 8px;
  }
  /* Full-width runner picker in the same style as the report's other tab groups: one bar, the selected tab tinted. */
  .runners {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 4px;
    margin-bottom: 6px;
    padding: 4px;
    border: 1px solid var(--tab-bar-border, var(--border-subtle));
    border-radius: 10px;
    background: var(--tab-bar-bg, transparent);
  }
  .runner {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    min-height: 34px;
    padding: 0 8px 0 10px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: var(--tab-btn-color, var(--text-secondary));
    font: inherit;
    font-size: 0.875rem;
    font-weight: 500;
    text-align: left;
    cursor: pointer;
  }
  .runner:hover,
  .runner:focus-visible {
    color: var(--text-primary);
    background: var(--tab-btn-hover-bg);
  }
  .runner.active {
    color: var(--accent-primary);
    background: rgb(var(--accent-primary-rgb) / 0.12);
    border-color: rgb(var(--accent-primary-rgb) / 0.3);
  }
  .runner-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .runner small {
    display: inline-grid;
    place-items: center;
    flex: none;
    min-width: 18px;
    height: 18px;
    margin: 0 0 0 auto;
    padding: 0 6px;
    border: 1px solid var(--border-primary);
    border-radius: 9px;
    background: var(--surface-3);
    color: var(--text-primary);
    font-size: 10px;
    font-weight: 700;
    line-height: 16px;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .runner.active small {
    color: var(--accent-primary);
    background: rgb(var(--accent-primary-rgb) / 0.12);
    border-color: rgb(var(--accent-primary-rgb) / 0.32);
  }
  .progress {
    font-size: 11px;
    color: var(--text-secondary);
  }
  /* Every chip in a list is the same width, so the names line up. */
  .skill-name {
    display: flex;
    width: 100%;
    min-width: 0;
  }
  /* Learned skills: skill, the gain as a bar on a shared axis, then the numbers. */
  /* The list scrolls; the axis sits under it, outside the scroll area, so it is always at the very bottom.
     Both reserve the same scrollbar gutter so the axis lines up with the bars. */
  .gain-table {
    min-width: 0;
  }
  .gain-list,
  .gain-axis {
    min-width: 0;
    scrollbar-width: thin;
    scrollbar-gutter: stable;
  }
  .gain-list {
    max-height: 460px;
    overflow: auto;
  }
  .gain-axis {
    overflow: hidden;
  }
  .gain-row {
    display: grid;
    grid-template-columns: 240px minmax(120px, 1fr) 92px 120px 112px;
    gap: 10px;
    align-items: center;
    min-height: 30px;
    padding-inline: 2px;
    border-top: 1px solid var(--border-subtle);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .gain-row:not(.head, .foot):hover {
    background: color-mix(in srgb, var(--accent-primary) 5%, transparent);
  }
  .gain-row.head {
    position: sticky;
    top: 0;
    z-index: 2;
    min-height: 26px;
    border-top: 0;
    border-bottom: 1px solid var(--border-subtle);
    background: var(--card-surface-bg, var(--surface-1));
    font-size: 11px;
    font-weight: 500;
    color: var(--text-secondary);
  }
  .gain-row.head + .gain-row {
    border-top: 0;
  }
  .gain-row.head > span {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }
  .gain-row.head > .num {
    justify-content: flex-end;
  }
  .gain-head {
    grid-column: span 2;
  }
  .gain-head small {
    display: inline;
    margin: 0 0 0 4px;
  }
  .gain-row.foot {
    min-height: 18px;
  }
  .gain-row .num {
    text-align: right;
  }
  .gain-row .value {
    line-height: 1.15;
  }
  .gain-row .value strong {
    font-weight: 650;
  }
  .gain-row .value small {
    margin: 0;
  }
  .sort {
    border: 0;
    background: none;
    padding: 0;
    color: inherit;
    font: inherit;
    white-space: nowrap;
    cursor: pointer;
  }
  .sort:hover,
  .sort:focus-visible {
    color: var(--text-primary);
  }
  .column-help {
    display: inline-flex;
    --inspect-popover-width: 310px;
    color: var(--text-secondary);
  }
  .column-help p {
    margin: 0;
    font-size: 11px;
    line-height: 1.6;
    white-space: normal;
  }
  /* Before measuring: every skill with a grey placeholder for its gain bar and value, so the empty result reads as "run it". */
  .notice {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 2px 0 8px;
    font-size: 12px;
    color: var(--text-secondary);
  }
  .notice :global(svg) {
    flex: none;
  }
  .chip-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 4px 16px;
  }
  .placeholder {
    display: grid;
    grid-template-columns: minmax(0, 210px) minmax(40px, 1fr) 34px;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .skeleton {
    height: 8px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--text-secondary) 16%, transparent);
  }
  .bar-skeleton {
    width: var(--length);
  }
  .value-skeleton {
    height: 10px;
  }
  .busy .skeleton {
    background:
      linear-gradient(
          90deg,
          transparent 0%,
          color-mix(in srgb, var(--text-primary) 14%, transparent) 50%,
          transparent 100%
        )
        0 0 / 200% 100% no-repeat,
      color-mix(in srgb, var(--text-secondary) 16%, transparent);
    animation: skeleton-shimmer 1.4s linear infinite;
  }
  @keyframes skeleton-shimmer {
    from {
      background-position:
        150% 0,
        0 0;
    }
    to {
      background-position:
        -50% 0,
        0 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .busy .skeleton {
      animation: none;
    }
  }
  small {
    display: block;
    margin-top: 1px;
    font-size: 10px;
    line-height: 1.3;
    color: var(--text-secondary);
  }
  sup {
    font-size: 9px;
    color: var(--text-secondary);
    margin-left: 1px;
  }
  .clean {
    color: var(--accent-success);
  }
  .warning {
    color: var(--accent-warning);
  }
  .dot {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--runner);
  }
  .track {
    position: relative;
    height: 22px;
    min-width: 0;
  }
  .track > i {
    position: absolute;
    pointer-events: none;
  }
  .grid {
    top: 0;
    bottom: 0;
    width: 1px;
    background: var(--border-subtle);
  }
  .grid.zero {
    background: var(--text-secondary);
  }
  .bar {
    top: 5px;
    height: 12px;
    border-radius: 2px;
    background: var(--runner);
  }
  .range {
    top: 10px;
    height: 2px;
    background: var(--text-primary);
    opacity: 0.55;
  }
  .axis {
    position: relative;
    height: 14px;
    font-size: 10px;
    color: var(--text-secondary);
  }
  .axis span {
    position: absolute;
    top: 0;
    transform: translateX(-50%);
    white-space: nowrap;
  }
  .axis span.start {
    transform: none;
  }
  .axis span.end {
    transform: translateX(-100%);
  }
  @media (max-width: 600px) {
    .gain-row {
      grid-template-columns: minmax(0, 1fr) 72px;
      gap: 2px 8px;
      padding-block: 3px;
    }
    .gain-row .secondary,
    .gain-head small,
    .gain-row.foot {
      display: none;
    }
    .gain-row > .track {
      grid-column: 1 / -1;
      grid-row: 2;
      height: 12px;
    }
    .gain-row .bar {
      top: 2px;
      height: 8px;
    }
    .gain-row .range {
      top: 5px;
    }
    .gain-head {
      grid-column: auto;
    }
    .chip-grid {
      grid-template-columns: 1fr;
    }
    .placeholder {
      grid-template-columns: minmax(0, 1fr) 60px 30px;
    }
    .runners {
      display: flex;
      overflow-x: auto;
      scrollbar-width: none;
    }
    .runner {
      flex: none;
      max-width: 220px;
    }
  }
</style>
