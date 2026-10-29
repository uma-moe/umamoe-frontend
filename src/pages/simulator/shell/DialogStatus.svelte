<script lang="ts">
  import type { Snippet } from 'svelte';

  /**
   * A simulator dialog's footer line, read like the run bar's summary: what confirming would do, or why it can't yet.
   * It leads the footer and pushes the buttons to the end; on a phone it takes its own line above them. The content
   * sets its headline in `<strong>`, more about it in `<span>`, and a reason it can't go ahead in `<span
   * class="blocked">`.
   */
  let { children }: { children: Snippet } = $props();
</script>

<p
  class="dialog-status"
  role="status"
>
  {@render children()}
</p>

<style>
  .dialog-status {
    display: flex;
    flex: 1 1 auto;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px 8px;
    min-width: 0;
    margin: 0 auto 0 0;
    font-size: 12px;
    line-height: 1.4;
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
  }
  .dialog-status :global(strong) {
    font-weight: 650;
    color: var(--text-primary);
  }
  .dialog-status :global(.blocked) {
    color: var(--accent-warning);
  }
  .dialog-status :global(.bad) {
    color: var(--accent-error);
  }
  /* The footer's buttons share the row under the status on a phone. */
  :global(footer:has(> .dialog-status)) {
    flex-wrap: wrap;
  }
  @media (max-width: 767px) {
    .dialog-status {
      flex-basis: 100%;
      gap: 0 6px;
      font-size: 11px;
    }
    :global(footer:has(> .dialog-status)) {
      gap: 6px;
    }
    :global(footer:has(> .dialog-status) > .ui-button) {
      flex: 1;
    }
  }
</style>
