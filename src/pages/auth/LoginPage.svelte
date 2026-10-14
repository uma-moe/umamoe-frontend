<script lang="ts">
  import Spinner from '@/components/feedback/Spinner.svelte';
  import Icon from '@/components/Icon.svelte';
  import PageFrame from '@/layouts/PageFrame.svelte';
  import { beginLogin } from '@/services/auth/auth-state';

  let loading = $state<'google' | 'discord' | ''>('');
  let error = $state('');

  async function login(provider: 'google' | 'discord'): Promise<void> {
    loading = provider;
    error = '';
    try {
      await beginLogin(provider);
    } catch (reason) {
      error =
        reason instanceof Error ? reason.message : 'The sign-in service could not be reached.';
      loading = '';
    }
  }
</script>

<svelte:head>
  <title>Sign in · uma.moe</title>
  <meta
    name="robots"
    content="noindex"
  />
</svelte:head>

<PageFrame
  routeId="login"
  pageTitle="Sign in"
  width="normal"
  adsEnabled={false}
>
  <div class="login-page">
    <div class="login-card">
      <h2>Sign in to uma.moe</h2>
      <p class="subtitle">Connect with your preferred account</p>

      {#if error}
        <p
          class="error"
          role="alert"
        >
          {error}
        </p>
      {/if}

      <div class="provider-buttons">
        <button
          class="provider-btn google"
          type="button"
          disabled={!!loading}
          onclick={() => login('google')}
        >
          {#if loading === 'google'}
            <Spinner size={20} />
          {:else}
            <span class="provider-icon">
              <Icon
                name="google"
                size={20}
              />
            </span>
          {/if}
          <span>Sign in with Google</span>
        </button>

        <button
          class="provider-btn discord"
          type="button"
          disabled={!!loading}
          onclick={() => login('discord')}
        >
          {#if loading === 'discord'}
            <Spinner size={20} />
          {:else}
            <span class="provider-icon">
              <Icon
                name="discord"
                size={20}
              />
            </span>
          {/if}
          <span>Sign in with Discord</span>
        </button>
      </div>
    </div>
  </div>
</PageFrame>

<style>
  .login-page {
    min-height: calc(100dvh - var(--utility-height, 60px) - 92px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px 5px;
  }

  .login-card {
    width: min(100%, 400px);
    padding: 2.5rem;
    border: 1px solid var(--border-primary);
    border-radius: 12px;
    background: var(--bg-secondary, var(--surface-1));
    box-shadow: var(--shadow-md);
    text-align: center;
  }

  h2 {
    margin: 0 0 0.5rem;
    color: var(--text-primary);
    font-size: 1.5rem;
  }
  .subtitle {
    margin: 0 0 2rem;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }
  .error {
    margin: -1rem 0 1rem;
    color: var(--accent-error);
    font-size: 0.75rem;
  }
  .provider-buttons {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .provider-btn {
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 0.75rem 1.5rem;
    border: 0;
    border-radius: 8px;
    cursor: pointer;
    font-family: inherit;
    font-size: 0.9rem;
    font-weight: 500;
    transition:
      background-color 0.2s ease,
      box-shadow 0.2s ease,
      opacity 0.2s ease;
  }
  .provider-btn:disabled {
    opacity: 0.6;
    cursor: wait;
  }
  .provider-btn.google {
    background: #fff;
    color: #333;
  }
  .provider-btn.google:hover:not(:disabled) {
    background: #f1f1f1;
    box-shadow: 0 2px 8px rgb(0 0 0 / 0.2);
  }
  .provider-btn.discord {
    background: #5865f2;
    color: #fff;
  }
  .provider-btn.discord:hover:not(:disabled) {
    background: #4752c4;
    box-shadow: 0 2px 8px rgb(88 101 242 / 0.4);
  }
  .provider-icon {
    flex: 0 0 auto;
  }
  @media (max-width: 480px) {
    .login-card {
      padding: 1.5rem 1rem;
    }
  }
</style>
