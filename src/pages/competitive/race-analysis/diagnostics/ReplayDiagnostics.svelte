<script lang="ts">
  import { untrack, type Snippet } from 'svelte';
  import RunnerSupportDeck from '../../runners/RunnerSupportDeck.svelte';
  import { veteranSupportCards } from '@/lib/veterans/records/veteran-profile';
  import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
  import { diagnosticHorse } from '@/lib/race/capture/race-diagnostics';
  import { skillImpactsInContext } from '../simulation/skill-impact.svelte';
  import DiagnosticsOutcomeSummary from './DiagnosticsOutcomeSummary.svelte';
  import DiagnosticsSkills from './report/DiagnosticsSkills.svelte';
  import DiagnosticsModes from './report/DiagnosticsModes.svelte';
  import DiagnosticsHp from './report/DiagnosticsHp.svelte';
  import DiagnosticsTraces from './measurements/DiagnosticsTraces.svelte';
  import DiagnosticsAcceleration from './measurements/DiagnosticsAcceleration.svelte';

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

  const skillImpacts = skillImpactsInContext();

  let inView = $state(false);

  const horse = $derived(diagnosticHorse(capture, index));
  const runner = $derived(capture.runners.find((r) => r.index === index));
  const deck = $derived(
    veteranSupportCards(runner?.raw ?? {}).map((card) => ({
      id: card.support_card_id,
      lb: card.limit_break_count ?? 0
    }))
  );

  /** Skill gains are measured once a reader opens this runner analysis, not when the race loads. */
  function watchView(analysis: HTMLElement) {
    if (typeof IntersectionObserver === 'undefined') {
      inView = true;
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      inView = entries.some((entry) => entry.isIntersecting);
    });
    observer.observe(analysis);
    return () => observer.disconnect();
  }

  $effect(() => {
    if (!inView || !skillImpacts) return;

    const race = skillImpacts.measurableRace(capture);
    if (race) untrack(() => void skillImpacts.measure(race));
  });
</script>

<section
  class="diagnostics"
  aria-label={(runner?.name ?? 'Runner') + ' detailed diagnostics'}
  {@attach watchView}
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
          {distance}
          {skillNames}
          {onseek}
        />
      {/if}
      <DiagnosticsModes
        {index}
        {capture}
        {horse}
        {distance}
        {onseek}
        {onselect}
      />
    </div>
  </div>
  {#if horse}
    <DiagnosticsAcceleration
      {capture}
      {index}
      {distance}
      {skillNames}
      {onseek}
    />
    <footer class="simulation-meta report-card">
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
      <span>
        Engine <strong>{capture.detailed?.engineBuild}</strong>
      </span>
    </footer>
  {/if}
</section>

<style>
  @import './report-card.css';
  @import './replay-diagnostics.css';
</style>
