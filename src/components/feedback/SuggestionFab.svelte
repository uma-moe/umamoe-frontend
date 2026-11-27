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
    /* A tab against the right edge, clear of the footer and any injected creative.
       The label reads bottom to top, so the tab hangs like a handle. */
    top: 50%;
    right: 0;
    translate: 0 -50%;
    rotate: 180deg;
    writing-mode: vertical-rl;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    width: 34px;
    padding: 12px 0;
    border: 1px solid var(--border-primary);
    border-right: 0;
    /* The half turn puts these rounded corners against the left edge of the screen;
       the right side stays square where the tab meets the edge. */
    border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
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
      height: 34px;
      padding: 0;
    }
  }
</style>
