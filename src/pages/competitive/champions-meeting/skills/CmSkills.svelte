<script lang="ts">
  import Banner from '@/components/feedback/Banner.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import { onMount, onDestroy } from 'svelte';
  import type { Snapshot } from '../../hakuraku-types';
  import { cmGet, snapshotPath, number, styleNames, styleOrder, styleColors } from '../cm-data';
  import type { SkillOverview } from '../cm-exploration';
  import { loadSkills, resolveEncodedSkill, type SkillData } from '@/lib/game-data/skills/skills';
  import CmSkillTable from './CmSkillTable.svelte';
  import CmSkillComparison from './CmSkillComparison.svelte';
  import Button from '@/components/controls/Button.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import { loadRaceCourse, type Course } from '../../race-analysis/replay/replay-course';
  import { skillRows, validateSkillPlayerUsage, type SkillPlayerUsage } from './cm-skill-rows';
  import { validateSkillOverview } from './cm-skill-analysis';
  import { CmSkillDetails } from './cm-skill-details.svelte';

  let {
    snapshot,
    style = $bindable('all'),
    colors = styleColors
  }: { snapshot: Snapshot; style?: string; colors?: Record<number, string> } = $props();

  let overview = $state.raw<SkillOverview>(),
    error = $state(''),
    attempt = $state(0),
    search = $state(''),
    selected = $state<number[]>([]),
    inspectedSkill = $state<number>(),
    comparison = $state<HTMLElement>();
  let sortKey = $state('players');
  let usage = $state.raw<SkillPlayerUsage>();
  let usageError = $state('');
  let usageAttempt = $state(0);
  const details = new CmSkillDetails();

  let catalog = $state.raw(new Map<number, SkillData>());
  let course = $state.raw<Course>();

  const name = (id: number) => resolveEncodedSkill(catalog, id).skill?.name ?? 'Skill ' + id;

  onDestroy(() => details.destroy());

  onMount(() => {
    void loadSkills()
      .then((c) => (catalog = c))
      .catch(() => {});
  });

  $effect(() => {
    const instance = snapshot.raceInstanceId;
    course = undefined;
    let current = true;
    void loadRaceCourse(instance)
      .then((value) => {
        if (current) course = value;
      })
      .catch(() => {});

    return () => {
      current = false;
    };
  });

  $effect(() => {
    const id = snapshot.snapshotId;
    attempt;
    overview = undefined;
    error = '';
    selected = [];
    inspectedSkill = undefined;
    details.destroy();
    const controller = new AbortController();
    cmGet<SkillOverview>(snapshotPath(id, 'skills/overview'), controller.signal, id)
      .then((v) => {
        if (controller.signal.aborted) return;
        validateSkillOverview(v);
        details.reset(id, v.courseDistance);
        overview = v;
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;

        error = reason instanceof Error ? reason.message : 'Could not load skill data.';
      });

    return () => controller.abort();
  });

  $effect(() => {
    const id = snapshot.snapshotId;
    usageAttempt;
    usage = undefined;
    usageError = '';
    if (snapshot.playerUsage?.schemaVersion !== 1) return;

    const controller = new AbortController();
    cmGet<SkillPlayerUsage>(snapshotPath(id, 'uma-usage'), controller.signal, id)
      .then((value) => {
        if (controller.signal.aborted) return;
        validateSkillPlayerUsage(value);
        usage = value;
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          usageError = reason instanceof Error ? reason.message : 'Player counts unavailable.';
      });

    return () => controller.abort();
  });

  const playersPending = $derived(snapshot.playerUsage?.schemaVersion === 1 && !usage);
  const skills = $derived(
    skillRows(overview, style, name, { details: details.values, usage, playersPending })
  );
  const rows = $derived(
    skills.filter((r) =>
      (r.name + ' ' + r.variants).toLowerCase().includes(search.trim().toLowerCase())
    )
  );

  const courseMatch = $derived(course?.distance === overview?.courseDistance ? course : undefined);
</script>

{#if error}
  <p role="alert">
    {error}
    <Button
      size="sm"
      onclick={() => attempt++}
    >
      Retry
    </Button>
  </p>
{:else if !overview}
  <Spinner
    size={48}
    centered
    minHeight="clamp(300px, 55dvh, 620px)"
    label="Loading skill data…"
  />
{:else}
  <div class="toolbar">
    <TextField
      id="cm-skill-search"
      type="search"
      label="Search skills"
      bind:value={search}
      placeholder="Skill name or ID"
      prefixIcon="search"
    /><SelectField
      id="cm-skill-style"
      label="Running style"
      bind:value={style}
      options={[
        { value: 'all', label: 'All styles' },
        ...styleOrder
          .filter((id) => id !== 6)
          .map((id) => ({ value: String(id), label: styleNames[id]! }))
      ]}
    />
    <p>
      {number(usage?.totalPlayers ?? overview.players)} players · {number(overview.races)} simulated races
    </p>
  </div>
  {#if usageError}
    <div
      class="usage-error"
      role="alert"
    >
      <Banner
        title="Player counts unavailable"
        tone="warning"
      >
        <p>{usageError}</p>
        <Button
          size="sm"
          variant="secondary"
          icon="refresh"
          onclick={() => usageAttempt++}
        >
          Retry player counts
        </Button>
      </Banner>
    </div>
  {/if}
  <section class="skill-list">
    <header>
      <h2>
        Skill performance <span>{rows.length} skills</span>
      </h2>
      {#if selected.length}
        <Button
          variant="secondary"
          size="sm"
          icon="chevron"
          onclick={() => comparison?.scrollIntoView({ block: 'nearest', behavior: 'instant' })}
        >
          Compare {selected.length}
          {selected.length === 1 ? 'skill' : 'skills'}
        </Button>
      {/if}
    </header>
    <CmSkillTable
      {overview}
      {rows}
      {style}
      {details}
      {colors}
      skillName={name}
      caption="CM Skill Analysis"
      course={courseMatch}
      courseLabel={snapshot.meta.course}
      playersUnavailable={usageError || undefined}
      columnHelp={{
        Players:
          snapshot.playerUsage?.schemaVersion === 1
            ? 'Players whose best active team learned this skill. Performance statistics use the full simulation.'
            : 'Distinct players with a captured build that learned this skill.',
        Activations:
          'All activation events, including repeats. The percentage counts learned runner entries with at least one activation. Select a skill to inspect exact entry counts.',
        'Mean distance':
          'Approximate mean activation distance, calculated automatically from course buckets. Values become sortable as they load.',
        'Median distance':
          'Approximate median activation distance, calculated automatically from course buckets. Values become sortable as they load.'
      }}
      bind:selected
      bind:inspected={inspectedSkill}
      bind:sortKey
    />
    {#if !rows.length}
      <Button
        variant="secondary"
        size="sm"
        onclick={() => {
          search = '';
          style = 'all';
        }}
      >
        Reset skill filters
      </Button>
    {/if}
  </section>
  <CmSkillComparison
    {overview}
    {style}
    {skills}
    {details}
    {colors}
    skillName={name}
    course={courseMatch}
    courseLabel={snapshot.meta.course}
    bind:selected
    bind:element={comparison}
  />
{/if}

<style>
  @import './skill-sections.css';
  @import './cm-skills.css';
</style>
