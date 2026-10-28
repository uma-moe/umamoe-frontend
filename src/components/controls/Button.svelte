<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from '../Icon.svelte';
  import Spinner from '../feedback/Spinner.svelte';
  import type { IconName } from '../icon-types';

  interface Props {
    children?: Snippet;
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    size?: 'sm' | 'md';
    type?: 'button' | 'submit' | 'reset';
    icon?: IconName;
    disabled?: boolean;
    loading?: boolean;
    title?: string;
    ariaLabel?: string;
    ariaPressed?: boolean;
    ariaExpanded?: boolean;
    ariaControls?: string;
    ariaCurrent?: 'page';
    href?: string;
    target?: '_self' | '_blank';
    rel?: string;
    onclick?: (event: MouseEvent) => void;
  }

  let {
    children,
    variant = 'primary',
    size = 'md',
    type = 'button',
    icon,
    disabled = false,
    loading = false,
    title,
    ariaLabel,
    ariaPressed,
    ariaExpanded,
    ariaControls,
    ariaCurrent,
    href,
    target,
    rel,
    onclick
  }: Props = $props();
</script>

{#if href}
  <a
    class="ui-button ui-button--{variant} ui-button--{size}"
    {href}
    {target}
    rel={rel ?? (target === '_blank' ? 'noopener noreferrer' : undefined)}
    aria-disabled={disabled || loading}
    aria-busy={loading}
    aria-label={ariaLabel}
    aria-current={ariaCurrent}
    {title}
    tabindex={disabled || loading ? -1 : undefined}
    onclick={(event) => {
      if (disabled || loading) event.preventDefault();
      else onclick?.(event);
    }}
  >
    {#if loading}
      <span
        class="button-spinner"
        aria-hidden="true"
      >
        <Spinner size={16} />
      </span>
    {:else if icon}
      <Icon
        name={icon}
        size={18}
      />
    {/if}
    {#if children}
      <span>{@render children()}</span>
    {/if}
  </a>
{:else}
  <button
    class="ui-button ui-button--{variant} ui-button--{size}"
    {type}
    disabled={disabled || loading}
    aria-busy={loading}
    aria-label={ariaLabel}
    aria-pressed={ariaPressed}
    {title}
    aria-expanded={ariaExpanded}
    aria-controls={ariaControls}
    {onclick}
  >
    {#if loading}
      <span
        class="button-spinner"
        aria-hidden="true"
      >
        <Spinner size={16} />
      </span>
    {:else if icon}
      <Icon
        name={icon}
        size={18}
      />
    {/if}
    {#if children}
      <span>{@render children()}</span>
    {/if}
  </button>
{/if}

<style>
  .ui-button {
    min-height: var(--touch-target);
    padding: 0 var(--space-4);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    cursor: pointer;
    font-weight: 700;
    text-decoration: none;
    transition:
      transform var(--duration-fast) var(--easing-standard),
      background var(--duration-fast),
      border-color var(--duration-fast);
  }
  .ui-button:disabled,
  .ui-button[aria-disabled='true'] {
    cursor: not-allowed;
    opacity: 0.5;
  }
  .ui-button {
    font-family: inherit;
    font-size: var(--font-sm);
    line-height: var(--line-height-control);
  }
  .ui-button--primary {
    color: var(--button-primary-text);
    background: var(--color-accent);
  }
  .ui-button--primary:hover:not(:disabled):not([aria-disabled='true']) {
    background: color-mix(in srgb, var(--color-accent) 88%, white);
  }
  .ui-button--secondary {
    color: var(--color-text);
    background: var(--factor-field-bg);
    border-color: var(--factor-field-border);
  }
  .ui-button--secondary:hover:not(:disabled):not([aria-disabled='true']),
  .ui-button--ghost:hover:not(:disabled):not([aria-disabled='true']) {
    background: var(--factor-field-bg);
    border-color: var(--border-secondary);
  }
  .ui-button--ghost {
    color: var(--color-text-muted);
    background: transparent;
  }
  .ui-button--danger {
    color: var(--color-danger);
    background: var(--color-danger-soft);
    border-color: color-mix(in srgb, var(--color-danger) 38%, transparent);
  }
  .ui-button--sm {
    min-height: 36px;
    padding-inline: var(--space-3);
    font-size: var(--font-sm);
  }
  .button-spinner {
    display: flex;
    flex: none;
  }
  @media (max-width: 767px) {
    .ui-button {
      min-height: 32px;
      padding: 4px 8px;
      gap: 5px;
      font-size: 12px;
    }
    .ui-button--sm {
      min-height: 28px;
      padding: 3px 6px;
      font-size: 11px;
    }
    .ui-button :global(svg) {
      width: 14px;
      height: 14px;
    }
  }
</style>
