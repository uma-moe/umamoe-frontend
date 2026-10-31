<script lang="ts">
  import Button from '@/components/controls/Button.svelte';

  let { onbrowse }: { onbrowse: () => void } = $props();

  const readingNotes = [
    'These are simulated results, not the original race outcomes.',
    'Player appearances are weighted equally.',
    'Associated team win rate includes wins by an Uma’s teammates.',
    'Player counts can overlap. Use the minimum-player filters and confidence intervals to judge sample size.'
  ];

  const buildSteps = [
    {
      title: 'Choose a style representative or team composition',
      detail: 'Find the captured teams that match it.'
    },
    { title: 'Open a team', detail: 'Inspect every build in it.' },
    {
      title: 'Simulate the team',
      detail: 'Or add single Uma from different teams to the race simulator and race them together.'
    }
  ];
</script>

<section
  class="introduction"
  aria-labelledby="cm-introduction-title"
>
  <h2 id="cm-introduction-title">Understand the meeting</h2>
  <div class="guide-cards">
    <section
      class="guide-card"
      aria-labelledby="cm-reading-title"
    >
      <header>
        <h3 id="cm-reading-title">Reading the results</h3>
        <Button
          variant="secondary"
          size="sm"
          icon="book"
          href="/research/new-age-umamusume-data"
        >
          Dataset methodology
        </Button>
      </header>
      <dl class="neutral-rates">
        <div>
          <dt>Neutral win rate per Uma</dt>
          <dd>11.1%</dd>
        </div>
        <div>
          <dt>Neutral win rate per team</dt>
          <dd>33.3%</dd>
        </div>
      </dl>
      <ul class="guide-rows">
        {#each readingNotes as note}
          <li>{note}</li>
        {/each}
      </ul>
    </section>
    <section
      class="guide-card"
      aria-labelledby="cm-builds-title"
    >
      <header>
        <h3 id="cm-builds-title">Explore the builds behind the numbers</h3>
        <Button
          variant="secondary"
          size="sm"
          icon="arrow-right"
          onclick={onbrowse}
        >
          Browse captured teams
        </Button>
      </header>
      <ol class="guide-rows build-steps">
        {#each buildSteps as step}
          <li>
            <strong>{step.title}</strong>
            <span>{step.detail}</span>
          </li>
        {/each}
      </ol>
    </section>
  </div>
</section>

<style>
  @import './cm-introduction.css';
</style>
