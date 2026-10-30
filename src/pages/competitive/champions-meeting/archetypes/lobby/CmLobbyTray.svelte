<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import Artwork from '@/components/game/Artwork.svelte';
  import Icon from '@/components/Icon.svelte';
  import type { Summary } from '../../../hakuraku-types';
  import { portrait } from '../../../analysis-view';
  import { styleNames } from '../../cm-data';
  import type { CmLobby } from './cm-lobby.svelte';
  import { LOBBY_SIZE, LOBBY_TEAMS, TEAM_SIZE, teamSlots } from './lobby-slots';

  interface Props {
    lobby: CmLobby;
    data: Summary;
    colors: Record<number, string>;
    expanded?: boolean;
  }

  let { lobby, data, colors, expanded = $bindable(false) }: Props = $props();

  const lobbyTeams = Array.from({ length: LOBBY_TEAMS }, (_, team) => team);

  const visible = $derived(
    expanded || lobby.count > 0 || lobby.pending.length > 0 || Boolean(lobby.error)
  );
  const selectedRunner = $derived(lobby.selected === null ? null : lobby.slots[lobby.selected]);

  function runnerName(card: number): string {
    return data.cards[card]?.name ?? 'Uma';
  }

  function clearLobby() {
    lobby.clear();
    expanded = false;
  }

  function placeLabel(slot: number): string {
    const runner = lobby.slots[slot];
    const place =
      'team ' + (Math.floor(slot / TEAM_SIZE) + 1) + ', place ' + ((slot % TEAM_SIZE) + 1);

    if (!runner) return lobby.selected === null ? 'Empty ' + place : 'Move to ' + place;
    if (lobby.selected === slot) return 'Deselect ' + runnerName(runner.build.card);
    if (lobby.selected !== null)
      return 'Swap with ' + runnerName(runner.build.card) + ' in ' + place;

    return 'Select ' + runnerName(runner.build.card) + ' in ' + place;
  }
</script>

{#if visible}
  <aside
    class="lobby-tray"
    class:expanded
    aria-label="Lobby"
  >
    <header class="tray-header">
      <button
        class="tray-toggle"
        aria-expanded={expanded}
        aria-controls="cm-lobby-teams"
        aria-label={expanded ? 'Collapse lobby' : 'Review lobby'}
        onclick={() => (expanded = !expanded)}
      >
        <strong>Lobby</strong>
        <span
          class="tray-count"
          role="status"
        >
          {lobby.count}/{LOBBY_SIZE} Uma{lobby.pending.length ? ' · Loading…' : ''}
        </span>
        <Icon
          name="chevron"
          size={16}
        />
      </button>
      <Button
        size="sm"
        icon="race"
        loading={lobby.opening}
        disabled={!lobby.count || lobby.pending.length > 0}
        onclick={lobby.openInSimulator}
      >
        Open in simulator
      </Button>
    </header>
    {#if lobby.error}
      <div
        class="tray-error"
        role="alert"
      >
        <Banner
          title="Lobby not updated"
          tone="warning"
          dismissible
          ondismiss={() => (lobby.error = '')}
        >
          <p>{lobby.error}</p>
        </Banner>
      </div>
    {/if}
    {#if expanded}
      <div
        id="cm-lobby-teams"
        class="tray-body"
      >
        {#if lobby.count === 0}
          <p class="tray-introduction">
            Add a captured team or use the + beside an Uma to start your lobby.
          </p>
        {/if}
        <div class="lobby-teams">
          {#each lobbyTeams as team}
            {@const places = teamSlots(team)}
            {@const members = places.filter((slot) => lobby.slots[slot] !== null).length}
            <section
              class="lobby-team"
              data-team={team + 1}
              aria-label={'Lobby team ' + (team + 1)}
            >
              <header>
                <h3>
                  Team {team + 1}
                  <span>{members}/3</span>
                </h3>
                {#if members > 0}
                  <Button
                    variant="secondary"
                    size="sm"
                    ariaLabel={'Remove lobby team ' + (team + 1)}
                    onclick={() => lobby.removeTeam(team)}
                  >
                    Remove
                  </Button>
                {/if}
              </header>
              <ol>
                {#each places as slot}
                  {@const runner = lobby.slots[slot]}
                  {@const selected = lobby.selected === slot}
                  <li>
                    <button
                      class="place"
                      class:filled={Boolean(runner)}
                      class:selected
                      aria-pressed={selected}
                      disabled={!runner && lobby.selected === null}
                      aria-label={placeLabel(slot)}
                      title={runner ? runnerName(runner.build.card) : undefined}
                      onclick={() => lobby.pick(slot)}
                    >
                      {#if runner}
                        <Artwork
                          src={portrait(runner.build.card)}
                          alt=""
                          size="xs"
                        />
                        <span class="place-copy">
                          <span class="place-name">{runnerName(runner.build.card)}</span>
                          <small style:color={colors[runner.build.style]}>
                            {styleNames[runner.build.style]}
                          </small>
                        </span>
                      {:else}
                        <span class="place-empty">
                          <Icon
                            name={lobby.selected === null ? 'add' : 'swap'}
                            size={16}
                          />
                          {lobby.selected === null ? 'Empty' : 'Move here'}
                        </span>
                      {/if}
                    </button>
                  </li>
                {/each}
              </ol>
            </section>
          {/each}
        </div>
        <div
          class="tray-status"
          role="status"
        >
          {#if selectedRunner}
            <span>
              <strong>{runnerName(selectedRunner.build.card)}</strong>
              selected.
            </span>
            <Button
              variant="secondary"
              size="sm"
              onclick={() => (lobby.selected = null)}
            >
              Cancel
            </Button>
            <Button
              variant="secondary"
              size="sm"
              ariaLabel={'Remove ' + runnerName(selectedRunner.build.card) + ' from lobby'}
              onclick={() => lobby.selected !== null && lobby.remove(lobby.selected)}
            >
              Remove
            </Button>
          {:else}
            <span>
              {lobby.count ? 'Select an Uma to move or swap.' : 'Up to three teams of three Uma.'}
            </span>
          {/if}
          {#if lobby.count > 0 || lobby.pending.length > 0}
            <Button
              variant="secondary"
              size="sm"
              onclick={clearLobby}
            >
              Clear lobby
            </Button>
          {/if}
        </div>
      </div>
    {/if}
  </aside>
{/if}

<style>
  @import './cm-lobby-tray.css';
</style>
