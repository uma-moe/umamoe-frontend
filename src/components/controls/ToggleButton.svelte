<script lang="ts">
  import Icon from '../Icon.svelte';
  import type { IconName } from '../icon-types';

  interface Props {
    label: string;
    fieldLabel?: string;
    icon: IconName;
    pressed?: boolean;
    badge?: string;
    action?: boolean;
    size?: 'sm' | 'md';
    disabled?: boolean;
    ariaLabel?: string;
    onclick?: (event: MouseEvent) => void;
  }

  let {
    label,
    fieldLabel,
    icon,
    pressed = false,
    badge,
    action = false,
    size = 'md',
    disabled = false,
    ariaLabel,
    onclick
  }: Props = $props();
</script>

<div
  class="toggle-field"
  class:labeled={Boolean(fieldLabel)}
>
  {#if fieldLabel}
    <span class="field-label">{fieldLabel}</span>
  {/if}
  <button
    class="ui-toggle"
    class:pressed
    class:action
    class:compact={size === 'sm'}
    type="button"
    aria-label={ariaLabel ?? label}
    aria-pressed={action ? undefined : pressed}
    {disabled}
    {onclick}
  >
    <Icon
      name={icon}
      size={15}
    />
    <span>{label}</span>
    {#if badge}
      <small>{badge}</small>
    {/if}
    {#if !action}
      <i
        class="switch"
        aria-hidden="true"
      >
        <b></b>
      </i>
    {/if}
  </button>
</div>

<style>
  .toggle-field {
    display: contents;
  }
  .toggle-field.labeled {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .field-label {
    color: var(--color-text);
    font-size: var(--font-sm);
    font-weight: 600;
    line-height: 1.2;
  }
  .labeled .ui-toggle {
    width: 100%;
    justify-content: space-between;
  }
  .ui-toggle {
    height: var(--control-height);
    min-width: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0 9px;
    border: 1px solid var(--border-primary);
    border-radius: 8px;
    background: var(--factor-field-bg);
    color: var(--factor-field-text);
    cursor: pointer;
    font: inherit;
    font-size: 0.7rem;
    font-weight: 700;
    line-height: 1;
    white-space: nowrap;
    transition:
      border-color var(--duration-fast),
      background-color var(--duration-fast),
      color var(--duration-fast);
  }
  .ui-toggle:hover {
    border-color: rgb(var(--accent-primary-rgb) / 0.42);
    background: rgb(var(--accent-primary-rgb) / 0.07);
    color: var(--text-primary);
  }
  .ui-toggle:focus-visible {
    outline: 0;
    box-shadow: var(--focus-ring);
  }
  .ui-toggle:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .ui-toggle.pressed {
    border-color: rgb(var(--accent-primary-rgb) / 0.64);
    background: rgb(var(--accent-primary-rgb) / 0.15);
    color: var(--accent-primary);
  }
  .ui-toggle :global(svg) {
    flex: 0 0 auto;
  }
  .ui-toggle > span {
    color: var(--factor-field-text);
  }
  small {
    min-width: 18px;
    padding: 2px 5px;
    border-radius: var(--radius-pill);
    background: rgb(var(--on-surface-rgb) / 0.08);
    color: inherit;
    font-size: 0.58rem;
    line-height: 1.25;
    text-align: center;
  }
  .pressed small {
    background: rgb(var(--accent-primary-rgb) / 0.18);
  }
  .switch {
    position: relative;
    width: 25px;
    height: 14px;
    flex: 0 0 25px;
    margin-left: 1px;
    border: 1px solid rgb(var(--on-surface-rgb) / 0.18);
    border-radius: 8px;
    background: rgb(var(--on-surface-rgb) / 0.09);
  }
  .switch b {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--text-muted);
    transition:
      transform var(--duration-fast),
      background-color var(--duration-fast);
  }
  .pressed .switch {
    border-color: rgb(var(--accent-primary-rgb) / 0.48);
    background: rgb(var(--accent-primary-rgb) / 0.23);
  }
  .pressed .switch b {
    background: var(--accent-primary);
    transform: translateX(11px);
  }
  @media (max-width: 600px) {
    .ui-toggle {
      min-height: var(--touch-target);
      height: var(--touch-target);
      padding-inline: 8px;
    }
  }
  .ui-toggle.compact {
    height: 26px;
    min-height: 26px;
    padding-inline: 6px;
    gap: 4px;
    font-size: 10px;
  }
  .compact :global(svg) {
    width: 12px;
    height: 12px;
  }
  .compact .switch {
    width: 22px;
    height: 12px;
    flex-basis: 22px;
  }
  .compact .switch b {
    width: 6px;
    height: 6px;
  }
  .compact.pressed .switch b {
    transform: translateX(10px);
  }
</style>
