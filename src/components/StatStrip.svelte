<script lang="ts">
  export type StatTone = 'speed' | 'stamina' | 'power' | 'guts' | 'wit' | 'neutral';
  export interface StatStripItem { id: string; label: string; value: string | number; tone?: StatTone; unit?: string; icon?: string; }
  interface Props { items: StatStripItem[]; label?: string; compact?: boolean; framed?: boolean; presentation?: 'labels' | 'icons' | 'inline' | 'values'; }
  let { items, label = 'Stats', compact = false, framed = false, presentation = 'labels' }: Props = $props();
</script>

<div class="stats-container">
<dl class="stats" class:compact class:framed class:icon-stats={presentation === 'icons'} class:inline-stats={presentation === 'inline'} class:values={presentation === 'values'} aria-label={label} style={`--stat-count:${Math.max(1, items.length)}`}>
  {#each items as item (item.id)}<div data-stat={item.id} data-tone={item.tone ?? 'neutral'} title={item.label+': '+item.value+(item.unit??'')}>{#if item.icon}<img src={item.icon} alt="" decoding="async"/>{/if}<dd>{item.value}{#if item.unit}<small>{item.unit}</small>{/if}</dd><dt class:visually-hidden={(presentation === 'icons' || presentation === 'values') && Boolean(item.icon)}>{item.label}</dt></div>{/each}
</dl>
</div>

<style>
  .stats-container { min-width: 0; container-type: inline-size; }
  .stats { display: grid; grid-template-columns: repeat(var(--stat-count, 5), minmax(0, 1fr)); gap: 0; margin: 0; overflow: hidden; border: 1px solid var(--border-subtle); border-radius: var(--radius-md); background: var(--card-surface-bg); }
  .stats > div { --stat-color: var(--color-text-muted); min-width: 0; min-height: 54px; display: grid; grid-template-columns: auto auto; grid-template-rows: auto auto; align-content: center; justify-content: center; gap: 1px 5px; padding: 6px 4px; text-align: center; }
  .stats > div + div { border-left: 1px solid var(--border-subtle); }
  .stats > div[data-tone='speed'] { --stat-color: var(--stat-speed); } .stats > div[data-tone='stamina'] { --stat-color: var(--stat-stamina); } .stats > div[data-tone='power'] { --stat-color: var(--stat-power); } .stats > div[data-tone='guts'] { --stat-color: var(--stat-guts); } .stats > div[data-tone='wit'] { --stat-color: var(--stat-wit); }
  img { width: 18px; height: 18px; grid-row: 1 / 3; align-self: center; object-fit: contain; }
  dt { grid-column: 2; overflow: hidden; color: var(--color-text-subtle); font-size: 8px; font-weight: 650; line-height: 1; letter-spacing: .04em; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
  dd { grid-column: 2; margin: 0; color: var(--stat-color); font-size: 15px; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1; }
  dd small { margin-left: 2px; font-family: var(--font-sans); font-size: 8px; font-weight: 600; }
  .compact > div { min-height: 44px; padding-block: 4px; }
  .compact img { width: 15px; height: 15px; }
  .compact dd { font-size: 13px; }
  .visually-hidden { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); white-space:nowrap; }
  @container (max-width: 430px) {
    .stats > div { min-height: 45px; display: flex; flex-direction: column; gap: 2px; padding: 4px 1px; }
    .stats > div + div { border-left: 1px solid var(--border-subtle); }
    img { width: 14px; height: 14px; }
    dd { font-size: 12px; }
    dt { font-size: 7px; }
  }
  .icon-stats { border: 1px solid var(--shared-card-soft-border); background: var(--shared-card-soft-bg); }
  .icon-stats > div { min-height: 0; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; gap: 3px; padding: .5rem .25rem; }
  .icon-stats > div + div { border-color: var(--shared-card-soft-border); }
  .icon-stats > div[data-stat='total'] { background: rgb(var(--accent-warning-rgb) / .08); }
  .icon-stats dd { color: var(--text-primary); font-size: .85rem; font-weight: 600; line-height: 1.5; font-variant-numeric: normal; }
  .icon-stats dt { order: -1; color: var(--text-secondary); font-size: .6rem; font-weight: 400; line-height: 1.5; letter-spacing: .03em; }
  .icon-stats img { width: 20px; height: 20px; }
  @media(max-width:480px) { .icon-stats > div { padding: .35rem .15rem; }.icon-stats img { width: 16px; height: 16px; }.icon-stats dd { font-size: .75rem; }.icon-stats dt { font-size: .5rem; } }
  .inline-stats { border:0; border-radius:0; background:transparent; }
  .inline-stats>div { min-height:0; display:grid; grid-template-columns:auto auto; grid-template-rows:auto auto; justify-content:center; align-items:center; gap:4px; padding:3px 0; }
  .inline-stats img { grid-column:1; grid-row:1; width:13px; height:13px; }
  .inline-stats dd { grid-column:2; grid-row:1; color:var(--text-primary); font-size:14px; font-weight:650; line-height:1.3; }
  .inline-stats dt { grid-column:1/-1; grid-row:2; color:var(--text-secondary); font-size:10px; font-weight:400; text-transform:none; letter-spacing:0; line-height:1.3; }
  .inline-stats.framed { border:1px solid var(--card-surface-border); border-radius:var(--radius-md); background:var(--card-surface-bg); }
  .inline-stats.framed>div { min-height:54px; padding:8px 2px; }
  @container(max-width:330px) { .inline-stats dd { font-size:12px; }.inline-stats img { width:12px; height:12px; }.inline-stats dt { font-size:9px; } }
  .values { border:0; border-radius:0; background:transparent; gap:6px; }
  .values>div { display:flex; flex-direction:row; align-items:center; justify-content:flex-start; min-height:0; padding:0; gap:4px; border:0; }
  .values>div+div { border:0; }
  .values img { width:12px; height:12px; }
  .values dd { font-size:11px; font-weight:600; color:var(--text-primary); line-height:1.4; }
  .values.compact { gap:8px; }
  .values.compact>div { display:flex; align-items:center; justify-content:flex-end; gap:3px; }
  .values.compact img { grid-column:1; grid-row:1; }
  .values.compact dd { grid-column:2; grid-row:1; font-size:11px; line-height:1.4; text-align:right; font-variant-numeric:tabular-nums; }
  @container(max-width:215px) { .values.compact { gap:6px; }.values.compact dd { font-size:10px; } }
</style>
