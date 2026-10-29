<script lang="ts">
  import Icon from '../Icon.svelte';

  interface Props {
    src?: string;
    fallbackSrc?: string;
    alt: string;
    kind?: 'character' | 'card';
    rarity?: string;
    size?: 'xs' | 'sm' | 'md' | 'lg';
    shape?: 'square' | 'portrait' | 'circle';
    loading?: 'lazy' | 'eager';
  }

  let {
    src,
    fallbackSrc,
    alt,
    kind = 'character',
    rarity,
    size = 'md',
    shape = 'square',
    loading = 'lazy'
  }: Props = $props();

  let failed = $state(false);
  let useFallback = $state(false);

  const imageSource = $derived(useFallback ? fallbackSrc : src);

  function imageError() {
    if (fallbackSrc && !useFallback) useFallback = true;
    else failed = true;
  }

  $effect(() => {
    src;
    fallbackSrc;
    failed = false;
    useFallback = false;
  });
</script>

<figure class="art art--{kind} art--{size} art--{shape}">
  {#if imageSource && !failed}
    <img
      src={imageSource}
      {alt}
      {loading}
      decoding="async"
      onerror={imageError}
    />
  {:else}
    <span
      role="img"
      aria-label={alt}
    >
      <Icon
        name={kind === 'character' ? 'user' : 'database'}
        size={size === 'lg' ? 32 : 24}
      />
    </span>
  {/if}
  {#if rarity}
    <figcaption>{rarity}</figcaption>
  {/if}
</figure>

<style>
  .art {
    position: relative;
    width: 56px;
    height: 56px;
    flex: 0 0 auto;
    margin: 0;
    overflow: hidden;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--surface-2);
  }
  .art--xs {
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
  }
  .art--sm {
    width: 40px;
    height: 40px;
    border-radius: var(--radius-sm);
  }
  .art--lg {
    width: 84px;
    height: 84px;
  }
  .art--portrait.art--xs {
    width: 28px;
    height: 38px;
  }
  .art--portrait.art--sm {
    width: 36px;
    height: 48px;
  }
  .art--portrait.art--md {
    width: 48px;
    height: 64px;
  }
  .art--portrait.art--lg {
    width: 64px;
    height: 86px;
  }
  .art--circle {
    border-radius: 50%;
  }
  .art--card {
    aspect-ratio: 1;
    height: auto;
  }
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top center;
  }
  .art > span {
    width: 100%;
    height: 100%;
    display: grid;
    place-items: center;
    color: var(--color-text-subtle);
  }
  figcaption {
    position: absolute;
    right: 3px;
    bottom: 3px;
    padding: 1px 4px;
    border-radius: var(--radius-xs);
    background: rgb(0 0 0 / 0.76);
    color: white;
    font-size: 9px;
    font-weight: 800;
  }
</style>
