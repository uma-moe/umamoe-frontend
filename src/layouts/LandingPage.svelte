<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import { loadSiteStatistics, type SiteStatistics } from '@/services/site/site-statistics';
  import SiteStatisticsStrip from '@/components/SiteStatistics.svelte';
  import SourcePage from './SourcePage.svelte';
  import ContentAd from './ads/ContentAd.svelte';

  let {
    routeId,
    title,
    description,
    heading,
    controls,
    statistics,
    children
  }: {
    routeId: string;
    title: string;
    description: string;
    /** Custom branding; defaults to the page title as the hero heading. */
    heading?: Snippet;
    /** Filters or search between the description and the links. */
    controls?: Snippet;
    /** Replaces the site-wide statistics strip with figures for this section. */
    statistics?: Snippet;
    children: Snippet;
  } = $props();

  let siteStats = $state<SiteStatistics>();

  onMount(() => {
    if (statistics) return;

    const controller = new AbortController();
    void loadSiteStatistics(controller.signal)
      .then((value) => (siteStats = value))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) console.warn('Site statistics could not be loaded.', error);
      });

    return () => controller.abort();
  });
</script>

<div class="landing-page {routeId}">
  <div class="landing-hero">
    <SourcePage
      {routeId}
      {title}
      width="normal"
      fullBleed
    >
      <section class="hero">
        <div class="hero-content">
          {#if heading}
            {@render heading()}
          {:else}
            <h1 class="landing-title">{title}</h1>
          {/if}
          <p class="hero-subtitle">{description}</p>
          {#if controls}
            <div class="hero-controls">{@render controls()}</div>
          {/if}
          <div class="quick-links">{@render children()}</div>
        </div>
      </section>
    </SourcePage>
  </div>
  <ContentAd
    {routeId}
    railAlternative={false}
    top
  />
  {#if statistics}
    {@render statistics()}
  {:else}
    <SiteStatisticsStrip stats={siteStats} />
  {/if}
</div>

<style>
  .landing-page {
    --statistics-card-bg: var(--card-surface-bg);
    display: flex;
    flex-direction: column;
    background: var(--bg-primary);
  }
  .landing-hero {
    flex: 1;
    display: flex;
  }
  .landing-hero :global(.page-boundary),
  .landing-hero :global(.page-content),
  .landing-hero :global(.page-body),
  .landing-hero :global(.source-page) {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: auto;
  }
  .landing-hero :global(.page-grid) {
    flex: 1;
  }
  .hero {
    flex: 1;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    place-items: center;
    padding: 4rem 2rem;
    background:
      radial-gradient(circle at 20% 50%, rgb(100 181 246/0.1), transparent 50%),
      radial-gradient(circle at 80% 20%, rgb(129 199 132/0.1), transparent 50%),
      radial-gradient(circle at 40% 80%, rgb(255 183 77/0.1), transparent 50%);
  }
  .tools .hero {
    min-height: calc(100dvh - var(--utility-height));
  }
  .hero-content {
    min-width: 0;
    width: 100%;
    max-width: 800px;
    text-align: center;
  }
  .landing-title {
    margin: 0 0 1rem;
    background: var(--gradient-heading);
    background-clip: text;
    color: transparent;
    font-size: clamp(2rem, 5vw, 3rem);
    font-weight: 800;
    line-height: 1.1;
  }
  .hero-subtitle {
    margin: 0 0 3rem;
    color: var(--text-secondary);
    font-size: 1.25rem;
  }
  .hero-controls {
    max-width: 900px;
    margin: 0 auto 1.5rem;
    text-align: left;
  }
  .quick-links {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 1.5rem;
    max-width: 900px;
    margin: 0 auto;
  }
  :global([data-theme='light']) .hero {
    background: var(--hero-light-bg);
    border-bottom: 1px solid var(--card-surface-border);
  }
  @media (min-width: 769px) and (max-height: 1000px) {
    .hero {
      padding: clamp(1rem, 2dvh, 2rem) 2rem;
    }
    .hero-subtitle {
      margin-bottom: 1.5rem;
    }
    .hero-controls {
      margin-bottom: 1rem;
    }
    .quick-links {
      gap: 1rem;
    }
  }
  @media (max-width: 768px) {
    .hero {
      padding: 16px 8px;
    }
    .landing-title {
      margin-bottom: 8px;
      font-size: 2rem;
    }
    .hero-subtitle {
      margin-bottom: 16px;
      font-size: 13px;
    }
    .hero-controls {
      margin-bottom: 12px;
    }
    .quick-links {
      grid-template-columns: 1fr;
      gap: 8px;
      width: 100%;
    }
  }
</style>
