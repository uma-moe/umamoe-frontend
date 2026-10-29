<script lang="ts">
  import type { TimelinePickup } from './timeline-types';

  let {
    items,
    label = 'Featured pickups',
    loadImages = true,
    overflow,
    wrap = false,
    grow = false
  }: {
    items: readonly TimelinePickup[];
    label?: string;
    loadImages?: boolean;
    overflow?: number;
    wrap?: boolean;
    grow?: boolean;
  } = $props();
</script>

<div
  class="pickups"
  class:wrap
  class:grow
  aria-label={label}
>
  {#each items as pickup}
    {@const description = [pickup.name, pickup.subLabel].filter(Boolean).join(' · ')}
    <a
      href={pickup.gametoraUrl}
      target="_blank"
      rel="noopener noreferrer"
      draggable="false"
      class:character={pickup.kind === 'character'}
      title={description}
      aria-label={pickup.gametoraUrl ? `${description} (GameTora, new tab)` : description}
    >
      <img
        src={loadImages ? pickup.image : undefined}
        alt={pickup.name}
        width={pickup.kind === 'character' ? 44 : 42}
        height={pickup.kind === 'character' ? 52 : 42}
        loading="lazy"
        decoding="async"
        onerror={(event) => event.currentTarget.setAttribute('style', 'display: none')}
      />
    </a>
  {/each}
  {#if overflow}
    <span class="pickup-overflow">+{overflow}</span>
  {/if}
</div>

<style>
  @import './pickup-images.css';
</style>
