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
    } else if (pathname === '/simulator' || pathname === '/simulator/') {
      // The HP calculator was the simulator's bare address before each tab had its own.
      void router.navigate('/simulator/hp', { replace: true, search: location.search });
    } else if (pathname === '/simulator/build') {
      void router.navigate('/simulator/skills', { replace: true, search: location.search });
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
