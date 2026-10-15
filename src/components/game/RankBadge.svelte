<script lang="ts">
  import { getRankInfo, getRankInfoFromLabel, getRankInfoFromScore } from '@/lib/rank';

  interface Props {
    label?: string;
    rarity?: number;
    score?: number;
    size?: 'sm' | 'md' | 'lg';
    icon?: string;
    useIconAsset?: boolean;
  }

  let { label, rarity, score, size = 'md', icon, useIconAsset = true }: Props = $props();

  let failed = $state(false);

  const rank = $derived.by(() => {
    if (label) return getRankInfoFromLabel(label);
    if (score !== undefined) return getRankInfoFromScore(score);
    return getRankInfo(rarity ?? 1);
  });

  const iconPath = $derived(
    icon ?? `/assets/images/icon/ranks/utx_txt_rank_${String(rank.iconIndex).padStart(2, '0')}.webp`
  );
</script>

<span
  class="rank rank--{size}"
  aria-label={`Rank ${rank.label}`}
  title={`${rank.label} rank`}
>
  {#if useIconAsset && !failed}
    <img
      src={iconPath}
      alt=""
      decoding="async"
      onerror={() => (failed = true)}
    />
  {:else}
    <span
      class="rank-fallback"
      class:ultra={rank.isUltra}
      style:--rank-color={rank.colorToken}
    >
      {#if rank.isUltra}
        <b>U</b>
        <span>{rank.label.slice(1)}</span>
      {:else}
        <span>{rank.label}</span>
      {/if}
    </span>
  {/if}
</span>

<style>
  .rank {
    width: 38px;
    height: 38px;
    display: inline-grid;
    flex: 0 0 auto;
    place-items: center;
    line-height: 1;
  }
  .rank img {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: contain;
  }
  .rank--sm {
    width: 28px;
    height: 28px;
  }
  .rank--lg {
    width: 46px;
    height: 46px;
  }
  .rank-fallback {
    position: relative;
    width: 100%;
    height: 100%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border: 2px solid var(--rank-color);
    border-radius: 50%;
    background: rgb(0 0 0 / 0.3);
    color: var(--rank-color);
    font-size: 10px;
    font-weight: 850;
    letter-spacing: -0.02em;
  }
  .rank--sm .rank-fallback {
    font-size: 8px;
  }
  .rank--lg .rank-fallback {
    font-size: 12px;
  }
  .rank-fallback.ultra {
    border-color: var(--rank-ultra);
  }
  .rank-fallback b {
    color: var(--rank-ultra);
    font: inherit;
  }
</style>
