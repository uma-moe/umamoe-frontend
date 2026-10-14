<script lang="ts">
  import Icon from '../Icon.svelte';

  interface Props {
    increaseLabel: string;
    decreaseLabel: string;
    increaseDisabled?: boolean;
    decreaseDisabled?: boolean;
    onstep: (direction: 1 | -1) => void;
  }

  let {
    increaseLabel,
    decreaseLabel,
    increaseDisabled = false,
    decreaseDisabled = false,
    onstep
  }: Props = $props();
</script>

<span class="number-stepper">
  <button
    type="button"
    aria-label={increaseLabel}
    disabled={increaseDisabled}
    onpointerdown={(event) => event.preventDefault()}
    onclick={() => onstep(1)}
  >
    <Icon
      name="chevron"
      size={13}
    />
  </button>
  <button
    type="button"
    aria-label={decreaseLabel}
    disabled={decreaseDisabled}
    onpointerdown={(event) => event.preventDefault()}
    onclick={() => onstep(-1)}
  >
    <Icon
      name="chevron"
      size={13}
    />
  </button>
</span>

<style>
  .number-stepper {
    display: flex;
    flex: none;
    flex-direction: column;
  }
  button {
    width: var(--number-stepper-width, 16px);
    height: var(--number-stepper-height, 14px);
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 2px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
  }
  button:first-child :global(svg) {
    transform: rotate(180deg);
  }
  button:hover:not(:disabled) {
    background: var(--color-accent-soft);
    color: var(--accent-primary);
  }
  button:focus-visible {
    outline: 1px solid var(--accent-primary);
    outline-offset: -1px;
  }
  button:disabled {
    opacity: 0.3;
    cursor: default;
  }
</style>
