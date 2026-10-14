<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    children: Snippet;
    tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
  }

  let { children, tone = 'neutral' }: Props = $props();
</script>

<span class="badge badge--{tone}">{@render children()}</span>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    min-height: 24px;
    padding: 2px 9px;
    border-radius: var(--radius-pill);
    background: var(--color-surface-2);
    color: var(--color-text-muted);
    font-size: var(--font-xs);
    font-weight: 750;
    line-height: 1;
  }
  .badge--accent {
    background: var(--color-accent-soft);
    color: var(--color-accent);
  }
  .badge--success {
    background: var(--color-secondary-soft);
    color: var(--color-secondary);
  }
  .badge--warning {
    background: var(--color-warning-soft);
    color: var(--color-warning);
  }
  .badge--danger {
    background: var(--color-danger-soft);
    color: var(--color-danger);
  }
</style>
