<script
  lang="ts"
  generics="Type extends string"
>
  import { pickTypes } from './skill-explorer-view';

  /**
   * One kind of skill filter as a row of chips: all on shows everything; picking one then shows only it, and more
   * picks add to it.
   */
  interface Props {
    label: string;
    all: readonly Type[];
    names: Record<Type, string>;
    selected: ReadonlySet<Type>;
  }

  let { label, all, names, selected = $bindable() }: Props = $props();

  const narrowed = $derived(selected.size < all.length);
</script>

<div
  class="chips"
  role="group"
  aria-label={label}
>
  <span class="chips-label">{label}</span>
  {#each all as type (type)}
    <button
      type="button"
      class="chip"
      class:on={selected.has(type)}
      aria-pressed={narrowed && selected.has(type)}
      onclick={() => (selected = pickTypes(selected, type, all))}
    >
      {names[type]}
    </button>
  {/each}
  {#if narrowed}
    <button
      type="button"
      class="chip reset"
      onclick={() => (selected = new Set(all))}
    >
      All
    </button>
  {/if}
</div>

<style>
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    align-items: center;
  }

  .chips-label {
    margin-right: 0.25rem;
    color: var(--text-muted);
    font-size: 0.78rem;
  }

  .chip {
    min-height: 30px;
    padding: 0.2rem 0.7rem;
    border: 1px solid var(--border-primary);
    border-radius: 999px;
    background: transparent;
    color: var(--text-muted);
    font-size: 0.8rem;
    cursor: pointer;
    transition:
      background 140ms ease,
      border-color 140ms ease,
      color 140ms ease;
  }

  .chip.on {
    border-color: rgb(var(--accent-primary-rgb) / 0.55);
    background: rgb(var(--accent-primary-rgb) / 0.14);
    color: var(--text-primary);
  }

  .chip:hover {
    border-color: rgb(var(--accent-primary-rgb) / 0.8);
  }

  .chip:focus-visible {
    outline: 2px solid var(--accent-primary);
    outline-offset: 2px;
  }

  .chip.reset {
    border-style: dashed;
    color: var(--text-secondary);
  }
</style>
