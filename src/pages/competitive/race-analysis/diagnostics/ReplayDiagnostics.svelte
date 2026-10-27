<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
  import { diagnosticHorse, hpChangeEvents } from '@/lib/race/capture/race-diagnostics';
  import Disclosure from '@/components/overlays/Disclosure.svelte';
  import DiagnosticsOutcomeSummary from './DiagnosticsOutcomeSummary.svelte';
  import DiagnosticsSkills from './report/DiagnosticsSkills.svelte';
  import DiagnosticsModes from './report/DiagnosticsModes.svelte';
  import DiagnosticsSpurt from './report/DiagnosticsSpurt.svelte';
  import DiagnosticsRushing from './report/DiagnosticsRushing.svelte';
  import DiagnosticsPaceCharts from './measurements/DiagnosticsPaceCharts.svelte';
  import DiagnosticsSamples from './measurements/DiagnosticsSamples.svelte';
  import DiagnosticsTraces from './measurements/DiagnosticsTraces.svelte';
  import { count, rushingPeriods, sampleRows, sectionRows } from './diagnostics-format';

  let {
    capture,
    index,
    skillNames,
    distance,
    blocking,
    overview,
    notice,
    onseek,
    onselect
  }: {
    capture: ParsedRaceCapture;
    index: number;
    skillNames: Map<number, string>;
    distance: number;
    blocking?: Snippet;
    overview?: Snippet;
    /** Replaces the recorded-data note while there is no detailed simulation for this runner. */
    notice?: Snippet;
    onseek: (time: number) => void;
    onselect: (index: number) => void;
  } = $props();

  const instanceId = $props.id();

  let rawOpen = $state(true);
  let sourceOpen = $state(false);
  let expandedMode = $state<string>();
  let spurtOpen = $state(false);

  const horse = $derived(diagnosticHorse(capture, index));
  const runner = $derived(capture.runners.find((r) => r.index === index));
  const samples = $derived(sampleRows(capture, horse));
  const rushing = $derived(rushingPeriods(horse));
  const hasRushing = $derived(Boolean(horse?.temptationDecision) || rushing.length > 0);
  const spurt = $derived(horse?.lastSpurtDecision ?? horse?.lastSpurtDecisions?.at(-1));
  const hpRows = $derived(hpChangeEvents(capture, horse?.hpSkillApplications ?? []));
  const sections = $derived(
    sectionRows(capture, index, horse?.baseTargetSpeedSections ?? [], distance)
  );
</script>

<section
  class="diagnostics"
  aria-label={(runner?.name ?? 'Runner') + ' detailed diagnostics'}
>
  {#snippet report()}
    <div class="report-grid">
      <DiagnosticsSkills
        {capture}
        {index}
        {horse}
        {skillNames}
        {onseek}
      />
      {#if horse}
        <div class="behaviour-report">
          <DiagnosticsModes
            {capture}
            {horse}
            {onseek}
            bind:expandedMode
          />
          {#if spurt}
            <DiagnosticsSpurt
              bind:spurtOpen
              id={instanceId}
              {spurt}
              {capture}
              {index}
              {horse}
              {skillNames}
              {onseek}
              {onselect}
            />
          {/if}
          {#if hasRushing}
            <DiagnosticsRushing
              {capture}
              {index}
              {horse}
              rushingPeriods={rushing}
              {skillNames}
              {onseek}
              {onselect}
            />
          {/if}
          {#if !hpRows.length || !hasRushing}
            <div class="incident-status">
              {#if !hpRows.length}
                <span>No recovery or HP debuffs</span>
              {/if}
              {#if !hasRushing}
                <span>No rushing</span>
              {/if}
            </div>
          {/if}
          {#if blocking}
            <!-- The incident list takes the column's remaining height, so the column ends with the skills. -->
            <div class="blocking-panel">
              <div class="blocking-fill">{@render blocking()}</div>
            </div>
          {/if}
        </div>
      {:else if blocking}
        <div class="blocking-summary">{@render blocking()}</div>
      {/if}
    </div>
  {/snippet}

  {#if overview}
    <div class="runner-overview">
      {#if horse}
        {@render overview()}
        <DiagnosticsOutcomeSummary
          {capture}
          {index}
          {horse}
          {notice}
        />
      {:else}
        <!-- Without detailed simulation the card and its blocking incidents fill the column beside the skills. -->
        <div class="runner-column">
          {@render overview()}
          {#if blocking}
            <div class="blocking-panel">
              <div class="blocking-fill">{@render blocking()}</div>
            </div>
          {/if}
        </div>
        <div class="recorded-side">
          <DiagnosticsOutcomeSummary
            {capture}
            {index}
            {horse}
            {notice}
          />
          <DiagnosticsSkills
            {capture}
            {index}
            {horse}
            {skillNames}
            {onseek}
          />
        </div>
      {/if}
    </div>
  {:else}
    <DiagnosticsOutcomeSummary
      {capture}
      {index}
      {horse}
      {notice}
    />
  {/if}

  {#if horse || !overview}
    {@render report()}
  {/if}
  {#if horse}
    <div
      class="measurements"
      aria-label="Runner pace and speed"
    >
      <DiagnosticsPaceCharts
        sampleRows={samples}
        sectionRows={sections}
        {onseek}
      />
      <Disclosure
        id={instanceId + '-raw'}
        title="Detailed measurements & simulation data"
        description={count(samples.length, 'sample') + ', ' + count(sections.length, 'section')}
        compact
        bind:open={rawOpen}
      >
        {#if rawOpen}
          <div class="measurement-data">
            <DiagnosticsSamples
              sampleRows={samples}
              sectionRows={sections}
              {onseek}
            />
            <DiagnosticsTraces
              id={instanceId}
              {capture}
              {index}
              {horse}
              {hpRows}
              {skillNames}
              {onseek}
              {onselect}
            />
            <footer class="simulation-meta">
              <span>
                Engine <strong>{capture.detailed?.engineBuild}</strong>
              </span>
              <span>
                Seed <strong>{capture.detailed?.seed}</strong>
              </span>
              <span>
                Schema <strong>{capture.detailed?.annotations.schemaVersion}</strong>
              </span>
              {#if typeof horse.popularity === 'number'}
                <span>
                  Popularity <strong>{horse.popularity}</strong>
                </span>
              {/if}
            </footer>
            <Disclosure
              id={instanceId + '-source'}
              title="Raw simulator response"
              compact
              bind:open={sourceOpen}
            >
              {#if sourceOpen}
                <pre>{JSON.stringify(capture.detailed, null, 2)}</pre>
              {/if}
            </Disclosure>
          </div>
        {/if}
      </Disclosure>
    </div>
  {/if}
</section>

<style>
  @import './replay-diagnostics.css';
</style>
