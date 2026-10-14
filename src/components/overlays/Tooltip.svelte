<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    text: string;
    children: Snippet;
    position?: 'top' | 'bottom';
  }

  let { text, children, position = 'top' }: Props = $props();
</script>

<span class="tooltip">
  <span class="target">{@render children()}</span>
  <span
    class="tip tip--{position}"
    role="tooltip"
  >
    {text}
  </span>
</span>

<style>
  .tooltip {
    position: relative;
    display: inline-flex;
  }
  .target {
    display: inline-flex;
  }
  .tip {
    position: absolute;
    left: 50%;
    z-index: var(--z-overlay);
    width: max-content;
    max-width: 240px;
    padding: 6px 9px;
    border-radius: var(--radius-sm);
    background: var(--color-text);
    color: var(--color-canvas);
    font-size: var(--font-xs);
    line-height: 1.35;
    opacity: 0;
    pointer-events: none;
    transform: translate(-50%, 4px);
    transition:
      opacity var(--duration-fast),
      transform var(--duration-fast);
  }
  .tip--top {
    bottom: calc(100% + 8px);
    transform: translate(-50%, 4px);
  }
  .tip--bottom {
    top: calc(100% + 8px);
    transform: translate(-50%, -4px);
  }
  .tooltip:hover .tip,
  .tooltip:focus-within .tip {
    opacity: 1;
    transform: translate(-50%, 0);
  }
  @container app-viewport (max-width: 479px) {
    .tip {
      right: 0;
      left: auto;
      max-width: min(240px, calc(100vw - 32px));
      transform: translateY(4px);
    }
    .tip--top {
      transform: translateY(4px);
    }
    .tip--bottom {
      transform: translateY(-4px);
    }
    .tooltip:hover .tip,
    .tooltip:focus-within .tip {
      transform: translateY(0);
    }
  }
</style>
