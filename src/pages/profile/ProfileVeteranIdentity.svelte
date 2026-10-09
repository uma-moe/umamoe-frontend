<script lang="ts">
  import RankBadge from '@/components/RankBadge.svelte';
  import Icon from '@/components/Icon.svelte';
  import type { VeteranUiRecord } from '@/components/veteran-ui-types';

  let { summary, rarity, score, heading = 'h3', titleId, descriptionId }: {
    summary: VeteranUiRecord; rarity?: number | null; score?: number | null;
    heading?: 'h2' | 'h3'; titleId?: string; descriptionId?: string;
  } = $props();
</script>

<div class="veteran-identity">
  <div class="portrait">{#if summary.image}<img src={summary.image} alt="" loading="lazy"/>{:else}<span class="portrait-placeholder"><Icon name="user" size={32}/></span>{/if}</div>
  <div class="identity">
    <svelte:element this={heading} id={titleId}>{summary.name}</svelte:element>
    <div class="identity-details" id={descriptionId}>
      <span class="scenario">{summary.scenario ?? 'Trained veteran'}</span>
      {#if summary.detail}<span class="race-style">{summary.detail}</span>{/if}
      {#if rarity}<span class="rarity" aria-label={`${rarity} rarity stars`}>{'★'.repeat(Math.max(0,Math.min(5,rarity)))}</span>{/if}
    </div>
  </div>
  {#if score != null}<div class="rank"><RankBadge {score}/><strong>{score.toLocaleString()}</strong></div>{/if}
</div>

<style>
  .veteran-identity { display:grid; grid-template-columns:56px minmax(0,1fr) auto; align-items:center; gap:12px; width:100%; min-width:0; text-align:left; color:var(--color-text); }
  .portrait { height:60px; overflow:hidden; }
  .portrait img { width:100%; height:100%; object-fit:contain; object-position:center bottom; }
  .portrait-placeholder { display:grid;place-items:center;width:100%;height:100%;color:var(--text-secondary);background:var(--surface-3);border-radius:var(--radius-md); }
  .identity { min-width:0; display:grid; gap:7px; }
  .identity-details { min-width:0; display:flex; flex-wrap:wrap; align-items:center; gap:4px 8px; }
  .identity :is(h2,h3) { margin:0; font-size:16px; font-weight:650; line-height:1.2; letter-spacing:-.02em; overflow-wrap:anywhere; }
  .scenario { padding:2px 5px; border-radius:4px; background:color-mix(in srgb,var(--accent-secondary) 10%,transparent); color:var(--accent-secondary); font-size:10px; font-weight:600; line-height:1.3; }
  .race-style { color:var(--color-text-muted); font-size:11px; }
  .rarity { color:var(--accent-warning); font-size:9px; letter-spacing:1px; white-space:nowrap; }
  .rank { display:grid; justify-items:center; gap:2px; }.rank strong { font-size:11px; font-weight:600; font-variant-numeric:tabular-nums; }
  @container(max-width:330px) { .veteran-identity { grid-template-columns:44px minmax(0,1fr) auto; gap:8px; }.portrait { height:56px; }.identity :is(h2,h3) { font-size:15px; }.identity-details { column-gap:6px; } }
</style>
