<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from '../Icon.svelte';
  import type { IconName } from '../icon-types';

  interface Props {
    icon?: IconName;
    title: string;
    description: string;
    actions?: Snippet;
    compact?: boolean;
  }

  let { icon = 'info', title, description, actions, compact = false }: Props = $props();
</script>

<div
  class="empty"
  class:compact
>
  <span class="icon">
    <Icon
      name={icon}
      size={compact ? 22 : 28}
    />
  </span>
  <div>
    <h3>{title}</h3>
    <p>{description}</p>
  </div>
  {#if actions}
    <div class="actions">{@render actions()}</div>
  {/if}
</div>

<style>
  .empty {
    min-height: 220px;
    display: grid;
    place-items: center;
    align-content: center;
    gap: var(--space-3);
    padding: var(--space-6);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    text-align: center;
  }
  .empty.compact {
    min-height: 128px;
    grid-template-columns: auto minmax(0, 1fr);
    justify-items: start;
    text-align: left;
  }
  .icon {
    width: 50px;
    height: 50px;
    display: grid;
    place-items: center;
    border-radius: var(--radius-md);
    background: var(--color-surface-2);
    color: var(--color-text-muted);
  }
  .compact .icon {
    width: 40px;
    height: 40px;
  }
  h3 {
    margin: 0;
    font-size: var(--font-md);
  }
  p {
    max-width: 50ch;
    margin: var(--space-1) 0 0;
    font-size: var(--font-sm);
  }
  .actions {
    margin-top: var(--space-2);
  }
  .compact .actions {
    grid-column: 2;
    margin-top: 0;
  }
</style>
