<script lang="ts">
  import Artwork from '@/components/game/Artwork.svelte';
  import { portrait } from '@/pages/competitive/analysis-view';

  /** A runner's portrait at text size, for tables, legends and pickers. */
  let { cardId, size = 22 }: { cardId?: number; size?: number } = $props();
</script>

<span
  class="face"
  style:--face-size={size + 'px'}
  aria-hidden="true"
>
  <Artwork
    src={portrait(cardId)}
    alt=""
    size="xs"
    loading="lazy"
  />
</span>

<style>
  .face {
    display: inline-flex;
    flex: none;
    width: var(--face-size);
    height: var(--face-size);
    vertical-align: middle;
  }
  .face :global(.art) {
    width: 100%;
    height: 100%;
    border: 0;
    border-radius: 0;
    background: transparent;
  }
  .face :global(img) {
    width: 100%;
    height: 100%;
    object-fit: contain;
    object-position: center bottom;
  }
  .face :global(.art > span) {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    color: var(--text-secondary);
  }
  .face :global(.art > span svg) {
    width: 70%;
    height: 70%;
  }
</style>
