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
  import SeekTimeButton from './SeekTimeButton.svelte';
  import { number } from './diagnostics-format';

  let {
    capture,
    index,
    skillNames,
    distance,
    overview,
    outcomeSummary = true,
    onseek,
    onselect
  }: {
    capture: ParsedRaceCapture;
    index: number;
    skillNames: Map<number, string>;
    distance: number;
    overview?: Snippet;
    /** Off when the caller already shows the runner's course loss and start. */
    outcomeSummary?: boolean;
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
  {#if overview}
    <div class="runner-overview">
      {@render overview()}
      <div class="runner-setup">
        <RunnerSupportDeck
          {deck}
          compact
        />
        <DiagnosticsOutcomeSummary
          {capture}
          {index}
          {horse}
        />
      </div>
    </div>
  {:else if outcomeSummary}
    <DiagnosticsOutcomeSummary
      {capture}
      {index}
      {horse}
    />
  {/if}

  <div
    class="report-grid"
    class:detailed={Boolean(horse)}
  >
    <div class="procs-column">
      <DiagnosticsSkills
        {capture}
        {index}
        {horse}
        {skillNames}
        {onseek}
      />
      {#if horse}
        <DiagnosticsTraces
          {capture}
          {index}
          {horse}
          {skillNames}
          {onseek}
          {onselect}
        />
      {/if}
    </div>
    <div class="behaviour-column">
      {#if horse}
        <DiagnosticsHp
          {capture}
          {index}
          {skillNames}
          {onseek}
          onspurt={spurt ? openSpurtBreakdown : undefined}
        />
      {/if}
      <DiagnosticsModes
        {index}
        {capture}
        {horse}
        {onseek}
        bind:expandedMode
      />
      {#if horse}
        <DiagnosticsAcceleration
          {capture}
          {index}
          {distance}
          {skillNames}
          {onseek}
        />
      {/if}
    </div>
  </div>
  {#if horse}
    <footer class="simulation-meta report-card">
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
        Spurt check
        <SeekTimeButton
          time={hp.checkTime}
          onseek={(time) => {
            breakdownOpen = false;
            onseek(time);
          }}
        />
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
