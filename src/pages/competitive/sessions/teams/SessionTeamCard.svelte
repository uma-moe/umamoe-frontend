<script lang="ts">
  import { runningStyleName } from '@/lib/race/replay/race-display';
  import Button from '@/components/controls/Button.svelte';
  import RunnerLineupRow from '../../runners/RunnerLineupRow.svelte';
  import { percent, styleColors } from '../../analysis-view';
  import type { SessionTeam } from '../session-statistics';

  /** One captured team build in CM Data's team card: the lineup, its members' builds and its record. */
  let {
    team,
    position,
    oninspect,
    onreplay
  }: {
    team: SessionTeam;
    position: number;
    oninspect: () => void;
    onreplay?: () => void;
  } = $props();
</script>

<article
  class="team-card"
  aria-label={'Team ' + position}
>
  <button
    class="team-open"
    aria-label={'Inspect team ' + position + ' builds'}
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
          <span style:color={styleColors[runner.result?.runningStyle ?? 0]}>
            {runningStyleName(runner.result?.runningStyle, true)}
          </span>
        {/each}
      </span>
    </div>
    <div class="team-rate">
      <strong>{percent(team.wins, team.appearances)}</strong>
      <span>team wins</span>
    </div>
  </header>
  <div class="members">
    {#each team.members as runner (runner.index)}
      <RunnerLineupRow
        {runner}
        color={styleColors[runner.result?.runningStyle ?? 0]}
      />
    {/each}
  </div>
  <footer class="team-results">
    <dl>
      <div>
        <dt>Trainer</dt>
        <dd title={team.trainer}>{team.trainer}</dd>
      </div>
      <div>
        <dt>Record</dt>
        <dd>{team.wins} of {team.appearances} races</dd>
      </div>
    </dl>
    {#if onreplay}
      <div class="team-actions">
        <Button
          size="sm"
          variant="secondary"
          icon="race"
          ariaLabel={'Watch a race with team ' + position}
          onclick={onreplay}
        >
          Watch race
        </Button>
      </div>
    {/if}
  </footer>
</article>

<style>
  @import './session-team-card.css';
</style>
