<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import AppPage from '@/layouts/AppPage.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import { readRaceCaptureFile, type ParsedRaceCapture } from '@/lib/race/race-capture-parser';
  import { groupMultiRaceCaptures } from '@/lib/race/multi-race-analysis';
  import { resimulateRace } from '@/services/race-resimulation';
  import { loadCharacterCatalog } from '@/lib/catalog/character-catalog';
  import { loadSkillCatalog } from '@/lib/catalog/skill-catalog';
  import { runnerName } from './race-character-display';
  import { demoSkills, makeDemoRaces } from '@/pages/competitive/demo-races';
  import RaceReplay from './replay/RaceReplay.svelte';
  import RaceStart from './RaceStart.svelte';
  import RaceUploadDialog from './RaceUploadDialog.svelte';
  import RaceSourceBar from './RaceSourceBar.svelte';
  import RaceSessionReport from './RaceSessionReport.svelte';
  import { downloadDetailedReplay, raceChoices } from './race-session';
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
    sessionProgress = $state(''),
    simulationErrors = $state<string[]>([]);

  let sessionController: AbortController | undefined;

  onDestroy(() => sessionController?.abort());

  let skillNames = $state.raw(new Map<number, string>());

  onMount(() => {
    void loadSkillCatalog()
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
        const characters = await loadCharacterCatalog();
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
      if (replace) simulationErrors = [];
      if (replace) {
        selected = '0';
        await tick();
        window.scrollTo({ top: 0, behavior: 'instant' });
      }
    }
    loading = false;
    if (loaded.length) void resimulateSession(loaded);
  }

  function clear() {
    sessionController?.abort();
    captures = [];
    errors = [];
    simulationErrors = [];
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

  async function resimulateSession(inputs: ParsedRaceCapture[]) {
    if (sessionBusy) return;
    const pending = inputs.filter((capture) => capture.original && !capture.detailed),
      controller = new AbortController();
    if (!pending.length) return;
    sessionController = controller;
    sessionBusy = true;
    try {
      for (const [index, input] of pending.entries()) {
        if (controller.signal.aborted) break;
        if (!captures.some((c) => c.original === input.original)) continue;
        sessionProgress = index + 1 + ' / ' + pending.length;
        try {
          const result = await resimulateRace(input, input.courseId ?? 0, {
            signal: controller.signal
          });
          if (!controller.signal.aborted && captures.some((c) => c.original === input.original))
            keepSimulation(result);
        } catch (error) {
          if (!controller.signal.aborted)
            simulationErrors = [
              ...simulationErrors,
              input.fileName +
                ': ' +
                (error instanceof Error ? error.message : 'Resimulation failed.')
            ];
        }
      }
    } finally {
      if (sessionController === controller) {
        sessionBusy = false;
        sessionProgress = '';
      }
    }
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
