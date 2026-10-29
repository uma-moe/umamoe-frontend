<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from '../Icon.svelte';
  import type { IconName } from '../icon-types';

  let {
    id,
    title,
    description,
    icon,
    compact = false,
    open = $bindable(false),
    heading,
    children
  }: {
    id: string;
    title: string;
    description?: string;
    icon?: IconName;
    compact?: boolean;
    open?: boolean;
    heading?: Snippet;
    children: Snippet;
  } = $props();
</script>

<details
  bind:open
  class:compact
>
  <!-- svelte-ignore a11y_no_redundant_roles (Explicit role keeps disclosure controls consistent across browser accessibility trees.) -->
  <summary
    role="button"
    aria-label={title}
    aria-expanded={open}
    aria-controls={id}
  >
    {#if heading}
      {@render heading()}
    {:else}
      {#if icon}
        <Icon
          name={icon}
          size={18}
        />
      {/if}
      <strong>{title}</strong>
      {#if description}
        <span class="description">{description}</span>
      {/if}
    {/if}
    <span class="chevron">
      <Icon
        name="chevron"
        size={18}
      />
    </span>
  </summary>
  <div
    {id}
    class="disclosure-content"
  >
    {@render children()}
  </div>
</details>

<style>
  details,
  .disclosure-content {
    min-width: 0;
  }
  summary {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: 48px;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--card-surface-border);
    border-radius: var(--radius-md);
    background: var(--card-surface-bg);
    cursor: pointer;
    list-style: none;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  summary:hover {
    border-color: var(--border-secondary);
  }
  summary > :global(svg) {
    flex: none;
    color: var(--color-accent);
  }
  strong {
    font-size: var(--font-sm);
  }
  .description {
    color: var(--color-text-muted);
    font-size: var(--font-xs);
  }
  .chevron {
    display: grid;
    margin-left: auto;
    color: var(--color-text-muted);
  }
  details[open] > summary > .chevron {
    transform: rotate(180deg);
  }
  details[open] > .disclosure-content {
    margin-top: var(--space-3);
  }
  .compact summary {
    min-height: var(--disclosure-compact-summary-height, 36px);
    padding: var(--disclosure-compact-summary-padding, 4px 0);
    border: 0;
    border-radius: 0;
    background: transparent;
  }
  .compact strong {
    font-size: 13px;
  }
  .compact .description {
    font-size: 10px;
  }
  .compact[open] > .disclosure-content {
    margin-top: var(--disclosure-compact-content-gap, 8px);
  }
  @media (max-width: 480px) {
    summary {
      flex-wrap: wrap;
    }
    .description {
      order: 1;
      flex-basis: 100%;
      padding-left: 26px;
    }
  }
  @media (max-width: 480px) {
    .compact summary {
      flex-wrap: nowrap;
    }
    .compact .description {
      order: 0;
      flex-basis: auto;
      padding-left: 0;
    }
  }
</style>
