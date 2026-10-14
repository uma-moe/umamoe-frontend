<script lang="ts">
  import Icon from '../Icon.svelte';

  interface Props {
    label: string;
    selected?: boolean;
    count?: number;
    removable?: boolean;
    disabled?: boolean;
    onclick?: (event: MouseEvent) => void;
    onremove?: () => void;
  }

  let {
    label,
    selected = $bindable(false),
    count,
    removable = false,
    disabled = false,
    onclick,
    onremove
  }: Props = $props();
</script>

<span class="wrap">
  <button
    type="button"
    class:selected
    aria-pressed={selected}
    {disabled}
    {onclick}
  >
    {label}{#if count !== undefined}
      <small>{count}</small>
    {/if}
  </button>
  {#if removable}
    <button
      class="remove"
      type="button"
      aria-label="Remove {label}"
      onclick={onremove}
    >
      <Icon
        name="close"
        size={14}
      />
    </button>
  {/if}
</span>

<style>
  .wrap {
    display: inline-flex;
  }
  button {
    min-height: 36px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-pill);
    background: var(--factor-field-bg);
    color: var(--color-text-muted);
    cursor: pointer;
    font-size: var(--font-sm);
    font-weight: 700;
  }
  button:hover:not(:disabled) {
    border-color: var(--color-border-strong);
    color: var(--color-text);
  }
  button.selected {
    border-color: color-mix(in srgb, var(--color-accent) 45%, var(--color-border));
    background: var(--color-accent-soft);
    color: var(--color-accent);
  }
  button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
  small {
    min-width: 20px;
    padding: 1px 5px;
    border-radius: var(--radius-pill);
    background: color-mix(in srgb, currentColor 12%, transparent);
    font-size: 10px;
    text-align: center;
  }
  .wrap:has(.remove) > button:first-child {
    border-radius: var(--radius-pill) 0 0 var(--radius-pill);
  }
  button.remove {
    width: 34px;
    padding: 0;
    justify-content: center;
    border-left: 0;
    border-radius: 0 var(--radius-pill) var(--radius-pill) 0;
  }
</style>
