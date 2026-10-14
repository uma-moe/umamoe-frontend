<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from '@/components/Icon.svelte';

  interface Props {
    title: string;
    id?: string;
    count?: number;
    variant?: 'default' | 'factor' | 'full';
    open?: boolean;
    children: Snippet;
  }

  let {
    title,
    id,
    count,
    variant = 'default',
    open = $bindable(typeof window === 'undefined' ? true : window.innerWidth > 600),
    children
  }: Props = $props();

  let initialized = $state(false);

  $effect(() => {
    if (open) initialized = true;
  });
</script>

<section
  data-filter-group={id}
  class="database-filter-card variant-{variant}"
  class:collapsed={!open}
>
  <button
    class="group-title"
    type="button"
    aria-expanded={open}
    onclick={() => (open = !open)}
  >
    <span class="chevron">
      <Icon
        name="chevron"
        size={16}
      />
    </span>
    <strong>{title}</strong>
    {#if count !== undefined}
      <small>{count}</small>
    {/if}
  </button>
  <div
    class="collapsible-body"
    hidden={!open}
  >
    {#if open || initialized}
      {@render children()}
    {/if}
  </div>
</section>

<style>
  .database-filter-card {
    min-width: 0;
    display: flex;
    flex: 1 1 300px;
    flex-direction: column;
    gap: 8px;
    overflow: visible;
    padding: 12px;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    background: var(--surface-1);
    transition:
      border-color 0.2s ease,
      background-color 0.2s ease;
  }
  .database-filter-card:hover {
    border-color: rgb(var(--accent-primary-rgb) / 0.3);
  }
  .variant-factor {
    flex-basis: 410px;
  }
  .variant-full {
    min-width: 100%;
    flex: 1 1 100%;
  }
  .group-title {
    width: 100%;
    min-width: 0;
    min-height: 32px;
    box-sizing: border-box;
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr) auto;
    align-items: center;
    gap: 4px;
    margin: 0;
    padding: 0 0 8px;
    border: 0;
    border-bottom: 1px solid rgb(var(--accent-primary-rgb) / 0.2);
    border-radius: 0;
    background: transparent;
    color: var(--color-blue);
    cursor: pointer;
    font: inherit;
    text-align: left;
  }
  .group-title strong {
    min-width: 0;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.5px;
    line-height: 1.2;
    text-transform: uppercase;
  }
  .group-title small {
    color: var(--text-muted);
    font-size: 10px;
  }
  .chevron {
    width: 18px;
    height: 18px;
    display: grid;
    place-items: center;
    transform: rotate(0);
    transition: transform 250ms ease-in-out;
  }
  .collapsible-body {
    min-width: 0;
  }
  .collapsed {
    gap: 0;
    overflow: hidden;
  }
  .collapsed .group-title {
    padding-bottom: 0;
    border-bottom-color: transparent;
  }
  .collapsed .chevron {
    transform: rotate(-90deg);
  }
  @media (max-width: 600px) {
    .database-filter-card {
      width: 100%;
      max-width: 100%;
      flex: 0 1 auto;
      padding: 10px;
    }
    .group-title {
      min-height: var(--touch-target);
      padding-bottom: 8px;
    }
  }
</style>
