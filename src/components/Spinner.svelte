<script lang="ts">
  import LogoMark from './LogoMark.svelte';
  interface Props { label?: string; size?: number; showLabel?: boolean; centered?: boolean; minHeight?: string; }
  let { label = 'Loading…', size = 24, showLabel = false, centered = false, minHeight }: Props = $props();
  const logoSize=$derived(centered?Math.max(size,128):size);
</script>

<span class="spinner" class:centered style:--logo-size={logoSize+'px'} style:min-height={centered?minHeight:undefined} role="status">
  <span class="spinner-content">
    <span class="spin-mark" aria-hidden="true"><LogoMark size={logoSize} label="" animated fluid/></span>
    <span class:sr-only={!showLabel&&!centered} class="caption">{label}</span>
  </span>
</span>

<style>
  .spinner { display:inline-flex; max-width:100%; vertical-align:middle; }
  .spinner-content { display:inline-flex; align-items:center; justify-content:center; gap:12px; min-width:0; }
  .centered { display:block; width:100%; height:100%; min-width:0; min-height:0; flex:1 1 0; align-self:stretch; justify-self:stretch; container-type:size; contain-intrinsic-block-size:180px; text-align:center; }
  .centered .spinner-content {
    --loader-gap:clamp(4px,4cqh,14px);
    --loader-padding:clamp(4px,4cqh,12px);
    --loader-font:clamp(12px,6cqh,15px);
    --loader-mark:min(var(--logo-size),max(0px,calc(100cqw - 2 * var(--loader-padding))),max(0px,calc(100cqh - 2 * var(--loader-padding) - var(--loader-gap) - 1.5 * var(--loader-font))));
    display:flex; flex-direction:column; width:100%; height:100%; gap:var(--loader-gap); padding:var(--loader-padding); box-sizing:border-box;
  }
  .centered .spin-mark { width:var(--loader-mark); height:var(--loader-mark); }
  .centered .caption { min-width:0; max-width:100%; font-size:var(--loader-font); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .spin-mark { display:block; flex:none; width:var(--logo-size); height:var(--logo-size); contain:layout paint; }
  .caption { font-size:13px; line-height:1.5; color:var(--text-secondary); }
  @container (max-height:64px) {
    .centered .spinner-content { flex-direction:row; --loader-mark:min(var(--logo-size),40cqw,max(0px,calc(100cqh - 2 * var(--loader-padding)))); }
  }
</style>
