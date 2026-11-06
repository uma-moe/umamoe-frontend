<script lang="ts">
  import { onMount } from 'svelte';
  import type { RaceRunner } from '@/lib/race/capture/race-capture-parser';
  import type { HorseDiagnostics } from '@/lib/race/capture/race-diagnostics';
  import {
    formatRaceTime,
    moodIcon,
    moodName,
    ordinalPlace,
    runningStyleIcon,
    type MoodName
  } from '@/lib/race/replay/race-display';
  import { loadSkills, skillPointTotal, type SkillData } from '@/lib/game-data/skills/skills';
  import { normalizeVeteranRecord } from '@/lib/veterans/records/veteran-normalizer';
  import { veteranSupportCards } from '@/lib/veterans/records/veteran-profile';
  import AptitudeTile from '@/components/game/AptitudeTile.svelte';
  import RankBadge from '@/components/game/RankBadge.svelte';
  import StatStrip from '@/components/game/StatStrip.svelte';
  import Icon from '@/components/Icon.svelte';
  import { identity, score, stats, styleColors } from '../../../analysis-view';
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

  const moodTones: Record<MoodName, 'good' | 'bad' | 'neutral'> = {
    Awful: 'bad',
    Bad: 'bad',
    Normal: 'neutral',
    Good: 'good',
    Great: 'good'
  };

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
  const summary = $derived(identity(runner));
  const runningStyle = $derived(runner.result?.runningStyle ?? Number(runner.raw.runningStyle));
  /** Debuffers are named as such rather than by the style badge they ran with. */
  const styleBadge = $derived(
    Number(runner.raw.analysisStyle) === 6 ? undefined : runningStyleIcon(runningStyle)
  );
  const rankScore = $derived(score(runner));
  const mood = $derived(moodName(runner.raw.motivation));
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
    <section
      class="profile-zone profile-identity"
      aria-label="Runner"
    >
      <span class="portrait">
        {#if summary.image}
          <img
            src={summary.image}
            alt=""
          />
        {:else}
          <Icon
            name="user"
            size={28}
          />
        {/if}
      </span>
      <div class="identity-main">
        <div class="identity-title">
          <div>
            <h3>{summary.name}</h3>
            <p class="trainer">{summary.scenario}</p>
          </div>
          {#if styleBadge}
            <img
              class="style-badge"
              src={styleBadge}
              alt={summary.detail}
              title={summary.detail}
              width="32"
              height="32"
            />
          {:else}
            <span
              class="style-pill"
              style:--style-color={styleColors[runningStyle] ?? styleColors[0]}
            >
              {summary.detail}
            </span>
          {/if}
        </div>
        <dl class="zone-metrics">
          {#if result}
            <div
              class="metric"
              class:winner={result.finishOrder === 1}
              class:podium={result.finishOrder === 2 || result.finishOrder === 3}
            >
              <dt>Place</dt>
              <dd>
                <strong>{ordinalPlace(result.finishOrder)}</strong>
                <small>of {fieldSize}</small>
              </dd>
            </div>
          {/if}
          {#if mood}
            <div
              class="metric"
              class:good={moodTones[mood] === 'good'}
              class:bad={moodTones[mood] === 'bad'}
            >
              <dt>Mood</dt>
              <dd>
                <img
                  class="metric-icon"
                  src={moodIcon(mood)}
                  alt=""
                  width="16"
                  height="16"
                />
                <strong>{mood}</strong>
              </dd>
            </div>
          {/if}
          {#if rankScore > 0}
            <div class="metric">
              <dt>Rank</dt>
              <dd>
                <RankBadge
                  score={rankScore}
                  size="xs"
                />
                <strong>{rankScore.toLocaleString()}</strong>
              </dd>
            </div>
          {/if}
        </dl>
      </div>
    </section>
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
        <dl class="zone-metrics">
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
