<script lang="ts">
  import type { MultiRaceAnalysis } from '@/lib/race/multi-race-analysis';
  import { runningStyleName } from '@/lib/race/replay/race-display';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import DataTable from '@/components/data/DataTable.svelte';
  import ChartFrame from '@/components/charts/ChartFrame.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Artwork from '@/components/game/Artwork.svelte';
  import RunnerReference from '../../runners/RunnerReference.svelte';
  import SessionUmaPlot from './SessionUmaPlot.svelte';
  import { percent, portrait, rate, styleColors } from '../../analysis-view';
  import {
    metricHelp,
    umaStyleMix,
    type SessionEntry,
    type TeamFilter
  } from '../session-statistics';

  interface Props {
    analysis: MultiRaceAnalysis;
    entries: SessionEntry[];
    selected: string;
    onteams: (filter: TeamFilter) => void;
  }

  let { analysis, entries, selected = $bindable(), onteams }: Props = $props();

  let ranking = $state('winrate'),
    minimum = $state('0');

  const styleMix = $derived(umaStyleMix(analysis));
  const characters = $derived(
    analysis.characters
      .filter((uma) => rate(uma.races, entries.length) >= Number(minimum))
      .sort((a, b) =>
        ranking === 'entries'
          ? b.races - a.races
          : rate(b.wins, b.races) - rate(a.wins, a.races) || b.races - a.races
      )
  );

  const mostEntries = $derived(Math.max(1, ...characters.map((uma) => uma.races)));
  const inspected = $derived(characters.find((uma) => uma.key === selected) ?? characters[0]);

  const partners = $derived(
    analysis.teams
      .filter((team) => team.members.some((member) => member.key === inspected?.key))
      .sort((a, b) => b.wins - a.wins || b.appearances - a.appearances)
      .slice(0, 6)
  );

  const stylesRun = (key: string) =>
    (styleMix.get(key) ?? []).map((part) => runningStyleName(part.strategy, true)).join(' / ');
</script>

<div class="umas">
  <div class="panels">
    <ChartFrame
      plain
      surface
      id="session-umas"
      title="Uma breakdown"
      description="Select an Uma to plot it and list its winning partners."
    >
      {#snippet actions()}
        <SegmentedControl
          compact
          label="Rank Umas by"
          options={[
            { value: 'winrate', label: 'Win rate' },
            { value: 'entries', label: 'Most entered' }
          ]}
          bind:value={ranking}
        />
        <div class="minimum">
          <SelectField
            id="uma-minimum"
            label="Minimum field share"
            hideLabel
            options={[
              { value: '0', label: 'All Umas' },
              { value: '3', label: '≥3% field' },
              { value: '5', label: '≥5% field' }
            ]}
            bind:value={minimum}
          />
        </div>
      {/snippet}
      <div class="column-head">
        <span>Uma · styles</span>
        <span>Win rate</span>
      </div>
      <ol
        class="uma-list"
        aria-label="Umas in this session"
      >
        {#each characters as uma (uma.key)}
          <li>
            <button
              class="uma-row"
              class:selected={uma.key === inspected?.key}
              aria-pressed={uma.key === inspected?.key}
              onclick={() => (selected = uma.key)}
            >
              <Artwork
                src={portrait(uma.cardId)}
                alt=""
                size="sm"
              />
              <span class="uma-name">
                <strong>{uma.name}</strong>
                <small>
                  {stylesRun(uma.key)} · {uma.races} entries · {percent(uma.races, entries.length)} field
                </small>
              </span>
              <span class="uma-rate">
                <strong>{percent(uma.wins, uma.races)}</strong>
                <small>{uma.wins} wins</small>
              </span>
              <span class="share-track">
                <span style:width={(uma.races / mostEntries) * 100 + '%'}>
                  {#each styleMix.get(uma.key) ?? [] as part (part.strategy)}
                    <i
                      style:width={(part.entries / uma.races) * 100 + '%'}
                      style:background={styleColors[part.strategy]}
                    ></i>
                  {/each}
                </span>
              </span>
            </button>
          </li>
        {:else}
          <li class="empty">No Umas reach this field share.</li>
        {/each}
      </ol>
    </ChartFrame>
    <ChartFrame
      plain
      surface
      expandable
      maximize
      id="uma-popularity"
      title="Popularity vs. performance"
      description="Field share against win rate. Select a portrait to inspect an Uma."
    >
      <SessionUmaPlot
        {characters}
        entries={entries.length}
        selected={inspected?.key}
        onselect={(key) => (selected = key)}
      />
      {#if inspected}
        <div class="inspection">
          <RunnerReference
            name={inspected.name}
            cardId={inspected.cardId}
            detail={stylesRun(inspected.key)}
          />
          <dl>
            <div>
              <dt>Win rate</dt>
              <dd>{percent(inspected.wins, inspected.races)}</dd>
            </div>
            <div>
              <dt>Field share</dt>
              <dd>{percent(inspected.races, entries.length)}</dd>
            </div>
            <div>
              <dt>Entries</dt>
              <dd>{inspected.races}</dd>
            </div>
          </dl>
          <Button
            size="sm"
            variant="secondary"
            icon="community"
            onclick={() => onteams({ uma: inspected.key })}
          >
            Find teams
          </Button>
        </div>
      {/if}
    </ChartFrame>
  </div>
  {#if inspected}
    <ChartFrame
      plain
      surface
      compact
      id="session-partners"
      title={'Teams with ' + inspected.name}
      description="Lineups that included this Uma, by team wins."
    >
      <DataTable
        plain
        compact
        caption={'Teams with ' + inspected.name}
        columnHelp={metricHelp}
        emptyMessage="This Uma did not race in a captured team."
        rows={partners.map((team) => ({
          id: team.key,
          appearances: team.appearances,
          wins: team.wins,
          winrate: rate(team.wins, team.appearances)
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
              {#each partners.find((team) => team.key === row.id)?.members ?? [] as member (member.key)}
                <button
                  class:current={member.key === inspected.key}
                  aria-label={'Inspect ' + member.name}
                  onclick={() => (selected = member.key)}
                >
                  <RunnerReference
                    name={member.name}
                    cardId={member.cardId}
                    detail={runningStyleName(member.strategy)}
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
</div>

<style>
  @import './session-umas.css';
</style>
