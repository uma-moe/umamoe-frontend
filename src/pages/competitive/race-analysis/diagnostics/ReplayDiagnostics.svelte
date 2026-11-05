<script lang="ts">
  import type { Snippet } from 'svelte';
  import RunnerSupportDeck from '../../runners/RunnerSupportDeck.svelte';
  import { veteranSupportCards } from '@/lib/veterans/records/veteran-profile';
  import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
  import { diagnosticHorse } from '@/lib/race/capture/race-diagnostics';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import DiagnosticsOutcomeSummary from './DiagnosticsOutcomeSummary.svelte';
  import DiagnosticsSkills from './report/DiagnosticsSkills.svelte';
  import DiagnosticsModes from './report/DiagnosticsModes.svelte';
  import DiagnosticsHp from './report/DiagnosticsHp.svelte';
  import DiagnosticsSpurt from './report/DiagnosticsSpurt.svelte';
  import DiagnosticsTraces from './measurements/DiagnosticsTraces.svelte';
  import DiagnosticsAcceleration from './measurements/DiagnosticsAcceleration.svelte';
  import { hpReport } from './report/hp-report';
  import { number } from './diagnostics-format';

  let {
    capture,
    index,
    skillNames,
    distance,
    overview,
    buildPreview,
    notice,
    onseek,
    onselect
  }: {
    capture: ParsedRaceCapture;
    index: number;
    skillNames: Map<number, string>;
    distance: number;
    overview?: Snippet;
    buildPreview?: Snippet;
    /** Replaces the recorded-data note while there is no detailed simulation for this runner. */
    notice?: Snippet;
    onseek: (time: number) => void;
    onselect: (index: number) => void;
  } = $props();

  const instanceId = $props.id();

  let expandedMode = $state<string>();
  let spurtOpen = $state(false);
  let breakdownOpen = $state(false);

  $effect(() => {
    capture;
    index;
    breakdownOpen = false;
    spurtOpen = false;
  });

  const horse = $derived(diagnosticHorse(capture, index));
  const runner = $derived(capture.runners.find((r) => r.index === index));
  const spurt = $derived(horse?.lastSpurtDecision ?? horse?.lastSpurtDecisions?.at(-1));
  const hp = $derived(hpReport(capture, index));
  const deck = $derived(
    veteranSupportCards(runner?.raw ?? {}).map((card) => ({
      id: card.support_card_id,
      lb: card.limit_break_count ?? 0
    }))
  );

  function openSpurtBreakdown() {
    spurtOpen = false;
    breakdownOpen = true;
  }
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
          <DiagnosticsHp
            {capture}
            {index}
            {skillNames}
            {onseek}
            onspurt={spurt ? openSpurtBreakdown : undefined}
          />
          <DiagnosticsModes
            {index}
            {capture}
            {horse}
            {onseek}
            bind:expandedMode
          />
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
      {@render overview()}
      {#if buildPreview}
        {@render buildPreview()}
        {#if !horse}
          <div class="runner-notice">
            <DiagnosticsOutcomeSummary
              {capture}
              {index}
              {horse}
              {notice}
            />
          </div>
        {/if}
      {:else}
        <div class="runner-setup">
          <RunnerSupportDeck
            {deck}
            compact
          />
          <DiagnosticsOutcomeSummary
            {capture}
            {index}
            {horse}
            {notice}
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

  {@render report()}
  {#if horse}
    <div
      class="measurement-data"
      aria-label="Runner simulation data"
    >
      <div class="decision-reports">
        <DiagnosticsTraces
          id={instanceId}
          {capture}
          {index}
          {horse}
          {skillNames}
          {onseek}
          {onselect}
        />
        <DiagnosticsAcceleration
          {capture}
          {index}
          {distance}
          {skillNames}
          {onseek}
        />
      </div>
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
      </div>
    </div>
  {/if}
</section>

<Dialog
  bind:open={breakdownOpen}
  title="Last-spurt breakdown"
  description={runner?.name}
  maxWidth="760px"
>
  {#if breakdownOpen && horse && spurt}
    <p class="first-check-detail">
      Starting HP: {number(hp.hp.start)}.
      {#if hp.checkTime !== undefined}
        Spurt check:
        <button
          type="button"
          onclick={() => {
            if (hp.checkTime === undefined) return;
            breakdownOpen = false;
            onseek(hp.checkTime);
          }}
        >
          {hp.checkTime.toFixed(3)} s
        </button>
        .
      {/if}
    </p>
    <DiagnosticsSpurt
      bind:spurtOpen
      id={instanceId}
      {spurt}
      {capture}
      {index}
      {horse}
      {distance}
      {skillNames}
      onseek={(time) => {
        breakdownOpen = false;
        onseek(time);
      }}
      onselect={(runnerIndex) => {
        breakdownOpen = false;
        onselect(runnerIndex);
      }}
    />
  {/if}
</Dialog>

<style>
  @import './report-card.css';
  @import './replay-diagnostics.css';
</style>
