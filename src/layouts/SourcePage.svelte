<script lang="ts">
  import type { Snippet } from 'svelte';
  import AdRegion from './ads/AdRegion.svelte';
  import PageFrame from './PageFrame.svelte';
  import type { PageWidth } from './breakpoints';
  import { adSurfaceForRoute, fuseIdForPlacement } from '@/services/ads/ad-slots';

  interface Props {
    children: Snippet;
    routeId: string;
    title: string;
    width?: PageWidth;
    source?: 'moe' | 'hakuraku';
    fullBleed?: boolean;
  }

  let {
    children,
    routeId,
    title,
    width = 'normal',
    source = 'moe',
    fullBleed = false
  }: Props = $props();

  const adSurface = $derived(adSurfaceForRoute(routeId));
</script>

<PageFrame
  {routeId}
  featureId={routeId}
  pageTitle={title}
  {width}
  {fullBleed}
  adsEnabled={Boolean(adSurface && fuseIdForPlacement(`${adSurface}_sticky_vrec_right`)) &&
    !fullBleed}
>
  {#snippet leftAd()}
    <AdRegion
      placement={`${adSurface}_sticky_vrec_left`}
      kind="rail"
      sizes={['160x600', '120x600']}
      active={Boolean(adSurface)}
    />
  {/snippet}
  {#snippet rightAd()}
    <AdRegion
      placement={`${adSurface}_sticky_vrec_right`}
      kind="rail"
      sizes={['160x600', '120x600']}
      active={Boolean(adSurface)}
    />
  {/snippet}
  <main
    class="source-page"
    class:source-hakuraku={source === 'hakuraku'}
    class:source-moe={source === 'moe'}
    data-page-source={source}
  >
    {@render children()}
  </main>
</PageFrame>

<style>
  .source-page {
    min-width: 0;
    min-height: calc(100dvh - var(--utility-height));
    background: var(--color-canvas);
  }
  .source-hakuraku {
    --haku-bg-0: var(--color-canvas);
    --haku-bg-1: var(--surface-1);
    --haku-bg-2: var(--surface-2);
    --haku-bg-3: var(--bg-quaternary);
    --haku-border: var(--border-primary);
    --haku-border-accent: rgb(99 102 241 / 0.45);
    --haku-accent: #667eea;
    --haku-accent-2: #764ba2;
    --haku-text-primary: var(--text-primary);
    --haku-text-secondary: var(--text-secondary);
    --haku-text-muted: var(--text-muted);
    --haku-radius: 8px;
    --haku-radius-lg: 12px;
    --haku-shadow: 0 2px 12px rgb(0 0 0 / 0.4);
    --haku-shadow-lg: 0 4px 24px rgb(0 0 0 / 0.5);
    --haku-transition: 0.18s ease;
    padding: 20px 0 36px;
    color: var(--haku-text-primary);
  }
  @media (max-width: 767px) {
    .source-page {
      padding-bottom: var(--bottom-nav-height);
    }
    .source-hakuraku {
      padding-top: 8px;
    }
  }
</style>
