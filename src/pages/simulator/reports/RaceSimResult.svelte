<script lang="ts">
  import { onDestroy, untrack, tick, type Component } from 'svelte';
  import Button from '@/components/controls/Button.svelte';
  import SimulatorFieldMatchups from './outcomes/SimulatorFieldMatchups.svelte';
  import SimulatorCourseCharts from './telemetry/SimulatorCourseCharts.svelte';
  import SimulatorBehaviour from './telemetry/SimulatorBehaviour.svelte';
  import SimulatorSkillActivation from './skills/SimulatorSkillActivation.svelte';
  import SimulatorBuildComparisons from './outcomes/SimulatorBuildComparisons.svelte';
  import SimulatorCourseProfile from '../courses/SimulatorCourseProfile.svelte';
  import SimulatorRunComparison from './outcomes/SimulatorRunComparison.svelte';
  import SimulatorSkillImpact from './skills/SimulatorSkillImpact.svelte';
  import Tabs, { type TabItem } from '@/components/navigation/Tabs.svelte';
  import Disclosure from '@/components/overlays/Disclosure.svelte';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import SimulatorMeanReplay from './replay/SimulatorMeanReplay.svelte';
  import SimulatorRaceBrowser from './replay/SimulatorRaceBrowser.svelte';
  import SimulatorFieldOverview from './outcomes/SimulatorFieldOverview.svelte';
  import SimulatorRunnerFace from './SimulatorRunnerFace.svelte';
  import SimulatorStamina from './outcomes/SimulatorStamina.svelte';
  import { SkillImpactStore } from './skills/skill-impact.svelte';
  import type { MarginUnit } from './simulation-comparison';
  import {
    simulatorResults,
    simulatorReplayCapture,
    simulatorSampleReplay
  } from '../simulator-results';
  import { runnerColor, reportNumber as n } from './simulation-report';
  import { simulatorRepository, type MonteCarloResult } from '../simulator-repository';
  import type { CourseCatalogEntry } from '@/lib/catalog/course-catalog';
  import type { SimulatorUma } from '../simulator-uma';
  import type { MonteCarloInput } from '../requests/race-sim-request';
  import { applyResimulation, type ParsedRaceCapture } from '@/lib/race/race-capture-parser';
  import './simulation-report.css';
  let {
    result,
    input,
    raw = '',
    umas,
    course,
    track = {},
    busy = false,
    suspended = false
  }: {
    result?: MonteCarloResult;
    input?: MonteCarloInput;
    raw?: string;
    umas: SimulatorUma[];
    course?: CourseCatalogEntry;
    track?: ParsedRaceCapture['track'];
    busy?: boolean;
    suspended?: boolean;
  } = $props();
  const metrics = $derived(result ? simulatorResults(result, umas.length) : []);
  let selected = $state<number[]>(untrack(() => metrics.slice(0, 2).map((r) => r.source))),
    inspected = $state(untrack(() => metrics[0]?.source ?? 0));
  let notice = $state(''),
    sample = $state(0),
    sampleOpen = $state(false),
    sampleLoading = $state(false),
    sampleError = $state(''),
    capture = $state.raw<ParsedRaceCapture>();
  let Replay = $state.raw<
    Component<{ capture: ParsedRaceCapture; suspended?: boolean }> | undefined
  >();
  let sampleRequest: AbortController | undefined;
  onDestroy(() => sampleRequest?.abort());
  function choose(source: number) {
    notice = '';
    if (selected.includes(source)) {
      if (selected.length > 1) {
        selected = selected.filter((s) => s !== source);
        if (inspected === source) inspected = selected[0]!;
      }
      return;
    }
    if (selected.length === 4) {
      notice = 'Compare up to four runners. Deselect one to add another.';
      return;
    }
    selected = [...selected, source];
    inspected = source;
  }

  /** Every comparison is measured against the first selected runner. */
  function makeReference(source: number) {
    notice = '';
    selected = [source, ...selected.filter((s) => s !== source)].slice(0, 4);
    inspected = source;
  }
  /** Picked compares up to four runners in depth; whole field puts every runner on the same charts. */
  let scope = $state<'picked' | 'field'>('picked'),
    highlight = $state<number>();
  /** Margins and gains always show lengths and seconds; this picks which one leads. */
  let marginUnit = $state<MarginUnit>('lengths');
  const reference = $derived(selected[0] ?? 0);
  const scoped = $derived(
    scope === 'field'
      ? [reference, ...metrics.map((row) => row.source).filter((source) => source !== reference)]
      : selected
  );
  let activeSection = $state('overview');
  // One long page: the pill bar jumps to each section and follows the scroll position.
  const sections: TabItem[] = [
    { id: 'overview', label: 'Overview', icon: 'grid' },
    { id: 'stamina', label: 'Stamina & race', icon: 'battery' },
    { id: 'skills', label: 'Skills', icon: 'star' },
    { id: 'field', label: 'Full field', icon: 'users' },
    { id: 'replays', label: 'Replays', icon: 'race' }
  ].map((item) => ({ ...item, href: '#report-' + item.id })) as TabItem[];
  let navigation = $state<HTMLElement>(),
    navHeight = $state(0),
    navWidth = $state(0);
  function jump(event: MouseEvent) {
    const link = (event.target as Element).closest<HTMLAnchorElement>('a[href^="#report-"]');
    if (
      !link ||
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    // Handled here so the router does not treat the anchor as a page navigation.
    event.preventDefault();
    const id = link.hash.slice('#report-'.length);
    activeSection = id;
    document
      .getElementById('report-' + id)
      ?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }
  $effect(() => {
    if (!result) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = (navigation?.getBoundingClientRect().bottom ?? 0) + 24;
      const atEnd = innerHeight + scrollY >= document.documentElement.scrollHeight - 4;
      let current = sections[0]!.id;
      for (const section of sections) {
        const top = document.getElementById('report-' + section.id)?.getBoundingClientRect().top;
        if (top !== undefined && top <= line) current = section.id;
      }
      activeSection = atEnd ? sections.at(-1)!.id : current;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    addEventListener('scroll', schedule, { passive: true });
    addEventListener('resize', schedule);
    return () => {
      removeEventListener('scroll', schedule);
      removeEventListener('resize', schedule);
      cancelAnimationFrame(frame);
    };
  });
  // Highlighting a runner in the whole-field views also follows her on the course graph.
  $effect(() => {
    if (highlight !== undefined) inspected = highlight;
  });
  const runnerName = (source: number) => umas[source]!.name;
  // The sticky bar shows who is being compared with whom as portraits; the names are in its tooltip.
  const compared = $derived(scoped.filter((source) => source !== reference));
  const list = (names: string[]) =>
    names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names.at(-1) : (names[0] ?? '');
  const comparisonTitle = $derived(
    'Comparing ' +
      (scope === 'picked' ? list(compared.map(runnerName)) : 'all ' + umas.length + ' runners') +
      ' with baseline ' +
      runnerName(reference) +
      '. Select to choose runners.'
  );
  // The report is keyed by run, so one store lives exactly as long as this batch.
  const impacts = untrack(() => (result ? new SkillImpactStore(result, input) : undefined));
  function download() {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify({ input, umas, course, result }, (_, v) =>
            v instanceof Float32Array || v instanceof Float64Array ? Array.from(v) : v
          )
        ],
        { type: 'application/json' }
      )
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'simulation-' + result?.seeds[0] + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function replay(index: number) {
    if (!result || !input || !course) return;
    sampleRequest?.abort();
    const request = (sampleRequest = new AbortController());
    sample = index;
    sampleOpen = true;
    sampleLoading = true;
    sampleError = '';
    capture = undefined;
    await tick();
    document
      .getElementById('report-replays')
      ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    try {
      const data =
        index === 0 && result.first_replay
          ? result.first_replay
          : simulatorSampleReplay(
              result,
              (
                await simulatorRepository.monteCarlo({
                  body: {
                    input,
                    seeds: [result.seeds[index]],
                    output_mode: 'skills',
                    output_format: 'msgpack'
                  },
                  signal: request.signal
                })
              ).result,
              index
            );
      if (request.signal.aborted) return;
      capture = simulatorReplayCapture(data, umas, course, track);
      Replay = (await import('@/pages/race-analysis/RaceReplay.svelte')).default;
    } catch (error) {
      if (!request.signal.aborted)
        sampleError = error instanceof Error ? error.message : 'Could not load the sample.';
    } finally {
      if (!request.signal.aborted) sampleLoading = false;
    }
  }
  function representative(source: number, index: number) {
    const recorded = result?.report?.runners.find((r) => r.source_input_index === source)
      ?.representative_runs[index];
    if (recorded !== undefined) return recorded;
    const values = result!.finish_times.map((row) => row[source]!);
    const sorted = [...values].sort((a, b) => a - b),
      mid = (sorted[(sorted.length - 1) >> 1]! + sorted[sorted.length >> 1]!) / 2;
    const target = index === 0 ? mid : index === 1 ? sorted[0]! : sorted.at(-1)!;
    return values.reduce(
      (best, v, i) => (Math.abs(v - target) < Math.abs(values[best]! - target) ? i : best),
      0
    );
  }
  async function detailedReplay() {
    if (!capture || !result || !input) return;
    const previous = capture,
      request = (sampleRequest = new AbortController());
    sampleLoading = true;
    sampleError = '';
    try {
      const response = await simulatorRepository.detailedReplay({
        body: { ...input, seed: result.seeds[sample] },
        signal: request.signal
      });
      if (request.signal.aborted) return;
      if (
        response.result.engineBuild !== result.engine_build ||
        response.result.seed !== result.seeds[sample]
      )
        throw new Error(
          'These diagnostics do not match the sampled engine and seed. Run the simulation again.'
        );
      const next = applyResimulation(previous, response.result);
      const sources = input.runners
        .toSorted((a, b) => a.frame_order - b.frame_order)
        .map((r) => r.source_input_index);
      if (
        next.runners.some(
          (r, gate) =>
            r.result?.finishOrder !== result!.finish_order[sample]!.indexOf(sources[gate]!) + 1 ||
            Math.abs(r.result!.finishTime - result!.finish_times[sample]![sources[gate]!]!) > 0.001
        )
      )
        throw new Error(
          'These diagnostic outcomes no longer match this sampled race. Run the simulation again.'
        );
      capture = next;
    } catch (error) {
      if (!request.signal.aborted)
        sampleError = error instanceof Error ? error.message : 'Could not load replay diagnostics.';
    } finally {
      if (!request.signal.aborted) sampleLoading = false;
    }
  }
</script>

<div
  class="simulation-report"
  aria-busy={busy}
>
  {#if result}
    <SimulatorFieldOverview
      {result}
      {umas}
      {course}
      {selected}
      {reference}
      unit={marginUnit}
      onreference={makeReference}
      onchoose={choose}
    />
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions (Delegates activation of the section links inside.) -->
    <div
      class="workspace-navigation"
      bind:this={navigation}
      bind:offsetHeight={navHeight}
      bind:clientWidth={navWidth}
      onclick={jump}
    >
      <Tabs
        variant="pills"
        compact
        id="simulation-tabs"
        label="Simulation results sections"
        items={sections}
        value={activeSection}
      />
      <div class="scope-bar">
        <SegmentedControl
          compact
          label="Comparison scope"
          options={[
            { value: 'picked', label: selected.length + ' picked' },
            { value: 'field', label: 'All ' + umas.length }
          ]}
          bind:value={scope}
        />
        <SegmentedControl
          compact
          label="Margin unit"
          options={[
            {
              value: 'lengths',
              label: navWidth && navWidth < 600 ? 'L' : 'Lengths',
              title: 'Margins in lengths first'
            },
            {
              value: 'seconds',
              label: navWidth && navWidth < 600 ? 's' : 'Seconds',
              title: 'Margins in seconds first'
            }
          ]}
          bind:value={marginUnit}
        />
        <button
          type="button"
          class="comparison-pick"
          aria-label="Choose runners"
          title={comparisonTitle}
          onclick={() =>
            document
              .getElementById('simulation-field-overview')
              ?.scrollIntoView({ block: 'start' })}
        >
          <span class="faces">
            {#each compared.slice(0, 5) as source (source)}<span
                class="ring"
                style:--runner={runnerColor(source)}
              >
                <SimulatorRunnerFace
                  cardId={umas[source]!.cardId}
                  size={24}
                />
              </span>{/each}{#if compared.length > 5}<small>+{compared.length - 5}</small>{/if}
          </span>
          <small>vs</small>
          <span
            class="ring baseline"
            style:--runner={runnerColor(reference)}
          >
            <SimulatorRunnerFace
              cardId={umas[reference]!.cardId}
              size={24}
            />
          </span>
        </button>
      </div>
      {#if notice}<p role="status">{notice}</p>{/if}
    </div>
    <div
      id="simulation-panel"
      class="content-area"
      style:--report-nav-offset={navHeight + 'px'}
    >
      <div
        id="report-overview"
        class="report-anchor"
      >
        <SimulatorRunComparison
          {result}
          {umas}
          {course}
          sources={scoped}
          {reference}
          {scope}
          unit={marginUnit}
          bind:focus={highlight}
        >
          {#snippet lead()}<SimulatorMeanReplay
              {result}
              {umas}
              {course}
              {track}
              {suspended}
              bind:source={inspected}
            />{/snippet}
        </SimulatorRunComparison>
      </div>
      <section
        id="report-stamina"
        class="report-section report-anchor"
        aria-label="Stamina and race details"
      >
        <header class="section-heading">
          <div>
            <h2>Stamina & race details</h2>
            <p>
              How much stamina each runner needs, where her HP goes, where she gains or loses ground
              along the course, and how her races play out.
            </p>
          </div>
        </header>
        <div id="simulation-stamina">
          <SimulatorStamina
            {result}
            {input}
            {umas}
            sources={scoped}
            {selected}
            distance={course?.distance ?? result.report?.distance_m.at(-1) ?? 2000}
            bind:inspected
            onreplay={replay}
          />
        </div>
        {#if result.report}<div
            id="simulation-progression"
            class="section-gap"
            role="region"
            aria-label="Along the course"
          >
            <SimulatorCourseCharts
              report={result.report}
              {result}
              {umas}
              sources={scoped}
              {reference}
              focus={inspected}
              distance={course?.distance ?? result.report.distance_m.at(-1) ?? 2000}
              unit={marginUnit}
            />
          </div>{/if}
        <div
          class="section-gap"
          role="region"
          aria-label="Race behaviour"
        >
          <SimulatorBehaviour
            {result}
            {umas}
            sources={scoped}
          />
        </div>
      </section>
      <div
        id="report-skills"
        class="report-anchor"
      >
        {#if impacts}<SimulatorSkillImpact
            {result}
            {umas}
            sources={scoped}
            distance={course?.distance ?? result.report?.distance_m.at(-1) ?? 2000}
            {impacts}
            unit={marginUnit}
            bind:source={inspected}
          >
            {#snippet lead()}<div
                id="simulation-skills"
                class="skill-lead"
                role="region"
                aria-label="Skill activation"
              >
                <SimulatorSkillActivation
                  {result}
                  {umas}
                  sources={scoped}
                />
              </div>{/snippet}
            {#snippet children()}{#if input}<div
                  class="section-gap"
                  role="region"
                  aria-label="Alternative builds"
                >
                  <SimulatorBuildComparisons
                    {input}
                    {result}
                    {umas}
                    source={inspected}
                  />
                </div>{/if}{/snippet}
          </SimulatorSkillImpact>{/if}
      </div>
      <section
        id="report-field"
        class="report-section report-anchor"
        aria-label="Full field"
      >
        <header class="section-heading">
          <div>
            <h2>Full field</h2>
            <p>
              Every runner against every other runner in the same races. Each runner’s own results
              are in the field panel at the top and in Who finishes ahead with All selected.
            </p>
          </div>
        </header>
        <div id="simulation-outcome">
          <SimulatorFieldMatchups
            {result}
            {umas}
          />
        </div>
      </section>
      <section
        id="report-replays"
        class="report-section report-anchor"
        aria-label="Sampled races and reproducibility"
      >
        <header class="section-heading">
          <div>
            <h2>Watch races & data</h2>
            <p>
              Replay real races from this batch, look up any seed, or download the full results.
            </p>
          </div>
          <span class="section-tools">
            <Button
              variant="secondary"
              size="sm"
              icon="download"
              onclick={download}
            >
              Download data
            </Button>
          </span>
        </header>
        <div id="simulation-samples">
          <SimulatorRaceBrowser
            {result}
            {umas}
            sources={selected}
            active={sampleOpen ? sample : undefined}
            busy={sampleLoading}
            {representative}
            onwatch={replay}
          >
            {#if sampleOpen}<div class="sample">
                <header class="sample-heading">
                  <strong>Race {sample + 1} of {result.runs}</strong>
                  <span>seed {result.seeds[sample]}</span>
                  <small>The replay clock counts simulation seconds.</small>
                  <span class="sample-tools">
                    {#if capture && !capture.detailed}<Button
                        variant="secondary"
                        size="sm"
                        disabled={sampleLoading}
                        onclick={detailedReplay}
                      >
                        Full replay diagnostics
                      </Button>{/if}<Button
                      variant="ghost"
                      size="sm"
                      onclick={() => {
                        sampleRequest?.abort();
                        sampleLoading = false;
                        sampleOpen = false;
                      }}
                    >
                      Close replay
                    </Button>
                  </span>
                </header>
                {#if sampleLoading}<p role="status">Loading this race…</p>{:else if sampleError}<p
                    role="alert"
                  >
                    {sampleError}
                  </p>{:else if capture && Replay}<Replay
                    {capture}
                    suspended={suspended || !sampleOpen}
                  />{/if}
              </div>{/if}
          </SimulatorRaceBrowser>
        </div>
        <div class="section-gap">
          <Disclosure
            id="simulation-engine"
            title="Setup, clocks and engine"
            description="Engine build, response schema and the exact request"
            icon="info"
          >
            <p class="report-note">
              {result.engine_build} · response schema {result.schema_version} · report {result
                .report?.version ?? 'not collected'} · {result.runs} races. Simulation traces use elapsed
              simulation seconds; finish comparisons use official seconds. Rates describe this field and
              seed population. Changing a build can change later random draws even with matched seeds.
            </p>
            {#if course}<SimulatorCourseProfile
                {course}
                compact
              />{/if}
            <pre>{JSON.stringify(input, null, 2)}</pre>
          </Disclosure>
        </div>
      </section>
    </div>
  {:else}<p>Run a simulation to compare outcomes.</p>{/if}
</div>
