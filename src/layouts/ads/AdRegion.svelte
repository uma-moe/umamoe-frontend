<script lang="ts">
  import type { Snippet } from 'svelte';
  import { fuseIdForPlacement } from '@/services/ads/ad-slots';
  import { registerFuseZone } from '@/services/ads/fuse-ads';

  export type AdRegionKind = 'leaderboard' | 'inline' | 'rail';

  interface Props {
    placement: string;
    kind: AdRegionKind;
    sizes: string[];
    active?: boolean;
    preview?: boolean;
    railAlternative?: boolean;
    children?: Snippet;
  }

  let {
    placement,
    kind,
    sizes,
    active = false,
    preview = false,
    railAlternative = false,
    children
  }: Props = $props();

  const elementId = $derived(`ad-${placement.replaceAll(/[^a-zA-Z0-9_-]/g, '-')}`);
  const fuseId = $derived(fuseIdForPlacement(placement));

  let region: HTMLElement | undefined = $state();

  $effect(() => {
    if (!active || preview || !fuseId || !region) return;
    const element = region;
    let unregister: (() => void) | undefined;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      if (entry.contentRect.width > 0) unregister ??= registerFuseZone(elementId, fuseId);
      else {
        unregister?.();
        unregister = undefined;
      }
    });

    observer.observe(element);
    return () => {
      observer.disconnect();
      unregister?.();
    };
  });
</script>

{#if active && (fuseId || preview)}
  <aside
    bind:this={region}
    id={`${elementId}-region`}
    class="ad-region ad-region--{kind}"
    class:preview
    class:rail-alternative={railAlternative}
    aria-label="Sponsored content"
    data-ad-kind={kind}
    data-ad-placement={placement}
    data-ad-sizes={sizes.join(',')}
    data-ad-behavior={railAlternative ? 'rail-alternative' : 'persistent'}
  >
    <div
      class="ad-target"
      id={elementId}
      data-ad-target={placement}
    >
      {#if children}
        {@render children()}
      {:else if preview}
        <span>
          <strong>Sponsored</strong>
          <small>{placement}, {sizes.join(' / ')}</small>
        </span>
      {/if}
    </div>
  </aside>
{/if}

<style>
  .ad-region {
    min-width: 0;
    display: grid;
    place-items: center;
    margin-inline: auto;
    overflow: hidden;
    contain: layout;
  }
  .ad-target {
    width: 100%;
    height: 100%;
    display: grid;
    place-items: center;
  }
  .ad-region--leaderboard,
  .ad-region--inline {
    width: calc(100% + var(--page-gutter-current, 16px) + var(--page-gutter-current, 16px) - 4px);
    max-width: 1200px;
    min-height: var(--ad-mobile-height);
    margin-inline: calc(0px - var(--page-gutter-current, 16px) + 2px);
  }
  .ad-region--inline {
    width: 100%;
    max-width: 100%;
    min-height: var(--ad-inline-mobile-height);
    margin: 12px auto;
    grid-column: 1/-1;
  }
  .ad-region--leaderboard {
    width: 100%;
    max-width: 100%;
    height: var(--ad-mobile-height);
    max-height: var(--ad-mobile-height);
    margin: 12px auto;
    contain: strict;
  }
  .ad-region--leaderboard .ad-target {
    min-height: 0;
    max-height: 100%;
    overflow: hidden;
  }
  .ad-region--rail {
    width: var(--ad-rail-width);
    height: var(--ad-rail-height);
  }
  /* Fuse filters creative sizes using the registered target's computed max dimensions. */
  .ad-region--rail .ad-target {
    max-width: var(--ad-rail-width);
    max-height: var(--ad-rail-height);
  }
  .preview {
    border: 1px dashed var(--color-border-strong);
    background: var(--color-surface-1);
    color: var(--color-text-subtle);
  }
  .preview span {
    display: grid;
    place-items: center;
    gap: 2px;
    padding: var(--space-2);
    text-align: center;
  }
  .preview strong {
    color: var(--color-text-muted);
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .preview small {
    max-width: 100%;
    overflow: hidden;
    font-size: 8px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @container app-viewport (min-width: 768px) {
    .ad-region--leaderboard,
    .ad-region--inline {
      width: 100%;
      min-height: var(--ad-leaderboard-height);
      margin-inline: auto;
    }
    .ad-region--leaderboard {
      height: var(--ad-leaderboard-height);
      max-height: var(--ad-leaderboard-height);
    }
  }

  @media (min-width: 1700px) {
    .rail-alternative {
      display: none;
    }
  }
</style>
