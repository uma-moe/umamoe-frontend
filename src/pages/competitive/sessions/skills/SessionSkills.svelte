<script lang="ts">
  import type { MultiRaceAnalysis } from '@/lib/race/multi-race-analysis';
  import Button from '@/components/controls/Button.svelte';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import CmSkillComparison from '../../champions-meeting/skills/CmSkillComparison.svelte';
  import CmSkillTable from '../../champions-meeting/skills/CmSkillTable.svelte';
  import { number, styleColors, styleNames, styleOrder } from '../../champions-meeting/cm-data';
  import { skillRows } from '../../champions-meeting/skills/cm-skill-rows';
  import { loadRaceCourse, type Course } from '../../race-analysis/replay/replay-course';
  import SessionKpis from '../SessionKpis.svelte';
  import { rate } from '../../analysis-view';
  import type { SessionKpi } from '../session-kpis';
  import { formatRate, isSmallSample, SMALL_SAMPLE } from '../session-insights';
  import { sessionSkillData, skillUseSummaries } from './session-skill-data';
  import { SessionSkillDetails } from './session-skill-details';

  interface Props {
    analysis: MultiRaceAnalysis;
    skillNames: Map<number, string>;
    /** The session's race, whose course the activation lanes are drawn on. */
    raceInstanceId?: number;
  }

  let { analysis, skillNames, raceInstanceId }: Props = $props();

  /** A skill needs this many learners before its activation rate is worth calling out. */
  const RELIABILITY_SAMPLE = SMALL_SAMPLE * 2;
  /** Win-rate gaps smaller than this many points are within a single result of each other here. */
  const NOTABLE_GAP = 2;

  let search = $state(''),
    style = $state('all'),
    runners = $state('all'),
    selected = $state<number[]>([]),
    inspected = $state<number>(),
    sortKey = $state('players'),
    course = $state.raw<Course>(),
    comparison = $state<HTMLElement>(),
    tableSection = $state<HTMLElement>();

  const hasPlayer = $derived(analysis.entries.some((entry) => entry.isPlayer));
  const styleOptions = $derived(
    styleOrder.filter((id) => analysis.entries.some((entry) => entry.strategy === id))
  );

  /** The runners every number in this view describes: all of them, or only the player's. */
  const scopedEntries = $derived(
    runners === 'own' ? analysis.entries.filter((entry) => entry.isPlayer) : analysis.entries
  );

  const data = $derived(sessionSkillData(scopedEntries));
  const overview = $derived(data.overview);
  const details = $derived(new SessionSkillDetails(data.details));
  const courseMatch = $derived(course?.distance === overview.courseDistance ? course : undefined);

  const skills = $derived(skillRows(overview, style, skillName, { details: details.values }));
  const rows = $derived(
    skills.filter((row) => row.name.toLowerCase().includes(search.trim().toLowerCase()))
  );

  const kpis = $derived.by(() => {
    const { skills: uses, population } = skillUseSummaries(overview, style);
    const learned = uses.reduce((total, use) => total + use.owned, 0);
    const activated = uses.reduce((total, use) => total + use.activated, 0);
    const list: SessionKpi[] = [];
    if (!learned) return list;

    list.push({
      id: 'activation',
      label: 'Learned skills that activated',
      value: formatRate(rate(activated, learned)),
      detail: number(activated) + ' of ' + number(learned) + ' carried'
    });

    const unreliable = uses
      .filter((use) => use.owned >= RELIABILITY_SAMPLE && use.activated < use.owned)
      .sort((a, b) => rate(a.activated, a.owned) - rate(b.activated, b.owned))[0];

    if (unreliable)
      list.push({
        id: 'unreliable',
        label: 'Least reliable skill',
        value: formatRate(rate(unreliable.activated, unreliable.owned)),
        subjects: [{ text: skillName(unreliable.skillId) }],
        detail: unreliable.activated + ' of ' + unreliable.owned + ' learners activated it',
        action: { label: 'Show', icon: 'eye', onselect: () => showSkill(unreliable.skillId) }
      });

    const gaps = uses.flatMap((use) => {
      const without = population.entries - use.owned;
      if (isSmallSample(use.owned) || isSmallSample(without)) return [];

      const gap =
        rate(use.learnerWins, use.owned) - rate(population.wins - use.learnerWins, without);
      return gap >= NOTABLE_GAP ? [{ skillId: use.skillId, gap }] : [];
    });
    const correlated = gaps.sort((a, b) => b.gap - a.gap)[0];

    if (correlated)
      list.push({
        id: 'correlated',
        label: 'Learners won more with',
        value: '+' + correlated.gap.toFixed(1) + ' pts',
        subjects: [{ text: skillName(correlated.skillId) }],
        detail: 'than runners without it · a hint, not the skill’s effect',
        action: { label: 'Show', icon: 'eye', onselect: () => showSkill(correlated.skillId) }
      });

    const repeated = [...uses].sort((a, b) => b.repeat - a.repeat)[0];
    if (repeated && repeated.repeat > 0)
      list.push({
        id: 'double',
        label: 'Most double procs',
        value: String(repeated.repeat),
        subjects: [{ text: skillName(repeated.skillId) }],
        detail: 'runners activated it twice or more',
        action: { label: 'Show', icon: 'eye', onselect: () => showSkill(repeated.skillId) }
      });

    return list;
  });

  function skillName(id: number) {
    return skillNames.get(id) ?? 'Skill ' + id;
  }

  /** Narrows the table to one skill with its activation lanes open, from a figure that names it. */
  function showSkill(id: number) {
    search = skillName(id);
    inspected = id;
    tableSection?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }

  /** Skills the other runners learned have no data among yours, so their lanes would stay empty. */
  function countRunners(scope: string) {
    runners = scope;
    selected = selected.filter((id) => data.details[id]);
    if (inspected !== undefined && !data.details[inspected]) inspected = undefined;
  }

  $effect(() => {
    const instance = raceInstanceId;
    course = undefined;
    let current = true;

    // Lanes fall back to plain distance marks when the course cannot be resolved.
    void loadRaceCourse(instance)
      .then((value) => {
        if (current) course = value;
      })
      .catch(() => {});

    return () => {
      current = false;
    };
  });
</script>

<div class="skills">
  <SessionKpis
    label="Skills at a glance"
    {kpis}
  />
  <div class="toolbar">
    <TextField
      id="session-skill-search"
      type="search"
      label="Search skills"
      bind:value={search}
      placeholder="Skill name"
      prefixIcon="search"
    />
    <SelectField
      id="session-skill-style"
      label="Running style"
      bind:value={style}
      options={[
        { value: 'all', label: 'All styles' },
        ...styleOptions.map((id) => ({ value: String(id), label: styleNames[id]! }))
      ]}
    />
    {#if hasPlayer}
      <SegmentedControl
        label="Runners counted"
        options={[
          { value: 'all', label: 'All runners' },
          { value: 'own', label: 'Yours' }
        ]}
        bind:value={() => runners, countRunners}
      />
    {/if}
    <p>{number(overview.players)} players · {number(overview.races)} races</p>
  </div>
  <section
    class="skill-list"
    bind:this={tableSection}
  >
    <header>
      <h2>
        Skill procs <span>{rows.length} skills</span>
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
      colors={styleColors}
      {skillName}
      caption="Session skill procs"
      course={courseMatch}
      columnHelp={{
        Players: 'Distinct trainers in this session with a runner that learned this skill.',
        Activations:
          'All activation events, including repeats. The percentage counts learned runners with at least one activation. Select a skill to inspect exact counts.',
        'Mean distance':
          'Mean activation distance, measured in 1% sections of the course. The race replays hold exact positions.',
        'Median distance':
          'Median activation distance, measured in 1% sections of the course. The race replays hold exact positions.'
      }}
      bind:selected
      bind:inspected
      bind:sortKey
    />
    {#if !rows.length}
      <Button
        variant="secondary"
        size="sm"
        icon="refresh"
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
    colors={styleColors}
    {skillName}
    course={courseMatch}
    bind:selected
    bind:element={comparison}
  />
</div>

<style>
  @import '../../champions-meeting/skills/skill-sections.css';
  @import './session-skills.css';
</style>
