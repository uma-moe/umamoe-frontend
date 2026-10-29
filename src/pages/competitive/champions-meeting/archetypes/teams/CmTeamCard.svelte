<script lang="ts">
  import type { Build, Performer, Summary } from '../../../hakuraku-types';
  import { pct, number, buildRunner, styleNames, capturedSkillPoints } from '../../cm-data';
  import type { SkillData } from '@/lib/game-data/skills/skills';
  import { SHORT_STYLE } from '../../../hakuraku-query';
  import Button from '@/components/controls/Button.svelte';
  import RunnerLineupRow from '../../../runners/RunnerLineupRow.svelte';
  import type { CmLobby } from '../lobby/cm-lobby.svelte';
  import { runnerKey } from '../lobby/lobby-slots';
  import LobbyToggle from './LobbyToggle.svelte';

  interface Props {
    team: Performer;
    position: number;
    data: Summary;
    colors: Record<number, string>;
    showStats: boolean;
    skillCatalog?: Map<number, SkillData>;
    lobby: CmLobby;
    onopen: () => void;
  }

  let { team, position, data, colors, showStats, skillCatalog, lobby, onopen }: Props = $props();

  const inLobby = $derived(lobby.hasTeam(team.id));
  const loadingTeam = $derived(lobby.pending.includes(team.id));
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
  <div class="members">
    {#each team.members as member, i}
      {@const card = data.cards[member.card]}
      {@const share = team.wins ? team.memberWins[i]! / team.wins : 0}
      <div class="member">
        <RunnerLineupRow
          runner={buildRunner(member as Build, data, i)}
          outfit={card?.outfit ?? 'Unknown outfit'}
          style={styleNames[member.style]}
          color={colors[member.style]}
          {showStats}
          sp={capturedSkillPoints(member, skillCatalog)}
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
        <LobbyToggle
          name={card?.name ?? 'this Uma'}
          added={lobby.hasRunner(team.id, i)}
          loading={lobby.pending.includes(runnerKey(team.id, i))}
          ontoggle={() => lobby.toggleRunner(team.id, i)}
        />
      </div>
    {/each}
  </div>
  <footer class="team-results">
    <dl>
      <div>
        <dt
          title="Uncertainty in the simulated win rate, calculated with a 95% confidence interval."
        >
          Win range
        </dt>
        <dd>{pct(team.ci[0])}–{pct(team.ci[1])}</dd>
      </div>
      <div>
        <dt>Races</dt>
        <dd>{number(team.n)}</dd>
      </div>
    </dl>
    <div class="team-actions">
      <Button
        size="sm"
        variant="secondary"
        icon={inLobby ? 'check' : 'add'}
        loading={loadingTeam}
        ariaLabel={(inLobby ? 'Remove team ' : 'Add team ') +
          (position + 1) +
          (inLobby ? ' from the lobby' : ' to the lobby')}
        ariaPressed={inLobby}
        onclick={() => lobby.toggleTeam(team.id)}
      >
        {inLobby ? 'In lobby' : 'Add team'}
      </Button>
    </div>
  </footer>
</article>

<style>
  @import './cm-team-card.css';
</style>
