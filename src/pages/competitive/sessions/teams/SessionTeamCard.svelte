<script lang="ts">
  import type { RaceRunner } from '@/lib/race/capture/race-capture-parser';
  import Artwork from '@/components/game/Artwork.svelte';
  import StatStrip from '@/components/game/StatStrip.svelte';
  import Button from '@/components/controls/Button.svelte';
  import { identity, percent, stats, styleColors } from '../../analysis-view';
  import { isSmallSample } from '../session-insights';
  import { isPlayerTeam, type SessionTeam } from '../session-statistics';

  /** One captured team build: its record in the header, then one line per member build. */
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

{#snippet member(runner: RaceRunner)}
  {@const summary = identity(runner)}
  <li class="member">
    <Artwork
      src={summary.image}
      alt=""
      size="xs"
    />
    <h3 title={runner.name}>{runner.name}</h3>
    <span
      class="style"
      style:color={styleColors[runner.result?.runningStyle ?? 0]}
    >
      {summary.detail}
    </span>
    <StatStrip
      items={stats(runner)}
      presentation="values"
      compact
      label={runner.name + ' build stats'}
    />
  </li>
{/snippet}

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
    <span class="team-number">#{position}</span>
    {#if isPlayerTeam(team)}
      <span class="own-team">Your team</span>
    {/if}
    <span
      class="trainer"
      title={team.trainer}
    >
      {team.trainer}
    </span>
    <span
      class="team-rate"
      class:few={isSmallSample(team.appearances)}
      title={'Won ' + team.wins + ' of ' + team.appearances + ' races with any member'}
    >
      <strong>{percent(team.wins, team.appearances)}</strong>
      {team.wins}/{team.appearances}
    </span>
    {#if onreplay}
      <span class="team-actions">
        <Button
          size="sm"
          variant="ghost"
          icon="race"
          ariaLabel={'Watch a race with team ' + position}
          onclick={onreplay}
        >
          Watch
        </Button>
      </span>
    {/if}
  </header>
  <ul class="members">
    {#each team.members as runner (runner.index)}
      {@render member(runner)}
    {/each}
  </ul>
</article>

<style>
  @import './session-team-card.css';
</style>
