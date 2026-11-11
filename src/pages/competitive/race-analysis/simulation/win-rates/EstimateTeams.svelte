<script lang="ts">
  import { onMount } from 'svelte';
  import type { RaceRunner } from '@/lib/race/capture/race-capture-parser';
  import { loadSkills, skillPointTotal, type SkillData } from '@/lib/game-data/skills/skills';
  import Button from '@/components/controls/Button.svelte';
  import AptitudeGrade from '@/components/game/AptitudeGrade.svelte';
  import Artwork from '@/components/game/Artwork.svelte';
  import StatStrip from '@/components/game/StatStrip.svelte';
  import {
    identity,
    portrait,
    skillPointsStat,
    stats,
    styleColors
  } from '@/pages/competitive/analysis-view';
  import { raceAptitudes, type RaceContext } from '@/pages/competitive/runners/race-aptitudes';
  import type { MonteCarloResult } from '@/pages/simulator/simulator-repository';
  import EstimateRunnerDetails from './EstimateRunnerDetails.svelte';
  import { runnerName, topThreeRate, type OddsGroup, type RunnerOdds } from './estimate-groups';
  import { firstWin } from './estimate-races';
  import { percent } from './estimate-format';

  let {
    groups,
    result,
    raceContext,
    teamColor,
    watchingRun,
    onwatch
  }: {
    groups: OddsGroup[];
    result: MonteCarloResult;
    /** The course's track and distance, which pick the aptitudes that count in this race. */
    raceContext: RaceContext;
    teamColor: (runner: RaceRunner) => string;
    /** The race being raced again to watch. */
    watchingRun?: number;
    onwatch: (run: number, runner: number) => void;
  } = $props();

  let catalog = $state.raw(new Map<number, SkillData>());
  let detailedRunner = $state.raw<RunnerOdds>();

  function groupColor(group: OddsGroup) {
    const member = group.runners[0]?.runner;

    return group.kind === 'team' && member ? teamColor(member) : undefined;
  }

  function buildStats(runner: RaceRunner) {
    return [...stats(runner), skillPointsStat(skillPointTotal(catalog, runner.skillIds))];
  }

  onMount(() => {
    // Until the skill catalogue loads, or if it fails to, the skill points read as a dash.
    void loadSkills()
      .then((skills) => (catalog = skills))
      .catch(() => {});
  });
</script>

{#snippet runnerTile(odds: RunnerOdds)}
  {@const name = runnerName(odds)}
  {@const win = firstWin(result, odds.source)}
  <li class="odds-runner">
    <span class="portrait">
      <Artwork
        src={portrait(odds.runner?.cardId)}
        alt=""
        size="sm"
      />
    </span>
    <span class="runner-name">
      <strong>{name}</strong>
      {#if odds.runner}
        <small style:--style={styleColors[odds.runner.result?.runningStyle ?? 0]}>
          {identity(odds.runner).detail}
        </small>
      {/if}
    </span>
    {#if odds.runner}
      <span class="runner-stats">
        <StatStrip
          items={buildStats(odds.runner)}
          label={name + ' build stats'}
          presentation="values"
          compact
        />
      </span>
      <span
        class="aptitudes"
        aria-label={name + '’s aptitudes for this race'}
      >
        {#each raceAptitudes(odds.runner, raceContext) as aptitude (aptitude.group)}
          <span class="aptitude">
            <small>{aptitude.label ?? aptitude.group}</small>
            {#if aptitude.grade}
              <AptitudeGrade
                grade={aptitude.grade}
                label={aptitude.group + ', ' + (aptitude.label ?? 'not detected')}
                size="xs"
              />
            {:else}
              <b class="no-grade">—</b>
            {/if}
          </span>
        {/each}
      </span>
    {/if}
    <span class="runner-odds">
      <strong>{percent(odds.winRate)}</strong>
      <small>Top 3 {percent(topThreeRate(odds, result.runs))}</small>
    </span>
    <span class="runner-actions">
      <Button
        variant="secondary"
        size="sm"
        icon="chart"
        ariaLabel={'View simulation details for ' + name}
        title="View details"
        onclick={() => (detailedRunner = odds)}
      />
      <Button
        variant="secondary"
        size="sm"
        icon="play"
        ariaLabel={win === undefined
          ? name + ' won none of these races'
          : 'Watch a race ' + name + ' won'}
        title={win === undefined ? name + ' won none of these races' : 'Watch a win'}
        disabled={win === undefined}
        loading={win !== undefined && watchingRun === win}
        onclick={() => win !== undefined && onwatch(win, odds.source)}
      />
    </span>
  </li>
{/snippet}

<div
  class="odds-groups"
  class:field={groups[0]?.kind === 'field'}
  style:--group-count={groups.length}
>
  {#each groups as group (group.kind === 'team' ? group.team : 'field')}
    <section
      class="odds-group"
      style:--team={groupColor(group)}
      aria-label={group.kind === 'team' ? group.label + '’s team' : 'Field'}
    >
      {#if group.kind === 'team'}
        <header class="group-head">
          <span class="team-dot"></span>
          <h3>{group.label}</h3>
          {#if group.own}
            <span class="own-team">You</span>
          {/if}
          <strong>{percent(group.winRate)}</strong>
        </header>
      {/if}
      <ul class="odds-runners">
        {#each group.runners as odds (odds.source)}
          {@render runnerTile(odds)}
        {/each}
      </ul>
    </section>
  {/each}
</div>

{#if detailedRunner}
  <EstimateRunnerDetails
    odds={detailedRunner}
    {result}
    {catalog}
    onclose={() => (detailedRunner = undefined)}
  />
{/if}

<style>
  @import './estimate-teams.css';
</style>
