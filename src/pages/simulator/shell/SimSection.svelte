<script lang="ts">
  import type { Snippet } from 'svelte';

  /** One numbered part of a simulator form: a heading with optional actions, then its fields. */
  let {
    number,
    title,
    note,
    actions,
    children
  }: {
    number: number;
    title: string;
    /** A short line beside the title. */
    note?: string;
    actions?: Snippet;
    children: Snippet;
  } = $props();

  const id = $props.id();
</script>

<section
  class="hp-section"
  aria-labelledby={id}
>
  <header>
    <h2 {id}>
      <span
        class="number"
        aria-hidden="true"
      >
        {number}
      </span>
      {title}
    </h2>
    {#if note}<span class="note">{note}</span>{/if}
    {#if actions}<div class="actions">{@render actions()}</div>{/if}
  </header>
  {@render children()}
</section>

<style>
  .hp-section {
    display: grid;
    gap: 10px;
    min-width: 0;
    padding: 12px 0;
    border-top: 1px solid var(--border-subtle);
  }
  .hp-section:first-child {
    padding-top: 0;
    border-top: 0;
  }
  .hp-section:last-child {
    padding-bottom: 0;
  }
  header {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px 12px;
    min-height: 28px;
  }
  h2 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-size: 14px;
    font-weight: 650;
  }
  .number {
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border: 1px solid var(--accent-primary);
    border-radius: 50%;
    background: var(--color-accent-soft);
    color: var(--accent-primary);
    font-size: 11px;
    font-weight: 700;
  }
  .note {
    font-size: 12px;
    color: var(--text-secondary);
  }
  .actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-left: auto;
  }
  /* Buttons and menus in a section's header are one size, so a row of them reads as one set. */
  .actions :global(.ui-button),
  .actions :global(.menu > .trigger) {
    height: 28px;
    min-height: 28px;
    padding-inline: 10px;
    border-radius: var(--radius-sm);
    font-size: 11px;
  }
  .actions :global(.menu > .trigger) {
    color: var(--color-text);
    font-weight: 700;
  }
  @media (max-width: 767px) {
    .actions :global(.ui-button),
    .actions :global(.menu > .trigger) {
      height: 40px;
      min-height: 40px;
    }
  }
</style>
