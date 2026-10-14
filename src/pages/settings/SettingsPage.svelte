<script lang="ts">
  import { authReady, authUser } from '@/services/auth/auth-state';
  import { router } from '@/routes/router';
  import Banner from '@/components/feedback/Banner.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import PageHeading from '@/layouts/PageHeading.svelte';
  import SourcePage from '@/layouts/SourcePage.svelte';
  import ContentAd from '@/layouts/ContentAd.svelte';
  import LinkedAccountsSettings from './LinkedAccountsSettings.svelte';
  import ConnectedLoginsSettings from './ConnectedLoginsSettings.svelte';
  import ApiKeySettings from './ApiKeySettings.svelte';
  import './settings.css';

  let loadError = $state('');

  $effect(() => {
    if ($authReady && !$authUser) void router.navigate('/login');
  });
</script>

<svelte:head>
  <title>Account Settings · uma.moe</title>
  <meta
    name="robots"
    content="noindex"
  />
</svelte:head>

<SourcePage
  routeId="settings"
  title="Account Settings"
  width="wide"
>
  <div class="settings-page">
    <PageHeading
      title="Account Settings"
      description="Manage your linked game accounts and connected logins."
    />
    {#if !$authReady}
      <div class="loading-row page-loading"><Spinner size={28} /> Loading…</div>
    {:else if $authUser}
      <div class="content-container">
        {#if loadError}
          <Banner
            title={loadError}
            tone="danger"
            dismissible
          />
        {/if}
        <LinkedAccountsSettings onerror={(message) => (loadError = message)} />
        <ContentAd routeId="settings" />
        <ConnectedLoginsSettings onerror={(message) => (loadError = message)} />
        <ApiKeySettings />
      </div>
    {/if}
  </div>
</SourcePage>
