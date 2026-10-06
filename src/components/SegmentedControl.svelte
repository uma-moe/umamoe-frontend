<script lang="ts">
  import Icon from './Icon.svelte';
  import type { IconName } from './icon-types';
  export interface Segment { value: string; label: string; disabled?: boolean; icon?: IconName; /** Game icon standing in for the label. */ image?: string; /** Accessible name when `label` is an abbreviation or an icon stands in for text. */ title?: string; }
  interface Props { label: string; options: Segment[]; value?: string; onchange?: (value: string) => void; }
  let { label, options, value = $bindable(''), onchange }: Props = $props();
  function select(next: string) { value = next; onchange?.(next); }
  const enabled = $derived(options.filter((option) => !option.disabled));
  const tabStop = $derived(enabled.find((option) => option.value === value)?.value ?? enabled[0]?.value);
  function navigate(event: KeyboardEvent, current: string) {
    const index = enabled.findIndex((option) => option.value === current);
    const next = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? (index + 1) % enabled.length
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? (index - 1 + enabled.length) % enabled.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1 : -1;
    if (next < 0 || !enabled[next]) return;
    event.preventDefault();
    select(enabled[next]!.value);
    (event.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')[next]?.focus();
  }
</script>

<div class="segments" role="radiogroup" aria-label={label}>
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
    >{#if option.image}<img src={option.image} alt="" loading="lazy"/>{:else if option.icon}<Icon name={option.icon} size={18}/>{:else}{option.label}{/if}</button>
  {/each}
</div>

<style>
  .segments { width: fit-content; max-width: 100%; display: flex; gap: 2px; padding: 3px; overflow-x: auto; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--factor-field-bg); scrollbar-width: none; }
  button { min-height: 36px; padding: 0 var(--space-3); flex: 0 0 auto; border: 1px solid transparent; border-radius: calc(var(--radius-md) - 3px); background: transparent; color:var(--factor-field-text); cursor: pointer; font-size: var(--font-sm); font-weight: 700; }
  button:hover:not(:disabled) { color: var(--color-text); }
  button.selected { background: rgb(var(--accent-primary-rgb) / .12); border-color: rgb(var(--accent-primary-rgb) / .3); color: var(--color-accent); }
  button:disabled { opacity: .42; cursor: not-allowed; }
  button.icon-only { display:grid; place-items:center; padding:0; }
  button img { width:28px; height:28px; object-fit:contain; }
</style>
