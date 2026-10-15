<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { copyText } from '@/lib/clipboard';
  import { loadCharacterImages } from '@/lib/game-data/characters';
  import { setAccountWorkspaces } from '@/lib/workspaces/workspace-state';
  import type { LinkedAccount } from '@/services/auth/auth-types';
  import Banner from '@/components/feedback/Banner.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Icon from '@/components/Icon.svelte';
  import { authRepository } from '@/services/auth/auth-repository';
  import { settingsErrorMessage as message } from './settings-errors';

  let { onerror }: { onerror: (message: string) => void } = $props();

  let accounts = $state<LinkedAccount[]>([]);
  let images = $state<Map<number, string>>(new Map());
  let loading = $state(true);
  let loadError = $state('');

  let accountsRequest = 0;

  let linkError = $state('');
  let linkSuccess = $state('');
  let newAccountId = $state('');
  let copiedToken = $state('');
  const busy = $state<Record<string, boolean>>({});
  let verifyError = $state<Record<string, string>>({});
  let verifyCooldown = $state<Record<string, number>>({});

  const cooldownTimers = new Set<ReturnType<typeof setInterval>>();

  function accountImage(id?: number): string | undefined {
    return id ? images.get(id) : undefined;
  }

  function normalizeAccountId(): void {
    newAccountId = newAccountId.replace(/\D/g, '').slice(0, 12);
  }

  async function loadAccounts(): Promise<void> {
    const request = ++accountsRequest;
    loading = true;
    loadError = '';
    try {
      const result = await authRepository.linkedAccounts(true);
      if (request === accountsRequest) {
        accounts = result;
        setAccountWorkspaces(
          result
            .filter((account) => account.verification_status === 'verified')
            .map((account) => ({
              accountId: account.account_id,
              label: account.trainer_name || account.account_id
            }))
        );
      }
    } catch (reason) {
      if (request === accountsRequest) loadError = message(reason);
    } finally {
      if (request === accountsRequest) loading = false;
    }
  }

  async function linkAccount(): Promise<void> {
    if (busy['link']) return;
    normalizeAccountId();
    linkError = '';
    linkSuccess = '';
    if (!/^\d{12}$/.test(newAccountId)) {
      linkError = 'Account ID must be exactly 12 digits.';
      return;
    }

    const accountId = newAccountId;
    busy['link'] = true;
    try {
      const account = await authRepository.linkAccount(accountId);
      newAccountId = '';
      linkSuccess = `Account ${account.account_id || accountId} linked! Follow the verification steps below.`;
      await loadAccounts();
    } catch (reason) {
      linkError = message(reason);
    } finally {
      delete busy['link'];
    }
  }

  function startCooldown(accountId: string): void {
    verifyCooldown = { ...verifyCooldown, [accountId]: 30 };

    const timer = setInterval(() => {
      const next = (verifyCooldown[accountId] ?? 0) - 1;
      if (next <= 0) {
        const { [accountId]: _removed, ...rest } = verifyCooldown;
        verifyCooldown = rest;
        clearInterval(timer);
        cooldownTimers.delete(timer);
      } else verifyCooldown = { ...verifyCooldown, [accountId]: next };
    }, 1000);

    cooldownTimers.add(timer);
  }

  async function verifyAccount(account: LinkedAccount): Promise<void> {
    const accountId = account.account_id;
    if (busy[`verify:${accountId}`] || verifyCooldown[accountId]) return;
    verifyError = { ...verifyError, [accountId]: '' };

    busy[`verify:${accountId}`] = true;
    try {
      const response = await authRepository.verifyAccount(accountId);
      startCooldown(accountId);
      if ('status' in response && response.status !== 'verified') {
        verifyError = {
          ...verifyError,
          [accountId]:
            response.message ||
            (response.status === 'timeout'
              ? 'Verification timed out. Make sure the token is in your profile comment and try again.'
              : 'Verification was not successful. Please try again.')
        };
      } else {
        await loadAccounts();
      }
    } catch (reason) {
      verifyError = { ...verifyError, [accountId]: message(reason) };

      startCooldown(accountId);
    } finally {
      delete busy[`verify:${accountId}`];
    }
  }

  async function unlinkAccount(account: LinkedAccount): Promise<void> {
    if (busy[`unlink:${account.account_id}`]) return;
    onerror('');
    busy[`unlink:${account.account_id}`] = true;
    try {
      await authRepository.unlinkAccount(account.account_id);
      await loadAccounts();
    } catch (reason) {
      onerror(message(reason));
    } finally {
      delete busy[`unlink:${account.account_id}`];
    }
  }

  async function copyToken(account: LinkedAccount): Promise<void> {
    const token = account.verification_token ?? '';
    if (!(await copyText(token))) {
      copiedToken = '';
      verifyError = {
        ...verifyError,
        [account.account_id]: 'Could not copy the code. Select and copy it manually.'
      };

      return;
    }

    verifyError = { ...verifyError, [account.account_id]: '' };

    copiedToken = token;
    window.setTimeout(() => {
      if (copiedToken === token) copiedToken = '';
    }, 2000);
  }

  onMount(() => {
    void loadAccounts();
    void loadCharacterImages().then(
      (result) => (images = result),
      () => {}
    );
  });

  onDestroy(() => cooldownTimers.forEach(clearInterval));
</script>

<section class="settings-card">
  <header class="card-header">
    <Icon
      name="veterans"
      size={20}
    />
    <h2>Linked Game Accounts</h2>
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
        title="Linked accounts unavailable"
        tone="danger"
      >
        {loadError}<Button
          variant="secondary"
          onclick={loadAccounts}
        >
          Retry linked accounts
        </Button>
      </Banner>
    {:else if accounts.length === 0}
      <div class="empty-state">
        <Icon
          name="close"
          size={30}
        />
        <p>No game accounts linked yet.</p>
      </div>
    {/if}
    {#if !loading && !loadError && accounts.length > 0}
      <div class="account-list">
        {#each accounts as account (account.account_id)}
          <article class="account-row">
            <div class="account-header">
              <div class="account-info">
                {#if accountImage(account.representative_uma_id)}
                  <img
                    class="uma-avatar"
                    src={accountImage(account.representative_uma_id)}
                    alt=""
                  />
                {:else}
                  <span class="uma-avatar-placeholder">
                    <Icon
                      name="user"
                      size={22}
                    />
                  </span>
                {/if}
                {#if account.trainer_name}
                  <span class="trainer-name">{account.trainer_name}</span>
                  <span class="info-divider"></span>
                {/if}
                <code class="account-id">{account.account_id}</code>
                <span
                  class:verified={account.verification_status === 'verified'}
                  class:pending={account.verification_status !== 'verified'}
                  class="account-badge"
                >
                  <Icon
                    name={account.verification_status === 'verified' ? 'check' : 'warning'}
                    size={14}
                  />{account.verification_status === 'verified'
                    ? 'Verified'
                    : 'Pending Verification'}
                </span>
              </div>
              <div class="account-actions">
                {#if account.verification_status === 'verified'}
                  <Button
                    href={`/profile/${account.account_id}`}
                    variant="secondary"
                    size="sm"
                    icon="user"
                  >
                    View Profile
                  </Button>
                {/if}<Button
                  variant="danger"
                  size="sm"
                  icon="close"
                  loading={busy[`unlink:${account.account_id}`]}
                  onclick={() => unlinkAccount(account)}
                >
                  Unlink
                </Button>
              </div>
            </div>
            {#if account.verification_status !== 'verified'}
              <div class="verify-section">
                <p class="verify-heading">Verify ownership of this account</p>
                <div class="verify-steps">
                  <div class="step">
                    <span>1</span>
                    <p>
                      Open Uma Musume and go to your <strong>Profile</strong>
                    </p>
                  </div>
                  <div class="step">
                    <span>2</span>
                    <p>
                      Set your <strong>profile comment</strong>
                      to this code:
                    </p>
                  </div>
                </div>
                {#if account.verification_token}
                  <div class="token-display">
                    <code>{account.verification_token}</code>
                    <button
                      aria-label="Copy code"
                      onclick={() => copyToken(account)}
                    >
                      <Icon
                        name={copiedToken === account.verification_token ? 'check' : 'copy'}
                        size={16}
                      />
                    </button>
                  </div>
                  <p class="token-note">
                    This code changes on each page load, copy it before switching to the game.
                  </p>
                {/if}
                <div class="step">
                  <span>3</span>
                  <p>
                    Click <strong>Verify</strong>
                    below, we'll check your profile comment matches the code
                  </p>
                </div>
                <div class="verify-actions">
                  <Button
                    variant="secondary"
                    icon="check"
                    loading={busy[`verify:${account.account_id}`]}
                    disabled={Boolean(verifyCooldown[account.account_id])}
                    onclick={() => verifyAccount(account)}
                  >
                    {verifyCooldown[account.account_id]
                      ? `Retry in ${verifyCooldown[account.account_id]}s`
                      : 'Verify'}
                  </Button>
                </div>
                {#if verifyError[account.account_id]}
                  <p class="error-msg">
                    {verifyError[account.account_id]}
                  </p>
                {/if}
              </div>
            {/if}
          </article>
        {/each}
      </div>
    {/if}
    <form
      class="link-form"
      onsubmit={(event) => {
        event.preventDefault();
        void linkAccount();
      }}
    >
      <h3>Link a new account</h3>
      <div class="form-row">
        <input
          aria-label="12-digit Account / Viewer ID"
          inputmode="numeric"
          autocomplete="off"
          maxlength="12"
          pattern={'[0-9]{12}'}
          placeholder="12-digit Account / Viewer ID"
          bind:value={newAccountId}
          oninput={normalizeAccountId}
        />
        <Button
          type="submit"
          icon="add"
          loading={busy['link']}
          disabled={newAccountId.length !== 12}
        >
          Link Account
        </Button>
      </div>
      {#if linkError}
        <p class="error-msg">{linkError}</p>
      {/if}{#if linkSuccess}
        <p class="success-msg">
          {linkSuccess}
        </p>
      {/if}
    </form>
  </div>
</section>
