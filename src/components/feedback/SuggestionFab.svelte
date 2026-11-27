<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import Icon from '@/components/Icon.svelte';
  import { appHttp } from '@/services/http/app-http';
  import { HttpError } from '@/services/http/http-client';
  import { buildVersion } from '@/services/site/site-services';
  import { DISCORD_SUPPORT_URL } from '@/services/site/site-links';
  import { router } from '@/routes/router';

  /** Discord rejects longer embed descriptions. */
  const MESSAGE_MAX = 2000;

  const categories = [
    { value: 'bug', label: 'Bug', title: 'Something broken' },
    { value: 'feature', label: 'Idea', title: 'Something new' },
    { value: 'other', label: 'Other', title: 'Anything else' }
  ];

  let open = $state(false);
  let sent = $state(false);
  let category = $state('bug');
  let message = $state('');
  let error = $state('');
  let submitting = $state(false);

  const remaining = $derived(MESSAGE_MAX - message.length);
  const canSubmit = $derived(message.trim().length > 0 && remaining >= 0 && !submitting);

  function reset() {
    sent = false;
    category = 'bug';
    message = '';
    error = '';
    submitting = false;
  }

  function close() {
    open = false;
    reset();
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    submitting = true;
    error = '';
    try {
      await appHttp.request('/api/suggestions', {
        method: 'POST',
        body: {
          category,
          message: message.trim(),
          route: router.route.pathname,
          version: buildVersion()
        }
      });
      sent = true;
    } catch (failure) {
      error =
        failure instanceof HttpError && failure.status === 429
          ? 'That is a lot of suggestions. Wait a few minutes, then try again.'
          : 'It could not be sent. Try again in a moment, or tell us on Discord.';
    } finally {
      submitting = false;
    }
  }
</script>

<button
  class="suggestion-fab"
  type="button"
  aria-label="Send a suggestion"
  title="Send a suggestion"
  onclick={() => (open = true)}
>
  <Icon
    name="send"
    size={20}
  />
  <span>Suggest</span>
</button>

<Dialog
  bind:open
  title="Send a suggestion"
  description="Bugs, ideas, anything else. Only the team sees it."
  icon="send"
  onclose={reset}
>
  {#if sent}
    <div class="sent">
      <p>Thanks! Your suggestion is with the team now.</p>
      <Button
        size="sm"
        onclick={close}
      >
        Close
      </Button>
    </div>
  {:else}
    <form
      class="suggestion-form"
      onsubmit={submit}
    >
      <SegmentedControl
        label="Kind of suggestion"
        options={categories}
        bind:value={category}
      />

      <div class="field">
        <label for="suggestion-message">Your suggestion</label>
        <textarea
          id="suggestion-message"
          bind:value={message}
          rows="5"
          maxlength={MESSAGE_MAX}
          placeholder="What would make uma.moe better?"
          required></textarea>
        <small>{remaining} characters left</small>
      </div>

      {#if error}
        <p
          class="error"
          role="alert"
        >
          {error}
        </p>
      {/if}

      <p class="discord-note">
        Prefer to talk it through? <a href={DISCORD_SUPPORT_URL}>Join the Discord</a>
        .
      </p>

      <div class="form-actions">
        <Button
          variant="secondary"
          size="sm"
          onclick={close}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          icon="send"
          loading={submitting}
          disabled={!canSubmit}
        >
          Send
        </Button>
      </div>
    </form>
  {/if}
</Dialog>

<style>
  .suggestion-fab {
    position: fixed;
    z-index: calc(var(--z-header) + 1);
    right: max(16px, env(safe-area-inset-right));
    /* Sits above the mobile tab toolbar and any injected footer creative. */
    bottom: calc(16px + env(safe-area-inset-bottom) + var(--footer-ad-height, 0px));
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    padding: 0 16px;
    border: 1px solid var(--border-primary);
    border-radius: 999px;
    background: var(--surface-overlay);
    box-shadow: var(--shadow-md);
    color: var(--text-primary);
    font-size: var(--font-sm);
    font-weight: 600;
    cursor: pointer;
  }
  .suggestion-fab:hover {
    background: var(--surface-2);
    color: var(--accent-primary);
  }
  .suggestion-fab:focus-visible {
    outline: 2px solid var(--accent-primary);
    outline-offset: 2px;
  }
  :global(body:has(.mobile-bottom-toolbar)) .suggestion-fab {
    bottom: calc(var(--timeline-toolbar-height) + 12px);
  }
  .suggestion-form {
    display: grid;
    gap: 16px;
  }
  .field {
    display: grid;
    gap: 6px;
  }
  .field label {
    font-size: var(--font-sm);
    font-weight: 600;
    color: var(--text-secondary);
  }
  .field textarea {
    box-sizing: border-box;
    width: 100%;
    min-height: 120px;
    padding: 12px;
    resize: vertical;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    background: var(--surface-1);
    color: var(--text-primary);
    font: inherit;
    font-size: 16px;
    line-height: 1.5;
  }
  .field textarea:focus-visible {
    outline: 2px solid var(--accent-primary);
    outline-offset: 1px;
  }
  .field small {
    justify-self: end;
    font-size: 12px;
    color: var(--text-muted);
  }
  .error {
    margin: 0;
    color: var(--color-danger);
    font-size: var(--font-sm);
  }
  .discord-note {
    margin: 0;
    font-size: 12px;
    color: var(--text-muted);
  }
  .discord-note a {
    color: var(--accent-primary);
  }
  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .sent {
    display: grid;
    gap: 16px;
    justify-items: start;
  }
  .sent p {
    margin: 0;
  }
  @media (max-width: 560px) {
    .suggestion-fab span {
      display: none;
    }
    .suggestion-fab {
      width: 52px;
      padding: 0;
      justify-content: center;
    }
    .form-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }
  }
</style>
