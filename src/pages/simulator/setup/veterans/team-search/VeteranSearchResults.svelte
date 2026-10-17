<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import SimulatorRunnerFace from '../../../reports/SimulatorRunnerFace.svelte';
  import { teamBestPlace, teamInterval, teamRate, type TeamResult } from './team-results';

  interface Props {
    top: TeamResult[];
    busy: boolean;
    stale: boolean;
    blocked: string;
    onuse: (team: TeamResult) => void;
    onsearch: () => void;
  }

  let { top, busy, stale, blocked, onuse, onsearch }: Props = $props();

  const best = $derived(top[0]);
</script>

<section
  class="results"
  class:stale
  aria-label="Best teams"
>
  {#if best}
    {@const range = teamInterval(best)}
    <div class="answer">
      <p class="label">{busy ? 'Best so far' : 'Best team'}</p>
      <ul class="lineup">
        {#each best.umas as uma (uma.id)}
          <li>
            <SimulatorRunnerFace
              cardId={uma.cardId}
              size={40}
            />
            <span>{uma.name}</span>
          </li>
        {/each}
      </ul>
      <p class="headline">
        Wins <strong>{teamRate(best).toFixed(1)}%</strong>
        <span>({range[0].toFixed(1)}–{range[1].toFixed(1)}%)</span>
      </p>
      <p class="detail">
        Best finisher places {teamBestPlace(best).toFixed(2)} on average · {best.successes.toLocaleString(
          'en-US'
        )}
        races
      </p>
      <Button
        icon="race"
        disabled={busy}
        onclick={() => onuse(best)}
      >
        Race this team
      </Button>
      {#if stale}<p class="stale-note">
          Setup changed since this search
          <Button
            size="sm"
            variant="secondary"
            icon="refresh"
            disabled={!!blocked}
            onclick={onsearch}
          >
            Search again
          </Button>
        </p>{/if}
    </div>
    {#if top.length > 1}
      <h4>Close behind</h4>
      <ol class="others">
        {#each top.slice(1) as team, index (team.id)}
          {@const range = teamInterval(team)}
          <li>
            <span class="place">{index + 2}</span>
            <span class="faces">
              {#each team.umas as uma (uma.id)}
                <SimulatorRunnerFace
                  cardId={uma.cardId}
                  size={24}
                />
              {/each}
            </span>
            <span class="names">{team.umas.map((uma) => uma.name).join(' · ')}</span>
            <span
              class="rate"
              title="{range[0].toFixed(1)}–{range[1].toFixed(1)}%"
            >
              <strong>{teamRate(team).toFixed(1)}%</strong>
              <small>{teamBestPlace(team).toFixed(2)}</small>
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              ariaLabel={'Race ' + team.umas.map((uma) => uma.name).join(', ')}
              onclick={() => onuse(team)}
            >
              Race
            </Button>
          </li>
        {/each}
      </ol>
      <p class="note">
        Win rate is how often one of the three wins; the small number is where the best finisher
        places on average. Showing the best {top.length}.
      </p>
    {/if}
  {:else if !busy}
    <div class="idle">
      <p class="headline">Which three should race?</p>
      <p class="detail">
        Pick your Veterans and who they race, then Find the best team. Every team gets the same
        opponents, seeds and gates.
      </p>
    </div>
  {/if}
</section>

<style>
  .note {
    margin: 0;
    font-size: 12px;
    line-height: 1.5;
    color: var(--text-secondary);
  }
  .results {
    display: grid;
    gap: 8px;
    min-width: 0;
  }
  .answer,
  .idle {
    display: grid;
    gap: 6px;
    justify-items: start;
    padding: 12px;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    background: var(--surface-1);
  }
  .answer {
    border-color: color-mix(in srgb, var(--accent-success) 40%, var(--border-subtle));
  }
  .answer p,
  .idle p {
    margin: 0;
  }
  .label {
    font-size: 12px;
    font-weight: 650;
    color: var(--text-secondary);
  }
  .lineup {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 16px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .lineup li {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    font-weight: 650;
  }
  .headline {
    font-size: 15px;
    color: var(--text-secondary);
  }
  .headline strong {
    font-size: 24px;
    font-weight: 700;
    color: var(--accent-success);
    font-variant-numeric: tabular-nums;
  }
  .headline span {
    font-size: 12px;
  }
  .idle .headline {
    font-size: 16px;
    font-weight: 650;
    color: var(--text-primary);
  }
  .detail {
    font-size: 12px;
    color: var(--text-secondary);
  }
  .stale-note {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px 10px;
    font-size: 12px;
    color: var(--accent-warning);
  }
  .stale .lineup,
  .stale .headline,
  .stale .detail,
  .stale .others {
    opacity: 0.5;
  }
  h4 {
    margin: 4px 0 0;
    font-size: 12px;
    font-weight: 650;
    color: var(--text-secondary);
  }
  .others {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .others li {
    display: grid;
    grid-template-columns: 22px auto minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 8px;
    min-height: 36px;
    border-top: 1px solid var(--border-subtle);
    font-size: 12px;
  }
  .place {
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
  }
  .faces {
    display: flex;
    gap: 2px;
  }
  .names {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .rate {
    display: grid;
    justify-items: end;
    line-height: 1.2;
    font-variant-numeric: tabular-nums;
  }
  .rate small {
    font-size: 10px;
    color: var(--text-secondary);
  }
  @media (max-width: 560px) {
    .others li {
      grid-template-columns: 18px auto minmax(0, 1fr) auto;
    }
    .others li :global(.ui-button) {
      grid-column: 2 / -1;
      justify-self: end;
    }
    .names {
      white-space: normal;
    }
  }
</style>
