<script lang="ts">
  import Icon from '../Icon.svelte';

  interface Props {
    id: string;
    label?: string;
    description?: string;
    actionLabel?: string;
    accept?: string;
    multiple?: boolean;
    disabled?: boolean;
    onfiles?: (files: FileList) => void;
  }

  let {
    id,
    label = 'Drop a file here or choose one',
    description,
    actionLabel,
    accept = '.json',
    multiple = false,
    disabled = false,
    onfiles
  }: Props = $props();

  let dragging = $state(false);

  function receive(files: FileList | null) {
    if (!disabled && files?.length) onfiles?.(files);
  }
</script>

<label
  class="drop"
  class:dragging
  class:disabled
  for={id}
  ondragover={(event) => {
    event.preventDefault();
    dragging = true;
  }}
  ondragleave={() => (dragging = false)}
  ondrop={(event) => {
    event.preventDefault();
    if (!disabled) event.stopPropagation();
    dragging = false;
    receive(event.dataTransfer?.files ?? null);
  }}
>
  <Icon
    name="upload"
    size={26}
  />
  <strong>{label}</strong>
  <small>{description ?? `Accepted: ${accept}`}</small>
  {#if actionLabel}
    <span class="drop-action">{actionLabel}</span>
  {/if}
  <input
    {id}
    type="file"
    {accept}
    {multiple}
    {disabled}
    onchange={(event) => {
      receive(event.currentTarget.files);
      event.currentTarget.value = '';
    }}
  />
</label>

<style>
  .drop {
    min-height: 132px;
    display: grid;
    place-items: center;
    align-content: center;
    gap: var(--space-2);
    padding: var(--space-5);
    border: 1px dashed var(--color-border-strong);
    border-radius: var(--radius-lg);
    background: var(--color-surface-2);
    color: var(--color-text-muted);
    text-align: center;
    cursor: pointer;
    transition:
      background var(--duration-fast),
      border-color var(--duration-fast);
  }
  .drop:hover,
  .drop.dragging {
    border-color: var(--color-accent);
    background: var(--color-accent-soft);
    color: var(--color-accent);
  }
  .drop.disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
  .drop:focus-within {
    outline: 2px solid var(--color-accent);
    outline-offset: 3px;
  }
  strong {
    color: var(--color-text);
    font-size: var(--font-sm);
  }
  small {
    font-size: var(--font-xs);
  }
  .drop-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 32px;
    padding: 0 14px;
    margin-top: 4px;
    border: 1px solid rgb(var(--accent-primary-rgb) / 0.4);
    border-radius: var(--radius-sm);
    background: rgb(var(--accent-primary-rgb) / 0.12);
    color: var(--accent-primary);
    font-size: 12px;
    font-weight: 600;
  }
  input {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    opacity: 0;
  }
</style>
