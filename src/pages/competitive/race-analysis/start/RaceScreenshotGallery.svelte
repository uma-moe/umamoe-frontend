<script lang="ts">
  import darkReplay from './screenshots/dark-replay.webp';
  import darkStrategy from './screenshots/dark-strategy.webp';
  import darkTeams from './screenshots/dark-teams.webp';
  import lightReplay from './screenshots/light-replay.webp';
  import lightStrategy from './screenshots/light-strategy.webp';
  import lightTeams from './screenshots/light-teams.webp';

  interface Screenshot {
    id: string;
    alt: string;
    dark: string;
    light: string;
  }

  // Captured from the 24-race demo session with the replay at 1:36; recapture both themes together when the report changes.
  const screenshots: Screenshot[] = [
    {
      id: 'replay',
      alt: 'Race replay with the course map, live race field, and speed and HP telemetry.',
      dark: darkReplay,
      light: lightReplay
    },
    {
      id: 'teams',
      alt: 'Session team builds with each runner’s stats, share of the team’s wins, and team win rate.',
      dark: darkTeams,
      light: lightTeams
    },
    {
      id: 'strategy',
      alt: 'Session strategy analysis comparing each running style’s win share with its field share, beside the room compositions.',
      dark: darkStrategy,
      light: lightStrategy
    }
  ];
</script>

<section
  class="screenshot-gallery"
  aria-labelledby="analysis-guide-title"
>
  <h2
    id="analysis-guide-title"
    class="sr-only"
  >
    What you can analyse
  </h2>
  {#each screenshots as shot (shot.id)}
    <figure>
      <img
        class="dark-shot"
        src={shot.dark}
        alt={shot.alt}
        width="1120"
        height="700"
        loading="lazy"
        decoding="async"
      />
      <img
        class="light-shot"
        src={shot.light}
        alt={shot.alt}
        width="1120"
        height="700"
        loading="lazy"
        decoding="async"
      />
    </figure>
  {/each}
</section>

<style>
  .screenshot-gallery {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--space-4);
  }
  figure {
    min-width: 0;
    margin: 0;
    overflow: hidden;
    border: 1px solid var(--card-surface-border);
    border-radius: var(--radius-lg);
    background: var(--bg-primary);
  }
  img {
    display: block;
    width: 100%;
    height: auto;
  }
  .light-shot {
    display: none;
  }
  :global([data-theme='light']) .dark-shot {
    display: none;
  }
  :global([data-theme='light']) .light-shot {
    display: block;
  }
  @media (max-width: 767px) {
    .screenshot-gallery {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
