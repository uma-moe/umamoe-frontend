<script lang="ts">
  import Artwork from '../game/Artwork.svelte';

  export interface RadioOption {
    value: string;
    label: string;
    shortLabel?: string;
    description?: string;
    image?: string;
    disabled?: boolean;
  }

  interface Props {
    id: string;
    legend: string;
    options: RadioOption[];
    cards?: boolean;
    compact?: boolean;
    value?: string;
  }

  let {
    id,
    legend,
    options,
    cards = false,
    compact = false,
    value = $bindable('')
  }: Props = $props();
</script>

<fieldset
  class:cards
  class:compact
>
  <legend>{legend}</legend>
  <div
    class="options"
    style:grid-template-columns={compact ? `repeat(${options.length},minmax(0,1fr))` : undefined}
  >
    {#each options as option}
      <label
        class:selected={value === option.value}
        class:has-image={cards && Boolean(option.image)}
        title={compact ? [option.label, option.description].filter(Boolean).join('\n') : undefined}
      >
        <input
          type="radio"
          name={id}
          value={option.value}
          bind:group={value}
          disabled={option.disabled}
          aria-label={compact
            ? [option.label, option.description].filter(Boolean).join(' ')
            : undefined}
        />
        <span
          class="radio"
          aria-hidden="true"
        ></span>
        {#if cards && option.image}
          <Artwork
            src={option.image}
            alt=""
            size={compact ? 'xs' : 'sm'}
          />
        {/if}
        <span class="copy">
          <strong>{compact ? (option.shortLabel ?? option.label) : option.label}</strong>
          {#if option.description && !compact}
            <small>{option.description}</small>
          {/if}
        </span>
      </label>
    {/each}
  </div>
</fieldset>

<style>
  fieldset {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }
  legend {
    margin-bottom: var(--space-2);
    font-size: var(--font-sm);
    font-weight: 700;
  }
  .options {
    display: grid;
    gap: var(--space-1);
  }
  label {
    min-height: var(--touch-target);
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr);
    align-items: center;
    gap: var(--space-3);
    cursor: pointer;
  }
  input {
    position: absolute;
    opacity: 0;
  }
  .radio {
    width: 22px;
    height: 22px;
    display: grid;
    place-items: center;
    border: 1px solid var(--color-border-strong);
    border-radius: 50%;
    background: var(--color-surface-1);
  }
  input:checked + .radio::after {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--color-accent);
    content: '';
  }
  input:focus-visible + .radio {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  input:disabled ~ * {
    opacity: 0.45;
  }
  .copy {
    display: flex;
    flex-direction: column;
  }
  strong {
    font-size: var(--font-sm);
  }
  small {
    color: var(--color-text-subtle);
    font-size: var(--font-xs);
  }
  .cards .options {
    grid-template-columns: repeat(var(--radio-columns, 3), minmax(0, 1fr));
    gap: 6px;
  }
  .cards label {
    position: relative;
    min-width: 0;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 8px;
    padding: 6px 8px;
    border: 1px solid var(--card-surface-border);
    border-radius: var(--radius-md);
    background: var(--card-surface-bg);
  }
  .cards input {
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    z-index: 1;
    cursor: pointer;
  }
  .cards label:hover {
    border-color: var(--border-secondary);
  }
  .cards label.selected {
    border-color: rgb(var(--accent-primary-rgb) / 0.6);
    background: rgb(var(--accent-primary-rgb) / 0.08);
  }
  .cards label:has(input:focus-visible) {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  .cards .radio {
    display: none;
  }
  .cards label:not(.has-image) {
    grid-template-columns: minmax(0, 1fr);
  }
  .cards .copy {
    min-width: 0;
    gap: 2px;
  }
  .cards strong {
    font-size: 12px;
    font-weight: 600;
    line-height: 1.25;
    overflow-wrap: anywhere;
  }
  .cards small {
    color: var(--text-secondary);
    font-size: 10px;
    line-height: 1.25;
  }
  .cards .selected small {
    color: var(--accent-primary);
  }
  .cards legend {
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 500;
  }
  .cards.compact .options {
    gap: 3px;
  }
  .cards.compact label {
    grid-template-columns: minmax(0, 1fr);
    justify-items: center;
    align-content: center;
    min-height: 44px;
    gap: 1px;
    padding: 2px;
  }
  .cards.compact :global(.art) {
    width: 24px;
    height: 24px;
    border: 0;
    background: transparent;
  }
  .cards.compact strong {
    font-size: 9px;
    white-space: nowrap;
    text-align: center;
  }
  @media (max-width: 650px) {
    .cards .options {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .cards label {
      gap: 6px;
      padding: 6px;
    }
    .cards strong {
      font-size: 11px;
    }
  }
</style>
