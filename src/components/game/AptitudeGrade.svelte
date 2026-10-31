<script lang="ts">
  import { getRankInfoFromLabel, rankIconPath } from '@/lib/rank';

  export type AptitudeGradeValue = 'S' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';

  interface Props {
    grade: AptitudeGradeValue;
    label?: string;
    size?: 'xs' | 'sm' | 'md';
  }

  let { grade, label, size = 'md' }: Props = $props();

  let failed = $state('');

  const image = $derived(rankIconPath(getRankInfoFromLabel(grade).iconIndex));
</script>

<span
  class="aptitude aptitude--{size}"
  style:--grade-color={`var(--aptitude-${grade.toLowerCase()})`}
  aria-label={label ? `${label}: ${grade}` : `Aptitude ${grade}`}
  title={label ? `${label}: ${grade}` : `Aptitude ${grade}`}
>
  {#if failed !== image}
    <img
      src={image}
      alt=""
      loading="lazy"
      onerror={() => (failed = image)}
    />
  {:else}
    <b>{grade}</b>
  {/if}
</span>

<style>
  .aptitude {
    width: 26px;
    height: 26px;
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 4px;
  }
  img {
    display: block;
    min-width: 0;
    min-height: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  b {
    color: var(--grade-color);
    font-size: 13px;
    font-weight: 800;
    line-height: 1;
    text-align: center;
  }
  .aptitude--sm {
    width: 22px;
    height: 22px;
  }
  .aptitude--sm b {
    font-size: 0.78rem;
  }
  .aptitude--xs {
    width: 16px;
    height: 18px;
    border-radius: 3px;
  }
  .aptitude--xs b {
    font-size: 10px;
  }
</style>
