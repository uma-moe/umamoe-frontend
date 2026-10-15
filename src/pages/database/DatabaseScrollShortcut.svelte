<script lang="ts">
  import Icon from '@/components/Icon.svelte';

  interface Props {
    container?: HTMLElement;
    results?: HTMLElement;
    filterExpanded: boolean;
    loading: boolean;
    error: string;
    count: number;
  }

  let { container, results, filterExpanded, loading, error, count }: Props = $props();

  let scrollShortcut = $state<'' | 'results' | 'top'>('');

  function useScrollShortcut(): void {
    (scrollShortcut === 'results' ? results : container)?.scrollIntoView({
      block: 'start',
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'
    });
  }

  $effect(() => {
    const node = container;
    if (!node) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      if (!results) return;
      scrollShortcut =
        filterExpanded && results.getBoundingClientRect().top > window.innerHeight
          ? 'results'
          : node.getBoundingClientRect().top < -200
            ? 'top'
            : '';
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(node);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  });
</script>

{#if scrollShortcut}
  <button
    type="button"
    class="floating-scroll-btn"
    class:results-mode={scrollShortcut === 'results'}
    onclick={useScrollShortcut}
  >
    <span
      class="scroll-arrow"
      class:up={scrollShortcut === 'top'}
    >
      <Icon
        name="arrow-right"
        size={18}
      />
    </span>
    <span aria-live="polite">
      {#if scrollShortcut === 'top'}
        Back to Top
      {:else if loading}
        Searching…
      {:else if error}
        Results unavailable
      {:else}
        Results ({count.toLocaleString()})
      {/if}
    </span>
  </button>
{/if}

<style>
  .floating-scroll-btn {
    position: fixed;
    right: max(16px, env(safe-area-inset-right));
    bottom: calc(16px + env(safe-area-inset-bottom) + var(--footer-ad-height, 0px));
    z-index: var(--z-rail);
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 44px;
    padding: 8px 16px;
    border: 1px solid var(--border-secondary);
    border-radius: 24px;
    background: var(--surface-2);
    color: var(--text-primary);
    box-shadow: var(--shadow-lg);
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
  }
  .floating-scroll-btn.results-mode {
    border-color: var(--accent-primary);
    color: var(--accent-primary);
  }
  .floating-scroll-btn:hover {
    background: var(--surface-3);
  }
  .scroll-arrow {
    transform: rotate(90deg);
  }
  .scroll-arrow.up {
    transform: rotate(-90deg);
  }
</style>
