<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Build, Performer, Summary } from '../../../hakuraku-types';
  import { pct, number, buildRunner, styleNames } from '../../cm-data';
  import { SHORT_STYLE } from '../../../hakuraku-query';
  import Button from '@/components/controls/Button.svelte';
  import Icon from '@/components/Icon.svelte';
  import RunnerLineupRow from '../../../runners/RunnerLineupRow.svelte';

  interface Props {
    team: Performer;
    position: number;
    data: Summary;
    colors: Record<number, string>;
    showStats: boolean;
    inLobby: boolean;
    pending: boolean;
    lobbyFull: boolean;
    runnerToggle: Snippet<[Performer, number]>;
    onopen: () => void;
    ontoggle: () => void;
  }

  let {
    team,
    position,
    data,
    colors,
    showStats,
    inLobby,
    pending,
    lobbyFull,
    runnerToggle,
    onopen,
    ontoggle
  }: Props = $props();
</script>

<article
  data-virtual-index={position}
  class="team-row"
  class:in-lobby={inLobby}
  aria-label={'Team ' + (position + 1)}
>
  <button
    class="team-open"
    aria-label={'View team ' + (position + 1) + ' details'}
    onclick={onopen}
  ></button>
  <header class="team-heading">
    <div>
      <span class="team-number">#{number(position + 1)}</span>
      <span class="lineup">
        {#each team.members as member, i}
          {#if i}
            <span class="slash">/</span>
          {/if}
          <span
            style:color={colors[member.style]}
            title={styleNames[member.style]}
          >
            {SHORT_STYLE[member.style]}
          </span>
        {/each}
      </span>
    </div>
    <div class="team-rate">
      <strong>{pct(team.wins / team.n)}</strong>
      <span>team wins</span>
    </div>
  </header>
  <div class="member-heading">
    <span>Team lineup</span>
    {#if showStats}
      <span>Build stats</span>
    {/if}
  </div>
  <div class="members">
    {#each team.members as member, i}
      {@const card = data.cards[member.card]}
      {@const share = team.wins ? team.memberWins[i]! / team.wins : 0}
      <div class="member-choice">
        <button
          class="member"
          aria-label={'Inspect ' + card?.name + ' team'}
          onclick={onopen}
        >
          <RunnerLineupRow
            runner={buildRunner(member as Build, data, i)}
            outfit={card?.outfit ?? 'Unknown outfit'}
            style={styleNames[member.style]}
            color={colors[member.style]}
            {showStats}
          >
            {#snippet metadata()}
              <span
                class="member-share"
                title={number(team.memberWins[i] ?? 0) + ' of ' + number(team.wins) + ' team wins'}
              >
                <strong>{pct(share)}</strong>
                <small>of wins</small>
              </span>
            {/snippet}
          </RunnerLineupRow>
          <Icon
            name="chevron"
            size={13}
          />
        </button>
        {@render runnerToggle(team, i)}
      </div>
    {/each}
  </div>
  <footer class="team-results">
    <dl>
      <div>
        <dt
          title="Uncertainty in the simulated win rate, calculated with a 95% confidence interval."
        >
          Estimated win range
        </dt>
        <dd>{pct(team.ci[0])}–{pct(team.ci[1])}</dd>
      </div>
      <div>
        <dt>Simulated races</dt>
        <dd>{number(team.n)}</dd>
      </div>
    </dl>
    <div class="team-actions">
      <Button
        size="sm"
        variant="secondary"
        onclick={(event) => {
          (event.currentTarget as HTMLButtonElement).focus({ preventScroll: true });
          onopen();
        }}
      >
        Details
      </Button><Button
        size="sm"
        variant={inLobby ? 'secondary' : 'primary'}
        disabled={pending || (!inLobby && lobbyFull)}
        onclick={ontoggle}
      >
        {inLobby ? 'Remove' : pending ? 'Loading…' : lobbyFull ? 'Lobby full' : 'Add to lobby'}
      </Button>
    </div>
  </footer>
</article>

<style>
  @import './cm-team-card.css';
</style>
