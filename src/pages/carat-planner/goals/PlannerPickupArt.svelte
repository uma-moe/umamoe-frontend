<script lang="ts">
  import type { PlannerGoalOption } from './planner-goal-view';
  import Icon from '@/components/Icon.svelte';

  interface Props {
    option: PlannerGoalOption;
    size: number;
    fallbackImage?: string;
  }

  let { option, size, fallbackImage }: Props = $props();

  function imageError(event: Event): void {
    const image = event.currentTarget as HTMLImageElement;
    if (!image.dataset.fallback && fallbackImage && image.getAttribute('src') !== fallbackImage) {
      image.dataset.fallback = 'true';
      image.src = fallbackImage;
    } else image.hidden = true;
  }
</script>

<span
  class="pickup-art"
  class:support={option.kind === 'support'}
  style:width={`${size}px`}
  style:height={`${size}px`}
>
  {#if option.image}
    <img
      src={option.image}
      width={size}
      height={size}
      alt=""
      loading="lazy"
      onerror={imageError}
    />
  {/if}
  <Icon
    name={option.kind === 'support' ? 'grid' : 'user'}
    size={Math.min(size, 22)}
  />
</span>

<style>
  .pickup-art {
    flex: none;
    display: grid;
    place-items: center;
    overflow: hidden;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
  }
  .pickup-art img,
  .pickup-art :global(svg) {
    grid-area: 1/1;
  }
  .pickup-art img {
    object-fit: contain;
    z-index: 1;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }
  .pickup-art img:not([hidden]) ~ :global(svg) {
    display: none;
  }
</style>
