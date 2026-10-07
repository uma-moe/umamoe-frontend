<script lang="ts">
  import { tick, type Snippet } from 'svelte';
  import type { PageWidth } from './breakpoints';
  import { router } from '@/routes/router';

  interface Props {
    children: Snippet;
    routeId: string;
    featureId?: string;
    pageTitle: string;
    width?: PageWidth;
    labelledby?: string;
    contentId?: string;
    navigation?: Snippet;
    header?: Snippet;
    leftAd?: Snippet;
    rightAd?: Snippet;
    adsEnabled?: boolean;
    fullBleed?: boolean;
    fill?: boolean;
  }

  let {
    children,
    routeId,
    featureId = routeId,
    pageTitle,
    width = 'normal',
    labelledby,
    contentId,
    navigation,
    header,
    leftAd,
    rightAd,
    adsEnabled = true,
    fullBleed = false,
    fill = false
  }: Props = $props();

  const resolvedContentId = $derived(contentId ?? `${routeId}-content`);
  const hasAdRails = $derived(Boolean(adsEnabled && leftAd && rightAd));
  $effect(() => {
    const path = router.route.pathname;
    pageTitle;
    let active = true;
    // Lazy pages can write their head tags after the router has finished loading.
    void tick().then(() => import('@/services/seo')).then(module => { if (active) module.applyRouteMetadata(path); }).catch(() => {});
    return () => { active = false; };
  });
</script>

<div class="page-boundary" class:fill data-page-frame>
  <article
    class="page-grid"
    class:has-ad-rails={hasAdRails}
    aria-labelledby={labelledby}
    data-route-id={routeId}
    data-feature-id={featureId}
    data-page-layout="ad-aware"
    data-page-width={width}
    class:page-grid--wide={width === 'wide'}
    class:page-grid--full-bleed={fullBleed}
  >
    <section class="page-content" id={resolvedContentId} data-page-content>
      {#if navigation}<nav aria-label="{pageTitle} navigation" data-page-navigation>{@render navigation()}</nav>{/if}
      {#if header}<header data-page-header>{@render header()}</header>{/if}
      <div class="page-body" data-page-body>{@render children()}</div>
    </section>
    {#if hasAdRails && leftAd && rightAd}
      <div class="ad-rail ad-rail--left" data-ad-position="left-rail">{@render leftAd()}</div>
      <div class="ad-rail ad-rail--right" data-ad-position="right-rail">{@render rightAd()}</div>
    {/if}
  </article>
</div>

<style>
  .page-boundary { width: 100%; min-width: 0; container: page-frame / inline-size; }
  .page-grid {
    --page-gutter-current: var(--page-gutter-mobile);
    --page-content-current: var(--page-content-normal);
    --page-frame-current: var(--page-frame-normal);
    width: min(100%, var(--page-frame-current));
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: 'content';
    gap: var(--ad-rail-gap);
    margin-inline: auto;
    padding-inline: var(--page-gutter-current);
  }
  .page-grid--wide { --page-content-current: var(--page-content-wide); --page-frame-current: var(--page-frame-wide); }
  .page-grid--full-bleed { --page-content-current: 100%; --page-frame-current: 100%; padding-inline: 0; }
  .page-content { width: min(100%, var(--page-content-current)); min-width: 0; grid-area: content; justify-self: center; }
  .page-content > nav { margin-bottom: var(--space-3); }
  .page-content > header { margin-bottom: var(--space-5); }
  .page-body { min-width: 0; }
  .fill, .fill .page-content, .fill .page-body { display: flex; flex-direction: column; min-height: 0; }
  .fill .page-grid, .fill .page-body { flex: 1 1 0px; }
  .fill .page-grid { grid-template-rows: minmax(0, 1fr); min-height: 0; }
  .ad-rail {
    display: none;
    align-self: start;
    position: sticky;
    top: max(
      calc(var(--page-viewport-top, 0px) + var(--utility-height) + var(--space-4)),
      calc(var(--page-viewport-top, 0px) + (var(--page-viewport-height, 100dvh) - var(--ad-rail-height)) / 2)
    );
  }
  .ad-rail--left { grid-area: left-ad; }
  .ad-rail--right { grid-area: right-ad; }

  @container app-viewport (min-width: 768px) {
    .page-grid { --page-gutter-current: var(--page-gutter-compact); }
    .page-grid--wide { padding-inline: 0; }
  }

  @container app-viewport (min-width: 1800px) {
    .page-grid { --page-gutter-current: var(--page-gutter-expanded); }
  }

  /* Publisher targeting uses viewport width, including the browser scrollbar. */
  @media (min-width: 1700px) {
    .page-grid.has-ad-rails { grid-template-columns: minmax(0, 1fr) var(--ad-rail-width); grid-template-areas: 'content right-ad'; }
    .page-grid.has-ad-rails .ad-rail--right { display: block; }
  }

  /* At the 1080p scale, one 240px counter-rail balances the 240px navigation rail. */
  @container app-viewport (min-width: 1800px) and (max-width: 2199px) {
    .page-grid.has-ad-rails { grid-template-columns: minmax(0, 1fr) var(--rail-expanded); grid-template-areas: 'content right-ad'; gap: 0; }
    .page-grid.has-ad-rails .ad-rail--right { display: block; }
  }

  /* The larger 2560-class scale has room for a balanced pair of Publift rails. */
  @media (min-width: 2200px) {
    .page-grid.has-ad-rails { grid-template-columns: var(--ad-rail-width) minmax(960px, 1fr) var(--ad-rail-width); grid-template-areas: 'left-ad content right-ad'; gap: var(--ad-rail-gap); }
    /* A publisher without a left slot must not reserve an empty rail column. */
    .page-grid.has-ad-rails:not(:has(.ad-rail--left > :global(.ad-region))) { grid-template-columns: minmax(0, 1fr) var(--ad-rail-width); grid-template-areas: 'content right-ad'; }
    .page-grid.has-ad-rails .ad-rail--left:has(> :global(.ad-region)),
    .page-grid.has-ad-rails .ad-rail--right { display: block; }
  }
</style>
