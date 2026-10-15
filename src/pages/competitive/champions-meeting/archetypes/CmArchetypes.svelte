<script lang="ts">
  import type {
    Summary,
    Performer,
    Build,
    TeamSearchResponse,
    Snapshot
  } from '../../hakuraku-types';
  import { cmGet, snapshotPath, number } from '../cm-data';
  import { parseQuery, hasRequirement } from '../../hakuraku-query';
  import Button from '@/components/controls/Button.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import { virtualScroll, type VirtualRange } from '@/lib/virtual-scroll';
  import Checkbox from '@/components/controls/Checkbox.svelte';
  import Icon from '@/components/Icon.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import CmArchetypeFilters from './filters/CmArchetypeFilters.svelte';
  import CmArchetypeField from './CmArchetypeField.svelte';
  import CmCustomTeam from './teams/CmCustomTeam.svelte';
  import CmTeamCard from './teams/CmTeamCard.svelte';
  import CmTeamDetails from './teams/CmTeamDetails.svelte';

  let {
    data,
    colors,
    snapshot,
    query = $bindable(''),
    lobby,
    teamDraft,
    pendingTeams,
    pendingRunners,
    teamError,
    onrunner,
    onbuildteam,
    onremoverunner,
    onclearteam,
    ontoggle,
    onlobby
  }: {
    data: Summary;
    snapshot?: Snapshot;
    colors: Record<number, string>;
    query?: string;
    lobby: Performer[];
    pendingTeams: string[];
    teamDraft: { key: string; build: Build }[];
    pendingRunners: string[];
    teamError: string;
    onrunner: (team: Performer, index: number) => void;
    onbuildteam: () => void;
    onremoverunner: (key: string) => void;
    onclearteam: () => void;
    ontoggle: (team: Performer) => void;
    onlobby: () => void;
  } = $props();

  let simError = $state('');

  let mode = $state('all'),
    sort = $state('lower'),
    offset = $state(0),
    loading = $state(false),
    exhausted = $state(false),
    range = $state<VirtualRange>({ start: 0, end: 0 }),
    attempt = $state(0),
    result = $state<TeamSearchResponse>(),
    error = $state('');
  let showStats = $state(true);
  let buildTeam = $state(false);
  let selected = $state('');

  const selectedRunners = $derived(new Set(teamDraft.map((r) => r.key)));

  const parsed = $derived.by(() => {
    try {
      return { slots: parseQuery(query, data.cards), error: '' };
    } catch (e) {
      return { slots: [], error: (e as Error).message };
    }
  });

  const activeFilters = $derived(parsed.slots.filter(hasRequirement).length);
  const lobbyIds = $derived(new Set(lobby.map((t) => t.id)));
  const total = $derived(
    mode === 'unique' ? (result?.totalOwners ?? 0) : (result?.totalTeams ?? 0)
  );

  $effect(() => {
    data.snapshotId;
    query;
    mode;
    sort;
    offset = 0;
    result = undefined;
    exhausted = false;
  });

  $effect(() => {
    const id = data.snapshotId;
    const params = new URLSearchParams({
      slots: JSON.stringify(parsed.slots),
      players: mode,
      sort,
      limit: '30',
      offset: String(offset)
    });
    attempt;
    if (offset === 0) result = undefined;
    error = '';
    if (parsed.error) return;
    loading = true;
    const controller = new AbortController();
    cmGet<TeamSearchResponse>(snapshotPath(id, 'teams?' + params), controller.signal, id)
      .then((v) => {
        if (!controller.signal.aborted) {
          result = { ...v, teams: offset === 0 ? v.teams : [...(result?.teams ?? []), ...v.teams] };
          exhausted = v.teams.length < 30;
          loading = false;
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          error = e.message;
          loading = false;
        }
      });
    return () => controller.abort();
  });

  function more() {
    if (!loading && !error && !exhausted && result && result.teams.length < total) {
      loading = true;
      offset += 30;
    }
  }

  $effect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('team')) selected = params.get('team')!;
  });
</script>

{#snippet runnerToggle(team: Performer, index: number)}
  {@const key = team.id + ':' + index}
  {@const name = data.cards[team.members[index]!.card]?.name ?? 'Uma'}
  <button
    class="runner-toggle"
    class:chosen={selectedRunners.has(key)}
    aria-label={(selectedRunners.has(key) ? 'Remove ' : 'Add ') +
      name +
      (selectedRunners.has(key) ? ' from custom team' : ' to custom team')}
    aria-pressed={selectedRunners.has(key)}
    disabled={pendingRunners.includes(key) ||
      (!selectedRunners.has(key) && teamDraft.length + pendingRunners.length >= 3)}
    onclick={() => {
      buildTeam = true;
      onrunner(team, index);
    }}
  >
    {#if pendingRunners.includes(key)}
      <Spinner
        size={14}
        label="Loading build…"
      />
    {:else}
      {#if selectedRunners.has(key)}
        <Icon
          name="close"
          size={16}
        />
      {:else}
        <span aria-hidden="true">+</span>
      {/if}
    {/if}
  </button>
{/snippet}
<div class="archetype-workspace">
  <div
    class="browse-tools"
    aria-label="Team browsing tools"
  >
    <CmArchetypeFilters
      cards={data.cards}
      {colors}
      {parsed}
      {activeFilters}
      bind:query
    />
    <CmArchetypeField
      {data}
      {parsed}
      {mode}
      {sort}
      {attempt}
      onretry={() => attempt++}
    />
  </div>
  <section
    class="team-browser"
    aria-label="Captured teams"
  >
    <div class="browser-controls">
      <header class="browser-heading">
        <div>
          <h2>Captured teams</h2>
          <p>
            {result ? number(total) + ' matching teams' : 'Finding teams…'}{activeFilters
              ? ' · ' + activeFilters + ' lineup filters'
              : ''}
          </p>
        </div>
      </header>
      <div class="browser-toolbar">
        <Checkbox
          id="cm-show-build-stats"
          label="Build stats"
          bind:checked={showStats}
        /><Checkbox
          id="cm-build-team"
          label="Build a team"
          bind:checked={buildTeam}
        /><SegmentedControl
          compact
          options={[
            { value: 'all', label: 'All teams' },
            { value: 'unique', label: 'Best per player' }
          ]}
          bind:value={mode}
          label="Team representation"
        /><SelectField
          id="cm-team-sort"
          label="Rank teams by"
          hideLabel
          bind:value={sort}
          options={[
            { value: 'lower', label: 'Reliable win rate' },
            { value: 'rate', label: 'Win rate' }
          ]}
        /><Button
          variant="secondary"
          size="sm"
          icon="race"
          onclick={onlobby}
        >
          Lobby {lobby.length}/3
        </Button>
      </div>
    </div>
    <p class="ranking-help">
      {sort === 'lower'
        ? 'Reliable ranking uses the lower end of the estimated win range.'
        : 'Ranked by simulated team win rate.'} Select a team to inspect its builds. Use + to choose individual
      Uma.
    </p>
    {#if buildTeam}
      <CmCustomTeam
        {data}
        {lobby}
        {teamDraft}
        {pendingTeams}
        {pendingRunners}
        {teamError}
        {onbuildteam}
        {onremoverunner}
        {onclearteam}
      />
    {/if}
    {#if simError}
      <p role="alert">{simError}</p>
    {/if}
    {#if teamError && !buildTeam}
      <p role="alert">{teamError}</p>
    {/if}
    {#if !result && !error}
      <div class="teams-loading">
        <Spinner
          size={48}
          centered
          label="Loading captured teams…"
        />
      </div>
    {:else if result && !result.teams.length}
      <div class="empty">
        <Icon
          name="search"
          size={26}
        />
        <h3>No matching teams</h3>
        <p>Try another Uma or style, or clear the lineup filters.</p>
        <Button
          variant="secondary"
          size="sm"
          onclick={() => (query = '')}
        >
          Clear filters
        </Button>
      </div>
    {:else if result}
      <div
        class="team-grid"
        use:virtualScroll={{
          items: result.teams,
          key: (t) => t.id,
          estimate: 280,
          searchText: (t) => t.members.map((m) => data.cards[m.card]?.name ?? m.card).join(' '),
          onrange: (r) => (range = r),
          onend: more
        }}
      >
        {#each result.teams.slice(range.start, range.end) as team, index (team.id)}
          <CmTeamCard
            {team}
            position={range.start + index}
            {data}
            {colors}
            {showStats}
            inLobby={lobbyIds.has(team.id)}
            pending={pendingTeams.includes(team.id)}
            lobbyFull={lobby.length + pendingTeams.length >= 3}
            {runnerToggle}
            onopen={() => (selected = team.id)}
            ontoggle={() => ontoggle(team)}
          />
        {/each}
      </div>
      <p class="loaded-count">
        {number(result.teams.length)} of {number(total)} teams loaded{loading
          ? ' · Loading more teams…'
          : ''}
      </p>
    {/if}
    {#if error}
      <p role="alert">
        {error}
        <Button
          variant="secondary"
          size="sm"
          onclick={() => attempt++}
        >
          Retry teams
        </Button>
      </p>
    {/if}
  </section>
</div>
<CmTeamDetails
  {data}
  {snapshot}
  {colors}
  bind:selected
  bind:buildTeam
  bind:simError
  {lobby}
  {lobbyIds}
  {pendingTeams}
  {pendingRunners}
  {teamDraft}
  {teamError}
  {runnerToggle}
  {ontoggle}
  {onbuildteam}
  {onremoverunner}
/>

<style>
  @import './archetype-text.css';
  @import './teams/runner-toggle.css';
  @import './cm-archetypes.css';
</style>
