<script lang="ts">
  import { tick } from 'svelte';
  import type { ParsedRaceCapture, RaceRunner } from '@/lib/race/capture/race-capture-parser';
  import { analyzeMultiRace } from '@/lib/race/multi-race-analysis';
  import Button from '@/components/controls/Button.svelte';
  import Tabs, { type TabItem } from '@/components/navigation/Tabs.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import RunnerBuildDetails from '../runners/RunnerBuildDetails.svelte';
  import RunnerBuildGroup from '../runners/RunnerBuildGroup.svelte';
  import SessionOverview from './overview/SessionOverview.svelte';
  import SessionStrategy from './strategy/SessionStrategy.svelte';
  import SessionUmas from './umas/SessionUmas.svelte';
  import SessionTeams from './teams/SessionTeams.svelte';
  import SessionSkills from './skills/SessionSkills.svelte';
  import SessionRunners from './diagnostics/SessionRunners.svelte';
  import { styleColors, teamBuilds } from '../analysis-view';
  import { styleCompositions, type SessionView, type TeamFilter } from './session-statistics';

  let {
    captures,
    skillNames = new Map<number, string>(),
    pending = false,
    onreplay
  }: {
    captures: ParsedRaceCapture[];
    skillNames?: Map<number, string>;
    pending?: boolean;
    onreplay?: (index: number, runner?: number, time?: number) => void;
  } = $props();

  const views: (TabItem & { id: SessionView })[] = [
    { id: 'overview', label: 'Overview', icon: 'grid' },
    { id: 'strategy', label: 'Strategy', icon: 'chart' },
    { id: 'umas', label: 'Umas', icon: 'users' },
    { id: 'teams', label: 'Teams', icon: 'community' },
    { id: 'skills', label: 'Skills', icon: 'star' },
    { id: 'runners', label: 'Runners', icon: 'race' }
  ];

  const sessionId = $props.id();
  const panelId = sessionId + '-panel';

  let view = $state<SessionView>('overview'),
    visited = $state<SessionView[]>(['overview']),
    navigation = $state<HTMLElement>();

  let selectedUma = $state(''),
    teamFilter = $state<TeamFilter>({});

  let detail = $state<RaceRunner[]>(),
    detailTitle = $state(''),
    detailRace = $state(0);

  const analysis = $derived(analyzeMultiRace(captures));
  const entries = $derived(
    captures.flatMap((capture, race) => capture.runners.map((runner) => ({ runner, race })))
  );

  const teams = $derived(teamBuilds(captures));
  const compositions = $derived(styleCompositions(teams));
  const resimulated = $derived(captures.filter((capture) => capture.detailed).length);
  // Demo races and captures without race input can never be resimulated, so a 0 / n count would only look stalled.
  const showsResimulation = $derived(
    captures.some((capture) => capture.detailed || capture.original !== undefined)
  );

  $effect(() => {
    if (!visited.includes(view)) visited = [...visited, view];
  });

  $effect(() => {
    captures;
    detail = undefined;
  });

  /** Opens a view from a link inside another one, keeping the tabs in sight when the reader had scrolled past them. */
  async function show(next: SessionView) {
    view = next;
    await tick();
    if ((navigation?.getBoundingClientRect().top ?? 0) < 0)
      navigation?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }

  function findTeams(filter: TeamFilter) {
    teamFilter = filter;
    void show('teams');
  }

  function inspectUma(key: string) {
    selectedUma = key;
    void show('umas');
  }

  function inspect(members: RaceRunner[], title: string, race: number) {
    detail = members;
    detailTitle = title;
    detailRace = race;
  }

  function replayInspected() {
    const runner = detail?.length === 1 ? detail[0]?.index : undefined;
    detail = undefined;
    onreplay?.(detailRace, runner);
  }
</script>

<div class="session-analysis">
  <div
    class="session-navigation"
    bind:this={navigation}
  >
    <Tabs
      compact
      variant="pills"
      label="Session analysis views"
      items={views}
      controls={panelId}
      bind:value={() => view, (next) => (view = next as SessionView)}
    />
    <dl
      class="session-totals"
      aria-label="Session totals"
    >
      <div>
        <dt>races</dt>
        <dd>{captures.length.toLocaleString()}</dd>
      </div>
      <div>
        <dt>runner entries</dt>
        <dd>{entries.length.toLocaleString()}</dd>
      </div>
      <div>
        <dt>Umas</dt>
        <dd>{analysis.characters.length.toLocaleString()}</dd>
      </div>
      <div>
        <dt>team builds</dt>
        <dd>{teams.length.toLocaleString()}</dd>
      </div>
      {#if showsResimulation}
        <div class="resimulated">
          <dt>resimulated</dt>
          <dd>
            {resimulated}
            <small>/ {captures.length}</small>
            {#if pending}
              <span
                class="pending"
                role="status"
              >
                Running
              </span>
            {/if}
          </dd>
          {#if pending}
            <span
              class="simulation-progress"
              aria-hidden="true"
            >
              <i style:width={(resimulated / Math.max(1, captures.length)) * 100 + '%'}></i>
            </span>
          {/if}
        </div>
      {/if}
    </dl>
  </div>
  <div
    id={panelId}
    class="session-panels"
    role="tabpanel"
    aria-label={views.find((item) => item.id === view)?.label}
  >
    {#if visited.includes('overview')}
      <div hidden={view !== 'overview'}>
        <SessionOverview
          {analysis}
          {captures}
          {entries}
          {compositions}
          onview={show}
          onteams={findTeams}
          onuma={inspectUma}
          oninspect={inspect}
          {onreplay}
        />
      </div>
    {/if}
    {#if visited.includes('strategy')}
      <div hidden={view !== 'strategy'}>
        <SessionStrategy
          {analysis}
          {captures}
          {compositions}
          onteams={findTeams}
        />
      </div>
    {/if}
    {#if visited.includes('umas')}
      <div hidden={view !== 'umas'}>
        <SessionUmas
          {analysis}
          {captures}
          {entries}
          bind:selected={selectedUma}
          onteams={findTeams}
        />
      </div>
    {/if}
    {#if visited.includes('teams')}
      <div hidden={view !== 'teams'}>
        <SessionTeams
          {teams}
          {analysis}
          {captures}
          bind:filter={teamFilter}
          {skillNames}
          {onreplay}
        />
      </div>
    {/if}
    {#if visited.includes('skills')}
      <div hidden={view !== 'skills'}>
        <SessionSkills
          {analysis}
          {skillNames}
          raceInstanceId={captures[0]?.raceInstanceId}
        />
      </div>
    {/if}
    {#if visited.includes('runners')}
      <div hidden={view !== 'runners'}>
        <SessionRunners
          {captures}
          {skillNames}
          {pending}
          onuma={inspectUma}
          {onreplay}
          onbuild={(runner, race) => inspect([runner], runner.name, race)}
        />
      </div>
    {/if}
  </div>
</div>
<Dialog
  open={Boolean(detail)}
  title={detailTitle}
  maxWidth={detail?.length === 1 ? '820px' : '1120px'}
  onclose={() => (detail = undefined)}
>
  <RunnerBuildGroup single={detail?.length === 1}>
    {#each detail ?? [] as runner}
      <RunnerBuildDetails
        {runner}
        {skillNames}
        color={styleColors[runner.result?.runningStyle ?? 0]}
        raceContext={{ distance: captures[detailRace]?.raceDistance }}
      />
    {/each}
  </RunnerBuildGroup>{#snippet actions()}
    {#if onreplay}
      <Button
        variant="secondary"
        size="sm"
        icon="race"
        onclick={replayInspected}
      >
        View race replay
      </Button>
    {/if}
  {/snippet}
</Dialog>

<style>
  @import './session-analysis.css';
</style>
