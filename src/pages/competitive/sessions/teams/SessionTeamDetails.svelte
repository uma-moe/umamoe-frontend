<script lang="ts">
  import { winRateInterval } from '@/lib/race/win-rate-interval';
  import Button from '@/components/controls/Button.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import RunnerBuildDetails from '../../runners/RunnerBuildDetails.svelte';
  import RunnerBuildGroup from '../../runners/RunnerBuildGroup.svelte';
  import { rate, styleColors } from '../../analysis-view';
  import { formatRate } from '../session-insights';
  import type { SessionTeam } from '../session-statistics';

  /** CM Data's team details for one captured team build: its record in the header, then each member's build. */
  let {
    team,
    skillNames,
    raceDistance,
    onclose,
    onreplay
  }: {
    team?: SessionTeam;
    skillNames: Map<number, string>;
    raceDistance?: number;
    onclose: () => void;
    onreplay?: () => void;
  } = $props();
</script>

{#snippet teamOverview(team: SessionTeam)}
  {@const interval = winRateInterval(team.wins, team.appearances)}
  <section
    class="detail-overview"
    aria-label="Captured team overview"
  >
    <dl class="detail-summary">
      <div>
        <dt>Team win rate</dt>
        <dd>{formatRate(rate(team.wins, team.appearances))}</dd>
      </div>
      <div>
        <dt title="Uncertainty in the win rate, calculated with a 95% confidence interval.">
          95% win range
        </dt>
        <dd>{formatRate(interval[0])}–{formatRate(interval[1])}</dd>
      </div>
      <div>
        <dt>Races</dt>
        <dd>{team.wins} of {team.appearances} won</dd>
      </div>
      <div>
        <dt>Trainer</dt>
        <dd>{team.trainer}</dd>
      </div>
    </dl>
  </section>
{/snippet}

<div class="team-details-dialog">
  <Dialog
    open={Boolean(team)}
    title="Team details"
    maxWidth="1480px"
    maxHeight="94dvh"
    mobileMaxHeight="94dvh"
    contentPadding="16px"
    mobileContentPadding="12px"
    {onclose}
  >
    {#snippet headerActions()}
      {#if team}
        <div class="header-overview">
          {@render teamOverview(team)}
        </div>
      {/if}
      {#if onreplay}
        <div class="detail-actions">
          <Button
            size="sm"
            variant="secondary"
            icon="race"
            ariaLabel="Watch a race with this team"
            onclick={onreplay}
          >
            <span class="action-label">Watch race</span>
          </Button>
        </div>
      {/if}
    {/snippet}
    {#if team}
      <!-- The header holds the overview where it fits; narrower dialogs show it above the builds instead. -->
      <div class="content-overview">
        {@render teamOverview(team)}
      </div>
      <RunnerBuildGroup>
        {#each team.members as runner, index (runner.index)}
          {@const memberWins = team.memberWins[index] ?? 0}
          <RunnerBuildDetails
            {runner}
            {skillNames}
            color={styleColors[runner.result?.runningStyle ?? 0]}
            raceContext={{ distance: raceDistance }}
            framed
            inlineMetrics
          >
            {#snippet metrics()}
              <dl class="runner-results">
                <div title="Races this Uma won itself">
                  <dt>win rate</dt>
                  <dd>{formatRate(rate(memberWins, team.appearances))}</dd>
                </div>
                <div title="Share of the team's wins">
                  <dt>of wins</dt>
                  <dd>{team.wins ? formatRate(rate(memberWins, team.wins)) : '—'}</dd>
                </div>
              </dl>
            {/snippet}
          </RunnerBuildDetails>
        {/each}
      </RunnerBuildGroup>
    {/if}
  </Dialog>
</div>

<style>
  @import '../../runners/runner-results.css';
  @import '../../runners/team-details.css';
</style>
