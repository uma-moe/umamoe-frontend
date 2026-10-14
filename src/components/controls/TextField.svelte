<script lang="ts">
  import Icon from '../Icon.svelte';
  import NumberStepper from './NumberStepper.svelte';
  import type { IconName } from '../icon-types';
  import type { HTMLInputAttributes } from 'svelte/elements';

  interface Props {
    id: string;
    label: string;
    value?: string;
    type?: 'text' | 'search' | 'email' | 'password' | 'number' | 'url' | 'date';
    placeholder?: string;
    help?: string;
    error?: string;
    disabled?: boolean;
    readonly?: boolean;
    min?: number;
    max?: number;
    step?: number;
    maxlength?: number;
    autocomplete?: HTMLInputAttributes['autocomplete'];
    inputmode?: 'none' | 'text' | 'decimal' | 'numeric' | 'tel' | 'search' | 'email' | 'url';
    hideLabel?: boolean;
    prefixIcon?: IconName;
    suffixIcon?: IconName;
    prefixImage?: string;
    oninput?: (event: Event) => void;
    onblur?: (event: FocusEvent) => void;
  }

  let {
    id,
    label,
    value = $bindable(''),
    type = 'text',
    placeholder = type === 'number' ? '0' : '',
    help,
    error,
    disabled = false,
    readonly = false,
    min,
    max,
    step,
    maxlength,
    autocomplete,
    inputmode,
    hideLabel = false,
    prefixIcon,
    suffixIcon,
    prefixImage,
    oninput,
    onblur
  }: Props = $props();

  const describedBy = $derived(error ? `${id}-error` : help ? `${id}-help` : undefined);

  let input: HTMLInputElement;

  const hasValue = $derived(value !== '' && value != null);

  function changeNumber(direction: 1 | -1): void {
    if (disabled || readonly) return;
    input.focus({ preventScroll: true });
    const previous = input.value;
    if (direction === 1) input.stepUp();
    else input.stepDown();
    if (input.value !== previous) {
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
</script>

<div class="field">
  <label
    class="field-label"
    for={id}
    class:sr-only={hideLabel}
  >
    {label}
  </label>
  <span
    class="input-wrap"
    class:numeric={type === 'number'}
  >
    {#if prefixIcon || prefixImage}
      <span
        class="prefix-icon"
        aria-hidden="true"
      >
        {#if prefixImage}
          <img
            src={prefixImage}
            width="20"
            height="20"
            alt=""
          />
        {:else if prefixIcon}
          <Icon
            name={prefixIcon}
            size={20}
          />
        {/if}
      </span>
    {/if}
    <input
      bind:this={input}
      class:has-prefix={Boolean(prefixIcon || prefixImage)}
      class:has-suffix={Boolean(suffixIcon)}
      {id}
      {type}
      {placeholder}
      {disabled}
      {readonly}
      {min}
      {max}
      {step}
      {maxlength}
      {autocomplete}
      {inputmode}
      bind:value
      aria-invalid={error ? 'true' : undefined}
      aria-describedby={describedBy}
      {oninput}
      {onblur}
    />
    {#if suffixIcon}
      <span
        class="suffix-icon"
        aria-hidden="true"
      >
        <Icon
          name={suffixIcon}
          size={20}
        />
      </span>
    {/if}{#if type === 'number'}
      <span class="number-controls">
        <NumberStepper
          increaseLabel={`Increase ${label}`}
          decreaseLabel={`Decrease ${label}`}
          increaseDisabled={disabled ||
            readonly ||
            (hasValue && max !== undefined && Number(value) >= max)}
          decreaseDisabled={disabled ||
            readonly ||
            (hasValue && min !== undefined && Number(value) <= min)}
          onstep={changeNumber}
        />
      </span>
    {/if}
  </span>
  {#if error}
    <span
      id="{id}-error"
      class="field-message field-error"
    >
      {error}
    </span>
  {:else if help}
    <span
      id="{id}-help"
      class="field-message"
    >
      {help}
    </span>
  {/if}
</div>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  .field-label {
    color: var(--color-text);
    font-size: var(--font-sm);
    font-weight: 600;
    line-height: 1.2;
  }
  .input-wrap {
    position: relative;
    min-width: 0;
    display: block;
  }
  .prefix-icon,
  .suffix-icon {
    position: absolute;
    z-index: 1;
    top: 50%;
    width: 20px;
    height: 20px;
    display: grid;
    place-items: center;
    transform: translateY(-50%);
    color: var(--text-disabled);
    pointer-events: none;
  }
  .prefix-icon {
    left: 14px;
  }
  .suffix-icon {
    right: 14px;
  }
  input {
    width: 100%;
    height: var(--control-height);
    padding: 0 10px;
    border: 1px solid var(--factor-field-border);
    border-radius: 8px;
    background: var(--factor-field-bg);
    color: var(--factor-field-text);
    font-family: inherit;
    font-size: 14px;
    line-height: 1.2;
    transition:
      border-color var(--duration-fast),
      background-color var(--duration-fast);
  }
  input.has-prefix {
    padding-left: 44px;
  }
  input.has-suffix {
    padding-right: 44px;
  }
  input[type='number'] {
    appearance: textfield;
    padding-right: 34px;
  }
  input[type='number']::-webkit-inner-spin-button,
  input[type='number']::-webkit-outer-spin-button {
    appearance: none;
    margin: 0;
  }
  .number-controls {
    --number-stepper-width: 22px;
    --number-stepper-height: calc((var(--control-height) - 8px) / 2);
    position: absolute;
    right: 5px;
    top: 50%;
    transform: translateY(-50%);
  }
  .numeric input.has-suffix {
    padding-right: 62px;
  }
  .numeric .suffix-icon {
    right: 34px;
  }
  .prefix-icon img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  input::placeholder {
    color: var(--factor-field-placeholder);
  }
  input:hover:not(:disabled) {
    border-color: var(--border-secondary);
  }
  input:focus {
    border-color: var(--factor-field-focus-border);
    outline: 0;
    background: var(--factor-field-focus-bg);
    box-shadow: var(--focus-ring);
  }
  input:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
  input:read-only {
    color: var(--color-text-muted);
  }
  input[aria-invalid='true'] {
    border-color: var(--color-danger);
    background: var(--color-danger-soft);
  }
  .field-message {
    min-height: 1rem;
    color: var(--color-text-subtle);
    font-size: var(--font-xs);
  }
  .field-error {
    color: var(--color-danger);
  }
</style>
