<script lang="ts">
  import type { MultiRaceAnalysis } from '@/lib/race/multi-race-analysis';
  import TextField from '@/components/controls/TextField.svelte';
  import DataTable from '@/components/data/DataTable.svelte';
  import ChartFrame from '@/components/charts/ChartFrame.svelte';
  import LazyEChartsSurface from '@/components/charts/LazyEChartsSurface.svelte';
  import RaceSkill from '../../runners/RaceSkill.svelte';
  import { histogram, percent } from '../../analysis-view';
  import { chartInk, metricHelp, sessionChart } from '../session-statistics';
  import { theme } from '@/stores/theme';

  interface Props {
    analysis: MultiRaceAnalysis;
    skillNames: Map<number, string>;
  }

  let { analysis, skillNames }: Props = $props();

  const LOCATION_BINS = 16;

  let search = $state(''),
    skill = $state('');

  const ink = $derived(chartInk($theme === 'dark'));
  const learnedTotal = $derived(analysis.skills.reduce((total, row) => total + row.learned, 0));
  const activatedTotal = $derived(
    analysis.skills.reduce((total, row) => total + row.activatedRunners, 0)
  );

  const selectedSkill = $derived(
    analysis.skills.find((row) => String(row.skillId) === skill) ?? analysis.skills[0]
  );

  const selectedName = $derived(selectedSkill ? skillName(selectedSkill.skillId) : '');
  const locations = $derived(histogram(selectedSkill?.activationDistances ?? [], LOCATION_BINS));
  const rows = $derived(
    analysis.skills
      .map((row) => ({
        id: row.skillId,
        name: skillName(row.skillId),
        learned: row.learned,
        activated: percent(row.activatedRunners, row.learned),
        active: row.measuredEntries ? (row.durationTotal / row.measuredEntries).toFixed(2) : '—',
        failed: row.measuredEntries ? row.rollFailures : '—',
        untriggered: row.measuredEntries ? row.passedUntriggered : '—',
        double: row.doubleProcRaces,
        winrate: percent(row.wins, row.learned)
      }))
      .filter((row) => row.name.toLowerCase().includes(search.trim().toLowerCase()))
  );

  function skillName(id: number) {
    return skillNames.get(id) ?? 'Skill ' + id;
  }
</script>

<div class="skills">
  <ChartFrame
    plain
    surface
    id="session-skills"
    title="Learned skills"
    description={learnedTotal.toLocaleString() +
      ' learned entries · ' +
      percent(activatedTotal, learnedTotal) +
      ' activated at least once. Select a skill to see where it activated.'}
  >
    {#snippet actions()}
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
        maxHeight={440}
        {rows}
        emptyMessage="No learned skill matches this search."
        columns={[
          { key: 'name', label: 'Skill' },
          { key: 'learned', label: 'Learned', numeric: true },
          { key: 'activated', label: 'Activation rate', numeric: true },
          { key: 'active', label: 'Avg. active (s)', numeric: true },
          { key: 'failed', label: 'Wit check failed', numeric: true },
          { key: 'untriggered', label: 'Condition failed', numeric: true },
          { key: 'double', label: 'Double procs', numeric: true },
          { key: 'winrate', label: 'Runner win rate', numeric: true }
        ]}
      >
        {#snippet cell(row, column)}
          {#if column.key === 'name'}
            <button
              class="skill-select"
              class:selected={row.id === selectedSkill?.skillId}
              aria-pressed={row.id === selectedSkill?.skillId}
              onclick={() => (skill = String(row.id))}
            >
              <RaceSkill
                id={Number(row.id)}
                name={String(row.name)}
              />
            </button>
          {:else}
            {row[column.key]}
          {/if}
        {/snippet}
      </DataTable>
      <section
        class="locations"
        aria-labelledby="session-skill-locations"
      >
        <h4 id="session-skill-locations">
          Activation locations
          <small>{selectedName || 'No skill selected'}</small>
        </h4>
        <LazyEChartsSurface
          height={240}
          label={'Where ' + selectedName + ' activated'}
          option={sessionChart(
            ink,
            [
              {
                type: 'bar',
                data: locations.counts,
                itemStyle: { color: '#d194df', borderRadius: [3, 3, 0, 0] }
              }
            ],
            {
              type: 'category',
              data: locations.labels.map((distance) => Math.round(distance) + ' m'),
              name: 'Race distance'
            },
            { type: 'value', minInterval: 1, name: 'Activations' }
          )}
        />
        <p>{selectedSkill?.activations ?? 0} activations in these races.</p>
      </section>
    </div>
  </ChartFrame>
</div>

<style>
  @import './session-skills.css';
</style>
