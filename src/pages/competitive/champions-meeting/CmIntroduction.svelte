<script lang="ts">
  import Button from '@/components/controls/Button.svelte';

  let { onbrowse }: { onbrowse: () => void } = $props();
</script>

<section class="introduction">
  <div class="intro-heading">
    <h2>Understand the meeting</h2>
    <p>
      Published simulations of captured Champions Meeting teams. Choose an analysis to explore the
      field, then follow a composition or Uma to its captured builds.
    </p>
  </div>
  <div class="reading-guide">
    <section>
      <h3>Reading the results</h3>
      <p>
        These are simulated results, not the original race outcomes. Player appearances are weighted
        equally. Neutral win rates are <strong>11.1% per Uma</strong>
        and
        <strong>33.3% per team</strong>
        .
      </p>
      <p>
        Associated team win rate includes wins by an Uma’s teammates. Player counts can overlap; use
        the minimum-player filters and confidence intervals to judge sample size.
      </p>
      <Button
        variant="ghost"
        size="sm"
        icon="book"
        href="/research/new-age-umamusume-data"
      >
        Dataset methodology
      </Button>
    </section>
    <section>
      <h3>Explore the builds behind the numbers</h3>
      <p>
        Choose a style representative or team composition to find matching captured teams. Open a
        team to inspect every build.
      </p>
      <p>
        Simulate a captured team, or add single Uma from different teams to the race simulator and
        race them together.
      </p>
      <Button
        variant="secondary"
        size="sm"
        icon="arrow-right"
        onclick={onbrowse}
      >
        Browse captured teams
      </Button>
    </section>
  </div>
</section>

<style>
  .introduction {
    margin-top: 18px;
    padding: 18px 0 0;
    border-top: 1px solid var(--border-subtle);
  }
  .intro-heading {
    max-width: 900px;
  }
  .introduction h2 {
    font-size: 20px;
    margin: 0 0 8px;
  }
  .introduction h3 {
    font-size: 15px;
    margin: 0 0 12px;
  }
  .introduction p {
    font-size: 13px;
    line-height: 1.75;
    color: var(--text-secondary);
  }
  .reading-guide {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 36px;
    padding: 20px 0;
  }
  @media (max-width: 767px) {
    .reading-guide {
      grid-template-columns: 1fr;
    }
    .reading-guide {
      gap: 24px;
    }
  }
</style>
