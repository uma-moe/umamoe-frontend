<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { PageWidth } from '@/layouts/breakpoints';
  import PageFrame from '@/layouts/PageFrame.svelte';
  import AdRegion from '@/layouts/AdRegion.svelte';
  import { fuseIdForPlacement } from '@/services/ads/ad-slots';
  import Icon from '@/components/Icon.svelte';

  let { routeId, title, blurb, width = 'wide', children }: {
    routeId: string; title: string; blurb: string; width?: PageWidth; children: Snippet;
  } = $props();
  const titleId = $derived(routeId+'-title');
  const race = $derived(routeId === 'simulator-race');
</script>

<svelte:head><title>{title} · uma.moe</title><meta name="robots" content="noindex, nofollow"/></svelte:head>

<PageFrame {routeId} pageTitle={title} {width} adsEnabled={race && Boolean(fuseIdForPlacement('tools_sticky_vrec_right'))} labelledby={titleId}>
  {#snippet rightAd()}<AdRegion placement="tools_sticky_vrec_right" kind="rail" sizes={['160x600', '120x600']} active={race}/>{/snippet}
  <main>
    <header class="intro">
      <span class="intro-icon"><Icon name={routeId === 'simulator' ? 'battery' : 'race'} size={26}/></span>
      <div><h1 id={titleId}>{title}</h1><p>{blurb}</p></div>
    </header>
    {@render children()}
  </main>
</PageFrame>

<style>
  main{display:flex;flex-direction:column;gap:var(--space-4);padding-inline:var(--space-4)}
  @media(min-width:768px){main{padding-inline:var(--page-gutter-compact)}}
  @media(min-width:1800px){main{padding-inline:var(--page-gutter-expanded)}}
  .intro{display:flex;align-items:center;gap:12px;margin:8px 0 0}
  .intro-icon{display:grid;place-items:center;width:42px;height:42px;flex:none;border-radius:var(--radius-md);background:var(--color-accent-soft);color:var(--accent-primary)}
  h1{margin:0;font-size:26px;letter-spacing:-.03em;line-height:1.2}
  .intro p{max-width:65ch;margin:var(--space-1) 0 0;color:var(--color-text-muted);font-size:12px;line-height:1.5}
  @media(max-width:600px){.intro p{font-size:11px}}
</style>
