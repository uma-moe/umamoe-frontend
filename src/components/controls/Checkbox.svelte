<script lang="ts">
  import Icon from '../Icon.svelte';
  import type { IconName } from '../icon-types';

  interface Props {
    id: string;
    label: string;
    icon?: IconName;
    ariaLabel?: string;
    description?: string;
    variant?: 'plain' | 'field';
    checked?: boolean;
    indeterminate?: boolean;
    disabled?: boolean;
    onchange?: (checked: boolean) => void;
  }

  let {
    id,
    label,
    icon,
    ariaLabel,
    description,
    variant = 'plain',
    checked = $bindable(false),
    indeterminate = false,
    disabled = false,
    onchange
  }: Props = $props();
</script>

<label
  class="checkbox"
  class:field={variant === 'field'}
  class:active={variant === 'field' && (checked || indeterminate)}
  for={id}
>
  <input
    {id}
    type="checkbox"
    {checked}
    {indeterminate}
    {disabled}
    aria-label={ariaLabel}
    aria-describedby={description ? `${id}-description` : undefined}
    onchange={(event) => {
      checked = event.currentTarget.checked;
      onchange?.(checked);
    }}
  />
  <span
    class="box"
    class:indeterminate
    aria-hidden="true"
  >
    {#if checked || indeterminate}
      <Icon
        name={indeterminate ? 'minus' : 'check'}
        size={14}
      />
    {/if}
  </span>
  <span class="copy">
    <strong class:with-icon={Boolean(icon)}>
      {#if icon}
        <Icon
          name={icon}
          size={14}
        />
      {/if}{label}
    </strong>
    {#if description}
      <small id="{id}-description">{description}</small>
    {/if}
  </span>
</label>

<style>
  .checkbox {
    position: relative;
    min-height: var(--touch-target);
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr);
    align-items: center;
    gap: var(--space-3);
    cursor: pointer;
  }
  input {
    position: absolute;
    z-index: 1;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }
  .box {
    width: 22px;
    height: 22px;
    pointer-events: none;
    display: grid;
    place-items: center;
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-xs);
    background: var(--color-surface-1);
    color: #07121d;
    font-size: 14px;
    font-weight: 900;
    transition:
      background var(--duration-fast),
      border-color var(--duration-fast);
  }
  input:checked + .box,
  .box.indeterminate {
    border-color: var(--color-accent);
    background: var(--color-accent);
  }
  input:focus-visible + .box {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  input:disabled + .box,
  input:disabled ~ .copy {
    opacity: 0.45;
  }
  .copy {
    pointer-events: none;
    display: flex;
    flex-direction: column;
  }
  strong {
    font-size: var(--font-sm);
  }
  strong.with-icon {
    display: flex;
    align-items: center;
    gap: 7px;
  }
  small {
    color: var(--color-text-subtle);
    font-size: var(--font-xs);
  }
  .field {
    --color-accent: var(--accent-secondary);
    min-width: 0;
    min-height: 34px;
    grid-template-columns: 18px minmax(0, 1fr);
    gap: 8px;
    padding-inline: 10px;
    border: 1px solid var(--factor-field-border);
    border-radius: 8px;
    background: var(--factor-field-bg);
  }
  .field.active {
    border-color: color-mix(in srgb, var(--color-success) 50%, var(--border-primary));
    background: rgb(var(--accent-primary-rgb) / 0.07);
  }
  .field .box {
    width: 18px;
    height: 18px;
  }
  .field strong {
    font-size: 11px;
    line-height: 1.2;
  }
  .field small {
    font-size: 9px;
    line-height: 1.2;
  }
  .field.active small {
    color: var(--accent-secondary);
  }
  @media (max-width: 980px) {
    .field {
      min-height: var(--touch-target);
    }
  }
</style>
