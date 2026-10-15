<script lang="ts">
  import type { MultiRaceAnalysis } from '@/lib/race/multi-race-analysis';
  import { raceRunnerKey } from '@/lib/race/multi-race-analysis';
  import { runningStyleName } from '@/lib/race/replay/race-display';
  import SelectField from '@/components/controls/SelectField.svelte';
  import DataTable from '@/components/data/DataTable.svelte';
  import ChartFrame from '@/components/charts/ChartFrame.svelte';
  import Button from '@/components/controls/Button.svelte';
  import RunnerReference from '../../runners/RunnerReference.svelte';
  import SessionUmaPlot from './SessionUmaPlot.svelte';
  import { percent, rate } from '../../analysis-view';
  import { metricHelp, type SessionEntry } from './session-statistics';

  interface Props {
    analysis: MultiRaceAnalysis;
    entries: SessionEntry[];
    active: boolean;
    uma: string;
    onfind: (card: string) => void;
  }

  let { analysis, entries, active, uma = $bindable(), onfind }: Props = $props();

  let characterSort = $state('wins'),
    minimum = $state('0');

  const characterStyles = $derived.by(() => {
    const result = new Map<string, Set<number>>();
    for (const { runner } of entries) {
      const key = raceRunnerKey(runner),
        styles = result.get(key) ?? new Set<number>();

      styles.add(runner.result?.runningStyle ?? 0);
      result.set(key, styles);
    }

    return new Map(
      [...result].map(([key, styles]) => [
        key,
        [...styles]
          .sort()
          .map((id) => runningStyleName(id, true))
          .join(' / ')
      ])
    );
  });

  const characters = $derived(
    analysis.characters
      .filter((r) => rate(r.races, entries.length) >= Number(minimum))
      .sort((a, b) =>
        characterSort === 'popularity'
          ? b.races - a.races
          : rate(b.wins, b.races) - rate(a.wins, a.races)
      )
  );

  const selectedCharacter = $derived(characters.find((r) => r.key === uma) ?? characters[0]);
  const winningPartners = $derived(
    analysis.teams
      .filter((t) => t.members.some((m) => m.key === selectedCharacter?.key))
      .sort((a, b) => b.wins - a.wins)
      .slice(0, 4)
  );
</script>

{#if active}
  <div class="toolbar">
    <SelectField
      id="uma-minimum"
      label="Minimum field share"
      options={[
        { value: '0', label: 'All Umas' },
        { value: '3', label: 'At least 3%' },
        { value: '5', label: 'At least 5%' }
      ]}
      bind:value={minimum}
    /><SelectField
      id="uma-ranking"
      label="Rank by"
      options={[
        { value: 'wins', label: 'Win rate' },
        { value: 'popularity', label: 'Popularity' }
      ]}
      bind:value={characterSort}
    />
  </div>
  <div class="uma-analysis">
    <ChartFrame
      plain
      surface
      compact
      id="session-umas"
      title="Uma breakdown"
      description="Select an Uma to explore its team combinations."
    >
      <div class="ranking">
        <DataTable
          plain
          compact
          caption="Session Uma performance"
          columnHelp={metricHelp}
          maxHeight={460}
          rows={characters.map((r) => ({
            id: r.key,
            name: r.name,
            cardId: r.cardId ?? '—',
            entries: r.races,
            field: rate(r.races, entries.length),
            wins: r.wins,
            winrate: rate(r.wins, r.races)
          }))}
          columns={[
            { key: 'name', label: 'Uma' },
            { key: 'winrate', label: 'Win rate', numeric: true },
            { key: 'entries', label: 'Entries', numeric: true },
            { key: 'field', label: 'Field share', numeric: true },
            { key: 'wins', label: 'Wins', numeric: true }
          ]}
        >
          {#snippet cell(row, column)}
            {#if column.key === 'name'}
              <button
                class="character-select"
                class:selected={selectedCharacter?.key === row.id}
                aria-pressed={selectedCharacter?.key === row.id}
                onclick={() => (uma = String(row.id))}
              >
                <RunnerReference
                  name={String(row.name)}
                  cardId={typeof row.cardId === 'number' ? row.cardId : undefined}
                  detail={characterStyles.get(String(row.id))}
                />
              </button>
            {:else if ['field', 'winrate'].includes(column.key)}
              {Number(row[column.key]).toFixed(1)}%
            {:else}
              {row[column.key]}
            {/if}
          {/snippet}
        </DataTable>
      </div>
    </ChartFrame>
    <ChartFrame
      plain
      surface
      compact
      expandable
      maximize
      id="uma-popularity"
      title="Popularity vs. performance"
      description="Select a portrait or a row to inspect an Uma."
    >
      <SessionUmaPlot
        {characters}
        entries={entries.length}
        selected={selectedCharacter?.key}
        onselect={(key) => (uma = key)}
      />
      {#if selectedCharacter}
        <div class="uma-inspection">
          <RunnerReference
            name={selectedCharacter.name}
            cardId={selectedCharacter.cardId}
          />
          <dl>
            <div>
              <dt>Win rate</dt>
              <dd>{percent(selectedCharacter.wins, selectedCharacter.races)}</dd>
            </div>
            <div>
              <dt>Field share</dt>
              <dd>{percent(selectedCharacter.races, entries.length)}</dd>
            </div>
            <div>
              <dt>Entries</dt>
              <dd>{selectedCharacter.races}</dd>
            </div>
          </dl>
          <Button
            size="sm"
            variant="secondary"
            onclick={() => onfind(selectedCharacter.key)}
          >
            Find teams
          </Button>
        </div>
      {/if}
    </ChartFrame>
  </div>
  {#if selectedCharacter}
    <ChartFrame
      plain
      surface
      compact
      id="session-partners"
      title={'Winning partners for ' + selectedCharacter.name}
    >
      <DataTable
        plain
        compact
        caption="Winning team lineups"
        columnHelp={metricHelp}
        rows={winningPartners.map((t) => ({
          id: t.key,
          appearances: t.appearances,
          wins: t.wins,
          winrate: rate(t.wins, t.appearances)
        }))}
        columns={[
          { key: 'lineup', label: 'Team lineup', sortable: false },
          { key: 'winrate', label: 'Win rate', numeric: true },
          { key: 'appearances', label: 'Races', numeric: true },
          { key: 'wins', label: 'Wins', numeric: true }
        ]}
      >
        {#snippet cell(row, column)}
          {#if column.key === 'lineup'}
            <div class="partner-lineup">
              {#each winningPartners.find((t) => t.key === row.id)?.members ?? [] as member}
                <button
                  onclick={() => onfind(member.key)}
                  aria-label={'Find teams with ' + member.name}
                >
                  <RunnerReference
                    name={member.name}
                    cardId={member.cardId}
                    compact
                  />
                </button>
              {/each}
            </div>
          {:else if column.key === 'winrate'}
            {Number(row.winrate).toFixed(1)}%
          {:else}
            {row[column.key]}
          {/if}
        {/snippet}
      </DataTable>
    </ChartFrame>
  {/if}
{/if}

<style>
  @import './session-toolbar.css';
  @import './character-select.css';
  .character-select.selected {
    color: var(--accent-primary);
  }
  .uma-analysis {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    min-width: 0;
  }
  .uma-analysis {
    align-items: start;
  }
  .ranking {
    min-width: 0;
  }
  .uma-inspection {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px 20px;
    padding-top: 10px;
    border-top: 1px solid var(--border-subtle);
  }
  .uma-inspection > :global(.runner-reference) {
    margin-right: auto;
  }
  .uma-inspection dl {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    margin: 0;
  }
  .uma-inspection dl > div {
    display: flex;
    align-items: baseline;
    gap: 6px;
    font-size: 11px;
  }
  .uma-inspection dt {
    color: var(--text-secondary);
  }
  .uma-inspection dd {
    margin: 0;
    font-weight: 600;
  }
  .partner-lineup {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 20px;
  }
  .partner-lineup button {
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
    text-align: left;
  }
  .partner-lineup button:hover {
    color: var(--accent-primary);
  }
  .partner-lineup > :global(button) {
    flex: 1;
    min-width: 140px;
  }
  @media (max-width: 760px) {
    .uma-analysis {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
