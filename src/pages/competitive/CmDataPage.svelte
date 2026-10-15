<script lang="ts">
  import Spinner from '@/components/feedback/Spinner.svelte';
  import AppPage from '@/layouts/AppPage.svelte';
  import Tabs from '@/components/navigation/Tabs.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Checkbox from '@/components/controls/Checkbox.svelte';
  import Icon from '@/components/Icon.svelte';
  import type { TabItem } from '@/components/navigation/Tabs.svelte';
  import CmOverview from './champions-meeting/CmOverview.svelte';
  import CmIntroduction from './champions-meeting/CmIntroduction.svelte';
  import CmDatasetSummary from './champions-meeting/CmDatasetSummary.svelte';
  import CmStrategy from './champions-meeting/strategy/CmStrategy.svelte';
  import CmUma from './champions-meeting/uma/CmUma.svelte';
  import CmArchetypes from './champions-meeting/archetypes/CmArchetypes.svelte';
  import CmSkills from './champions-meeting/skills/CmSkills.svelte';
  import LobbyBuilder from './champions-meeting/lobby/LobbyBuilder.svelte';
  import { CmLobbyState } from './champions-meeting/lobby/cm-lobby.svelte';
  import type { Summary, Snapshot, Requirement } from './hakuraku-types';
  import {
    cmGet,
    loadCmSummary,
    styleColors,
    accessibleColors,
    type Manifest
  } from './champions-meeting/cm-data';
  import { queryText } from './hakuraku-query';

  const params = new URLSearchParams(location.search);
  const allowed = ['introduction', 'strategy', 'character', 'archetypes', 'skills', 'lobby'];
  const legacyView = params.get('view'),
    legacyTab =
      legacyView === 'umas'
        ? 'character'
        : legacyView === 'skills'
          ? 'skills'
          : legacyView === 'teams'
            ? 'archetypes'
            : legacyView === 'lobby'
              ? 'lobby'
              : 'strategy';

  let tab = $state(
    params.get('tab') === 'explore'
      ? legacyTab
      : allowed.includes(params.get('tab') ?? '')
        ? params.get('tab')!
        : 'introduction'
  );
  let snapshotId = $state(params.get('snapshot') ?? ''),
    snapshots = $state<Snapshot[]>([]),
    data = $state<Summary>(),
    error = $state(''),
    manifestError = $state(''),
    attempt = $state(0),
    colorblind = $state(false),
    query = $state(params.get('q') ?? '');
  let scope = $state(params.get('style') ?? 'all'),
    selectedUma = $state(''),
    umaView = $state(legacyView === 'umas' ? 'field' : 'overview');
  const lobbyState = new CmLobbyState(() => data);

  let visited = $state<string[]>([]);

  $effect(() => {
    if (!visited.includes(tab)) visited = [...visited, tab];
  });

  const snapshot = $derived(snapshots.find((s) => s.snapshotId === snapshotId));

  $effect(() => {
    if (snapshot && !snapshot.skillAnalysis && tab === 'skills') tab = 'strategy';
  });

  const colors = $derived(colorblind ? accessibleColors : styleColors);
  const tabs: TabItem[] = $derived([
    { id: 'introduction', label: 'Introduction', icon: 'info' },
    { id: 'strategy', label: 'Strategy Analysis', icon: 'chart' },
    { id: 'character', label: 'Uma Analysis', icon: 'users' },
    ...(snapshot?.skillAnalysis
      ? [{ id: 'skills', label: 'Skill Analysis', icon: 'star' as const }]
      : []),
    { id: 'archetypes', label: 'Archetype Analysis', icon: 'grid' },
    {
      id: 'lobby',
      label: 'Lobby Builder',
      icon: 'race',
      badge: lobbyState.lobby.length ? lobbyState.lobby.length + '/3' : undefined
    }
  ]);

  $effect(() => {
    attempt;
    manifestError = '';
    const controller = new AbortController();
    cmGet<Manifest>('/manifest', controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          if (!Array.isArray(value.snapshots) || !value.snapshots.length)
            throw new Error('No published snapshots are available.');
          snapshots = value.snapshots;
          if (!value.snapshots.some((s) => s.snapshotId === snapshotId))
            snapshotId = value.snapshots[0]!.snapshotId;
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) manifestError = e.message;
      });
    return () => controller.abort();
  });

  $effect(() => {
    const id = snapshot?.snapshotId;
    attempt;
    data = undefined;
    error = '';
    lobbyState.reset();
    visited = [];
    if (!id) return;
    const controller = new AbortController();
    loadCmSummary(id, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) data = value;
      })
      .catch((e) => {
        if (!controller.signal.aborted) error = e.message;
      });
    return () => controller.abort();
  });

  $effect(() => {
    const url = new URL(location.href);
    url.searchParams.set('tab', tab);
    url.searchParams.delete('step');
    url.searchParams.delete('view');
    if (snapshotId) url.searchParams.set('snapshot', snapshotId);
    if (scope !== 'all') url.searchParams.set('style', scope);
    else url.searchParams.delete('style');
    if (query) url.searchParams.set('q', query);
    else url.searchParams.delete('q');
    if (tab !== 'archetypes') url.searchParams.delete('team');
    history.replaceState(history.state, '', url);
  });

  function findTeams(slots: Requirement[]) {
    if (data) {
      query = queryText(slots, data.cards);
      tab = 'archetypes';
    }
  }

  function addCustomTeam() {
    if (lobbyState.addCustomTeam()) tab = 'lobby';
  }
</script>

<svelte:head>
  <title>CM Data · uma.moe</title>
  <meta
    name="description"
    content="Hakuraku Champions Meeting datasets, strategy and Uma analysis, captured teams, and lobby building in uma.moe."
  />
</svelte:head>
<AppPage
  routeId="cm-data"
  title="CM Data"
  description="Champions Meeting statistics · Hakuraku × uma.moe"
  width="wide"
>
  {#snippet actions()}
    {#if snapshot}
      <Button
        variant="secondary"
        size="sm"
        icon="veterans"
        href={'/simulator/race?team-search=1&cm-snapshot=' + encodeURIComponent(snapshotId)}
      >
        Find my best team
      </Button>
      <div class="dataset-picker">
        <SelectField
          id="cm-snapshot"
          label="Dataset"
          options={snapshots.map((s) => ({ value: s.snapshotId, label: s.label }))}
          bind:value={snapshotId}
        />
      </div>
    {/if}
  {/snippet}
  <div class="cm-workspace">
    {#if snapshot}
      <CmDatasetSummary {snapshot} />
    {/if}
    {#if manifestError || error}
      <div
        class="message"
        role="alert"
      >
        <p>{manifestError || error}</p>
        <Button
          variant="secondary"
          onclick={() => attempt++}
        >
          Retry data
        </Button>
      </div>
    {/if}
    {#if !snapshots.length && !manifestError}
      <Spinner
        size={48}
        centered
        minHeight="clamp(320px, 60dvh, 700px)"
        label="Loading Hakuraku datasets…"
      />
    {/if}
    {#if data && snapshot}
      <div class="navigation">
        <Tabs
          compact
          items={tabs}
          bind:value={tab}
          label="Champions Meeting views"
          controls="cm-panel"
          variant="pills"
        />
        <details class="display-settings">
          <summary>
            <Icon
              name="tune"
              size={15}
            /> Display
          </summary>
          <div>
            <Checkbox
              id="cm-palette"
              label="Colorblind palette"
              bind:checked={colorblind}
            />
            <p>Changes running-style colours throughout the analysis.</p>
          </div>
        </details>
      </div>
      <div
        id="cm-panel"
        class="stack"
        role="tabpanel"
        aria-label={tabs.find((t) => t.id === tab)?.label}
      >
        {#if tab === 'introduction'}
          <CmOverview
            {data}
            {colors}
            onstyle={(value) => {
              scope = value;
              tab = 'strategy';
            }}
            onuma={(key) => {
              selectedUma = key;
              umaView = 'overview';
              tab = 'character';
            }}
            onteams={findTeams}
            onview={(value) => (tab = value)}
          />
          <CmIntroduction onbrowse={() => (tab = 'archetypes')} />
        {/if}
        {#if visited.includes('strategy')}
          <div hidden={tab !== 'strategy'}>
            <CmStrategy
              {data}
              {colors}
              {scope}
              onstyle={(value) => (scope = value)}
              onteams={findTeams}
            />
          </div>
        {/if}
        {#if visited.includes('character')}
          <div hidden={tab !== 'character'}>
            <CmUma
              {data}
              {colors}
              {colorblind}
              bind:selected={selectedUma}
              bind:view={umaView}
              onteams={findTeams}
            />
          </div>
        {/if}
        {#if visited.includes('skills') && snapshot.skillAnalysis}
          <div hidden={tab !== 'skills'}>
            <CmSkills {snapshot} />
          </div>
        {/if}
        {#if visited.includes('archetypes')}
          <div hidden={tab !== 'archetypes'}>
            <CmArchetypes
              {data}
              {colors}
              {snapshot}
              bind:query
              lobby={lobbyState.lobby}
              teamDraft={lobbyState.teamDraft}
              pendingTeams={lobbyState.pendingTeams}
              pendingRunners={lobbyState.pendingRunners}
              teamError={lobbyState.teamError}
              onrunner={lobbyState.toggleRunner}
              onbuildteam={addCustomTeam}
              onremoverunner={lobbyState.removeRunner}
              onclearteam={() => (lobbyState.teamDraft = [])}
              ontoggle={lobbyState.toggleTeam}
              onlobby={() => (tab = 'lobby')}
            />
          </div>
        {/if}
        {#if visited.includes('lobby')}
          <div hidden={tab !== 'lobby'}>
            <LobbyBuilder
              {data}
              {colors}
              {snapshot}
              teams={lobbyState.lobby}
              bind:draft={lobbyState.draft}
              onmove={lobbyState.moveRunner}
              onbrowse={() => (tab = 'archetypes')}
              onremove={lobbyState.removeTeam}
              onclear={lobbyState.clear}
            />
          </div>
        {/if}
      </div>
      <footer class="data-footer">
        <span>
          Teams seen {snapshot.meta.capturedThrough
            ? 'through ' + snapshot.meta.capturedThrough
            : snapshot.meta.window} · Equally weighted player appearances
        </span>
      </footer>
    {:else if snapshot && !error}
      <Spinner
        size={48}
        centered
        minHeight="clamp(320px, 60dvh, 700px)"
        label="Loading snapshot…"
      />
    {/if}
  </div>
</AppPage>

<style>
  @import './cm-data-page.css';
</style>
