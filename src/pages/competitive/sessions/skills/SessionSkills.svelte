<script lang="ts">
  import type { MultiRaceAnalysis } from '@/lib/race/multi-race-analysis';
  import { runningStyleName } from '@/lib/race/replay/race-display';
  import TextField from '@/components/controls/TextField.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import DataTable from '@/components/data/DataTable.svelte';
  import ChartFrame from '@/components/charts/ChartFrame.svelte';
  import RaceSkill from '../../runners/RaceSkill.svelte';
  import SessionKpis from '../SessionKpis.svelte';
  import SessionSkillDetail from './SessionSkillDetail.svelte';
  import { rate } from '../../analysis-view';
  import { rateClass, type SessionKpi } from '../session-kpis';
  import { formatRate, isSmallSample, SMALL_SAMPLE } from '../session-insights';
  import { metricHelp } from '../session-statistics';
  import { activationSpread, learnerWinGap, sessionSkills } from './session-skill-stats';

  interface Props {
    analysis: MultiRaceAnalysis;
    skillNames: Map<number, string>;
  }

  let { analysis, skillNames }: Props = $props();

  /** A skill needs this many learners before its activation rate is worth calling out. */
  const RELIABILITY_SAMPLE = SMALL_SAMPLE * 2;
  /** Win-rate gaps smaller than this many points are within a single result of each other here. */
  const NOTABLE_GAP = 2;

  let search = $state(''),
    style = $state('all'),
    runners = $state('all'),
    selected = $state<number>();

  const hasPlayer = $derived(analysis.entries.some((entry) => entry.isPlayer));
  const styleOptions = $derived(
    [...new Set(analysis.entries.map((entry) => entry.strategy))]
      .filter((id) => id > 0)
      .sort((a, b) => a - b)
  );

  const raceDistance = $derived(
    Math.max(0, ...analysis.entries.map((entry) => entry.raceDistance))
  );

  /** The runners every number in this view describes: all of them, or only the player's. */
  const scopedEntries = $derived(
    runners === 'own' ? analysis.entries.filter((entry) => entry.isPlayer) : analysis.entries
  );

  const skills = $derived(sessionSkills(scopedEntries));
  const styleFilter = $derived(style === 'all' ? undefined : Number(style));

  const totals = $derived.by(() => {
    const inStyle = scopedEntries.filter(
      (entry) => styleFilter === undefined || entry.strategy === styleFilter
    );

    return {
      entries: inStyle.length,
      wins: inStyle.filter((entry) => entry.finishOrder === 1).length
    };
  });

  /** The win rate of every runner in scope, which a skill's learners are read against. */
  const neutralWin = $derived(rate(totals.wins, totals.entries));

  const scoped = $derived(
    skills.flatMap((skill) => {
      const use = styleFilter === undefined ? skill.all : skill.byStyle.get(styleFilter);
      if (!use) return [];

      return [{ skill, use, name: skillName(skill.skillId), gap: learnerWinGap(use, totals) }];
    })
  );

  const learnedTotal = $derived(scoped.reduce((total, item) => total + item.use.learned, 0));
  const activatedTotal = $derived(scoped.reduce((total, item) => total + item.use.activated, 0));

  const kpis = $derived.by(() => {
    const list: SessionKpi[] = [];
    if (!learnedTotal) return list;

    list.push({
      id: 'activation',
      label: 'Learned skills that activated',
      value: formatRate(rate(activatedTotal, learnedTotal)),
      detail: activatedTotal.toLocaleString() + ' of ' + learnedTotal.toLocaleString() + ' carried'
    });

    const unreliable = scoped
      .filter(
        (item) => item.use.learned >= RELIABILITY_SAMPLE && item.use.activated < item.use.learned
      )
      .sort(
        (a, b) => rate(a.use.activated, a.use.learned) - rate(b.use.activated, b.use.learned)
      )[0];

    if (unreliable)
      list.push({
        id: 'unreliable',
        label: 'Least reliable skill',
        value: formatRate(rate(unreliable.use.activated, unreliable.use.learned)),
        subjects: [{ text: unreliable.name }],
        detail:
          unreliable.use.activated + ' of ' + unreliable.use.learned + ' learners activated it',
        action: { label: 'Show', onselect: () => (selected = unreliable.skill.skillId) }
      });

    const correlated = scoped
      .filter((item) => item.gap !== undefined && item.gap >= NOTABLE_GAP)
      .sort((a, b) => (b.gap ?? 0) - (a.gap ?? 0))[0];

    if (correlated?.gap !== undefined)
      list.push({
        id: 'correlated',
        label: 'Learners won more with',
        value: '+' + correlated.gap.toFixed(1) + ' pts',
        subjects: [{ text: correlated.name }],
        detail: 'than runners without it · a hint, not the skill’s effect',
        action: { label: 'Show', onselect: () => (selected = correlated.skill.skillId) }
      });

    const repeated = [...scoped].sort((a, b) => b.use.doubleProcs - a.use.doubleProcs)[0];
    if (repeated && repeated.use.doubleProcs > 0)
      list.push({
        id: 'double',
        label: 'Most double procs',
        value: String(repeated.use.doubleProcs),
        subjects: [{ text: repeated.name }],
        detail: 'runners activated it twice or more',
        action: { label: 'Show', onselect: () => (selected = repeated.skill.skillId) }
      });

    return list;
  });

  const hasDoubleProcs = $derived(scoped.some((item) => item.use.doubleProcs > 0));

  const rows = $derived(
    scoped
      .filter((item) => item.name.toLowerCase().includes(search.trim().toLowerCase()))
      .map(({ skill, use, name, gap }) => {
        const spread = activationSpread(use.distances);

        return {
          id: skill.skillId,
          name,
          learned: use.learned,
          activated: rate(use.activated, use.learned),
          activeWin: use.activated ? rate(use.activatedWins, use.activated) : '—',
          activatedRuns: use.activated,
          gap: gap ?? '—',
          where: spread?.median ?? '—',
          low: spread?.low ?? 0,
          high: spread?.high ?? 0,
          double: use.doubleProcs
        };
      })
  );

  const selectedItem = $derived(
    scoped.find((item) => item.skill.skillId === selected) ?? scoped[0]
  );

  const measured = $derived(
    analysis.skills.find((row) => row.skillId === selectedItem?.skill.skillId)
  );

  const position = (distance: number) =>
    Math.min(100, Math.max(0, (distance / Math.max(1, raceDistance)) * 100)) + '%';

  function skillName(id: number) {
    return skillNames.get(id) ?? 'Skill ' + id;
  }
</script>

{#snippet courseTrack(row: Record<string, string | number>)}
  {#if typeof row.where === 'number'}
    <span
      class="where"
      title={'Middle half between ' +
        Math.round(Number(row.low)) +
        ' m and ' +
        Math.round(Number(row.high)) +
        ' m'}
    >
      <span
        class="track"
        aria-hidden="true"
      >
        <i
          style:left={position(Number(row.low))}
          style:right={'calc(100% - ' + position(Number(row.high)) + ')'}
        ></i>
        <b style:left={position(row.where)}></b>
      </span>
      {Math.round(row.where).toLocaleString()} m
    </span>
  {:else}
    —
  {/if}
{/snippet}

<div class="skills">
  <SessionKpis
    label="Skills at a glance"
    {kpis}
  />
  <ChartFrame
    plain
    surface
    id="session-skills"
    title="Learned skills"
    description={'Select a skill for its course heatmap · under ' +
      SMALL_SAMPLE +
      ' learners muted'}
  >
    {#snippet actions()}
      {#if hasPlayer}
        <SegmentedControl
          compact
          label="Runners counted"
          options={[
            { value: 'all', label: 'All runners' },
            { value: 'own', label: 'Yours' }
          ]}
          bind:value={runners}
        />
      {/if}
      <div class="style">
        <SelectField
          id="session-skill-style"
          label="Running style"
          hideLabel
          options={[
            { value: 'all', label: 'All styles' },
            ...styleOptions.map((id) => ({ value: String(id), label: runningStyleName(id) }))
          ]}
          bind:value={style}
        />
      </div>
      <div class="search">
        <TextField
          id="session-skill-search"
          label="Search learned skills"
          hideLabel
          type="search"
          prefixIcon="search"
          placeholder="Search skills"
          bind:value={search}
        />
      </div>
    {/snippet}
    <div class="skill-layout">
      <DataTable
        plain
        compact
        caption="Learned skills in this session"
        columnHelp={metricHelp}
        maxHeight={420}
        {rows}
        emptyMessage="No learned skill matches this search."
        columns={[
          { key: 'name', label: 'Skill' },
          { key: 'learned', label: 'Learned', numeric: true },
          { key: 'activated', label: 'Activation rate', numeric: true },
          { key: 'activeWin', label: 'Win% if active', numeric: true },
          { key: 'gap', label: 'vs. without', numeric: true },
          { key: 'where', label: 'Median activation', numeric: true },
          ...(hasDoubleProcs ? [{ key: 'double', label: 'Double procs', numeric: true }] : [])
        ]}
      >
        {#snippet cell(row, column)}
          {#if column.key === 'name'}
            <button
              class="skill-select skill-chip-cell"
              class:selected={row.id === selectedItem?.skill.skillId}
              aria-pressed={row.id === selectedItem?.skill.skillId}
              onclick={() => (selected = Number(row.id))}
            >
              <RaceSkill
                id={Number(row.id)}
                name={String(row.name)}
                fill
              />
            </button>
          {:else if column.key === 'activated'}
            <span class:few={isSmallSample(Number(row.learned))}>
              {formatRate(Number(row.activated))}
            </span>
          {:else if column.key === 'activeWin'}
            {#if typeof row.activeWin === 'number'}
              <span class={rateClass(row.activeWin, Number(row.activatedRuns), neutralWin)}>
                {formatRate(row.activeWin)}
              </span>
            {:else}
              —
            {/if}
          {:else if column.key === 'gap'}
            {#if typeof row.gap === 'number'}
              <span
                class="gap"
                class:over={row.gap >= NOTABLE_GAP}
                class:under={row.gap <= -NOTABLE_GAP}
              >
                {(row.gap > 0 ? '+' : '') + row.gap.toFixed(1)} pts
              </span>
            {:else}
              —
            {/if}
          {:else if column.key === 'where'}
            {@render courseTrack(row)}
          {:else}
            {row[column.key]}
          {/if}
        {/snippet}
      </DataTable>
      {#if selectedItem}
        <SessionSkillDetail
          skill={selectedItem.skill}
          name={selectedItem.name}
          use={selectedItem.use}
          {raceDistance}
          {neutralWin}
          {measured}
        />
      {/if}
    </div>
  </ChartFrame>
</div>

<style>
  @import '../../runners/skill-chip-cell.css';
  @import './session-skills.css';
</style>
