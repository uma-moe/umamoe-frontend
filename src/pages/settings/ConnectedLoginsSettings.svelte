<script lang="ts">
  import { onMount } from 'svelte';
  import type { AuthIdentity } from '@/services/auth/auth-types';
  import Banner from '@/components/feedback/Banner.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Icon from '@/components/Icon.svelte';
  import { authRepository } from '@/services/auth/auth-repository';
  import { settingsErrorMessage as message } from './settings-errors';

  let { onerror }: { onerror: (message: string) => void } = $props();

  let identities = $state<AuthIdentity[]>([]);
  let loading = $state(true);
  let loadError = $state('');

  let identitiesRequest = 0;

  const busy = $state<Record<string, boolean>>({});

  function providerLabel(provider: string): string {
    return provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : 'Provider';
  }

  async function loadIdentities(): Promise<void> {
    const request = ++identitiesRequest;
    loading = true;
    loadError = '';
    try {
      const result = await authRepository.identities();
      if (request === identitiesRequest) identities = result;
    } catch (reason) {
      if (request === identitiesRequest) loadError = message(reason);
    } finally {
      if (request === identitiesRequest) loading = false;
    }
  }

  async function connect(provider: 'google' | 'discord'): Promise<void> {
    if (busy[`connect:${provider}`]) return;
    onerror('');
    busy[`connect:${provider}`] = true;
    try {
      window.location.assign((await authRepository.connectProvider(provider)).url);
    } catch (reason) {
      onerror(message(reason));
      delete busy[`connect:${provider}`];
    }
  }

  async function disconnectIdentity(identity: AuthIdentity): Promise<void> {
    if (identities.length <= 1 || busy[`disconnect:${identity.provider}`]) return;
    onerror('');
    busy[`disconnect:${identity.provider}`] = true;
    try {
      await authRepository.disconnectProvider(identity.provider);
      await loadIdentities();
    } catch (reason) {
      onerror(message(reason));
    } finally {
      delete busy[`disconnect:${identity.provider}`];
    }
  }

  onMount(() => {
    void loadIdentities();
  });
</script>

<section class="settings-card">
  <header class="card-header">
    <Icon
      name="connect"
      size={20}
    />
    <h2>Connected Logins</h2>
  </header>
  <div class="card-body">
    {#if loading}
      <div
        class="loading-row"
        role="status"
      >
        Loading…
      </div>
    {:else if loadError}
      <Banner
        title="Connected logins unavailable"
        tone="danger"
      >
        {loadError}<Button
          variant="secondary"
          onclick={loadIdentities}
        >
          Retry connected logins
        </Button>
      </Banner>
    {:else}
      <div class="identity-list">
        {#each identities as identity (`${identity.provider}:${identity.provider_id}`)}
          <div class="identity-row">
            <div class="identity-info">
              <Icon
                name={identity.provider === 'google' ? 'google' : 'discord'}
                size={18}
              />
              <strong>{providerLabel(identity.provider)}</strong>
              {#if identity.display_name}
                <span>{identity.display_name}</span>
              {/if}
            </div>
            <Button
              variant="danger"
              size="sm"
              ariaLabel="Disconnect"
              disabled={identities.length <= 1}
              loading={busy[`disconnect:${identity.provider}`]}
              onclick={() => disconnectIdentity(identity)}
            >
              <Icon
                name="close"
                size={14}
              />
            </Button>
          </div>
        {/each}
        <div class="connect-buttons">
          {#if !identities.some((item) => item.provider === 'google')}
            <Button
              icon="google"
              variant="secondary"
              loading={busy['connect:google']}
              onclick={() => connect('google')}
            >
              Connect Google
            </Button>
          {/if}{#if !identities.some((item) => item.provider === 'discord')}
            <Button
              icon="discord"
              variant="secondary"
              loading={busy['connect:discord']}
              onclick={() => connect('discord')}
            >
              Connect Discord
            </Button>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</section>
