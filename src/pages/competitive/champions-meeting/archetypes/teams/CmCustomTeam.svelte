<script lang="ts">
  import type { Build, Performer, Summary } from '../../../hakuraku-types';
  import { styleNames } from '../../cm-data';
  import { portrait } from '../../../analysis-view';
  import Button from '@/components/controls/Button.svelte';
  import Artwork from '@/components/game/Artwork.svelte';
  import Icon from '@/components/Icon.svelte';

  interface Props {
    data: Summary;
    lobby: Performer[];
    teamDraft: { key: string; build: Build }[];
    pendingTeams: string[];
    pendingRunners: string[];
    teamError: string;
    onbuildteam: () => void;
    onremoverunner: (key: string) => void;
    onclearteam: () => void;
  }

  let {
    data,
    lobby,
    teamDraft,
    pendingTeams,
    pendingRunners,
    teamError,
    onbuildteam,
    onremoverunner,
    onclearteam
  }: Props = $props();
</script>

<section
  class="custom-team"
  aria-label="Custom team selection"
>
  <header>
    <div>
      <strong>Build a team · {teamDraft.length}/3</strong>
      <p>Choose individual Uma from any captured team.</p>
    </div>
    <Button
      size="sm"
      variant="ghost"
      disabled={!teamDraft.length || pendingRunners.length > 0}
      onclick={onclearteam}
    >
      Clear selection
    </Button>
  </header>
  <div class="custom-slots">
    {#each [0, 1, 2] as slot}
      {@const entry = teamDraft[slot]}{#if entry}
        <div>
          <Artwork
            src={portrait(entry.build.card)}
            alt=""
            size="sm"
          />
          <span>
            <strong>{data.cards[entry.build.card]?.name}</strong>
            <small>
              {data.cards[entry.build.card]?.outfit} · {styleNames[entry.build.racingStyle]}
            </small>
          </span>
          <button
            class="runner-toggle chosen"
            aria-label={'Remove ' + data.cards[entry.build.card]?.name + ' from selection'}
            onclick={() => onremoverunner(entry.key)}
          >
            <Icon
              name="close"
              size={16}
            />
          </button>
        </div>
      {:else}
        <div class="vacant">
          <span aria-hidden="true">+</span>
          <span>Runner {slot + 1}</span>
        </div>
      {/if}
    {/each}
  </div>
  <footer>
    <span>
      {teamError ||
        (lobby.length >= 3
          ? 'Lobby full · Remove a team to add this one.'
          : pendingRunners.length
            ? 'Loading captured build…'
            : 'Selected builds retain their stats, aptitudes and skills.')}
    </span>
    <Button
      size="sm"
      disabled={teamDraft.length !== 3 ||
        lobby.length + pendingTeams.length >= 3 ||
        pendingRunners.length > 0}
      onclick={onbuildteam}
    >
      Add custom team to lobby
    </Button>
  </footer>
</section>

<style>
  @import '../archetype-text.css';
  @import './runner-toggle.css';
  .custom-team {
    display: grid;
    gap: 8px;
    margin: 0 0 12px;
    padding: 10px 12px;
    background: var(--surface-1);
    border-radius: var(--radius-md);
  }
  .custom-team header,
  .custom-team footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .custom-team strong {
    font-size: 12px;
  }
  .custom-team p,
  .custom-team small,
  .custom-team footer > span {
    font-size: 10px;
    color: var(--text-secondary);
    margin: 2px 0 0;
  }
  .custom-slots {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }
  .custom-slots > div {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding: 6px 8px;
    background: var(--surface-2);
    border-radius: var(--radius-sm);
  }
  .custom-slots > div > span {
    min-width: 0;
    flex: 1;
  }
  .custom-slots strong,
  .custom-slots small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .custom-slots .vacant {
    color: var(--text-secondary);
    font-size: 11px;
    min-height: 40px;
  }
  @media (max-width: 760px) {
    .custom-slots {
      grid-template-columns: 1fr;
    }
    .custom-team footer {
      align-items: start;
      flex-wrap: wrap;
    }
    .custom-team footer > :global(button) {
      width: 100%;
    }
  }
  .custom-slots :global(.art) {
    width: 48px;
    height: 48px;
    border: 0;
    background: transparent;
  }
</style>
