<script lang="ts">
  import { MAX_COUNT } from './hp-plan';

  /**
   * A count to type or step: − and + for the pointer, a number field for the keyboard (type it, or arrow up and
   * down). The field is the one tab stop; the buttons stay out of the tab order.
   */
  let {
    id,
    name,
    value = $bindable(0),
    max = MAX_COUNT,
    small = false
  }: {
    /** For the field, so a page can move focus to it. */
    id?: string;
    /** What is counted, such as "Gold recovery skills"; names the field and both buttons. */
    name: string;
    value?: number;
    max?: number;
    /** The tighter version, for a table of counts. */
    small?: boolean;
  } = $props();

  const set = (next: number) => (value = Math.min(max, Math.max(0, Math.round(next))));
</script>

<span
  class="stepper"
  class:small
  class:zero={value === 0}
>
  <button
    type="button"
    tabindex="-1"
    aria-label={'Fewer ' + name.toLowerCase()}
    disabled={value <= 0}
    onclick={() => set(value - 1)}
  >
    −
  </button>
  <input
    {id}
    type="number"
    inputmode="numeric"
    min="0"
    {max}
    step="1"
    aria-label={name}
    {value}
    onfocus={(event) => event.currentTarget.select()}
    oninput={(event) => {
      const typed = event.currentTarget.value;
      if (typed !== '' && Number.isFinite(Number(typed))) set(Number(typed));
    }}
    onchange={(event) => (event.currentTarget.value = String(value))}
  />
  <button
    type="button"
    tabindex="-1"
    aria-label={'More ' + name.toLowerCase()}
    disabled={value >= max}
    onclick={() => set(value + 1)}
  >
    +
  </button>
</span>

<style>
  .stepper {
    display: inline-flex;
    align-items: center;
    flex: none;
  }
  button {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 1px solid var(--border-primary);
    border-radius: 6px;
    background: var(--surface-1);
    color: var(--text-primary);
    font: inherit;
    font-size: 15px;
    line-height: 1;
    cursor: pointer;
  }
  button:hover:not(:disabled) {
    background: var(--tab-btn-hover-bg);
  }
  button:disabled {
    cursor: default;
    opacity: 0.35;
  }
  input {
    width: 30px;
    height: 28px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: var(--text-primary);
    font: inherit;
    font-size: 13px;
    font-weight: 700;
    text-align: center;
    font-variant-numeric: tabular-nums;
    appearance: textfield;
    -moz-appearance: textfield;
  }
  input::-webkit-inner-spin-button,
  input::-webkit-outer-spin-button {
    margin: 0;
    appearance: none;
  }
  input:hover {
    border-color: var(--border-subtle);
  }
  input:focus-visible {
    border-color: var(--accent-primary);
    outline: 2px solid rgb(var(--accent-primary-rgb) / 0.35);
    outline-offset: 0;
  }
  .zero input {
    color: var(--text-secondary);
  }
  /* In a table of counts: the same control, tighter. */
  .small button {
    width: 24px;
    height: 24px;
    border-radius: 5px;
    font-size: 14px;
  }
  .small input {
    width: 22px;
    height: 24px;
    font-size: 12px;
  }
  /* A phone: the design system's control height. */
  @media (max-width: 767px) {
    .stepper:not(.small) button {
      width: var(--control-height);
      height: var(--control-height);
    }
    .stepper:not(.small) input {
      height: var(--control-height);
    }
    .small button {
      width: 28px;
      height: var(--control-height);
    }
    .small input {
      height: var(--control-height);
    }
  }
</style>
