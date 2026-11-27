<script lang="ts">
  import Icon from '@/components/Icon.svelte';

  /**
   * The shell only carries this chip; the dialog, form and HTTP client load on
   * first use so they stay out of the base shell's budget.
   */
  let SuggestionDialog = $state<typeof import('./SuggestionDialog.svelte').default>();
  let open = $state(false);
  let loading: Promise<void> | undefined;

  function openDialog() {
    open = true;
    if (SuggestionDialog) return;

    loading ??= import('./SuggestionDialog.svelte')
      .then((module) => {
        SuggestionDialog = module.default;
      })
      .catch((error: unknown) => {
        console.warn('Feedback could not be loaded. Opening the chip again will retry.', error);
        open = false;
      })
      .finally(() => {
        loading = undefined;
      });
  }
</script>

<button
  class="suggestion-fab"
  type="button"
  aria-label="Send feedback"
  title="Send feedback"
  onclick={openDialog}
>
  <Icon
    name="send"
    size={15}
  />
  <span>Feedback</span>
</button>

{#if SuggestionDialog}
  <SuggestionDialog bind:open />
{/if}

<style>
  .suggestion-fab {
    position: fixed;
    z-index: calc(var(--z-header) + 1);
    /* A tab against the right edge, clear of the footer and any injected creative. */
    top: 50%;
    right: 0;
    transform: translateY(-50%);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 34px;
    padding: 0 10px;
    border: 1px solid var(--border-primary);
    border-right: 0;
    border-radius: 999px 0 0 999px;
    background: var(--surface-overlay);
    box-shadow: var(--shadow-md);
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.01em;
    cursor: pointer;
  }
  .suggestion-fab:hover {
    background: var(--surface-2);
    color: var(--accent-primary);
  }
  .suggestion-fab:focus-visible {
    outline: 2px solid var(--accent-primary);
    outline-offset: -2px;
  }
  @media (max-width: 560px) {
    /* On a phone the label would cover a whole card edge, so the tab keeps to its icon. */
    .suggestion-fab span {
      display: none;
    }
    .suggestion-fab {
      justify-content: center;
      width: 34px;
      padding: 0;
    }
  }
</style>
