<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import SimulatorFieldMatchups from './outcomes/SimulatorFieldMatchups.svelte';
  import SimulatorCourseCharts from './telemetry/SimulatorCourseCharts.svelte';
  import SimulatorBehaviour from './telemetry/SimulatorBehaviour.svelte';
  import SimulatorSkillActivation from './skills/SimulatorSkillActivation.svelte';
  import SimulatorBuildComparisons from './outcomes/build/SimulatorBuildComparisons.svelte';
  import SimulatorRunComparison from './outcomes/SimulatorRunComparison.svelte';
  import SimulatorSkillImpact from './skills/impact/SimulatorSkillImpact.svelte';
  import SimulatorMeanReplay from './replay/SimulatorMeanReplay.svelte';
  import ReportReplays from './replay/ReportReplays.svelte';
  import { ReportSample } from './replay/report-sample.svelte';
  import SimulatorFieldOverview from './outcomes/SimulatorFieldOverview.svelte';
  import ReportNavigation from './ReportNavigation.svelte';
  import SimulatorStamina from './outcomes/stamina/SimulatorStamina.svelte';
  import { SkillImpactStore } from './skills/impact/skill-impact.svelte';
  import type { MarginUnit } from './simulation-comparison';
  import { simulatorResults } from '../simulator-results';
  import type { MonteCarloResult } from '../simulator-repository';
  import type { RaceCourse } from '@/lib/game-data/racing/courses';
  import type { SimulatorUma } from '../simulator-uma';
  import type { MonteCarloInput } from '../requests/race-sim-request';
  import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
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
    course?: RaceCourse;
    track?: ParsedRaceCapture['track'];
    busy?: boolean;
    suspended?: boolean;
  } = $props();

  const metrics = $derived(result ? simulatorResults(result, umas.length) : []);
  let selected = $state<number[]>(untrack(() => metrics.slice(0, 2).map((r) => r.source))),
    inspected = $state(untrack(() => metrics[0]?.source ?? 0));

  let notice = $state('');
  const sample = new ReportSample(() => ({ result, input, umas, course, track }));
  onDestroy(() => sample.abort());
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

  let navHeight = $state(0);
  // Highlighting a runner in the whole-field views also follows her on the course graph.
  $effect(() => {
    if (highlight !== undefined) inspected = highlight;
  });

  // The report is keyed by run, so one store lives exactly as long as this batch.
  const impacts = untrack(() => (result ? new SkillImpactStore(result, input) : undefined));
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
    <ReportNavigation
      {result}
      {umas}
      {selected}
      {scoped}
      {reference}
      {notice}
      bind:scope
      bind:marginUnit
      bind:navHeight
    />
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
            onreplay={(index) => sample.replay(index)}
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
      <ReportReplays
        {result}
        {input}
        {umas}
        {course}
        {selected}
        {suspended}
        {sample}
      />
    </div>
  {:else}<p>Run a simulation to compare outcomes.</p>{/if}
</div>
