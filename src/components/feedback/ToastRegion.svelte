<script lang="ts">
  import Icon from '../Icon.svelte';
  import Button from '../controls/Button.svelte';
  import { DISCORD_SUPPORT_URL } from '@/services/site-links';

  export interface Toast {
    id: string;
    title: string;
    message?: string;
    tone?: 'info' | 'success' | 'warning' | 'danger';
  }

  interface Props {
    toasts?: Toast[];
    ondismiss?: (id: string) => void;
  }

  let { toasts = [], ondismiss }: Props = $props();

  function autoDismiss(_node: HTMLElement, id: string) {
    const timer = window.setTimeout(() => ondismiss?.(id), 5000);
    return { destroy: () => window.clearTimeout(timer) };
  }
</script>

<div
  class="region"
  aria-live="polite"
  aria-label="Notifications"
>
  {#each toasts as toast (toast.id)}
    <article
      class="toast toast--{toast.tone ?? 'info'}"
      use:autoDismiss={toast.id}
    >
      <span class="toast-icon">
        <Icon
          name={toast.tone === 'success'
            ? 'check'
            : toast.tone === 'warning' || toast.tone === 'danger'
              ? 'warning'
              : 'info'}
          size={18}
        />
      </span>
      <div>
        <strong>{toast.title}</strong>
        {#if toast.message}
          <p>{toast.message}</p>
        {/if}{#if toast.tone === 'danger'}
          <div class="report-action">
            <Button
              href={DISCORD_SUPPORT_URL}
              target="_blank"
              variant="secondary"
              size="sm"
              icon="discord"
            >
              Report on Discord
            </Button>
          </div>
        {/if}
      </div>
      <button
        type="button"
        aria-label="Dismiss notification"
        onclick={() => ondismiss?.(toast.id)}
      >
        <Icon
          name="close"
          size={16}
        />
      </button>
    </article>
  {/each}
</div>

<style>
  .region {
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: calc(var(--z-overlay) + 10);
    width: min(340px, calc(100vw - 32px));
    display: grid;
    gap: var(--space-2);
    pointer-events: none;
  }
  .toast {
    --toast-color: var(--color-accent);
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr) 28px;
    align-items: center;
    gap: var(--space-2);
    padding: 10px var(--space-3);
    border: 1px solid var(--card-surface-border);
    border-radius: var(--radius-md);
    background: var(--card-surface-bg);
    box-shadow: var(--shadow-lg);
    pointer-events: auto;
    overflow-wrap: anywhere;
  }
  .toast--success {
    --toast-color: var(--color-success);
  }
  .toast--warning {
    --toast-color: var(--color-warning);
  }
  .toast--danger {
    --toast-color: var(--color-danger);
  }
  .toast-icon {
    display: grid;
    place-items: center;
    color: var(--toast-color);
  }
  .report-action {
    margin-top: var(--space-2);
  }
  strong {
    display: block;
    font-size: var(--font-sm);
    line-height: 1.4;
  }
  p {
    margin: 4px 0 0;
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.5;
  }
  button {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
  }
  button:hover {
    color: var(--text-primary);
    background: var(--surface-3);
  }
  @media (max-width: 767px) {
    .toast {
      grid-template-columns: 20px minmax(0, 1fr) 32px;
    }
    button {
      width: 32px;
      height: 32px;
    }
  }
</style>
