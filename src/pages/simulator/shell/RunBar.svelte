<script lang="ts">
  import type { Snippet } from 'svelte';
  import LogoMark from '@/components/LogoMark.svelte';

  /**
   * A simulator tab's run bar, the same on every tab: what a run would do or what the last one found, then its
   * buttons, the main action last. It sits under the form and sticks to the bottom of the screen while the form
   * scrolls. The summary sets its headline in `<strong>`, more about it in `<span>`, and a reason it cannot run in
   * `<span class="blocked">`. While a run is under way the bar is where it shows: the mark spins beside the summary and a
   * line sweeps along the bar's foot, so the buttons only need to stand disabled.
   */
  interface Props {
    /** Names the bar for assistive tech, such as `Run simulation`. */
    label: string;
    /** Colours the summary by the last answer. */
    tone?: 'good' | 'warn' | 'bad';
    /** A run is under way. */
    busy?: boolean;
    summary: Snippet;
    /** Small buttons, the main action last. */
    children: Snippet;
  }

  let { label, tone, busy = false, summary, children }: Props = $props();
</script>

<section
  class="run-bar {tone ?? ''}"
  class:busy
  aria-label={label}
  aria-busy={busy}
>
  <p
    class="summary"
    role="status"
  >
    {#if busy}
      <span
        class="busy-mark"
        aria-hidden="true"
      >
        <LogoMark
          size={28}
          label=""
          animated
        />
      </span>
    {/if}
    {@render summary()}
  </p>
  {@render children()}
  {#if busy}
    <span
      class="progress"
      aria-hidden="true"
    ></span>
  {/if}
</section>

<style>
  .run-bar {
    position: sticky;
    bottom: 12px;
    z-index: 5;
    display: flex;
    align-items: center;
    gap: 8px;
    overflow: hidden;
    padding: 8px 8px 8px 16px;
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-lg);
    background: var(--surface-1);
    box-shadow: 0 6px 24px rgb(0 0 0 / 0.28);
  }
  .summary {
    display: flex;
    flex: 1;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px 8px;
    min-width: 0;
    margin: 0;
    font-size: 13px;
  }
  .busy-mark {
    display: inline-flex;
    flex: none;
  }
  .busy .summary :global(strong) {
    color: var(--color-accent);
  }
  /* The run under way: a soft accent sweep along the foot of the bar, quick out and slow in. */
  .progress {
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    height: 2px;
    overflow: hidden;
    background: rgb(var(--accent-primary-rgb) / 0.12);
  }
  .progress::before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 40%;
    background: linear-gradient(90deg, transparent, var(--accent-primary), transparent);
    animation: sweep 1.6s cubic-bezier(0.16, 1, 0.3, 1) infinite;
  }
  @keyframes sweep {
    from {
      transform: translateX(-100%);
    }
    to {
      transform: translateX(250%);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .progress::before {
      width: 100%;
      opacity: 0.6;
      animation: none;
    }
  }
  .summary :global(strong) {
    font-weight: 650;
    color: var(--text-primary);
  }
  .summary :global(span) {
    color: var(--text-secondary);
  }
  .summary :global(.blocked) {
    color: var(--accent-warning);
  }
  .good .summary :global(svg) {
    color: var(--accent-success);
  }
  .warn .summary :global(svg) {
    color: var(--accent-warning);
  }
  .bad .summary :global(strong),
  .bad .summary :global(svg) {
    color: var(--accent-error);
  }
  .run-bar > :global(.ui-button) {
    flex: none;
    height: 40px;
    min-height: 40px;
    font-size: 13px;
    border-radius: var(--radius-sm);
  }
  /* A phone: the summary on its own line, the buttons sharing the row under it. */
  @media (max-width: 767px) {
    .run-bar {
      bottom: 8px;
      flex-wrap: wrap;
      gap: 6px;
      padding: 6px;
    }
    .summary {
      flex-basis: 100%;
      padding: 2px 4px 0;
      font-size: 12px;
    }
    .run-bar > :global(.ui-button) {
      flex: 1;
      height: 36px;
      min-height: 36px;
      padding-inline: 8px;
      font-size: 12px;
    }
  }
</style>
