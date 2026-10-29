<script lang="ts">
  import Icon from '../Icon.svelte';

  interface Props {
    title: string;
    description: string;
    step: number;
    total: number;
    open?: boolean;
    nextDisabled?: boolean;
    nextLabel?: string;
    onback?: () => void;
    onnext?: () => void;
    ondismiss?: () => void;
  }

  let {
    title,
    description,
    step,
    total,
    open = true,
    nextDisabled = false,
    nextLabel,
    onback,
    onnext,
    ondismiss
  }: Props = $props();

  const id = $props.id();
</script>

{#if open}
  <div
    class="tour"
    role="dialog"
    aria-labelledby={`${id}-title`}
    aria-describedby={`${id}-description`}
    tabindex="-1"
  >
    <header>
      <h2 id={`${id}-title`}>{title}</h2>
      <button
        type="button"
        class="dismiss"
        aria-label="Dismiss tour"
        onclick={ondismiss}
      >
        <Icon
          name="close"
          size={20}
        />
      </button>
    </header>
    <p id={`${id}-description`}>{description}</p>
    <footer>
      <button
        type="button"
        disabled={step <= 1}
        onclick={onback}
      >
        <span class="previous">
          <Icon
            name="chevron"
            size={18}
          />
        </span>
        Back
      </button>
      <span
        class="progress"
        aria-label={`Tour step ${step} of ${total}`}
      >
        {step} / {total}
      </span>
      <button
        type="button"
        disabled={nextDisabled}
        onclick={onnext}
      >
        {nextLabel ?? (step >= total ? 'Done' : 'Next')}
        <span class="next">
          <Icon
            name="chevron"
            size={18}
          />
        </span>
      </button>
    </footer>
  </div>
{/if}

<style>
  .tour {
    width: 100%;
    max-height: calc(100dvh - 16px);
    overflow: auto;
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    background: var(--surface-overlay);
    color: var(--text-primary);
    box-shadow: var(--shadow-dropdown);
    font-family: var(--font-sans);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 6px 0 14px;
  }
  h2 {
    min-width: 0;
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
    line-height: 1.5;
  }
  p {
    margin: 8px 0;
    padding: 0 16px;
    color: var(--text-secondary);
    font-size: 0.875rem;
    line-height: 1.45;
  }
  button {
    min-height: 36px;
    min-width: 44px;
    padding: 0 10px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--accent-primary);
    font-family: inherit;
    font-size: 14px;
    font-weight: 700;
    line-height: 1.2;
    cursor: pointer;
  }
  button:hover:not(:disabled) {
    background: rgb(var(--accent-primary-rgb) / 0.08);
  }
  button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .dismiss {
    display: grid;
    flex: 0 0 48px;
    height: 48px;
    place-items: center;
    padding: 0;
    color: var(--text-secondary);
  }
  footer {
    display: grid;
    min-height: 52px;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 8px;
    padding: 0 12px 12px;
  }
  footer button {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .previous {
    transform: rotate(90deg);
  }
  .next {
    transform: rotate(-90deg);
  }
  footer button:first-child {
    justify-self: start;
  }
  footer button:last-child {
    justify-self: end;
  }
  .progress {
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
  }
  @media (max-width: 600px) {
    header {
      padding-top: 4px;
      padding-left: 12px;
    }
    h2 {
      font-size: 0.95rem;
    }
    p {
      font-size: 0.82rem;
      line-height: 1.4;
    }
    footer {
      gap: 2px;
      padding: 0 10px 10px;
    }
  }
  @media (max-width: 767px) {
    button {
      min-height: var(--touch-target);
    }
  }
</style>
