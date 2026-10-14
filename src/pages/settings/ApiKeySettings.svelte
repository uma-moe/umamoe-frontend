<script lang="ts">
  import { onMount } from 'svelte';
  import { copyText } from '@/lib/clipboard';
  import type { ApiKey } from '@/services/auth/auth-types';
  import Banner from '@/components/feedback/Banner.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Icon from '@/components/Icon.svelte';
  import { authRepository } from '@/services/auth/auth-repository';
  import { settingsErrorMessage as message } from './settings-errors';

  let apiKeys = $state<ApiKey[]>([]);
  let loading = $state(true);
  let loadError = $state('');

  let keysRequest = 0;

  let apiKeyError = $state('');
  let newKeyName = $state('');
  let newlyCreatedKey = $state<string | null>(null);
  let copiedApiKey = $state(false);
  const busy = $state<Record<string, boolean>>({});

  function formatDate(value: string): string {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }).format(new Date(value));
  }

  async function loadApiKeys(): Promise<void> {
    const request = ++keysRequest;
    loading = true;
    loadError = '';
    try {
      const result = await authRepository.apiKeys();
      if (request === keysRequest) apiKeys = result;
    } catch (reason) {
      if (request === keysRequest) loadError = message(reason);
    } finally {
      if (request === keysRequest) loading = false;
    }
  }

  async function createApiKey(): Promise<void> {
    if (busy['create-key']) return;
    const name = newKeyName.trim();
    if (!name) return;
    apiKeyError = '';
    newlyCreatedKey = null;
    busy['create-key'] = true;
    try {
      const key = await authRepository.createApiKey(name);
      newlyCreatedKey = key.key ?? null;
      newKeyName = '';
      await loadApiKeys();
    } catch (reason) {
      apiKeyError = message(reason);
    } finally {
      delete busy['create-key'];
    }
  }

  async function revokeApiKey(key: ApiKey): Promise<void> {
    if (busy[`revoke:${key.id}`]) return;
    apiKeyError = '';
    busy[`revoke:${key.id}`] = true;
    try {
      await authRepository.revokeApiKey(key.id);
      await loadApiKeys();
    } catch (reason) {
      apiKeyError = message(reason);
    } finally {
      delete busy[`revoke:${key.id}`];
    }
  }

  async function copyKey(key: string): Promise<void> {
    if (!(await copyText(key))) {
      copiedApiKey = false;
      apiKeyError =
        'Could not copy the API key. Select and copy it manually before leaving this page.';
      return;
    }
    apiKeyError = '';
    copiedApiKey = true;
    window.setTimeout(() => (copiedApiKey = false), 2000);
  }

  onMount(() => {
    void loadApiKeys();
  });
</script>

<section class="settings-card">
  <header class="card-header">
    <Icon
      name="tools"
      size={20}
    />
    <h2>API Keys</h2>
  </header>
  <div class="card-body">
    <div class="api-key-intro">
      <div class="api-key-intro-main">
        <span class="intro-icon">
          <Icon
            name="tools"
            size={18}
          />
        </span>
        <div>
          <p>
            API keys authenticate scripts, tools, and external apps that call the uma.moe API. They
            are not needed for normal website use.
          </p>
          <div class="guidance">
            <span>
              <Icon
                name="status"
                size={13}
              />Keep keys private
            </span>
            <span>
              <Icon
                name="user"
                size={13}
              />Revoke unused keys anytime
            </span>
          </div>
        </div>
      </div>
      <a
        class="api-docs-link"
        href="/api/docs"
        target="_blank"
        rel="noopener noreferrer"
      >
        <Icon
          name="info"
          size={16}
        />API Docs<Icon
          name="external"
          size={14}
        />
      </a>
    </div>
    {#if loading}
      <div
        class="loading-row"
        role="status"
      >
        Loading…
      </div>
    {:else if loadError}
      <Banner
        title="API keys unavailable"
        tone="danger"
      >
        {loadError}<Button
          variant="secondary"
          onclick={loadApiKeys}
        >
          Retry API keys
        </Button>
      </Banner>
    {:else if apiKeys.length > 0}
      <div class="api-keys-list">
        {#each apiKeys as key (key.id)}
          <div
            class:revoked={key.revoked}
            class="api-key-row"
          >
            <span class="key-icon">
              <Icon
                name={key.revoked ? 'close' : 'tools'}
                size={18}
              />
            </span>
            <div class="api-key-info">
              <div>
                <strong>{key.name}</strong>
                <code>{key.key_prefix}…</code>
                {#if key.revoked}
                  <span class="account-badge revoked-badge">Revoked</span>
                {/if}
              </div>
              <small>
                Created {formatDate(key.created_at)}{#if key.last_used}
                  · Last used {formatDate(key.last_used)}
                {/if}{#if key.total_requests}
                  · {key.total_requests.toLocaleString()} requests
                {/if}
              </small>
            </div>
            {#if !key.revoked}
              <Button
                variant="danger"
                size="sm"
                icon="trash"
                loading={busy[`revoke:${key.id}`]}
                onclick={() => revokeApiKey(key)}
              >
                Revoke
              </Button>
            {/if}
          </div>
        {/each}
      </div>
    {:else if !newlyCreatedKey}
      <div class="empty-state">
        <Icon
          name="tools"
          size={30}
        />
        <p>No API keys yet.</p>
      </div>
    {/if}
    {#if newlyCreatedKey}
      <div class="new-key-display">
        <strong>
          <Icon
            name="check"
            size={18}
          />API key created! Copy it now - you won't see it again.
        </strong>
        <div class="token-display">
          <code>{newlyCreatedKey}</code>
          <button
            aria-label="Copy API key"
            onclick={() => copyKey(newlyCreatedKey ?? '')}
          >
            <Icon
              name={copiedApiKey ? 'check' : 'copy'}
              size={16}
            />
          </button>
        </div>
      </div>
    {/if}
    <form
      class="link-form"
      onsubmit={(event) => {
        event.preventDefault();
        void createApiKey();
      }}
    >
      <h3>Create a new key</h3>
      <div class="form-row">
        <input
          aria-label="Key name"
          placeholder="Key name (e.g. My App)"
          bind:value={newKeyName}
        />
        <Button
          type="submit"
          icon="add"
          loading={busy['create-key']}
          disabled={!newKeyName.trim()}
        >
          Create Key
        </Button>
      </div>
      {#if apiKeyError}
        <p class="error-msg">{apiKeyError}</p>
      {/if}
    </form>
    <div class="usage-hint">
      <strong>Usage</strong>
      <p>
        Include your key in requests via the <code>X-API-Key</code>
        header:
      </p>
      <pre><code>curl -H "X-API-Key: uma_k_…" https://uma.moe/api/…</code></pre>
      <p>
        Endpoint details and examples are available in the <a
          href="/api/docs"
          target="_blank"
          rel="noopener noreferrer"
        >
          API documentation
        </a>
        .
      </p>
    </div>
  </div>
</section>
