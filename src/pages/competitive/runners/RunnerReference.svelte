<script lang="ts">
  import Artwork from '@/components/game/Artwork.svelte';
  import { portrait } from '../analysis-view';

  let {
    name,
    cardId,
    detail,
    compact = false
  }: { name: string; cardId?: number; detail?: string; compact?: boolean } = $props();
</script>

<span
  class="runner-reference"
  class:compact
>
  <Artwork
    src={portrait(cardId)}
    alt=""
    size="sm"
  />
  <span class="runner-name">
    <strong>{name}</strong>
    {#if detail}
      <small>{detail}</small>
    {/if}
  </span>
</span>

<style>
  .runner-reference {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    text-align: left;
    vertical-align: middle;
  }
  .runner-reference :global(.art) {
    width: 36px;
    height: 44px;
    border: 0;
    background: transparent;
    border-radius: 0;
  }
  .runner-reference :global(img) {
    object-fit: contain;
    object-position: center bottom;
  }
  .runner-name {
    min-width: 0;
    display: grid;
    gap: 2px;
  }
  .runner-name strong {
    font-size: 12px;
    font-weight: 600;
    line-height: 1.3;
  }
  small {
    font-size: 10px;
    font-weight: 400;
    color: var(--text-secondary);
    line-height: 1.3;
  }
  .compact :global(.art) {
    width: 28px;
    height: 34px;
  }
  .compact {
    gap: 6px;
  }
</style>
