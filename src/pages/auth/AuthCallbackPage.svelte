<script lang="ts">
  import AppPage from '@/layouts/AppPage.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import { completeLogin } from '@/services/auth/auth-state';
  import { router } from '@/routes/router';
  import Button from '@/components/controls/Button.svelte';
  import { onMount } from 'svelte';

  let error = $state('');
  let token = $state<string | null>(null);

  function verify() {
    error = '';
    if (!token) {
      error = 'The provider did not return a session token.';
      return;
    }

    void completeLogin(token)
      .then(() => {
        let destination: '/' | '/veterans' = '/';
        try {
          if (sessionStorage.getItem('auth_return_to') === '/veterans') destination = '/veterans';
          sessionStorage.removeItem('auth_return_to');
        } catch {
          /* Fall back to Home when session storage is unavailable. */
        }

        return router.navigate(destination, { replace: true });
      })
      .catch((reason) => {
        error = reason instanceof Error ? reason.message : 'The session could not be verified.';
      });
  }

  onMount(() => {
    const url = new URL(window.location.href);
    token = url.searchParams.get('token');
    url.searchParams.delete('token');
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    verify();
  });
</script>

<svelte:head>
  <title>Completing sign in · uma.moe</title>
  <meta
    name="robots"
    content="noindex"
  />
</svelte:head>
<AppPage
  routeId="signin"
  title="Completing sign in"
  width="normal"
>
  {#if error}
    <Banner
      title="Sign-in failed"
      tone="danger"
    >
      <p>
        {error}
        <a href="/login">Return to sign in.</a>
      </p>
      {#if token}
        <Button
          variant="secondary"
          size="sm"
          onclick={verify}
        >
          Retry sign in
        </Button>
      {/if}
    </Banner>
  {:else}
    <div class="callback">
      <Spinner size={38} />
      <p>Verifying your session…</p>
    </div>
  {/if}
</AppPage>

<style>
  .callback {
    min-height: 45vh;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: var(--space-3);
    color: var(--color-text-muted);
  }
  .callback p {
    margin: 0;
  }
</style>
