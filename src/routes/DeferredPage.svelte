<script lang="ts">
  import AppPage from '@/layouts/AppPage.svelte';
  import { router } from './router';
  import { routeDefinitionForPath } from './route-manifest';
  import RouteLoadErrorPage from './RouteLoadErrorPage.svelte';
  import { afterPagePaint } from './after-page-paint';
  import { withPageRequest } from '@/services/http/page-request';

  const loader = $derived(router.route.meta.loadPage!);
  // Query changes keep the existing page and its local state mounted.
  const page = $derived(withPageRequest(() => Promise.all([loader(), afterPagePaint()]).then(([module]) => module)).catch(error => {
    window.dispatchEvent(new CustomEvent('umamoe:module-error', { detail: error }));
    throw error;
  }));
  const definition = $derived(routeDefinitionForPath(router.route.pathname));
  const titles: Record<string, string> = {
    clubs: 'Club Leaderboard', rankings: 'Trainer Rankings', activity: 'Top 100 Club Activity Reports',
    statistics: 'Team Stadium', tierlist: 'Support Card Tierlist', settings: 'Account Settings',
    privacy: 'Privacy Policy', tools: 'Tools & Calculators'
  };
  const title = $derived(titles[definition?.id ?? ''] ?? definition?.title ?? 'uma.moe');
</script>

{#key loader}
  {#await page}
    <AppPage routeId={definition?.id ?? 'page'} {title} description={definition?.description} width={definition?.width ?? 'normal'} adsActive={false}>
      <div class="pending-content" aria-busy="true" aria-label={`${title} content`}></div>
    </AppPage>
  {:then module}
    <module.default/>
  {:catch}
    <RouteLoadErrorPage/>
  {/await}
{/key}

<style>
  .pending-content { min-height: 55dvh; }
</style>
