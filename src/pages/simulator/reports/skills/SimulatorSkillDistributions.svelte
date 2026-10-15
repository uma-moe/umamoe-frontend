<script lang="ts">
  import { onMount } from 'svelte';
  import { loadSkills, resolveEncodedSkill, type SkillData } from '@/lib/game-data/skills/skills';
  import ChartFrame from '@/components/charts/ChartFrame.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import StatStrip from '@/components/game/StatStrip.svelte';
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';
  import Icon from '@/components/Icon.svelte';
  import LazyEChartsSurface from '@/components/charts/LazyEChartsSurface.svelte';
  import RaceSkill from '@/pages/competitive/runners/RaceSkill.svelte';
  import { theme } from '@/stores/theme';
  import { binomialProbabilities } from '@/lib/carat-planner/gacha/planner-pull-probability';
  import { skillDistributions, skillHistogram } from './skill-distributions';
  import { distributionChart } from '../distribution-chart';
  import type { MonteCarloResult } from '../../simulator-repository';
  import type { SimulatorUma } from '../../simulator-uma';

  let {
    result,
    umas,
    distance,
    source = '0',
    mode = $bindable('binomial'),
    selected = $bindable(0),
    focusOnly = false
  }: {
    result: MonteCarloResult;
    umas: SimulatorUma[];
    distance: number;
    source?: string;
    mode?: string;
    selected?: number;
    focusOnly?: boolean;
  } = $props();

  let expanded = $state(false),
    skillLookup = $state.raw(new Map<number, SkillData>());

  let skillDataError = $state('');

  onMount(() => {
    let active = true;
    void loadSkills()
      .then((value) => {
        if (active) skillLookup = value;
      })
      .catch((reason: unknown) => {
        if (active)
          skillDataError =
            reason instanceof Error
              ? reason.message
              : 'Skill names could not be loaded. Observations remain available.';
      });

    return () => {
      active = false;
    };
  });

  const data = $derived(
    skillDistributions(
      result,
      Number(source),
      umas[Number(source)]?.skills.map((skill) => skill.skillId) ?? []
    )
  );

  const row = $derived(
    data.rows.find((row) => row.id === selected) ??
      data.rows.find((row) => row.duration !== undefined) ??
      data.rows[0]
  );

  const discrete = $derived(mode === 'binomial' || mode === 'counts');
  const unit = $derived.by(() => {
    if (mode === 'binomial') {
      return 'races';
    }

    if (mode === 'distance') {
      return 'm';
    }

    if (mode === 'counts') {
      return 'procs';
    }

    return 's';
  });

  const observations = $derived(
    row?.procs
      .map(({ proc }) => {
        if (mode === 'distance') {
          return proc[5];
        }

        if (mode === 'duration') {
          return proc[6];
        }

        return proc[4];
      })
      .filter((value) => mode !== 'duration' || value > 0) ?? []
  );

  const range = $derived.by(() => {
    if (discrete) return { min: 0, max: mode === 'binomial' ? result.runs : data.maxCount };

    if (!observations.length) return { min: 0, max: 1 };

    const low = Math.min(...observations),
      high = Math.max(...observations),
      padding = Math.max((high - low) * 0.1, mode === 'distance' ? 5 : 0.2);

    return {
      min: Math.max(0, low - padding),
      max: mode === 'distance' ? Math.min(distance, high + padding) : high + padding
    };
  });

  const bins = $derived(
    discrete ? range.max + 1 : Math.min(32, Math.max(8, Math.ceil(Math.sqrt(observations.length))))
  );

  const values = $derived.by(() => {
    if (!row) {
      return [];
    }

    if (mode === 'binomial') {
      return binomialProbabilities(result.runs, row.triggered / result.runs).map(
        (value) => value * 100
      );
    }

    return skillHistogram(row, mode, range.max, bins, range.min);
  });

  const mean = $derived.by(() => {
    if (!row) {
      return undefined;
    }

    if (mode === 'binomial') {
      return row.triggered;
    }

    if (mode === 'counts') {
      return row.total / result.runs;
    }

    if (mode === 'distance') {
      return row.distance;
    }

    if (mode === 'duration') {
      return row.duration;
    }

    return row.time;
  });

  const option = $derived({
    ...distributionChart(
      [
        {
          name: mode === 'binomial' ? 'Binomial probability' : 'Observed frequency',
          color: $theme === 'dark' ? '#69b7ee' : '#287caf',
          values,
          mean
        }
      ],
      range.min,
      range.max,
      unit,
      $theme === 'dark',
      discrete
    ),
    dataZoom: expanded
      ? [
          { type: 'inside', filterMode: 'none' },
          { type: 'slider', bottom: 0, height: 16 }
        ]
      : []
  });

  const modelInterval = $derived.by(() => {
    let sum = 0,
      low = 0,
      high = range.max,
      found = false;

    for (let i = 0; i < values.length; i++) {
      sum += values[i]!;
      if (!found && sum >= 2.5) {
        low = i;
        found = true;
      }

      if (sum >= 97.5) {
        high = i;
        break;
      }
    }

    return [low, high];
  });

  const label = $derived.by(() => {
    if (mode === 'binomial') {
      return 'Activation probability';
    }

    if (mode === 'time') {
      return 'Activation timing';
    }

    if (mode === 'distance') {
      return 'Activation distance';
    }

    if (mode === 'duration') {
      return 'Activation duration';
    }

    return 'Procs per race';
  });
</script>

<section
  class="skill-analysis"
  aria-label="Skill distributions"
>
  {#if skillDataError}
    <p role="alert">{skillDataError}</p>
  {/if}
  {#if !result.skill_procs}
    <p class="unavailable">Run a new batch to capture skill timings and duration distributions.</p>
  {:else}
    <div
      class="skill-layout"
      class:focus-only={focusOnly}
    >
      <aside>
        <ChartFrame
          plain
          surface
          id="simulator-skill-list"
          title="Skills"
          description={'Select a skill · ' + data.rows.length + ' in this build'}
        >
          <div class="skill-columns">
            <span>Skill</span>
            <span>Proc rate</span>
            <span>Duration</span>
          </div>
          <div class="skill-list">
            {#each data.rows as skill}
              <button
                class="skill-row"
                class:active={row?.id === skill.id}
                aria-pressed={row?.id === skill.id}
                onclick={() => (selected = skill.id)}
                data-skill-id={skill.id}
              >
                <RaceSkill id={skill.id} />
                <strong>{skill.rate.toFixed(1)}%</strong>
                <span>
                  {skill.passive
                    ? 'Passive'
                    : skill.duration !== undefined
                      ? skill.duration.toFixed(1) + ' s'
                      : skill.instant
                        ? 'Instant'
                        : '—'}
                </span>
              </button>
            {:else}
              <p class="unavailable">This Uma has no owned or recorded skills.</p>
            {/each}
          </div>
        </ChartFrame>
      </aside>
      <ChartFrame
        plain
        surface
        id="simulator-skill-distribution"
        title={label}
        description={mode === 'binomial'
          ? 'Estimated activated races in another batch of ' + result.runs + '.'
          : 'Observed across ' + result.runs + ' simulated races.'}
        expandable
        bind:expanded
        state={row ? 'ready' : 'empty'}
      >
        {#snippet titleActions()}
          <InspectPopover label="How to read skill distributions">
            {#snippet trigger()}
              <span class="guide">
                <Icon
                  name="info"
                  size={16}
                />
              </span>
            {/snippet}
            <h3>Model and observations</h3>
            <p>
              Binomial models activated races in another independent batch using this sample’s
              observed activation rate. It excludes uncertainty in the fitted rate. A 0% or 100%
              observation does not prove certainty.
            </p>
            <p>
              Timing and duration curves connect observed bin frequencies. Duration includes timed
              activations only. Procs per race includes zero-proc races. Dashed lines show the mean.
            </p>
          </InspectPopover>
        {/snippet}
        {#if row}
          <div class="skill-chart-tools">
            <span class="selected-skill"><RaceSkill id={row.id} /></span>
            <div class="mobile-skill-picker">
              <SelectField
                id="selected-skill-distribution"
                label="Skill"
                value={String(row.id)}
                onchange={(value) => (selected = Number(value))}
                options={data.rows.map((skill) => ({
                  value: String(skill.id),
                  label:
                    resolveEncodedSkill(skillLookup, skill.id).skill?.name ?? 'Skill ' + skill.id
                }))}
              />
            </div>
            <SelectField
              id="skill-distribution-mode"
              label="Distribution"
              bind:value={mode}
              options={[
                { value: 'binomial', label: 'Binomial' },
                { value: 'time', label: 'Activation time' },
                { value: 'distance', label: 'Activation distance' },
                { value: 'duration', label: 'Duration distribution' },
                { value: 'counts', label: 'Procs per race' }
              ]}
            />
          </div>
          <div class="skill-metrics">
            <StatStrip
              presentation="inline"
              label="Selected skill outcomes"
              items={[
                { id: 'rate', label: 'Proc rate', value: row.rate.toFixed(1), unit: '%' },
                { id: 'procs', label: 'Total activations', value: row.total },
                {
                  id: 'duration',
                  label: 'Mean duration',
                  value:
                    row.duration?.toFixed(2) ??
                    (row.passive ? 'Passive' : row.instant ? 'Instant' : '—'),
                  unit: row.duration !== undefined ? 's' : undefined
                }
              ]}
            />
          </div>
          {#if values.some((value) => value > 0)}
            <div data-distribution={mode}>
              <LazyEChartsSurface
                {option}
                {label}
                height={expanded ? 440 : 280}
                zoomable={expanded}
                dismissTouchTooltip
              />
            </div>
          {:else}
            <div class="no-observations">
              {row.passive
                ? 'Passive effects have no timed duration.'
                : row.instant
                  ? 'Instant effects have no timed duration.'
                  : 'No activations observed for this skill.'}
            </div>
          {/if}
          <div class="chart-note">
            <span>
              {row.triggered} / {result.runs} races activated{mode === 'binomial'
                ? ' · Model middle 95%: ' + modelInterval[0] + '–' + modelInterval[1] + ' races'
                : ''}
            </span>
            <span>{mean === undefined ? '' : 'Mean ' + mean.toFixed(2) + ' ' + unit}</span>
          </div>
        {/if}
      </ChartFrame>
    </div>
  {/if}
</section>

<style>
  .skill-layout.focus-only {
    grid-template-columns: minmax(0, 1fr);
  }
  .focus-only > aside {
    display: none;
  }
  .focus-only .mobile-skill-picker {
    display: none;
  }
  .focus-only .selected-skill {
    display: block;
  }
  .mobile-skill-picker {
    display: none;
  }
  .skill-analysis {
    min-width: 0;
  }
  .skill-layout {
    display: grid;
    grid-template-columns: minmax(260px, 0.85fr) minmax(0, 1.6fr);
    gap: 14px;
    align-items: start;
  }
  .skill-layout > aside {
    min-width: 0;
  }
  .skill-columns,
  .skill-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 54px 54px;
    gap: 8px;
    align-items: center;
  }
  .skill-columns {
    font-size: 10px;
    color: var(--text-secondary);
    padding-bottom: 8px;
  }
  .skill-columns > span:not(:first-child) {
    text-align: right;
  }
  .skill-list {
    max-height: 440px;
    overflow-y: auto;
    scrollbar-width: thin;
  }
  .skill-row {
    width: 100%;
    border: 0;
    border-bottom: 1px solid var(--border-subtle);
    background: transparent;
    color: var(--text-primary);
    padding: 9px 2px;
    cursor: pointer;
    text-align: left;
    min-height: 43px;
  }
  .skill-row.active,
  .skill-row:hover {
    background: var(--color-accent-soft);
  }
  .skill-row:focus-visible {
    outline: 2px solid var(--accent-primary);
    outline-offset: -2px;
  }
  .skill-row > strong {
    font-size: 12px;
    font-weight: 600;
    text-align: right;
    color: var(--accent-primary);
  }
  .skill-row > span {
    font-size: 10px;
    text-align: right;
    color: var(--text-secondary);
  }
  .skill-row :global(.skill-chip) {
    min-width: 0;
    max-width: 100%;
  }
  .skill-row :global(.skill-body) {
    min-width: 0;
  }
  .skill-row :global(.skill-name) {
    font-size: 11px;
  }
  .skill-chart-tools {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 16px;
  }
  .skill-chart-tools :global(.field) {
    width: 200px;
    max-width: 100%;
  }
  .skill-metrics {
    padding-bottom: 14px;
    margin-bottom: 12px;
    border-bottom: 1px solid var(--border-subtle);
  }
  .chart-note {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
    font-size: 11px;
    line-height: 1.5;
    color: var(--text-secondary);
    padding-top: 8px;
  }
  .guide {
    display: flex;
    color: var(--text-secondary);
  }
  .unavailable {
    padding: 16px;
    color: var(--text-secondary);
    font-size: 12px;
  }
  .no-observations {
    min-height: 280px;
    display: grid;
    place-items: center;
    color: var(--text-secondary);
    font-size: 12px;
    text-align: center;
  }
  @container race-main (max-width:800px) {
    .skill-layout {
      grid-template-columns: 1fr;
    }
    .skill-layout > aside {
      display: none;
    }
    .mobile-skill-picker {
      display: block;
      width: 100%;
    }
    .skill-chart-tools :global(.field) {
      width: 100%;
    }
    .selected-skill {
      display: none;
    }
  }
  @media (max-width: 600px) {
    .skill-layout {
      grid-template-columns: 1fr;
    }
    .skill-list {
      max-height: 190px;
    }
    .skill-chart-tools {
      align-items: start;
    }
    .skill-chart-tools :global(.field) {
      width: 100%;
    }
  }
</style>
