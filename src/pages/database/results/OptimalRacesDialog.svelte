<script lang="ts">
  import { MediaQuery } from 'svelte/reactivity';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import RaceSchedule from '@/components/game/RaceSchedule.svelte';
  import {
    optimalRaceSchedule,
    type OptimalRaceRecommendation
  } from '@/lib/game-data/racing/races';

  interface Props {
    open?: boolean;
    recommendations: OptimalRaceRecommendation[];
  }

  let { open = $bindable(false), recommendations }: Props = $props();

  const schedule = $derived(optimalRaceSchedule(recommendations));

  const mobile = new MediaQuery('(max-width:768px)');
</script>

<div class="optimal-races-dialog">
  <Dialog
    bind:open
    title="Optimal Races"
    icon="trophy"
    description="Win these G1s with the parent you are building to maximize future race affinity."
    maxWidth="1320px"
    contentPadding="0"
    mobileContentPadding="0"
  >
    {#snippet headerActions()}
      <div class="legend">
        <span>
          <strong>+6</strong>
          both parents
        </span>
        <span>
          <strong>+3</strong>
          one parent
        </span>
      </div>
    {/snippet}
    {#if open}
      <div class="calendar">
        {#if !mobile.current}
          <div class="desktop-schedule">
            <RaceSchedule
              years={schedule}
              label="Optimal G1 races"
            />
          </div>
        {:else}
          <div class="mobile-schedule">
            {#each schedule.filter((year) => year.slots.length) as year (year.id)}
              <section class="year year--{year.id}">
                <h3>{year.label}</h3>
                {#each year.slots as slot (slot.id)}
                  {@const race = slot.races[0]!}
                  {@const recommendation = recommendations.find(
                    (entry) => String(entry.raceInstanceId) === race.id
                  )!}
                  {@const parents =
                    recommendation.overlapsP1 && recommendation.overlapsP2
                      ? 'P1 + P2'
                      : recommendation.overlapsP1
                        ? 'P1'
                        : 'P2'}
                  <article
                    class="race"
                    aria-label={`${race.name} - ${parents} - +${race.affinityGain} affinity`}
                  >
                    <div class="art">
                      {#if race.image}
                        <img
                          src={race.image}
                          alt=""
                          loading="lazy"
                          onerror={(event) =>
                            ((event.currentTarget as HTMLImageElement).hidden = true)}
                        />
                      {/if}
                      <span>{race.shortName ?? race.name}</span>
                    </div>
                    <div class="race-meta">
                      <time>{slot.label}</time>
                      <span>{race.name}</span>
                    </div>
                    <div class="affinity">
                      <strong>+{race.affinityGain}</strong>
                      <span>{parents}</span>
                    </div>
                  </article>
                {/each}
              </section>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
    <p class="note">
      Race affinity is awarded when this new parent later appears above the matching P1/P2 legacies.
    </p>
  </Dialog>
</div>

<style>
  .optimal-races-dialog :global(.dialog-panel > header) {
    min-height: 56px;
    padding: 8px 12px;
    align-items: center;
  }
  .optimal-races-dialog :global(.heading) {
    padding: 0;
  }
  .optimal-races-dialog :global(.heading h2) {
    font-size: 14px;
  }
  .optimal-races-dialog :global(dialog),
  .optimal-races-dialog :global(.dialog-panel) {
    max-height: 90dvh;
  }
  .optimal-races-dialog :global(.dialog-panel > .content) {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .optimal-races-dialog :global(.header-icon) {
    width: 38px;
    height: 38px;
    flex-basis: 38px;
    border-radius: 10px;
    color: #ffca28;
    background: rgb(255 202 40/0.1);
    border: 1px solid rgb(255 202 40/0.24);
  }
  .legend {
    display: flex;
    flex: 0 0 auto;
    flex-wrap: wrap;
    gap: 7px 18px;
    padding: 0;
    color: var(--text-muted);
    font-size: 0.7rem;
  }
  .legend strong {
    color: #ffca28;
    font-family: var(--font-mono);
  }
  .calendar {
    flex: 1 1 auto;
    min-height: 0;
    padding: 12px 16px 16px;
    overflow: auto;
    overscroll-behavior: contain;
  }
  .desktop-schedule {
    min-width: 1040px;
  }
  .mobile-schedule {
    display: none;
  }
  .note {
    flex: 0 0 auto;
    margin: 0;
    padding: 11px 18px 14px;
    border-top: 1px solid var(--border-subtle);
    color: var(--text-muted);
    font-size: 0.66rem;
    line-height: 1.4;
  }
  .year {
    display: grid;
    gap: 3px;
  }
  .year h3 {
    margin: 0;
    padding: 4px 7px;
    border-radius: 5px;
    font-size: 9px;
    font-weight: 750;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .year--junior h3 {
    color: #90caf9;
    background: rgb(33 150 243/0.14);
  }
  .year--classic h3 {
    color: #f5c83a;
    background: rgb(245 200 58/0.12);
  }
  .year--senior h3 {
    color: var(--accent-secondary);
    background: rgb(102 187 106/0.12);
  }
  .race {
    min-width: 0;
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr) 36px;
    align-items: center;
    gap: 6px;
    min-height: 42px;
    padding: 3px 5px;
    border: 1px solid var(--border-subtle);
    border-left: 3px solid var(--race-g1);
    border-radius: 5px;
    background: var(--surface-1);
  }
  .art {
    position: relative;
    display: grid;
    place-items: center;
    width: 72px;
    height: 36px;
    overflow: hidden;
    border: 1px solid var(--race-g1);
    border-radius: 4px;
    background: var(--surface-2);
  }
  .art img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .art img:not([hidden]) + span {
    display: none;
  }
  .art span {
    padding: 5px;
    font-size: 9px;
    text-align: center;
    color: var(--text-secondary);
  }
  .race-meta {
    min-width: 0;
    display: grid;
    gap: 1px;
  }
  .race-meta time {
    color: var(--text-secondary);
    font-size: 8px;
    font-weight: 700;
    line-height: 1.25;
  }
  .race-meta > span {
    color: var(--text-muted);
    font-size: 9px;
    line-height: 1.15;
  }
  .affinity {
    display: grid;
    justify-items: center;
    gap: 1px;
  }
  .affinity strong {
    color: var(--accent-secondary);
    font-family: var(--font-mono);
    font-size: 12px;
    line-height: 1.1;
  }
  .affinity span {
    color: var(--text-muted);
    font-size: 7px;
    font-weight: 700;
    white-space: nowrap;
  }
  @media (max-width: 768px) {
    .desktop-schedule {
      display: none;
    }
    .mobile-schedule {
      display: grid;
      gap: 6px;
    }
    .calendar {
      overflow-x: hidden;
    }
  }
  @media (max-width: 520px) {
    .optimal-races-dialog :global(dialog),
    .optimal-races-dialog :global(.dialog-panel) {
      max-height: min(84dvh, 660px);
    }
    .optimal-races-dialog :global(.dialog-panel > header) {
      gap: 8px;
      padding: 8px;
    }
    .optimal-races-dialog :global(.header-icon),
    .optimal-races-dialog :global(.heading p) {
      display: none;
    }
    .legend {
      display: grid;
      gap: 4px;
      font-size: 0.61rem;
    }
    .calendar {
      padding: 5px 7px 7px;
    }
    .note {
      display: none;
    }
  }
  @media (max-width: 360px) {
    .race {
      grid-template-columns: 64px minmax(0, 1fr) 34px;
    }
    .art {
      width: 64px;
      height: 32px;
    }
  }
</style>
