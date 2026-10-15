<script lang="ts">
  import type { ParsedRaceCapture, RaceRunner } from '@/lib/race/capture/race-capture-parser';
  import { raceRunnerKey } from '@/lib/race/multi-race-analysis';
  import { runningStyleName } from '@/lib/race/replay/race-display';
  import TextField from '@/components/controls/TextField.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import Button from '@/components/controls/Button.svelte';
  import EmptyState from '@/components/feedback/EmptyState.svelte';
  import Icon from '@/components/Icon.svelte';
  import RunnerSummary from '../../runners/RunnerSummary.svelte';
  import { percent, rate, styleColors } from '../../analysis-view';
  import type { SessionTeam } from './session-statistics';

  interface Props {
    captures: ParsedRaceCapture[];
    teams: SessionTeam[];
    active: boolean;
    uma: string;
    style: string;
    teamSearch: string;
    oninspect: (members: RaceRunner[], title: string, race: number) => void;
    onlobby?: (members: RaceRunner[]) => void;
  }

  let {
    captures,
    teams,
    active,
    uma = $bindable(),
    style = $bindable(),
    teamSearch = $bindable(),
    oninspect,
    onlobby
  }: Props = $props();

  let teamSort = $state('wins'),
    teamLimit = $state(12);

  const filteredTeams = $derived(
    teams
      .filter(
        (team) =>
          team.members.some(
            (r) =>
              (!uma || raceRunnerKey(r) === uma) &&
              (style === 'all' || String(r.result?.runningStyle) === style)
          ) &&
          (team.trainer + ' ' + team.members.map((r) => r.name).join(' '))
            .toLowerCase()
            .includes(teamSearch.toLowerCase())
      )
      .sort((a, b) =>
        teamSort === 'appearances'
          ? b.appearances - a.appearances
          : rate(b.wins, b.appearances) - rate(a.wins, a.appearances)
      )
  );

  $effect(() => {
    captures;
    teamSearch;
    style;
    uma;
    teamSort;
    teamLimit = 12;
  });
</script>

{#snippet runnerSummary(runner: RaceRunner, race: number)}
  <button
    class="build-summary"
    onclick={() => oninspect([runner], runner.name, race)}
    aria-label={'Inspect ' + runner.name + ' build'}
  >
    <RunnerSummary
      {runner}
      labelStats={false}
      showScore={false}
      layout="row"
      color={styleColors[runner.result?.runningStyle ?? 0]}
    />
    <Icon
      name="chevron"
      size={13}
    />
  </button>
{/snippet}
{#if active}
  <div class="toolbar">
    <TextField
      id="cm-search"
      label="Uma or trainer"
      type="search"
      placeholder="Search teams and builds…"
      bind:value={teamSearch}
    /><SelectField
      id="team-style"
      label="Strategy"
      options={[
        { value: 'all', label: 'All strategies' },
        ...[1, 2, 3, 4].map((id) => ({ value: String(id), label: runningStyleName(id) }))
      ]}
      bind:value={style}
    /><SelectField
      id="team-sort"
      label="Sort teams"
      options={[
        { value: 'wins', label: 'Team win rate' },
        { value: 'appearances', label: 'Most appearances' }
      ]}
      bind:value={teamSort}
    />
  </div>
  <div class="section-heading">
    <p>{filteredTeams.length.toLocaleString()} matching team builds</p>
    {#if uma}
      <Button
        variant="secondary"
        size="sm"
        icon="close"
        onclick={() => (uma = '')}
      >
        Clear Uma filter
      </Button>
    {/if}
  </div>
  <div class="team-grid">
    {#each filteredTeams.slice(0, teamLimit) as team, i}
      <section class="team-card">
        <header class="team-heading">
          <div>
            <span class="team-number">#{i + 1}</span>
            <span class="lineup">
              {#each team.members as runner, j}
                {#if j}
                  <span class="slash">/</span>
                {/if}
                <span style:color={styleColors[runner.result?.runningStyle ?? 0]}>
                  {runningStyleName(runner.result?.runningStyle, true)}
                </span>
              {/each}
            </span>
          </div>
          <div class="team-rate">
            <strong>{percent(team.wins, team.appearances)}</strong>
            <span>team wins</span>
          </div>
        </header>
        <div class="member-heading">
          <span>{team.trainer}</span>
          <span>Build stats</span>
        </div>
        <div class="team-members">
          {#each team.members as runner}
            {@render runnerSummary(runner, team.races[0]!)}
          {/each}
        </div>
        <footer>
          <span>{team.wins} wins in {team.appearances} races</span>
          <div>
            <Button
              variant="secondary"
              size="sm"
              onclick={() => oninspect(team.members, team.trainer, team.races[0]!)}
            >
              Inspect team
            </Button>{#if onlobby}
              <Button
                variant="primary"
                size="sm"
                onclick={() => onlobby?.(team.members)}
              >
                Add to lobby
              </Button>
            {/if}
          </div>
        </footer>
      </section>
    {:else}
      <EmptyState
        icon="search"
        title="No matching teams"
        description="Clear the Uma filter or try another strategy or name."
      />
    {/each}
  </div>
  {#if filteredTeams.length}
    <div class="team-pagination">
      <span>
        Showing {Math.min(teamLimit, filteredTeams.length)} of {filteredTeams.length} teams
      </span>
      {#if teamLimit < filteredTeams.length}
        <Button
          variant="secondary"
          size="sm"
          onclick={() => (teamLimit += 12)}
        >
          Show more teams
        </Button>
      {/if}
    </div>
  {/if}
{/if}

<style>
  @import './session-toolbar.css';
  @import './session-lineup.css';
  @import './session-teams.css';
</style>
