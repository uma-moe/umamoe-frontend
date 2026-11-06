<script lang="ts">
  import { onMount } from 'svelte';
  import type { RaceRunner } from '@/lib/race/capture/race-capture-parser';
  import type { HorseDiagnostics } from '@/lib/race/capture/race-diagnostics';
  import { formatRaceTime, ordinalPlace } from '@/lib/race/replay/race-display';
  import { loadSkills, skillPointTotal, type SkillData } from '@/lib/game-data/skills/skills';
  import { normalizeVeteranRecord } from '@/lib/veterans/records/veteran-normalizer';
  import { veteranSupportCards } from '@/lib/veterans/records/veteran-profile';
  import AptitudeTile from '@/components/game/AptitudeTile.svelte';
  import StatStrip from '@/components/game/StatStrip.svelte';
  import ProfileVeteranIdentity from '@/pages/profile/veterans/ProfileVeteranIdentity.svelte';
  import { identity, score, stats } from '../../../analysis-view';
  import { raceAptitudes, type RaceContext } from '../../../runners/race-aptitudes';
  import RunnerLineage from '../../../runners/RunnerLineage.svelte';
  import RunnerSupportDeck from '../../../runners/RunnerSupportDeck.svelte';
  import DiagnosticsMetricHelp from '../../diagnostics/DiagnosticsMetricHelp.svelte';
  import { number } from '../../diagnostics/diagnostics-format';
  import { startOutcome } from '../../diagnostics/start-outcome';

  let {
    runner,
    horse,
    fieldSize,
    winningTime,
    raceContext,
    color
  }: {
    runner: RaceRunner;
    horse: HorseDiagnostics | undefined;
    fieldSize: number;
    winningTime: number;
    raceContext: RaceContext;
    /** The runner's colour in the replay, which tints who they are. */
    color: string;
  } = $props();

  let skillCatalog = $state.raw(new Map<number, SkillData>());

  /** Null until the catalog prices every learned skill. */
  const skillPoints = $derived(skillPointTotal(skillCatalog, runner.skillIds));
  const statItems = $derived([
    ...stats(runner),
    {
      id: 'sp',
      label: 'Skill points',
      value: skillPoints ?? '—',
      icon: '/game-assets/textures/hint.webp'
    }
  ]);
  const aptitudes = $derived(raceAptitudes(runner, raceContext));
  const start = $derived(horse ? startOutcome(horse, runner.result) : undefined);
  const result = $derived(runner.result);
  const timeBehind = $derived(result ? result.finishTime - winningTime : 0);
  const deck = $derived(
    veteranSupportCards(runner.raw).map((card) => ({
      id: card.support_card_id,
      lb: card.limit_break_count ?? 0
    }))
  );
  const parents = $derived.by(() => {
    try {
      return normalizeVeteranRecord(runner.raw).parents;
    } catch {
      return [];
    }
  });

  onMount(() => {
    void loadSkills()
      .then((catalog) => (skillCatalog = catalog))
      .catch(() => {});
  });
</script>

<section
  class="runner-profile report-card"
  aria-label={runner.name + ' profile'}
  style:--runner-color={color}
>
  <div class="profile-zones">
    <div class="profile-zone profile-identity">
      {#if result}
        <p
          class="finish-place"
          class:winner={result.finishOrder === 1}
          class:podium={result.finishOrder === 2 || result.finishOrder === 3}
        >
          <span class="sr-only">Finished</span>
          <strong>{ordinalPlace(result.finishOrder)}</strong>
          <small>of {fieldSize}</small>
        </p>
      {/if}
      <ProfileVeteranIdentity
        summary={identity(runner)}
        score={score(runner) || undefined}
        rankPlacement="details"
      />
    </div>
    <section
      class="profile-zone profile-build"
      aria-label="Build"
    >
      <h3>Build</h3>
      <StatStrip
        items={statItems}
        label={runner.name + ' build stats'}
        presentation="tiles"
        compact
      />
      <div
        class="race-aptitudes"
        aria-label="Aptitudes for this race"
      >
        {#each aptitudes as item}
          <AptitudeTile
            label={item.label ?? item.group}
            grade={item.grade}
            title={item.group + ': ' + (item.label ?? 'not detected')}
          />
        {/each}
      </div>
    </section>
    <section
      class="profile-zone profile-result"
      aria-label="Race result"
    >
      <h3>Result</h3>
      {#if result || horse}
        <dl class="result-metrics">
          {#if result}
            <div class="metric">
              <dt>Finish time</dt>
              <dd>
                <strong>{formatRaceTime(result.finishTime)}</strong>
                <small class="time-behind">
                  {result.finishOrder === 1 ? 'Winner' : '+' + timeBehind.toFixed(2) + ' s'}
                </small>
              </dd>
            </div>
          {/if}
          {#if horse && start}
            <div class="metric">
              <dt>Course loss<DiagnosticsMetricHelp label="Course loss" /></dt>
              <dd>
                <strong>{number(horse.worldTransformDistanceLoss, 2)}</strong>
                <small>m</small>
              </dd>
            </div>
            <div
              class="metric"
              class:good={start.label === 'Normal'}
              class:bad={start.late}
            >
              <dt>Start<DiagnosticsMetricHelp label="Start" /></dt>
              <dd>
                <strong>{start.label}</strong>
                {#if start.delayMs !== undefined}
                  <small>{number(start.delayMs, 1)} ms</small>
                {/if}
                {#if start.lostAccelerationFrame}
                  <small>Lost acceleration frame</small>
                {/if}
              </dd>
            </div>
          {/if}
        </dl>
      {:else}
        <p class="empty">No result was recorded.</p>
      {/if}
    </section>
    <div class="profile-zone profile-deck">
      <RunnerSupportDeck {deck} />
    </div>
    <div class="profile-zone profile-parents">
      <RunnerLineage {parents} />
    </div>
  </div>
</section>

<style>
  @import '../../diagnostics/report-card.css';
  @import './replay-runner-profile.css';
</style>
