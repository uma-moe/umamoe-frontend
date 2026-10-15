<script lang="ts">
  import AdRegion from './AdRegion.svelte';
  import { adSurfaceForRoute, fuseIdForPlacement } from '@/services/ads/ad-slots';

  let {
    routeId,
    index = 1,
    top = false,
    railAlternative
  }: { routeId: string; index?: number; top?: boolean; railAlternative?: boolean } = $props();

  const surface = $derived(adSurfaceForRoute(routeId));
</script>

{#if surface}
  <AdRegion
    placement={top ? `${surface}_content_top` : `${surface}_interscroller_${index}`}
    kind={top ? 'leaderboard' : 'inline'}
    sizes={top ? ['728x90', '320x50'] : ['728x90', '300x250', '320x100', '320x50']}
    active
    railAlternative={railAlternative ?? Boolean(fuseIdForPlacement(`${surface}_sticky_vrec_right`))}
  />
{/if}
