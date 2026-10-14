<script lang="ts">
  import Icon from '../Icon.svelte';
  import type { IconName } from '../icon-types';

  interface Props {
    id: string;
    label: string;
    icon?: IconName;
    ariaLabel?: string;
    description?: string;
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
    checked = $bindable(false),
    indeterminate = false,
    disabled = false,
    onchange
  }: Props = $props();
</script>

<label
  class="checkbox"
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
</style>
