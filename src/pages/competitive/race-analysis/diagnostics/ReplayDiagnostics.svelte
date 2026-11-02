<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
  import { diagnosticHorse, hpChangeEvents } from '@/lib/race/capture/race-diagnostics';
  import Disclosure from '@/components/overlays/Disclosure.svelte';
  import DiagnosticsOutcomeSummary from './DiagnosticsOutcomeSummary.svelte';
  import DiagnosticsSkills from './report/DiagnosticsSkills.svelte';
  import DiagnosticsModes from './report/DiagnosticsModes.svelte';
  import DiagnosticsSpurt from './report/DiagnosticsSpurt.svelte';
  import DiagnosticsPaceCharts from './measurements/DiagnosticsPaceCharts.svelte';
  import DiagnosticsSamples from './measurements/DiagnosticsSamples.svelte';
  import DiagnosticsTraces from './measurements/DiagnosticsTraces.svelte';
  import { count, sampleRows, sectionRows } from './diagnostics-format';

  let {
    capture,
    index,
    skillNames,
    distance,
    overview,
    notice,
    onseek,
    onselect
  }: {
    capture: ParsedRaceCapture;
    index: number;
    skillNames: Map<number, string>;
    distance: number;
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
            {index}
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
              {distance}
              {skillNames}
              {onseek}
              {onselect}
            />
          {/if}
          {#if !hpRows.length}
            <div class="incident-status report-card">
              <span>No recovery or HP debuffs</span>
            </div>
          {/if}
        </div>
      {:else}
        <DiagnosticsModes
          {capture}
          {index}
          {horse}
          {onseek}
          bind:expandedMode
        />
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
        <div class="runner-column">
          {@render overview()}
          <DiagnosticsModes
            {capture}
            {index}
            {horse}
            {onseek}
            bind:expandedMode
          />
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
            <div class="simulation-source report-card">
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
          </div>
        {/if}
      </Disclosure>
    </div>
  {/if}
</section>

<style>
  @import './report-card.css';
  @import './replay-diagnostics.css';
</style>
