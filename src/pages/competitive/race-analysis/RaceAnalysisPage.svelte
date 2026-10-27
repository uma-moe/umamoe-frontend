<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import AppPage from '@/layouts/AppPage.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import {
    readRaceCaptureFile,
    type ParsedRaceCapture
  } from '@/lib/race/capture/race-capture-parser';
  import { groupMultiRaceCaptures } from '@/lib/race/multi-race-analysis';
  import { resimulateRace } from '@/services/race/race-resimulation';
  import { loadCharacters } from '@/lib/game-data/characters';
  import { loadSkills } from '@/lib/game-data/skills/skills';
  import { runnerName } from './race-character-display';
  import { demoSkills, makeDemoRaces } from '@/pages/competitive/demo-races';
  import RaceReplay from './replay/RaceReplay.svelte';
  import RaceStart from './start/RaceStart.svelte';
  import RaceUploadDialog from './RaceUploadDialog.svelte';
  import RaceSourceBar from './RaceSourceBar.svelte';
  import RaceSessionReport from './RaceSessionReport.svelte';
  import { downloadDetailedReplay, raceChoices } from './race-session';
  import { missingSimulationInput, type DetailedSimulation } from './detailed-simulation';
  import { loadReplayCourses, resolveReplayCourses, type CourseData } from './replay/replay-course';

  let courses = $state<CourseData>();

  onMount(() => {
    void loadReplayCourses()
      .then((value) => (courses = value))
      .catch(() => {});
  });

  let captures = $state.raw<ParsedRaceCapture[]>([]),
    errors = $state<string[]>([]),
    loading = $state(false),
    demo = $state(false);

  let selected = $state('0'),
    group = $state('all'),
    uploadsOpen = $state(false),
    reportTarget = $state<HTMLElement>();

  let replayFocus = $state<{ runner: number; time?: number }>(),
    sessionBusy = $state(false),
    simulationErrors = $state<string[]>([]);

  // Keyed by each capture's recorded input, which a resimulated copy keeps.
  let simulating = $state.raw<ParsedRaceCapture['original']>(),
    simulationFailures = $state.raw(new Map<ParsedRaceCapture['original'], string>());

  let sessionController: AbortController | undefined;

  onDestroy(() => sessionController?.abort());

  let skillNames = $state.raw(new Map<number, string>());

  onMount(() => {
    void loadSkills()
      .then(
        (catalog) => (skillNames = new Map([...catalog].map(([id, skill]) => [id, skill.name])))
      )
      .catch(() => {});
  });

  const resolvedCaptures: ParsedRaceCapture[] = $derived(
    captures.map((capture) => ({
      ...capture,
      raceDistance: courses?.courses[capture.courseId ?? '']?.distance ?? capture.raceDistance
    }))
  );

  const groups = $derived(groupMultiRaceCaptures(resolvedCaptures));
  const filtered = $derived(
    group === 'all' ? resolvedCaptures : (groups.find((item) => item.key === group)?.captures ?? [])
  );

  const active = $derived(captures[Number(selected)]);
  const choices = $derived(raceChoices(captures));

  const resimulable = $derived(captures.filter((capture) => capture.original));
  const sessionProgress = $derived.by(() => {
    const finished = resimulable.filter(
      (capture) => capture.detailed || simulationFailures.has(capture.original)
    ).length;

    return Math.min(finished + 1, resimulable.length) + ' / ' + resimulable.length;
  });

  const activeSimulation = $derived.by((): DetailedSimulation => {
    if (!active || active.detailed) return { status: 'ready' };

    if (demo)
      return {
        status: 'unavailable',
        reason: 'Demo races are synthetic, so they have no detailed simulation.'
      };

    if (!active.original) return { status: 'unavailable', reason: missingSimulationInput };

    const failure = simulationFailures.get(active.original);
    if (failure !== undefined) return { status: 'failed', reason: failure };

    return { status: simulating === active.original ? 'running' : 'queued' };
  });

  async function examples(count: number) {
    uploadsOpen = false;
    captures = makeDemoRaces(count);
    demo = true;
    selected = '0';
    group = 'all';
    errors = [];
    await tick();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  async function receive(files: FileList) {
    loading = true;
    errors = [];
    const loaded: ParsedRaceCapture[] = [];
    // Sequential decoding keeps memory bounded when importing a whole session.
    for (const file of Array.from(files)) {
      try {
        if (file.size > 50 * 1024 * 1024) throw new Error('File exceeds the 50 MB limit.');
        loaded.push(await readRaceCaptureFile(file));
      } catch (error) {
        errors.push(
          `${file.name}: ${error instanceof Error ? error.message : 'Unable to read capture.'}`
        );
      }
    }

    if (loaded.length) {
      await resolveReplayCourses(loaded);
      try {
        const characters = await loadCharacters();
        for (const capture of loaded)
          for (const runner of capture.runners) runner.name = runnerName(runner, characters);
      } catch {
        /* IDs remain usable offline. */
      }

      const replace = demo || !captures.length;
      uploadsOpen = false;
      captures = replace ? loaded : [...captures, ...loaded];
      demo = false;
      group = 'all';
      if (replace) {
        simulationErrors = [];
        simulationFailures = new Map();
        selected = '0';
        await tick();
        window.scrollTo({ top: 0, behavior: 'instant' });
      }
    }

    loading = false;
    if (loaded.length) void resimulateSession();
  }

  function clear() {
    sessionController?.abort();
    captures = [];
    errors = [];
    simulationErrors = [];
    simulationFailures = new Map();
    demo = false;
    uploadsOpen = false;
    selected = '0';
    group = 'all';
    replayFocus = undefined;
  }

  function remove() {
    replayFocus = undefined;
    const index = Number(selected);
    captures = captures.filter((_, i) => i !== index);
    selected = String(Math.min(index, Math.max(0, captures.length - 1)));
    group = 'all';
    if (!captures.length) {
      sessionController?.abort();
      simulationErrors = [];
      uploadsOpen = false;
      demo = false;
    }
  }

  function scrollReport(section: string) {
    reportTarget
      ?.querySelector<HTMLElement>('[data-report-section="' + section + '"]')
      ?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }

  async function watchRace(index: number, runner?: number, time?: number) {
    replayFocus = undefined;
    selected = String(resolvedCaptures.indexOf(filtered[index]!));
    await tick();
    replayFocus = runner === undefined ? undefined : { runner, time };

    await tick();
    scrollReport('replay');
  }

  function keepSimulation(result: ParsedRaceCapture) {
    captures = captures.map((capture) => (capture.original === result.original ? result : capture));
  }

  function download() {
    if (!active?.detailed) return;
    downloadDetailedReplay(active);
  }

  function awaitsSimulation(capture: ParsedRaceCapture) {
    return (
      Boolean(capture.original) && !capture.detailed && !simulationFailures.has(capture.original)
    );
  }

  /** The replay on screen goes first, so whichever race the reader opens gets its detailed simulation next. */
  function nextSimulation() {
    return active && awaitsSimulation(active) ? active : captures.find(awaitsSimulation);
  }

  /** Resimulates every capture still waiting, one at a time; races added meanwhile join the queue. */
  async function resimulateSession() {
    if (sessionBusy) return;

    const controller = new AbortController();
    sessionController = controller;
    sessionBusy = true;

    try {
      for (let input = nextSimulation(); input; input = nextSimulation()) {
        if (controller.signal.aborted) break;

        simulating = input.original;
        try {
          const result = await resimulateRace(input, input.courseId ?? 0, {
            signal: controller.signal
          });

          if (!controller.signal.aborted) keepSimulation(result);
        } catch (error) {
          if (controller.signal.aborted) break;

          const reason = error instanceof Error ? error.message : 'Resimulation failed.';
          simulationFailures = new Map(simulationFailures).set(input.original, reason);
          simulationErrors = [...simulationErrors, input.fileName + ': ' + reason];
        }
      }
    } finally {
      if (sessionController === controller) {
        sessionBusy = false;
        simulating = undefined;
      }
    }
  }

  function retrySimulation() {
    if (!active?.original) return;

    const failures = new Map(simulationFailures);
    failures.delete(active.original);
    simulationFailures = failures;
    void resimulateSession();
  }
</script>

<svelte:head>
  <title>Race Analysis · uma.moe</title>
  <meta
    name="description"
    content="Upload one or multiple race captures for local replay and race analysis."
  />
</svelte:head>
<div
  class="race-page"
  class:loaded={captures.length > 0}
>
  <AppPage
    routeId="race-analysis"
    title="Race Analysis"
    description={captures.length ? undefined : 'Follow the race. Understand the result.'}
    width="wide"
  >
    {#snippet actions()}
      {#if captures.length}
        <div class="file-actions">
          {#if active?.detailed}
            <Button
              variant="secondary"
              size="sm"
              icon="download"
              onclick={download}
            >
              Export detailed replay
            </Button>
          {/if}<Button
            variant="secondary"
            size="sm"
            icon="upload"
            disabled={loading || sessionBusy}
            onclick={() => (uploadsOpen = true)}
          >
            Add race files
          </Button>{#if captures.length > 1}
            <Button
              variant="secondary"
              size="sm"
              icon="trash"
              disabled={loading}
              onclick={clear}
            >
              Clear races
            </Button>
          {/if}
        </div>
      {/if}
    {/snippet}
    <div class="race-workspace">
      {#if errors.length}
        <Banner
          title="Some files could not be imported"
          tone="danger"
          reportable={false}
        >
          <ul>
            {#each errors as error}
              <li>{error}</li>
            {/each}
          </ul>
        </Banner>
      {/if}
      {#if simulationErrors.length}
        <Banner
          title="Resimulation failed; recorded replays were kept"
          tone="warning"
          reportable={false}
        >
          <ul>
            {#each simulationErrors as error}
              <li>{error}</li>
            {/each}
          </ul>
        </Banner>
      {/if}
      {#if captures.length}
        <RaceUploadDialog
          bind:open={uploadsOpen}
          {loading}
          busy={sessionBusy}
          onfiles={receive}
          onexample={examples}
        />
      {:else}
        <RaceStart
          loading={loading || sessionBusy}
          {courses}
          onfiles={receive}
          onexample={examples}
        />
      {/if}
      {#if captures.length && active}
        <div
          class="analysis-workspace"
          aria-label="Race analysis report"
          bind:this={reportTarget}
        >
          <RaceReplay
            capture={active}
            skillNames={demo ? demoSkills : skillNames}
            hasSession={captures.length > 1}
            focus={replayFocus}
            simulation={activeSimulation}
            onretrysimulation={retrySimulation}
          >
            {#snippet headerActions()}
              <RaceSourceBar
                count={captures.length}
                busy={sessionBusy}
                progress={sessionProgress}
                {demo}
                {loading}
                {choices}
                {selected}
                fileName={active.fileName}
                onselect={(value) => {
                  replayFocus = undefined;
                  selected = value;
                }}
                onremove={remove}
              />
            {/snippet}
            {#snippet sessionReport()}
              {#if captures.length > 1}
                <RaceSessionReport
                  total={captures.length}
                  {groups}
                  {filtered}
                  bind:group
                  {courses}
                  skillNames={demo ? demoSkills : skillNames}
                  pending={sessionBusy}
                  onreplay={watchRace}
                />
              {/if}
            {/snippet}
          </RaceReplay>
        </div>
      {/if}
    </div>
  </AppPage>
</div>

<style>
  @import './race-analysis-page.css';
</style>
