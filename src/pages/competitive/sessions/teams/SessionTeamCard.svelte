<script lang="ts">
  import type { RaceRunner } from '@/lib/race/capture/race-capture-parser';
  import { skillPointTotal, type SkillData } from '@/lib/game-data/skills/skills';
  import { runningStyleName } from '@/lib/race/replay/race-display';
  import { winRateInterval } from '@/lib/race/win-rate-interval';
  import Button from '@/components/controls/Button.svelte';
  import RunnerLineupRow from '../../runners/RunnerLineupRow.svelte';
  import { identity, percent, rate, styleColors } from '../../analysis-view';
  import { formatRate, isSmallSample } from '../session-insights';
  import { isPlayerTeam, type SessionTeam } from '../session-statistics';

  /** One captured team build as CM Data draws it: lineup and team rate, member builds, then its record. */
  let {
    team,
    position,
    skillCatalog,
    oninspect,
    onreplay
  }: {
    team: SessionTeam;
    position: number;
    /** Resolves each build's skill point total once the catalog has loaded. */
    skillCatalog?: Map<number, SkillData>;
    oninspect: () => void;
    onreplay?: () => void;
  } = $props();

  const own = $derived(isPlayerTeam(team));
  const few = $derived(isSmallSample(team.appearances));
  const interval = $derived(winRateInterval(team.wins, team.appearances));

  function styleOf(runner: RaceRunner) {
    return runner.result?.runningStyle ?? Number(runner.raw.runningStyle);
  }

  function skillPoints(runner: RaceRunner) {
    if (!skillCatalog) return undefined;
    return skillPointTotal(skillCatalog, runner.skillIds) ?? undefined;
  }
</script>

<article
  class="team-row"
  class:own
  aria-label={'Team ' + position}
>
  <button
    class="team-open"
    aria-label={'View team ' + position + ' builds'}
    onclick={oninspect}
  ></button>
  <header class="team-heading">
    <div>
      <span class="team-number">#{position}</span>
      <span class="lineup">
        {#each team.members as runner, index (runner.index)}
          {#if index}
            <span class="slash">/</span>
          {/if}
          <span
            style:color={styleColors[styleOf(runner)]}
            title={identity(runner).detail}
          >
            {Number(runner.raw.analysisStyle) === 6
              ? 'Debuffer'
              : runningStyleName(styleOf(runner), true)}
          </span>
        {/each}
      </span>
    </div>
    <div
      class="team-rate"
      class:few
    >
      <strong>{percent(team.wins, team.appearances)}</strong>
      <span>team wins</span>
    </div>
  </header>
  <div class="members">
    {#each team.members as runner, index (runner.index)}
      {@const share = rate(team.memberWins[index] ?? 0, team.wins)}
      <div class="member">
        <RunnerLineupRow
          {runner}
          style={identity(runner).detail}
          color={styleColors[styleOf(runner)]}
          sp={skillPoints(runner)}
        >
          {#snippet metadata()}
            <span
              class="member-share"
              title={(team.memberWins[index] ?? 0) + ' of ' + team.wins + ' team wins'}
            >
              <strong>{team.wins ? formatRate(share) : '—'}</strong>
              <small>of wins</small>
            </span>
          {/snippet}
        </RunnerLineupRow>
      </div>
    {/each}
  </div>
  <footer class="team-results">
    <dl>
      <div>
        <dt title="Uncertainty in the team's win rate, as a 95% confidence interval.">Win range</dt>
        <dd>{formatRate(interval[0])}–{formatRate(interval[1])}</dd>
      </div>
      <div>
        <dt>Races</dt>
        <dd>{team.wins} of {team.appearances} won</dd>
      </div>
      <div class="trainer">
        <dt>Trainer</dt>
        <dd title={team.trainer}>{team.trainer}</dd>
      </div>
    </dl>
    <div class="team-actions">
      {#if own}
        <span class="own-team">Your team</span>
      {/if}
      {#if onreplay}
        <Button
          size="sm"
          variant="secondary"
          icon="race"
          ariaLabel={'Watch a race with team ' + position}
          onclick={onreplay}
        >
          Watch
        </Button>
      {/if}
    </div>
  </footer>
</article>

<style>
  @import './session-team-card.css';
</style>
