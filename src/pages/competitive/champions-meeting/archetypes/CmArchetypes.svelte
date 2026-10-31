<script lang="ts">
  import { onMount } from 'svelte';
  import { loadSkills, type SkillData } from '@/lib/game-data/skills/skills';
  import type { Summary, TeamSearchResponse, Snapshot } from '../../hakuraku-types';
  import { cmGet, snapshotPath, number } from '../cm-data';
  import { parseQuery, hasRequirement } from '../../hakuraku-query';
  import Button from '@/components/controls/Button.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import { virtualScroll, type VirtualRange } from '@/lib/virtual-scroll';
  import Checkbox from '@/components/controls/Checkbox.svelte';
  import EmptyState from '@/components/feedback/EmptyState.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import CmArchetypeFilters from './filters/CmArchetypeFilters.svelte';
  import CmArchetypeField from './CmArchetypeField.svelte';
  import CmTeamCard from './teams/CmTeamCard.svelte';
  import CmTeamDetails from './teams/CmTeamDetails.svelte';
  import CmLobbyTray from './lobby/CmLobbyTray.svelte';
  import { CmLobby } from './lobby/cm-lobby.svelte';

  let {
    data,
    colors,
    snapshot,
    query = $bindable('')
  }: {
    data: Summary;
    snapshot?: Snapshot;
    colors: Record<number, string>;
    query?: string;
  } = $props();

  const lobby = new CmLobby(() => ({ data, snapshot }));

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
  let selected = $state('');
  let lobbyExpanded = $state(false);
  let skillCatalog = $state.raw<Map<number, SkillData>>();
  let skillCatalogError = $state('');

  const parsed = $derived.by(() => {
    try {
      return { slots: parseQuery(query, data.cards), error: '' };
    } catch (e) {
      return { slots: [], error: (e as Error).message };
    }
  });

  const activeFilters = $derived(parsed.slots.filter(hasRequirement).length);
  const total = $derived(
    mode === 'unique' ? (result?.totalOwners ?? 0) : (result?.totalTeams ?? 0)
  );

  $effect(() => {
    data.snapshotId;
    lobby.reset();
    lobbyExpanded = false;
  });

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

  onMount(() => {
    let active = true;

    void loadSkills()
      .then((catalog) => {
        if (active) skillCatalog = catalog;
      })
      .catch(() => {
        if (active) {
          skillCatalogError =
            'SP totals for older builds are unavailable. Reload the page to try again.';
        }
      });

    return () => {
      active = false;
    };
  });
</script>

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
              ? ' with ' + activeFilters + ' lineup filters'
              : ''}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          icon="users"
          ariaExpanded={lobbyExpanded}
          ariaControls="cm-lobby-teams"
          onclick={() => (lobbyExpanded = !lobbyExpanded)}
        >
          {lobby.count ? 'Review lobby' : 'Build a lobby'}
        </Button>
      </header>
      <div class="browser-toolbar">
        <Checkbox
          id="cm-show-build-stats"
          label="Build stats"
          bind:checked={showStats}
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
        />
      </div>
    </div>
    {#if skillCatalogError}
      <p
        class="ranking-help"
        role="status"
      >
        {skillCatalogError}
      </p>
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
      <EmptyState
        icon="search"
        title="No matching teams"
        description="Try another Uma or style, or clear the lineup filters."
      >
        {#snippet actions()}
          <Button
            variant="secondary"
            size="sm"
            onclick={() => (query = '')}
          >
            Clear filters
          </Button>
        {/snippet}
      </EmptyState>
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
            {skillCatalog}
            {lobby}
            onopen={() => (selected = team.id)}
          />
        {/each}
      </div>
      <p class="loaded-count">
        {number(result.teams.length)} of {number(total)} teams loaded{loading
          ? ', loading more…'
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
  {colors}
  bind:selected
  {lobby}
/>
<CmLobbyTray
  {lobby}
  {data}
  {colors}
  bind:expanded={lobbyExpanded}
/>

<style>
  @import './archetype-text.css';
  @import './cm-archetypes.css';
</style>
