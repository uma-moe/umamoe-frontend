<script lang="ts">
  import Icon from '@/components/Icon.svelte';
  import type { TimelineMarker } from '@/lib/timeline/timeline-layout';

  interface Props {
    marker: TimelineMarker;
    imagesReady: boolean;
    mobile?: boolean;
  }

  let { marker, imagesReady, mobile = false }: Props = $props();
</script>

<div
  class="lane-marker"
  class:is-anniversary={marker.type === 'anniversary'}
  data-marker-type={marker.type}
>
  {#if marker.image}
    <img
      class="marker-banner"
      src={imagesReady ? marker.image : undefined}
      alt={marker.label}
      width="512"
      height="125"
      loading="lazy"
      decoding="async"
    />
  {/if}
  <div class="marker-label">
    <Icon
      name={marker.type === 'anniversary'
        ? 'gift'
        : marker.type === 'launch'
          ? 'diamond'
          : 'calendar'}
      size={mobile ? 18 : 13}
    />
    <span>{marker.label}</span>
  </div>
</div>

<style>
  .lane-marker {
    margin: 3px 0 8px;
    overflow: hidden;
    border: 1px solid var(--border-subtle);
    border-radius: 4px;
    background: var(--surface-1);
    order: 1;
  }
  .lane-marker.is-anniversary {
    margin-top: 7px;
    order: 4;
  }
  .marker-banner {
    display: block;
    width: 100%;
    height: auto;
    aspect-ratio: 512/125;
    object-fit: contain;
    background: var(--bg-primary);
    border-bottom: 1px solid var(--border-subtle);
  }
  .marker-label {
    display: flex;
    min-height: 28px;
    padding: 4px 7px;
    align-items: center;
    gap: 5px;
    color: var(--text-secondary);
    font-size: 10px;
    font-weight: 650;
  }
  .marker-label :global(svg) {
    color: var(--accent-primary);
  }
  :global(.vertical-events) .lane-marker {
    margin: 0;
    order: initial;
  }
  :global(.vertical-events) .marker-label {
    min-height: 44px;
    font-size: 13px;
    padding: 8px 12px;
  }
  :global(.mobile-feed) .lane-marker {
    margin: 0;
    min-height: 52px;
    border-color: var(--border-primary);
    border-radius: 5px;
  }
  :global(.mobile-feed) .marker-label {
    min-height: 50px;
    padding: 8px 10px;
    gap: 8px;
    font-size: 12px;
  }
</style>
