<script lang="ts">
  import type { Snippet } from 'svelte';
  import PageFrame from '@/layouts/PageFrame.svelte';

  interface Props {
    routeId: string;
    /** Page heading, and the document title before the site name. */
    title: string;
    blurb: string;
    children: Snippet;
  }

  let { routeId, title, blurb, children }: Props = $props();

  const titleId = $derived(`${routeId}-title`);
</script>

<svelte:head><title>{title} · uma.moe</title><meta name="robots" content="noindex, nofollow"/></svelte:head>

<PageFrame {routeId} pageTitle={title} width="wide" adsEnabled={false} labelledby={titleId}>
  <main>
    <header class="intro">
      <h1 id={titleId}>{title}</h1>
      <p>{blurb}</p>
    </header>

    {@render children()}
  </main>
</PageFrame>

<style>
  /*
   * `width="wide"` drops PageFrame's inline padding altogether above 768px and
   * leaves the 4px phone gutter below it, which puts the sidebar against the
   * navigation rail and the columns against the viewport edge. The shell needs
   * the gutter back, so it restates the same scale PageFrame uses elsewhere.
   */
  main {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding-inline: var(--space-4);
  }

  @media (min-width: 768px) {
    main { padding-inline: var(--page-gutter-compact); }
  }

  @media (min-width: 1800px) {
    main { padding-inline: var(--page-gutter-expanded); }
  }

  .intro { margin: 0; }
  h1 { margin: 0; font-size: var(--font-lg); }
  .intro p {
    max-width: 65ch;
    margin: var(--space-1) 0 0;
    color: var(--color-text-muted);
    font-size: var(--font-sm);
  }
</style>
