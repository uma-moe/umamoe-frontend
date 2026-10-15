<script lang="ts">
  import type { ParsedRaceCapture, RaceRunner } from '@/lib/race/race-capture-parser';
  import { analyzeMultiRace } from '@/lib/race/multi-race-analysis';
  import Button from '@/components/controls/Button.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import RunnerBuildDetails from '../runners/RunnerBuildDetails.svelte';
  import RunnerBuildGroup from '../runners/RunnerBuildGroup.svelte';
  import SessionDiagnostics from './diagnostics/SessionDiagnostics.svelte';
  import SessionOverview from './statistics/SessionOverview.svelte';
  import SessionStrategies from './statistics/SessionStrategies.svelte';
  import SessionUmas from './statistics/SessionUmas.svelte';
  import SessionTeams from './statistics/SessionTeams.svelte';
  import SessionSkills from './statistics/SessionSkills.svelte';
  import SessionHp from './statistics/SessionHp.svelte';
  import { styleColors, teamBuilds } from '../analysis-view';

  let {
    captures,
    skillNames = new Map<number, string>(),
    active = true,
    pending = false,
    onreplay,
    onlobby
  }: {
    captures: ParsedRaceCapture[];
    skillNames?: Map<number, string>;
    active?: boolean;
    pending?: boolean;
    onreplay?: (index: number, runner?: number, time?: number) => void;
    onlobby?: (members: RaceRunner[]) => void;
  } = $props();

  const analysis = $derived(analyzeMultiRace(captures));
  const entries = $derived(
    captures.flatMap((c, race) => c.runners.map((runner) => ({ runner, race })))
  );
  const winners = $derived(entries.filter((e) => e.runner.result?.finishOrder === 1));
  const teams = $derived(teamBuilds(captures));

  let teamSearch = $state(''),
    style = $state('all'),
    uma = $state(''),
    detail = $state<RaceRunner[]>(),
    detailTitle = $state(''),
    selectedRace = $state(0);

  const instanceId = $props.id();

  const sessionSections = [
    { id: 'overview', title: 'Session overview' },
    { id: 'strategies', title: 'Strategy analysis' },
    { id: 'characters', title: 'Uma analysis' },
    { id: 'teams', title: 'Teams & builds' },
    { id: 'skills', title: 'Skill analysis' },
    { id: 'hp', title: 'HP & last spurt' },
    { id: 'diagnostics', title: 'Detailed analysis' }
  ];

  function jump(section: string) {
    document
      .getElementById(instanceId + '-' + section)
      ?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }

  $effect(() => {
    captures;
    detail = undefined;
  });

  function inspect(members: RaceRunner[], title: string, race: number) {
    detail = members;
    detailTitle = title;
    selectedRace = race;
  }

  function findTeams(card: string, selectedStyle = 'all') {
    uma = card;
    style = selectedStyle;
    teamSearch = '';
    jump('teams');
  }
</script>

<div
  class="analysis"
  aria-label="Session analysis"
>
  <nav
    class="session-navigation"
    aria-label="Jump to session section"
  >
    {#each sessionSections as section}
      <Button
        variant="ghost"
        size="sm"
        onclick={() => jump(section.id)}
      >
        {section.title}
      </Button>
    {/each}
  </nav>
  <div class="session-sections">
    {#if active}
      <dl
        class="session-counts"
        aria-label="Session totals"
      >
        {#each [{ label: 'Races', value: captures.length }, { label: 'Runner entries', value: entries.length }, { label: 'Umas', value: analysis.characters.length }, { label: 'Team builds', value: teams.length }, { label: 'Skill activations', value: analysis.skills.reduce((n, s) => n + s.activations, 0) }] as metric}
          <div>
            <dt>{metric.label}</dt>
            <dd>{metric.value.toLocaleString()}</dd>
          </div>
        {/each}
      </dl>
    {/if}
    <section
      class="analysis-section"
      id={instanceId + '-overview'}
    >
      <header class="analysis-heading">
        <h2>Session overview</h2>
        <p>Results and field distribution across the selected races.</p>
      </header>
      <div class="section-body">
        <SessionOverview
          {captures}
          {entries}
          {winners}
          {active}
          oninspect={inspect}
        />
      </div>
    </section>
    <section
      class="analysis-section"
      id={instanceId + '-strategies'}
    >
      <header class="analysis-heading">
        <h2>Strategy analysis</h2>
        <p>See which running styles and team compositions win.</p>
      </header>
      <div class="section-body">
        <SessionStrategies
          {analysis}
          {captures}
          entryCount={entries.length}
          {teams}
          {active}
          onfind={findTeams}
        />
      </div>
    </section>
    <section
      class="analysis-section"
      id={instanceId + '-characters'}
    >
      <header class="analysis-heading">
        <h2>Uma analysis</h2>
        <p>Compare field share, win rates and winning partners.</p>
      </header>
      <div class="section-body">
        <SessionUmas
          {analysis}
          {entries}
          {active}
          bind:uma
          onfind={findTeams}
        />
      </div>
    </section>
    <section
      class="analysis-section"
      id={instanceId + '-teams'}
    >
      <header class="analysis-heading">
        <h2>Teams & builds</h2>
        <p>Find captured builds and return to their race.</p>
      </header>
      <div class="section-body">
        <SessionTeams
          {captures}
          {teams}
          {active}
          bind:uma
          bind:style
          bind:teamSearch
          oninspect={inspect}
          {onlobby}
        />
      </div>
    </section>
    <section
      class="analysis-section"
      id={instanceId + '-skills'}
    >
      <header class="analysis-heading">
        <h2>Skill analysis</h2>
        <p>Learned skills, activation conditions and active time.</p>
      </header>
      <div class="section-body">
        <SessionSkills
          {analysis}
          {skillNames}
          {active}
        />
      </div>
    </section>
    <section
      class="analysis-section"
      id={instanceId + '-hp'}
    >
      <header class="analysis-heading">
        <h2>HP & last spurt</h2>
        <p>Check remaining HP and last-spurt timing for your runners.</p>
      </header>
      <div class="section-body">
        <SessionHp
          {analysis}
          {active}
          onuma={(key) => {
            uma = key;
            jump('characters');
          }}
        />
      </div>
    </section>
    <section
      class="analysis-section"
      id={instanceId + '-diagnostics'}
    >
      <header class="analysis-heading">
        <h2>Detailed analysis</h2>
        <p>Compare simulation decisions across races and inspect each runner.</p>
      </header>
      {#if active}
        <SessionDiagnostics
          {captures}
          {skillNames}
          {onreplay}
          {pending}
          onbuild={(runner, race) => inspect([runner], runner.name, race)}
        />
      {/if}
    </section>
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
        raceContext={{ distance: captures[selectedRace]?.raceDistance }}
      />
    {/each}
  </RunnerBuildGroup>{#snippet actions()}
    {#if onreplay}
      <Button
        variant="secondary"
        size="sm"
        icon="race"
        onclick={() => {
          const runner = detail?.length === 1 ? detail[0]?.index : undefined;
          detail = undefined;
          onreplay?.(selectedRace, runner);
        }}
      >
        View race replay
      </Button>
    {/if}{#if onlobby && detail?.length === 3}
      <Button
        size="sm"
        onclick={() => {
          onlobby?.(detail!);
          detail = undefined;
        }}
      >
        Add team to lobby
      </Button>
    {/if}
  {/snippet}
</Dialog>

<style>
  @import './statistics/session-counts.css';
  @import './race-statistics.css';
</style>
