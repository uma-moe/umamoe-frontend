<script lang="ts">
  import { onMount } from 'svelte';
  import Button from '@/components/controls/Button.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import Icon from '@/components/Icon.svelte';
  import {
    availableVersion,
    reloadUpdatedVersion,
    startSiteServices,
    CURRENT_UPDATE_VERSION
  } from '@/services/site-services';
  import { browserProofPort, browserVerification } from '@/services/http/browser-proof';
  import type { RateLimitNotice } from '@/services/http/http-client';

  let rateLimited = $state(false);
  let retryAt = $state(0);
  let now = $state(Date.now());

  let lastShown = -Infinity;

  let dismissedVersion = $state('');
  let verified = $state(false);
  let UpdateNotification = $state<typeof import('./UpdateNotification.svelte').default>();
  let updateRequest = $state(0);

  const remaining = $derived(Math.max(0, Math.ceil((retryAt - now) / 1000)));

  function rateLimit(event: Event) {
    const notice = (event as CustomEvent<RateLimitNotice>).detail;
    if (rateLimited || Date.now() - lastShown < 10_000) return;
    lastShown = Date.now();
    now = lastShown;
    retryAt = now + Math.max(0, notice.retryAfterSeconds || 0) * 1000;
    rateLimited = true;
  }

  async function verify() {
    verified = false;
    try {
      await browserProofPort?.refresh(true);
      verified = true;
    } catch {
      /* The verification store supplies the error and retry action. */
    }
  }

  onMount(() => {
    let active = true;
    const loadUpdates = () => {
      if (!UpdateNotification)
        void import('./UpdateNotification.svelte')
          .then((module) => {
            if (active) UpdateNotification = module.default;
          })
          .catch(() => {});
    };
    const showUpdates = () => {
      updateRequest++;
      loadUpdates();
    };
    try {
      if (Number(localStorage.getItem('lastSeenUpdateVersion') ?? 0) < CURRENT_UPDATE_VERSION)
        loadUpdates();
    } catch {}
    window.addEventListener('uma:show-updates', showUpdates);
    const stop = startSiteServices();
    window.addEventListener('uma:rate-limit', rateLimit);
    const timer = setInterval(() => {
      if (rateLimited) now = Date.now();
    }, 1000);
    return () => {
      active = false;
      stop();
      clearInterval(timer);
      window.removeEventListener('uma:rate-limit', rateLimit);
      window.removeEventListener('uma:show-updates', showUpdates);
    };
  });
</script>

{#if UpdateNotification}
  <UpdateNotification request={updateRequest} />
{/if}
{#if ($availableVersion && dismissedVersion !== $availableVersion) || $browserVerification.error || verified}
  <aside
    class="service-notices"
    aria-label="Service notifications"
  >
    {#if $availableVersion && dismissedVersion !== $availableVersion}
      <section
        class="update-notice"
        aria-label="Update available"
        aria-live="polite"
      >
        <div class="update-heading">
          <span class="update-icon">
            <Icon
              name="refresh"
              size={19}
            />
          </span>
          <div>
            <strong>Update available</strong>
            <p>A new version of uma.moe is ready.</p>
          </div>
        </div>
        <div class="update-footer">
          <span>Save your work before reloading.</span>
          <div class="actions">
            <Button
              size="sm"
              variant="ghost"
              onclick={() => (dismissedVersion = $availableVersion)}
            >
              Later
            </Button><Button
              size="sm"
              onclick={() => reloadUpdatedVersion($availableVersion)}
            >
              Reload
            </Button>
          </div>
        </div>
      </section>
    {/if}
    {#if $browserVerification.error}
      <Banner
        title="Browser verification"
        tone="warning"
      >
        <p>{$browserVerification.error}</p>
        <Button
          size="sm"
          disabled={$browserVerification.pending}
          onclick={verify}
        >
          Retry verification
        </Button>
      </Banner>
    {:else if verified}
      <Banner
        title="Browser verified"
        tone="success"
        dismissible
        ondismiss={() => (verified = false)}
      >
        <p>You can retry your request.</p>
      </Banner>
    {/if}
  </aside>
{/if}
<Dialog
  open={rateLimited}
  title="Too many requests"
  icon="warning"
  onclose={() => (rateLimited = false)}
>
  <p>
    {remaining
      ? `Please wait ${remaining} seconds before trying again.`
      : 'You can try your request again now.'}
  </p>
  {#snippet actions()}
    <Button
      size="sm"
      variant="secondary"
      onclick={() => (rateLimited = false)}
    >
      Dismiss
    </Button>
  {/snippet}
</Dialog>

<style>
  .service-notices {
    position: fixed;
    bottom: 16px;
    right: 16px;
    z-index: var(--z-overlay);
    width: min(440px, calc(100vw - 32px));
    display: grid;
    gap: var(--space-2);
  }
  p {
    margin: 0 0 var(--space-3);
  }
  .actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .update-notice {
    padding: var(--space-4);
    border: 1px solid var(--card-surface-border);
    border-radius: var(--radius-lg);
    background: var(--card-surface-bg);
    box-shadow: var(--shadow-lg);
    color: var(--color-text);
  }
  .update-heading {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }
  .update-heading strong {
    display: block;
    font-size: var(--font-sm);
  }
  .update-heading p {
    margin: 3px 0 0;
    font-size: var(--font-sm);
    color: var(--color-text-muted);
  }
  .update-icon {
    display: grid;
    place-items: center;
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    border-radius: var(--radius-md);
    background: var(--color-accent-soft);
    color: var(--color-accent);
  }
  .update-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-top: var(--space-3);
  }
  .update-footer > span {
    color: var(--color-text-subtle);
    font-size: var(--font-xs);
  }
  .update-footer .actions {
    margin-left: auto;
  }
  @media (max-width: 767px) {
    .update-notice {
      padding: var(--space-3);
    }
    .update-footer :global(.ui-button) {
      min-height: 36px;
      padding-inline: var(--space-3);
      font-size: var(--font-sm);
    }
  }
</style>
