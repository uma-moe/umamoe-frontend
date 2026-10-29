<script lang="ts">
  import type { Snippet } from 'svelte';
  import { loadWhenVisible } from '@/lib/load-when-visible';

  let {
    children,
    height = 160,
    eager = false
  }: { children: Snippet; height?: number; eager?: boolean } = $props();

  let visible = $state(false);

  $effect(() => {
    if (eager) visible = true;
  });
</script>

<div
  class:pending={!visible && !eager}
  style:--reserved-height={`${height}px`}
  use:loadWhenVisible={() => (visible = true)}
>
  {#if visible || eager}
    {@render children()}
  {/if}
</div>

<style>
  div {
    display: contents;
  }
  .pending {
    display: block;
    min-width: 0;
    width: 100%;
    min-height: var(--reserved-height);
  }
</style>
