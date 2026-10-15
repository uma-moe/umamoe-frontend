<script lang="ts">
  import Icon from '../Icon.svelte';
  import type { IconName } from '../icon-types';

  export interface Segment {
    value: string;
    label: string;
    disabled?: boolean;
    icon?: IconName;
    /** Game icon standing in for the label. */ image?: string;
    /** Accessible name when `label` is an abbreviation or an icon stands in for text. */ title?: string;
  }

  interface Props {
    label: string;
    options: Segment[];
    value?: string;
    compact?: boolean;
    onchange?: (value: string) => void;
  }

  let { label, options, value = $bindable(''), compact = false, onchange }: Props = $props();

  const enabled = $derived(options.filter((option) => !option.disabled));
  const tabStop = $derived(
    enabled.find((option) => option.value === value)?.value ?? enabled[0]?.value
  );

  function select(next: string) {
    value = next;
    onchange?.(next);
  }

  function navigate(event: KeyboardEvent, current: string) {
    const index = enabled.findIndex((option) => option.value === current);
    if (!enabled.length) return;
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = (index + 1) % enabled.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = (index - 1 + enabled.length) % enabled.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = enabled.length - 1;
        break;
      default:
        return;
    }

    const option = enabled[next];
    if (!option) return;
    event.preventDefault();
    select(option.value);
    (event.currentTarget as HTMLElement).parentElement
      ?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
      [next]?.focus();
  }
</script>

<div
  class="segments"
  class:compact
  role="radiogroup"
  aria-label={label}
>
  {#each options as option}
    <button
      type="button"
      role="radio"
      tabindex={option.value === tabStop ? 0 : -1}
      onkeydown={(event) => navigate(event, option.value)}
      aria-checked={value === option.value}
      aria-label={option.title ?? (option.icon || option.image ? option.label : undefined)}
      title={option.title ?? (option.icon || option.image ? option.label : undefined)}
      class:selected={value === option.value}
      class:icon-only={option.icon !== undefined || option.image !== undefined}
      disabled={option.disabled}
      onclick={() => select(option.value)}
    >
      {#if option.image}
        <img
          src={option.image}
          alt=""
          loading="eager"
        />
      {:else if option.icon}
        <Icon
          name={option.icon}
          size={18}
        />
      {:else}
        {option.label}
      {/if}
    </button>
  {/each}
</div>

<style>
  .segments {
    width: fit-content;
    max-width: 100%;
    display: flex;
    gap: 2px;
    padding: 3px;
    overflow-x: auto;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--factor-field-bg);
    scrollbar-width: none;
  }
  button {
    min-height: 36px;
    padding: 0 var(--space-3);
    flex: 0 0 auto;
    border: 1px solid transparent;
    border-radius: calc(var(--radius-md) - 3px);
    background: transparent;
    color: var(--factor-field-text);
    cursor: pointer;
    font-size: var(--font-sm);
    font-weight: 700;
  }
  button:hover:not(:disabled) {
    color: var(--color-text);
  }
  button.selected {
    background: rgb(var(--accent-primary-rgb) / 0.12);
    border-color: rgb(var(--accent-primary-rgb) / 0.3);
    color: var(--color-accent);
  }
  button:disabled {
    opacity: 0.42;
    cursor: not-allowed;
  }
  button.icon-only {
    display: grid;
    place-items: center;
    padding: 0;
  }
  button img {
    width: 28px;
    height: 28px;
    object-fit: contain;
  }
  .compact {
    box-sizing: border-box;
    height: var(--control-height);
    padding: 2px;
    align-items: stretch;
  }
  .compact button {
    min-height: 0;
    padding-inline: 10px;
    font-family: inherit;
    font-size: 11px;
    font-weight: 600;
  }
</style>
