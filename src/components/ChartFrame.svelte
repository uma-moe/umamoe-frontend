<script lang="ts">
  import { tick, type Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  import Dialog from './Dialog.svelte';
  import Button from './Button.svelte';
  export interface ChartLegendItem { label: string; color: string; }
  interface Props { id: string; title: string; description?: string; legend?: ChartLegendItem[]; state?: 'ready' | 'loading' | 'empty' | 'error'; emptyTitle?: string; emptyDetail?: string; children?: Snippet; titleActions?: Snippet; actions?: Snippet; onexport?: () => void; expandable?: boolean; expanded?: boolean; plain?: boolean; surface?: boolean; }
  let { id, title, description, legend = [], state = 'ready', emptyTitle = 'No data to chart', emptyDetail = 'Adjust the filters or choose another comparison.', children, titleActions, actions, onexport, expandable = false, expanded = $bindable(false), plain = false, surface = false }: Props = $props();
  async function restoreExpandFocus() {
    await tick();
    if (document.activeElement !== document.body) return;
    // The inline chart remounts after expansion, so its original trigger no longer exists.
    const buttons = document.getElementById(id + '-title')?.closest('figure')?.querySelectorAll('button');
    Array.from(buttons ?? []).find(button => button.getAttribute('aria-label') === 'Expand ' + title)?.focus({ preventScroll: true });
  }
</script>

{#snippet chart()}
<figure class="chart-frame" class:expanded class:plain class:surface aria-labelledby={`${id}-title`}>
  <figcaption><div class="chart-heading"><div class="title-row"><h3 id={`${id}-title`} class:visually-hidden={expanded}>{title}</h3>{@render titleActions?.()}</div>{#if description}<p>{description}</p>{/if}</div><div class="chart-tools">
    {#if legend.length}<ul class="legend" aria-label="Chart legend">{#each legend as item}<li><span style={`--series:${item.color}`}></span>{item.label}</li>{/each}</ul>{/if}
    {#if actions}<div class="chart-actions">{@render actions()}</div>{/if}{#if onexport}<button type="button" onclick={onexport}><Icon name="download" size={15}/>Export</button>{/if}
    {#if expandable && !expanded}<Button variant="ghost" size="sm" ariaLabel={'Expand '+title} onclick={() => expanded = true}>Expand</Button>{/if}
  </div></figcaption>
  <div class="plot" aria-busy={state === 'loading'}>
    {#if state === 'ready' && children}{@render children()}
    {:else if state === 'loading'}<div class="state"><span class="loader"></span><strong>Loading chart data…</strong></div>
    {:else}<div class="state"><Icon name={state === 'error' ? 'warning' : 'chart'} size={28}/><strong>{state === 'error' ? 'Chart unavailable' : emptyTitle}</strong><span>{state === 'error' ? 'The data could not be prepared. Try again.' : emptyDetail}</span></div>{/if}
  </div>
</figure>
{/snippet}

{#if expanded}
  <div class="expanded-placeholder" class:plain><Button variant="ghost" onclick={() => expanded = false}>Return to {title}</Button></div>
{:else}{@render chart()}{/if}
{#if expandable}<Dialog bind:open={expanded} {title} maxWidth="1240px" maxHeight="94dvh" contentPadding="0" mobileContentPadding="0" onclose={restoreExpandFocus}>{#if expanded}{@render chart()}{/if}</Dialog>{/if}

<style>
  .chart-frame { min-width: 0; margin: 0; display: grid; grid-template-rows:auto minmax(0,1fr); gap: 8px; padding: 10px; border: 1px solid var(--card-surface-border); border-radius: var(--radius-lg); background: var(--card-surface-bg); container: chart-frame / inline-size; }
  .expanded-placeholder { display:grid; place-items:center; min-height:240px; border:1px dashed var(--border-primary); border-radius:var(--radius-lg); }
  .chart-frame.expanded { border:0; padding:16px; }
  .plain { border:0; border-radius:0; background:transparent; padding:0; gap:18px; }
  .plain figcaption { gap:16px; flex-wrap:wrap; }
  .plain .title-row { gap:12px; }
  .plain h3 { font-size:17px; font-weight:650; letter-spacing:-.02em; }
  .plain p { font-size:12px; line-height:1.6; margin-top:7px; max-width:68ch; }
  .plain .legend { justify-content:flex-start; }
  .plain .legend li { font-size:11px; }
  .plain .plot { min-height:0; }
  .plain .state { border:0; border-radius:0; }
  .surface { border:0; border-radius:var(--radius-lg); background:var(--surface-1); padding:20px; }
  .surface figcaption { padding-bottom:12px; border-bottom:1px solid var(--border-subtle); }
  @media(max-width:600px) { .surface { padding:14px; } }
  .visually-hidden { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); white-space:nowrap; }
  .chart-tools,.chart-actions { min-width:0; display:flex; align-items:center; flex-wrap:wrap; justify-content:flex-end; gap:var(--space-2); }
  .chart-heading { min-width:0; }.title-row { display:flex; align-items:center; flex-wrap:wrap; gap:var(--space-1); }
  figcaption { min-width: 0; display: flex; align-items: start; justify-content: space-between; gap: 8px; } h3, p { margin: 0; } h3 { font-size: var(--font-md); } p { margin-top: 2px; color: var(--color-text-muted); font-size: 10px; }
  figcaption button { min-height: 34px; display: inline-flex; align-items: center; gap: 4px; padding: 0 8px; border: 1px solid var(--factor-field-border); border-radius: var(--radius-md); background: var(--factor-field-bg); color: var(--color-text-muted); cursor: pointer; font: inherit; font-size: 10px; }
  .legend { display: flex; flex-wrap: wrap; justify-content:flex-end; gap: 5px 12px; margin: 0; padding: 0; list-style: none; }.legend li { display: inline-flex; align-items: center; gap: 5px; color: var(--color-text-muted); font-size: 10px; white-space:nowrap; }.legend li > span { width: 8px; height: 8px; border-radius: 2px; background: var(--series); }
  .plot { min-width: 0; min-height: 180px; display:flex; flex-direction:column; overflow: hidden; }.state { min-height: 180px; display: grid; place-items: center; align-content: center; gap: 5px; padding: 12px; border: 1px dashed var(--border-primary); border-radius: var(--radius-sm); color: var(--color-text-subtle); text-align: center; }.state strong { color: var(--color-text); font-size: var(--font-sm); }.state span { max-width: 40ch; font-size: 10px; }
  .loader { width: 24px; height: 24px; border: 2px solid var(--border-primary); border-top-color: var(--accent-primary); border-radius: 50%; animation: spin .8s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .loader { animation-duration: 1.8s; } }
  @container chart-frame (max-width: 420px) { figcaption button { width: 36px; padding: 0; justify-content: center; font-size: 0; }.plot { min-height: 150px; } }
</style>
