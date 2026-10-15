<script lang="ts">
  import Spinner from '@/components/feedback/Spinner.svelte';
  import { onMount } from 'svelte';
  import type { Snapshot } from '../../hakuraku-types';
  import { cmGet, snapshotPath, pct, number, styleNames, styleOrder } from '../cm-data';
  import type { SkillOverview } from '../cm-exploration';
  import { loadSkills, resolveEncodedSkill, type SkillData } from '@/lib/game-data/skills/skills';
  import Icon from '@/components/Icon.svelte';
  import RaceSkill from '../../runners/RaceSkill.svelte';
  import CmSkillLanes from './CmSkillLanes.svelte';
  import CmSkillComparison from './CmSkillComparison.svelte';
  import DataTable from '@/components/data/DataTable.svelte';
  import Button from '@/components/controls/Button.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import { loadRaceCourse, type Course } from '../../race-analysis/replay/replay-course';
  import { skillRows } from './cm-skill-rows';

  let { snapshot, style = $bindable('all') }: { snapshot: Snapshot; style?: string } = $props();

  let overview = $state<SkillOverview>(),
    error = $state(''),
    attempt = $state(0),
    search = $state(''),
    selected = $state<number[]>([]),
    expandedSkill = $state<number>(),
    comparison = $state<HTMLElement>();

  let catalog = $state.raw(new Map<number, SkillData>());
  let course = $state.raw<Course>();

  const name = (id: number) => resolveEncodedSkill(catalog, id).skill?.name ?? 'Skill ' + id;

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
    expandedSkill = undefined;
    const controller = new AbortController();
    cmGet<SkillOverview>(snapshotPath(id, 'skills/overview'), controller.signal, id)
      .then((v) => {
        if (!controller.signal.aborted) overview = v;
      })
      .catch((e) => {
        if (!controller.signal.aborted) error = e.message;
      });

    return () => controller.abort();
  });

  const skills = $derived(skillRows(overview, style, name));
  const rows = $derived(
    skills.filter((r) => (r.name + ' ' + r.id).toLowerCase().includes(search.trim().toLowerCase()))
  );

  const courseMatch = $derived(course?.distance === overview?.courseDistance ? course : undefined);

  function inspect(id: number) {
    expandedSkill = expandedSkill === id ? undefined : id;
  }

  function toggle(id: number) {
    selected = selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id];
  }
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
    <p>{number(overview.players)} players · {number(overview.races)} simulated races</p>
  </div>
  <section class="skill-list">
    <header>
      <div>
        <h2>
          Skill performance <span>{rows.length} skills</span>
        </h2>
        <p>Click a row for activation distances. Use Compare to add skills below.</p>
      </div>
      {#if selected.length}
        <Button
          variant="secondary"
          size="sm"
          onclick={() => comparison?.scrollIntoView({ block: 'nearest', behavior: 'instant' })}
        >
          Compare selected ({selected.length}) ↓
        </Button>
      {/if}
    </header>
    <DataTable
      plain
      compact
      caption="CM Skill Analysis"
      maxHeight={580}
      sortKey="players"
      sortDirection="descending"
      expandedRow={expandedSkill}
      onrowclick={(row) => inspect(Number(row.id))}
      emptyMessage="No skills match these filters."
      columns={[
        { key: 'name', label: 'Skill' },
        { key: 'players', label: 'Players', numeric: true },
        { key: 'owned', label: 'Learned entries', numeric: true },
        { key: 'active', label: 'Activated entries', numeric: true },
        { key: 'activation', label: 'Activation%', numeric: true },
        { key: 'procs', label: 'Procs', numeric: true },
        { key: 'winrate', label: 'Win% when active', numeric: true },
        { key: 'timing', label: 'Compare', sortable: false }
      ]}
      {rows}
    >
      {#snippet cell(row, column)}
        {#if column.key === 'name'}
          <button
            class="skill-select"
            class:active={expandedSkill === Number(row.id)}
            aria-label={'Inspect ' + row.name}
            aria-expanded={expandedSkill === Number(row.id)}
            aria-controls={expandedSkill === Number(row.id) ? 'cm-skill-detail' : undefined}
            onclick={() => inspect(Number(row.id))}
          >
            <span
              class="chevron"
              class:open={expandedSkill === Number(row.id)}
            >
              <Icon
                name="chevron"
                size={16}
              />
            </span>
            <span class="skill-label">
              <RaceSkill id={Number(row.id)} />
              <small>[Id {row.id}]</small>
            </span>
          </button>
        {:else if column.key === 'timing'}
          <Button
            variant={selected.includes(Number(row.id)) ? 'primary' : 'secondary'}
            size="sm"
            ariaLabel={(selected.includes(Number(row.id)) ? 'Remove ' : 'Add ') +
              row.name +
              (selected.includes(Number(row.id)) ? ' from comparison' : ' to comparison')}
            ariaPressed={selected.includes(Number(row.id))}
            onclick={() => toggle(Number(row.id))}
          >
            {selected.includes(Number(row.id)) ? 'Remove' : 'Compare'}
          </Button>
        {:else if column.key === 'activation' || column.key === 'winrate'}
          {pct(Number(row[column.key]))}
        {:else}
          {number(Number(row[column.key]))}
        {/if}
      {/snippet}
      {#snippet rowDetail(row)}
        <section
          id="cm-skill-detail"
          class="skill-detail"
          aria-label={row.name + ' activation details'}
        >
          <CmSkillLanes
            overview={overview!}
            {style}
            selected={[Number(row.id)]}
            removable={false}
            course={courseMatch}
            courseLabel={snapshot.meta.course}
          />
        </section>
      {/snippet}
    </DataTable>
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
    <p class="caption">
      Entries count simulated runner appearances. Win rate when active describes association, not
      the skill’s isolated effect. Debuffers are included under their running strategy.
    </p>
  </section>
  <CmSkillComparison
    {overview}
    {style}
    {skills}
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
