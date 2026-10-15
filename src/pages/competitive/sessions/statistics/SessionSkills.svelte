<script lang="ts">
  import type { MultiRaceAnalysis } from '@/lib/race/multi-race-analysis';
  import TextField from '@/components/controls/TextField.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import DataTable from '@/components/data/DataTable.svelte';
  import ChartFrame from '@/components/charts/ChartFrame.svelte';
  import LazyEChartsSurface from '@/components/charts/LazyEChartsSurface.svelte';
  import RaceSkill from '../../runners/RaceSkill.svelte';
  import { histogram, percent } from '../../analysis-view';
  import { metricHelp, sessionChart } from './session-statistics';
  import { theme } from '@/stores/theme';

  interface Props {
    analysis: MultiRaceAnalysis;
    skillNames: Map<number, string>;
    active: boolean;
  }

  let { analysis, skillNames, active }: Props = $props();

  let skillSearch = $state(''),
    skill = $state('');

  const ink = $derived($theme === 'dark' ? '#abb4c3' : '#566071');
  const selectedSkill = $derived(
    analysis.skills.find((r) => String(r.skillId) === skill) ?? analysis.skills[0]
  );
  const distances = $derived(histogram(selectedSkill?.activationDistances ?? [], 16));
</script>

{#if active}
  <dl
    class="session-counts"
    aria-label="Session skill totals"
  >
    <div>
      <dt>Learned entries</dt>
      <dd>{analysis.skills.reduce((n, r) => n + r.learned, 0).toLocaleString()}</dd>
    </div>
    <div>
      <dt>Activation rate</dt>
      <dd>
        {percent(
          analysis.skills.reduce((n, r) => n + r.activatedRunners, 0),
          analysis.skills.reduce((n, r) => n + r.learned, 0)
        )}
      </dd>
    </div>
  </dl>
  <div class="toolbar">
    <TextField
      id="analysis-search"
      label="Filter skills"
      type="search"
      bind:value={skillSearch}
      placeholder="Search learned skills…"
    /><SelectField
      id="skill-selection"
      label="Inspect activation locations"
      options={analysis.skills.map((r) => ({
        value: String(r.skillId),
        label: skillNames.get(r.skillId) ?? 'Skill ' + r.skillId
      }))}
      value={String(selectedSkill?.skillId ?? '')}
      onchange={(v) => (skill = v)}
    />
  </div>
  <ChartFrame
    plain
    surface
    compact
    expandable
    maximize
    id="skill-locations"
    title="Activation locations"
    description={selectedSkill
      ? (skillNames.get(selectedSkill.skillId) ?? 'Skill ' + selectedSkill.skillId)
      : 'No activation events available'}
  >
    <LazyEChartsSurface
      height={190}
      label="Skill activation distance"
      option={sessionChart(
        ink,
        [{ type: 'bar', data: distances.counts, itemStyle: { color: '#d194df' } }],
        {
          type: 'category',
          data: distances.labels.map((n) => Math.round(n) + 'm'),
          axisLabel: { rotate: 25 }
        },
        { type: 'value', name: 'Activations' }
      )}
    />
  </ChartFrame>
  <DataTable
    plain
    compact
    caption="Skill Analysis"
    columnHelp={metricHelp}
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
    rows={analysis.skills
      .map((r) => ({
        id: r.skillId,
        name: skillNames.get(r.skillId) ?? 'Skill ' + r.skillId,
        learned: r.learned,
        activated: percent(r.activatedRunners, r.learned),
        active: r.measuredEntries ? (r.durationTotal / r.measuredEntries).toFixed(2) : '—',
        failed: r.measuredEntries ? r.rollFailures : '—',
        untriggered: r.measuredEntries ? r.passedUntriggered : '—',
        double: r.doubleProcRaces,
        winrate: percent(r.wins, r.learned)
      }))
      .filter((r) => r.name.toLowerCase().includes(skillSearch.toLowerCase()))}
  >
    {#snippet cell(row, column)}
      {#if column.key === 'name'}
        <button
          class="skill-select"
          class:selected={String(row.id) === String(selectedSkill?.skillId)}
          aria-pressed={String(row.id) === String(selectedSkill?.skillId)}
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
{/if}

<style>
  @import './session-counts.css';
  @import './session-toolbar.css';
  .skill-select {
    padding: 2px 0;
    border: 0;
    background: none;
    cursor: pointer;
  }
  .skill-select.selected {
    box-shadow: 0 0 0 1px var(--accent-primary);
    border-radius: 4px;
  }
</style>
