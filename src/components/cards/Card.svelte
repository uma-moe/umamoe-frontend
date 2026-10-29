<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    children: Snippet;
    interactive?: boolean;
    padding?: 'sm' | 'md' | 'lg';
  }

  let { children, interactive = false, padding = 'md' }: Props = $props();
</script>

<div
  class="card card--{padding}"
  class:card--interactive={interactive}
>
  {@render children()}
</div>

<style>
  .card {
    border: 1px solid var(--card-surface-border);
    border-radius: var(--radius-lg);
    background: var(--card-surface-bg);
    box-shadow: var(--card-surface-shadow);
    container-type: inline-size;
  }
  .card--sm {
    padding: var(--space-3);
  }
  .card--md {
    padding: var(--space-4);
  }
  .card--lg {
    padding: var(--space-6);
  }
  .card--interactive {
    transition:
      transform var(--duration-fast),
      border-color var(--duration-fast);
  }
  .card--interactive:hover {
    border-color: var(--color-border-strong);
    transform: translateY(-1px);
  }
</style>
