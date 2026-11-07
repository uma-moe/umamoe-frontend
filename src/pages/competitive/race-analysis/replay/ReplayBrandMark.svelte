<script lang="ts">
  import LogoMark from '@/components/LogoMark.svelte';

  let {
    bottom = 8,
    left = 12,
    width = $bindable(0),
    height = $bindable(0)
  }: {
    /** Distance from the bottom of the view, in pixels. */
    bottom?: number;
    /** Distance from the left of the view, in pixels. */
    left?: number;
    /** The rendered size, for layers that keep clear of the mark. */
    width?: number;
    height?: number;
  } = $props();
</script>

<div
  class="brand-mark"
  style:left={left + 'px'}
  style:bottom={bottom + 'px'}
  bind:clientWidth={width}
  bind:clientHeight={height}
  aria-hidden="true"
>
  <span class="mark">
    <LogoMark
      fluid
      label=""
    />
  </span>
  <strong>uma.moe</strong>
</div>

<style>
  .brand-mark {
    position: absolute;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 7px;
    filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.95)) drop-shadow(0 0 3px rgb(0 0 0 / 0.85))
      drop-shadow(0 2px 10px rgb(0 0 0 / 0.7));
    pointer-events: none;
  }
  .mark {
    display: block;
    width: 26px;
    height: 26px;
  }
  strong {
    color: #f2f5f3;
    font-size: 18px;
    font-weight: 700;
    line-height: 1;
  }
  @media (max-width: 640px) {
    .brand-mark {
      gap: 5px;
    }
    .mark {
      width: 20px;
      height: 20px;
    }
    strong {
      font-size: 14px;
    }
  }
</style>
