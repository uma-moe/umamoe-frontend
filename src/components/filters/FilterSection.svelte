<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from '../Icon.svelte';

  interface Props {
    title: string;
    description?: string;
    count?: number;
    open?: boolean;
    hideMobileHeader?: boolean;
    children: Snippet;
  }

  let {
    title,
    description,
    count,
    open = $bindable(true),
    hideMobileHeader = false,
    children
  }: Props = $props();
</script>

<details
  bind:open
  class:hide-mobile-header={hideMobileHeader}
>
  <summary>
    <span class="chevron">
      <Icon
        name="chevron"
        size={14}
      />
    </span>
    <span>
      <strong>{title}</strong>
      {#if description}
        <small>{description}</small>
      {/if}
    </span>
    {#if count !== undefined}
      <b>{count}</b>
    {/if}
  </summary>
  <div class="section-content">{@render children()}</div>
</details>

<style>
  details {
    margin-bottom: 10px;
    overflow: hidden;
    border: 1px solid var(--db-section-border);
    border-radius: var(--radius-md);
    background: var(--db-section-bg);
    transition: border-color var(--duration-normal);
  }
  details[open] {
    overflow: visible;
  }
  details:hover {
    border-color: rgb(var(--accent-primary-rgb) / 0.32);
  }
  summary {
    min-height: 44px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 4px;
    padding: 7px 12px;
    cursor: pointer;
    list-style: none;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  details[open] summary {
    border-bottom: 1px solid var(--db-section-header-border);
  }
  summary > span:nth-child(2) {
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: 7px;
  }
  strong {
    color: var(--color-blue);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }
  small {
    min-width: 0;
    overflow: hidden;
    color: var(--color-text-subtle);
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  summary b {
    color: var(--color-text-subtle);
    font-size: 10px;
  }
  .chevron {
    display: grid;
    color: var(--color-blue);
    transform: rotate(-90deg);
    transition: transform 250ms ease-in-out;
  }
  details[open] .chevron {
    transform: rotate(0);
  }
  .section-content {
    min-width: 0;
    padding: 10px 14px 12px;
  }
  @media (max-width: 600px) {
    details {
      margin-bottom: 4px;
      border: 0;
      border-radius: 0;
      background: transparent;
    }
    summary {
      min-height: var(--touch-target);
      padding-inline: 4px;
    }
    details[open] summary {
      border-bottom-color: var(--border-subtle);
    }
    summary > span:nth-child(2) {
      display: grid;
      gap: 0;
    }
    .section-content {
      padding: 8px 4px 10px;
    }
    .hide-mobile-header summary {
      display: none;
    }
    .hide-mobile-header .section-content {
      padding: 6px 0 0;
    }
  }
</style>
