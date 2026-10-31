<script lang="ts">
  import { routeDefinitionForPath } from './route-manifest';
  import { router } from './router';
  import AppPage from '@/layouts/AppPage.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import Button from '@/components/controls/Button.svelte';

  const route = $derived(routeDefinitionForPath(router.route.pathname));
</script>

<AppPage
  routeId={route?.id ?? 'page-error'}
  title={route?.title ?? 'Page unavailable'}
  width={route?.width ?? 'normal'}
>
  <Banner
    tone="danger"
    title="This page could not be loaded"
  >
    <p>
      The page could not start. A file may have failed to download, or a browser feature may be
      unavailable. Reload to try again. Your saved data has not been changed.
    </p>
    <p>
      If this keeps happening, report the page and your browser version using the Discord link
      below. On Windows 7, use Chromium 109 or Firefox 115 ESR or newer.
    </p>
    <Button
      variant="secondary"
      icon="refresh"
      onclick={() => location.reload()}
    >
      Reload page
    </Button>
  </Banner>
</AppPage>
