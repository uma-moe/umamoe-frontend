<script lang="ts">
  import { router } from './router';

  $effect(() => {
    const pathname = router.route.pathname;
    const viewerId = router.route.params.viewerId;
    if (
      pathname.startsWith('/profile/') &&
      pathname.endsWith('/veterans') &&
      router.route.params.accountId
    ) {
      void router.navigate('/veterans/:accountId', {
        params: { accountId: router.route.params.accountId },
        replace: true
      });
    } else if (pathname === '/inheritance' || pathname === '/support-cards') {
      void router.navigate('/database', { replace: true });
    } else if (pathname === '/shame' || pathname.startsWith('/shame/')) {
      if (viewerId)
        void router.navigate('/activity/:viewerId', { params: { viewerId }, replace: true });
      else void router.navigate('/activity', { replace: true });
    } else {
      void router.navigate('/', { replace: true });
    }
  });
</script>

<svelte:head>
  <meta
    name="robots"
    content="noindex"
  />
</svelte:head>
