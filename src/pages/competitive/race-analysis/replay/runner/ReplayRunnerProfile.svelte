<script lang="ts">
  import { onMount } from 'svelte';
  import type { RaceRunner } from '@/lib/race/capture/race-capture-parser';
  import type { HorseDiagnostics } from '@/lib/race/capture/race-diagnostics';
  import { formatRaceTime, ordinalPlace } from '@/lib/race/replay/race-display';
  import { loadSkills, skillPointTotal, type SkillData } from '@/lib/game-data/skills/skills';
  import Button from '@/components/controls/Button.svelte';
  import AptitudeTile from '@/components/game/AptitudeTile.svelte';
  import StatStrip from '@/components/game/StatStrip.svelte';
  import ProfileVeteranIdentity from '@/pages/profile/veterans/ProfileVeteranIdentity.svelte';
  import { identity, score, stats } from '../../../analysis-view';
  import { raceAptitudes, type RaceContext } from '../../../runners/race-aptitudes';
  import DiagnosticsMetricHelp from '../../diagnostics/DiagnosticsMetricHelp.svelte';
  import { number } from '../../diagnostics/diagnostics-format';
  import { startOutcome } from '../../diagnostics/start-outcome';
  import RunnerTrainingPreview from './RunnerTrainingPreview.svelte';

  let {
    runner,
    horse,
    fieldSize,
    winningTime,
    raceContext,
    color,
    onbuild
  }: {
    runner: RaceRunner;
    horse: HorseDiagnostics | undefined;
    fieldSize: number;
    winningTime: number;
    raceContext: RaceContext;
    /** The runner's colour in the replay, which tints who they are. */
    color: string;
    onbuild: () => void;
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
      <ProfileVeteranIdentity
        summary={identity(runner)}
        score={score(runner) || undefined}
        rankPlacement="details"
      />
    </div>
    <section
      class="profile-zone"
      aria-label="Race result"
    >
      <h3>Result</h3>
      {#if result || horse}
        <dl class="result-metrics">
          {#if result}
            <div class="metric">
              <dt>Finish</dt>
              <dd>
                <strong>{ordinalPlace(result.finishOrder)}</strong>
                <small>of {fieldSize}</small>
              </dd>
            </div>
            <div class="metric">
              <dt>Finish time</dt>
              <dd>
                <strong>{formatRaceTime(result.finishTime)}</strong>
                <small>
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
              class:caution={start.late}
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
    <section
      class="profile-zone profile-build"
      aria-label="Build"
    >
      <header class="zone-heading">
        <h3>Build</h3>
        <Button
          variant="secondary"
          size="sm"
          icon="clipboard"
          onclick={onbuild}
        >
          Build details
        </Button>
      </header>
      <StatStrip
        items={statItems}
        label={runner.name + ' build stats'}
        presentation="values"
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
    <div class="profile-zone profile-training">
      <RunnerTrainingPreview {runner} />
    </div>
  </div>
</section>

<style>
  @import '../../diagnostics/report-card.css';
  @import './replay-runner-profile.css';
</style>
