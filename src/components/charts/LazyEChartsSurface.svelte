<script lang="ts">
  import { onMount, type Component } from 'svelte';
  import type { EChartsCoreOption } from 'echarts/core';
  import Banner from '@/components/feedback/Banner.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';

  interface Props {
    option: EChartsCoreOption;
    label: string;
    description?: string;
    height?: number;
    dismissTouchTooltip?: boolean;
    zoomable?: boolean;
    onaxisclick?: (value: number) => void;
    onplotclick?: (x: number, y: number) => void;
    onzoom?: (start: number, end: number) => void;
  }

  let {
    option,
    label,
    description,
    height = 280,
    dismissTouchTooltip = false,
    zoomable = false,
    onaxisclick,
    onplotclick,
    onzoom
  }: Props = $props();

  let host: HTMLDivElement;

  let Surface = $state<Component<Props> | null>(null);
  let loading = $state(false);
  let failed = $state(false);

  async function load(): Promise<void> {
    if (loading || Surface) return;
    loading = true;
    try {
      Surface = (await import('./EChartsSurface.svelte')).default;
    } catch {
      failed = true;
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    if (!('IntersectionObserver' in window)) {
      void load();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void load();
          observer.disconnect();
        }
      },
      { rootMargin: '240px' }
    );

    observer.observe(host);
    return () => observer.disconnect();
  });
</script>

<div
  bind:this={host}
  class="lazy-surface"
  style:--lazy-height={`${height}px`}
>
  {#if Surface}
    <Surface
      {option}
      {label}
      {description}
      {height}
      {dismissTouchTooltip}
      {zoomable}
      {onaxisclick}
      {onplotclick}
      {onzoom}
    />
  {:else if failed}
    <Banner
      title="Chart renderer could not be loaded"
      tone="danger"
    >
      <p>Reload the page to try again.</p>
      <Button
        variant="secondary"
        size="sm"
        onclick={() => location.reload()}
      >
        Reload page
      </Button>
    </Banner>
  {:else}
    <div class="placeholder">
      {#if loading}
        <Spinner
          centered
          label="Loading chart…"
        />
      {:else}
        <span>Chart renderer loads near the viewport.</span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .lazy-surface,
  .placeholder {
    min-height: var(--lazy-height);
  }
  .placeholder {
    display: grid;
    place-items: center;
    background:
      repeating-linear-gradient(0deg, transparent 0 49px, var(--border-subtle) 50px),
      var(--surface-1);
    color: var(--color-text-subtle);
    font-size: 10px;
  }
</style>
