<script lang="ts">
  import { tick } from 'svelte';
  import Icon from '../Icon.svelte';

  interface Props {
    page?: number;
    pages: number;
    label?: string;
    showPageNumbers?: boolean;
    total?: number;
    pageSize?: number;
    jump?: boolean;
    onchange?: (page: number) => void;
  }

  let {
    page = $bindable(1),
    pages,
    label = 'Pagination',
    showPageNumbers = true,
    total,
    pageSize,
    jump = false,
    onchange
  }: Props = $props();
  const inputId = $props.id();

  let jumpOpen = $state(false);
  let jumpInput = $state<HTMLInputElement>();
  let jumpControl = $state<HTMLButtonElement>();
  let destination = $state<number | undefined>(page);

  const canJump = $derived(jump && pages > 7);

  $effect(() => {
    destination = page;
    pages;
    jumpOpen = false;
  });

  const visiblePages = $derived.by(() => {
    if (pages <= 7) return Array.from({ length: Math.max(0, pages) }, (_, index) => index + 1);
    const start = Math.max(1, Math.min(page - 2, pages - 4));
    return [
      ...new Set([
        1,
        ...Array.from({ length: Math.min(5, pages) }, (_, index) => start + index),
        pages
      ])
    ]
      .filter((value) => value > 0)
      .sort((a, b) => a - b);
  });

  function select(next: number) {
    if (!Number.isFinite(next)) return;
    const selected = Math.max(1, Math.min(pages, Math.trunc(next)));
    destination = selected;
    jumpOpen = false;
    if (selected !== page) {
      page = selected;
      onchange?.(page);
    }
  }

  async function toggleJump() {
    jumpOpen = !jumpOpen;
    destination = page;
    if (jumpOpen) {
      await tick();
      jumpInput?.focus();
      jumpInput?.select();
    }
  }

  function closeJump() {
    jumpOpen = false;
    jumpControl?.focus({ preventScroll: true });
  }
</script>

<nav
  aria-label={label}
  class:with-summary={total !== undefined}
  class:compact-pages={pages > 5}
>
  <div class="controls">
    <button
      class="previous"
      type="button"
      aria-label="Previous page"
      disabled={page <= 1}
      onclick={() => select(page - 1)}
    >
      <Icon
        name="chevron"
        size={17}
      />{#if jump}
        <span>Previous</span>
      {/if}
    </button>
    {#if showPageNumbers}
      <div class="page-numbers">
        {#each visiblePages as current, index}
          {#if index > 0 && current - (visiblePages[index - 1] ?? 0) > 1}
            <span
              class="gap"
              aria-hidden="true"
            >
              …
            </span>
          {/if}
          <button
            type="button"
            class:active={current === page}
            aria-label={`Page ${current}`}
            aria-current={current === page ? 'page' : undefined}
            onclick={() => select(current)}
          >
            {current}
          </button>
        {/each}
      </div>
    {/if}
    {#if showPageNumbers && pages > 5}
      <span class="compact-page">
        Page <strong>{page.toLocaleString()}</strong>
        <span>of {pages.toLocaleString()}</span>
      </span>
    {/if}
    <button
      class="next"
      type="button"
      aria-label="Next page"
      disabled={page >= pages}
      onclick={() => select(page + 1)}
    >
      {#if jump}
        <span>Next</span>
      {/if}<Icon
        name="chevron"
        size={17}
      />
    </button>
  </div>
  {#if (total !== undefined && pageSize) || canJump}
    <div class="meta">
      {#if total !== undefined && pageSize}
        <span
          class="summary"
          aria-live="polite"
        >
          <strong>
            {Math.min(total, (page - 1) * pageSize + 1).toLocaleString()}–{Math.min(
              total,
              page * pageSize
            ).toLocaleString()}
          </strong>
          of {total.toLocaleString()} results
        </span>
      {/if}
      {#if canJump}
        <button
          bind:this={jumpControl}
          class="jump-toggle"
          type="button"
          aria-expanded={jumpOpen}
          aria-controls={`${inputId}-form`}
          onclick={toggleJump}
        >
          Jump to page<Icon
            name="chevron"
            size={12}
          />
        </button>
      {/if}
    </div>
  {/if}
  {#if canJump && jumpOpen}
    <form
      id={`${inputId}-form`}
      onsubmit={(event) => {
        event.preventDefault();
        if (destination !== undefined) {
          jumpControl?.focus({ preventScroll: true });
          select(destination);
        }
      }}
    >
      <label for={inputId}>Page</label>
      <input
        bind:this={jumpInput}
        id={inputId}
        type="number"
        inputmode="numeric"
        min="1"
        max={pages}
        step="1"
        required
        bind:value={destination}
        aria-label="Go to page"
        onkeydown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            closeJump();
          }
        }}
      />
      <span>of {pages.toLocaleString()}</span>
      <button
        class="go"
        type="submit"
      >
        Go
      </button>
      <button
        type="button"
        onclick={closeJump}
        aria-label="Cancel page jump"
      >
        <Icon
          name="close"
          size={15}
        />
      </button>
    </form>
  {/if}
</nav>

<style>
  nav {
    max-width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    font-size: var(--font-sm);
    font-variant-numeric: tabular-nums;
  }
  nav.with-summary {
    width: 100%;
    container: pagination / inline-size;
    padding-block: 16px;
    border-top: 1px solid var(--color-border);
  }
  .controls,
  .page-numbers,
  form,
  .meta {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .controls {
    max-width: 100%;
    padding: 3px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--factor-field-bg);
  }
  button {
    min-width: 36px;
    min-height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0 10px;
    border: 1px solid transparent;
    border-radius: calc(var(--radius-md) - 3px);
    background: transparent;
    color: var(--factor-field-text);
    cursor: pointer;
    font: inherit;
    font-weight: 600;
  }
  button:hover:not(:disabled) {
    background: var(--color-surface-2);
    color: var(--color-text);
  }
  button.active {
    border-color: rgb(var(--accent-primary-rgb) / 0.3);
    background: rgb(var(--accent-primary-rgb) / 0.16);
    color: var(--color-accent);
  }
  .previous,
  .next {
    padding-inline: 12px;
  }
  button:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
  .previous :global(svg) {
    transform: rotate(90deg);
  }
  .next :global(svg) {
    transform: rotate(-90deg);
  }
  .gap {
    padding-inline: 3px;
    color: var(--color-text-subtle);
  }
  .compact-page {
    display: none;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding-inline: 12px;
    color: var(--color-text-muted);
    white-space: nowrap;
  }
  .compact-page strong {
    color: var(--color-accent);
  }
  .meta {
    flex-wrap: wrap;
    justify-content: center;
    gap: 2px 12px;
    color: var(--color-text-muted);
    font-size: 12px;
  }
  .summary strong {
    color: var(--color-text);
    font-weight: 500;
  }
  .jump-toggle {
    min-height: 28px;
    padding: 0;
    color: var(--color-text-muted);
    font-size: 12px;
    font-weight: 500;
  }
  .jump-toggle:hover {
    color: var(--color-accent);
    background: transparent;
  }
  .jump-toggle[aria-expanded='true'] :global(svg) {
    transform: rotate(180deg);
  }
  form {
    gap: 6px;
    color: var(--color-text-muted);
    font-size: 12px;
    white-space: nowrap;
  }
  form input {
    width: 64px;
    min-height: 36px;
    padding: 5px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--factor-field-bg);
    color: var(--color-text);
    font: inherit;
    text-align: center;
    appearance: textfield;
  }
  input::-webkit-inner-spin-button,
  input::-webkit-outer-spin-button {
    appearance: none;
  }
  form .go {
    background: var(--color-accent);
    color: var(--button-primary-text);
  }
  button:focus-visible,
  input:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  @container pagination (max-width:640px) {
    .compact-pages .page-numbers {
      display: none;
    }
    .compact-pages .compact-page {
      display: flex;
    }
    .previous > span,
    .next > span {
      display: none;
    }
    .previous,
    .next {
      padding-inline: 8px;
    }
  }
  @media (max-width: 767px) {
    .compact-pages .page-numbers {
      display: none;
    }
    .compact-pages .compact-page {
      display: flex;
    }
    .previous > span,
    .next > span {
      display: none;
    }
    .previous,
    .next {
      padding-inline: 8px;
    }
    button,
    form input {
      min-height: 44px;
    }
    .jump-toggle {
      min-height: 32px;
    }
  }
</style>
