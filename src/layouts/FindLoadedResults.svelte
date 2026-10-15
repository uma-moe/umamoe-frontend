<script lang="ts">
  import { onDestroy, tick, untrack } from 'svelte';
  import Icon from '@/components/Icon.svelte';
  import { router } from '@/routes/router';
  import {
    availableFindSources,
    findLoaded,
    findRequested,
    findSources,
    highlightResultText,
    type FindMatch
  } from '@/lib/find-loaded';

  let open = $state(false),
    query = $state(''),
    selected = $state(0);

  let matches = $state.raw<FindMatch[]>([]);
  let input = $state<HTMLInputElement>();

  let returnFocus: HTMLElement | undefined, highlighted: HTMLElement | undefined;
  let generation = 0;
  let lastQuery = '';
  let clearTextHighlight: (() => void) | undefined;

  function clearHighlight() {
    clearTextHighlight?.();
    clearTextHighlight = undefined;
    highlighted?.removeAttribute('data-find-current');
    highlighted = undefined;
  }

  function close() {
    open = false;
    matches = [];
    selected = 0;
    generation++;
    clearHighlight();
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  }

  async function show() {
    if (!open)
      returnFocus =
        document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    open = true;
    await tick();
    input?.focus();
    input?.select();
  }

  async function reveal(index: number) {
    const current = ++generation;
    clearHighlight();
    selected = index;
    const match = matches[index];
    if (!match) return;
    const node = await match.source.reveal(match.index);
    if (current !== generation || !open || !node?.isConnected) return;
    highlighted = node;
    node.setAttribute('data-find-current', '');
    clearTextHighlight = highlightResultText(node, query);
  }

  function next(direction: number) {
    if (matches.length) void reveal((selected + direction + matches.length) % matches.length);
  }

  function keydown(event: KeyboardEvent) {
    if (event.defaultPrevented || event.isComposing || document.querySelector('dialog[open]'))
      return;
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'f') {
      if (!open && !availableFindSources($findSources).length) return;
      event.preventDefault();
      void show();
    } else if (open && event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (open && (event.key === 'F3' || (event.key === 'Enter' && event.target === input))) {
      event.preventDefault();
      next(event.shiftKey ? -1 : 1);
    }
  }

  $effect(() => {
    if (!open) return;
    const sources = $findSources,
      value = query;

    // Searching data is debounced; scrolling itself does not rebuild this index.
    const timer = setTimeout(() => {
      const previous = value === lastQuery ? matches[selected] : undefined;
      matches = findLoaded(sources, value);
      const retained = previous
        ? matches.findIndex(
            (match) => match.source === previous.source && match.index === previous.index
          )
        : -1;

      if (retained >= 0 && highlighted?.isConnected) selected = retained;
      else void reveal(Math.max(0, retained));
      lastQuery = value;
    }, 120);

    return () => clearTimeout(timer);
  });

  $effect(() => {
    router.route.pathname;
    untrack(close);
  });

  $effect(() => {
    if ($findRequested) untrack(() => void show());
  });

  onDestroy(() => {
    generation++;
    clearHighlight();
  });
</script>

<svelte:window onkeydown={keydown} />
{#if open}
  <section
    class="find-bar"
    role="search"
    aria-label="Find loaded results"
  >
    <div class="find-controls">
      <div class="find-field">
        <Icon
          name="search"
          size={16}
        />
        <input
          bind:this={input}
          bind:value={query}
          oninput={() => {
            generation++;
            clearHighlight();
          }}
          type="search"
          aria-label="Find in loaded results"
          aria-describedby="find-help"
          placeholder="Find in results…"
          autocomplete="off"
          spellcheck={false}
        />
        <span
          class="count"
          class:empty={query.trim() && !matches.length}
          role="status"
          aria-live="polite"
          aria-label={query.trim()
            ? matches.length
              ? `Result ${selected + 1} of ${matches.length}`
              : 'No matching results'
            : undefined}
        >
          {query.trim()
            ? matches.length
              ? `${selected + 1} / ${matches.length}`
              : 'No matches'
            : ''}
        </span>
      </div>
      <div class="find-navigation">
        <button
          class="previous"
          type="button"
          aria-label="Previous match"
          title="Previous result (Shift+Enter)"
          disabled={!matches.length}
          onclick={() => next(-1)}
        >
          <Icon
            name="chevron"
            size={18}
          />
        </button>
        <button
          type="button"
          aria-label="Next match"
          title="Next result (Enter)"
          disabled={!matches.length}
          onclick={() => next(1)}
        >
          <Icon
            name="chevron"
            size={18}
          />
        </button>
      </div>
      <button
        type="button"
        aria-label="Close find"
        title="Close (Esc)"
        onclick={close}
      >
        <Icon
          name="close"
          size={18}
        />
      </button>
    </div>
    <div
      class="find-help"
      id="find-help"
    >
      <span>Loaded results</span>
      <span class="shortcuts">
        <kbd>↵</kbd>
        next
        <kbd>⇧ ↵</kbd>
        previous
      </span>
    </div>
  </section>
{/if}

<style>
  .find-bar {
    position: fixed;
    z-index: calc(var(--z-header) + 1);
    top: calc(var(--utility-height) + 8px);
    right: 12px;
    width: min(440px, calc(100vw - 24px));
    padding: 6px;
    border: 1px solid var(--border-secondary);
    border-radius: 10px;
    background: var(--surface-overlay);
    color: var(--text-primary);
    box-shadow: var(--shadow-dropdown);
  }
  .find-controls {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .find-field {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 0;
    padding: 0 8px;
    border: 1px solid var(--border-primary);
    border-radius: 6px;
    background: var(--bg-primary);
    color: var(--text-muted);
  }
  .find-field:focus-within {
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent-primary) 20%, transparent);
  }
  input {
    width: 100%;
    min-width: 0;
    flex: 1;
    height: 34px;
    padding: 0;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--text-primary);
    font: inherit;
    font-size: 13px;
  }
  input:focus-visible {
    outline: none;
    box-shadow: none;
  }
  input::-webkit-search-cancel-button {
    appearance: none;
  }
  .count {
    flex: none;
    padding: 2px 5px;
    border-radius: 4px;
    background: var(--surface-3);
    color: var(--text-secondary);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .count:empty {
    display: none;
  }
  .count.empty {
    color: var(--accent-warning);
    background: var(--color-warning-soft);
  }
  .find-navigation {
    display: flex;
    border-right: 1px solid var(--border-primary);
    margin-right: 2px;
    padding-right: 2px;
  }
  button {
    display: grid;
    place-items: center;
    flex: none;
    width: 32px;
    height: 34px;
    padding: 0;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
  }
  button:hover:not(:disabled) {
    background: var(--surface-3);
    color: var(--text-primary);
  }
  button:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .previous :global(svg) {
    transform: rotate(180deg);
  }
  .find-help {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin: 5px 5px 0;
    color: var(--text-muted);
    font-size: 10px;
    line-height: 16px;
  }
  .shortcuts {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  kbd {
    font: inherit;
    color: var(--text-secondary);
  }
  kbd + kbd {
    margin-left: 4px;
  }
  :global([data-find-current]) {
    outline: 1px solid color-mix(in srgb, var(--accent-primary) 65%, transparent);
    outline-offset: 2px;
  }
  :global(::highlight(loaded-result-find)) {
    background-color: #ffd76a;
    color: #241b06;
    text-shadow: none;
  }
  @media (max-width: 767px) {
    .find-bar {
      right: 6px;
      width: calc(100vw - 12px);
    }
    .find-field {
      gap: 5px;
      padding: 0 6px;
    }
    .find-field > :global(svg) {
      display: none;
    }
    input {
      height: 42px;
      font-size: 16px;
    }
    button {
      width: var(--touch-target);
      height: var(--touch-target);
    }
    .shortcuts {
      display: none;
    }
  }
</style>
