<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import { appHttp } from '@/services/http/app-http';
  import { HttpError } from '@/services/http/http-client';
  import { buildVersion } from '@/services/site/site-services';
  import { DISCORD_SUPPORT_URL } from '@/services/site/site-links';
  import { router } from '@/routes/router';

  interface Props {
    open?: boolean;
  }

  let { open = $bindable(false) }: Props = $props();

  /** Discord rejects longer embed descriptions. */
  const MESSAGE_MAX = 2000;

  const categories = [
    { value: 'bug', label: 'Bug', title: 'Something broken' },
    { value: 'feature', label: 'Idea', title: 'Something new' },
    { value: 'other', label: 'Other', title: 'Anything else' }
  ];

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

<Dialog
  bind:open
  title="Send feedback"
  description="Bugs, ideas, anything else. Only the team sees it."
  icon="send"
  onclose={reset}
>
  {#if sent}
    <div class="sent">
      <p>Thanks! Your feedback is with the team now.</p>
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
        label="Kind of feedback"
        options={categories}
        bind:value={category}
      />

      <div class="field">
        <label for="suggestion-message">Your feedback</label>
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
    .form-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }
  }
</style>
