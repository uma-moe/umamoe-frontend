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
  import {
    loadSkills,
    resolveEncodedSkill,
    skillPointTotal,
    skillRarity,
    type SkillData
  } from '@/lib/game-data/skills/skills';
  import { skillDistributions } from '../skill-distributions';
  import { runnerColor } from '../../simulation-report';
  import ReportRunnerPicker from '../../ReportRunnerPicker.svelte';
  import {
    formatMarginValue,
    skillValue,
    type MarginUnit,
    type SkillValue
  } from '../../simulation-comparison';
  import { PRELIMINARY_RACES, type SkillImpactStore } from './skill-impact.svelte';
  import { sortRows, type SkillImpactRow, type SortDirection } from './skill-impact-gains';
  import SkillImpactPlaceholder from './SkillImpactPlaceholder.svelte';
  import SkillImpactTable from './SkillImpactTable.svelte';
  import type { MonteCarloResult } from '../../../simulator-repository';
  import type { SimulatorUma } from '../../../simulator-uma';

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

  let skillLookup = $state.raw(new Map<number, SkillData>());
  let sample = $state('quick');
  let skillDataError = $state('');
  let sortKey = $state('value'),
    sortDirection = $state<SortDirection>('descending');

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
              : 'Skill names could not be loaded. Measurements remain available.';
      });

    return () => {
      active = false;
    };
  });

  const active = $derived(source !== undefined && sources.includes(source) ? source : sources[0]!);
  const races = $derived(
    sample === 'full' ? result.runs : Math.min(PRELIMINARY_RACES, result.runs)
  );

  const name = (id: number) => resolveEncodedSkill(skillLookup, id).skill?.name ?? 'Skill ' + id;
  const owned = (runner: number) => umas[runner]!.skills.map((skill) => skill.skillId);
  const unique = (id: number) => {
    const { skill, inherited } = resolveEncodedSkill(skillLookup, id);
    return skillRarity(skill, inherited) === 'unique-main';
  };

  const cost = (id: number) => (unique(id) ? null : skillPointTotal(skillLookup, [id]));
  const value = (runner: number, id: number): SkillValue | undefined => {
    const outcome = impacts.get(runner, id);
    return outcome ? skillValue(result, runner, distance, outcome) : undefined;
  };

  // Learned skills only: effect suppression requires the skill on the build.
  const rows = $derived.by((): SkillImpactRow[] => {
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

  const listed = $derived(sortRows(rows, sortKey, sortDirection, name));
</script>

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
  {#if skillDataError}
    <Banner
      title="Skill data unavailable"
      tone="danger"
      reportable={false}
    >
      {skillDataError}
    </Banner>
  {/if}
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
                (unmeasured * races).toLocaleString('en-US') +
                ' races'
              : 'All skills measured'}
          </Button>
        {/if}
      {/snippet}
      {#if sources.length > 1}<ReportRunnerPicker
          label="Runner for skill impact"
          {sources}
          {active}
          {umas}
          summary={runnerSummary}
          onselect={(runner) => (source = runner)}
        />{/if}
      {#if !measuredRows.length}<SkillImpactPlaceholder
          rows={listed}
          busy={impacts.busy}
          runnerName={umas[active]!.name}
          {races}
          {unique}
        />
      {:else}
        <SkillImpactTable
          rows={listed}
          runnerName={umas[active]!.name}
          color={runnerColor(active)}
          {unit}
          value={(id) => value(active, id)}
          {unique}
          bind:sortKey
          bind:sortDirection
        />
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
  .progress {
    font-size: 11px;
    color: var(--text-secondary);
  }
</style>
