<script lang="ts">
  import type { Snippet } from 'svelte';
  import { virtualScroll, type VirtualRange } from '@/lib/virtual-scroll';
  export interface TableColumn { key: string; label: string; numeric?: boolean; priority?: 'primary' | 'secondary'; sortable?: boolean; sortValue?: (row:Record<string,string|number>)=>string|number; }
  interface Props { caption: string; plain?: boolean; columns: TableColumn[]; rows: Record<string, string | number>[]; emptyMessage?: string; cell?: Snippet<[Record<string, string | number>, TableColumn]>; sortKey?:string; sortDirection?:'ascending'|'descending'; maxHeight?:number; compact?:boolean; onrowclick?:(row:Record<string,string|number>)=>void; expandedRow?:string|number; rowKey?:string; rowDetail?:Snippet<[Record<string,string|number>]>; }
  let { caption, plain = false, columns, rows, emptyMessage = 'No results', cell, sortKey=$bindable(''), sortDirection=$bindable('ascending'), maxHeight, compact=false, onrowclick, expandedRow, rowKey='id', rowDetail }: Props = $props();
  let virtualRange = $state<VirtualRange>({ start: 0, end: 0 });
  let container=$state<HTMLDivElement>();
  const ordered=$derived.by(()=>{
    const column=columns.find(c=>c.key===sortKey);
    if(!column)return rows;
    const value=(row:Record<string,string|number>)=>column.sortValue?.(row)??row[column.key]??'';
    return [...rows].sort((a,b)=>{
      const av=value(a),bv=value(b);
      const an=typeof av==='number'?av:Number(String(av).replace(/[,%#\s]/g,'')),bn=typeof bv==='number'?bv:Number(String(bv).replace(/[,%#\s]/g,''));
      const result=(column.numeric||typeof av==='number')&&Number.isFinite(an)&&Number.isFinite(bn)?an-bn:String(av).localeCompare(String(bv),undefined,{numeric:true,sensitivity:'base'});
      return sortDirection==='ascending'?result:-result;
    });
  });
  const expandedIndex=$derived(rowDetail&&expandedRow!==undefined?ordered.findIndex(row=>row[rowKey]===expandedRow):-1);
  function clickRow(event:MouseEvent,row:Record<string,string|number>){
    if((event.target instanceof Element&&event.target.closest('button,a,input,select,textarea,summary,[role="button"]'))||window.getSelection()?.isCollapsed===false)return;
    onrowclick?.(row);
  }
  function sort(column:TableColumn){
    sortDirection=sortKey===column.key?(sortDirection==='ascending'?'descending':'ascending'):(column.numeric?'descending':'ascending');
    sortKey=column.key;
    if(maxHeight)container?.scrollTo({top:0});
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex (Scrollable tables must be reachable with the keyboard.) -->
<div class="table-wrap" class:plain class:compact class:expandable={!!rowDetail} class:bounded={maxHeight} style:max-height={maxHeight?maxHeight+'px':undefined} bind:this={container} role="region" aria-label={caption+' scroll area'} tabindex={maxHeight?0:undefined}>
  <table aria-rowcount={rows.length+1+(expandedIndex>=0?1:0)}>
    <caption class="sr-only">{caption}</caption>
    <thead><tr>{#each columns as column}<th class:secondary={column.priority === 'secondary'} class:numeric={column.numeric} scope="col" aria-sort={column.sortable===false?undefined:sortKey===column.key?sortDirection:'none'}>{#if column.sortable===false}{column.label}{:else}<button class="sort" onclick={()=>sort(column)}>{column.label}<span aria-hidden="true">{sortKey===column.key?(sortDirection==='ascending'?'↑':'↓'):'↕'}</span></button>{/if}</th>{/each}</tr></thead>
    <tbody use:virtualScroll={{ items: ordered, searchText: row => columns.map(column => row[column.key]).join(' '), estimate: compact?34:48, root:maxHeight?'closest':null, onrange: range => virtualRange = range }}>
      {#each ordered.slice(virtualRange.start, virtualRange.end) as row, index (virtualRange.start + index)}
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions (The cell action button supplies the same keyboard interaction while preserving table semantics.) -->
        <tr class:interactive={!!onrowclick} onclick={onrowclick?event=>clickRow(event,row):undefined} data-virtual-index={virtualRange.start + index} aria-rowindex={virtualRange.start+index+2+(expandedIndex>=0&&expandedIndex<virtualRange.start+index?1:0)}>{#each columns as column}<td class:secondary={column.priority === 'secondary'} class:numeric={column.numeric} data-label={column.label}>{#if cell}{@render cell(row, column)}{:else}{row[column.key]}{/if}</td>{/each}</tr>
        {#if rowDetail&&expandedIndex===virtualRange.start+index}<tr class="detail-row" data-virtual-index={virtualRange.start+index} aria-rowindex={virtualRange.start+index+3}><td colspan={columns.length}><div class="row-detail">{@render rowDetail(row)}</div></td></tr>{/if}
      {/each}
      {#if !rows.length}<tr><td colspan={columns.length} class="empty">{emptyMessage}</td></tr>{/if}
    </tbody>
  </table>
</div>

<style>
  .expandable{container-type:inline-size}
  .table-wrap { max-width: 100%; overflow-x: auto; border: 1px solid var(--color-border); border-radius: var(--radius-md); }
  .bounded{overflow:auto;scrollbar-gutter:stable;overscroll-behavior:contain}
  .compact th,.compact td{padding:4px 8px;line-height:1.3}.compact .sort{min-height:26px}.detail-row>td{padding:0;white-space:normal}.row-detail{position:sticky;left:0;width:100cqw;max-width:100%;}
  .plain { border:0; border-radius:0; }
  .plain table { background:transparent; }
  table { width: 100%; border-collapse: separate; border-spacing:0; background: var(--color-surface-1); font-size: var(--font-sm); }
  th, td { min-height: 44px; padding: 10px var(--space-3); border-bottom: 1px solid var(--color-border); text-align: left; white-space: nowrap; }
  th { position: sticky; top: 0; z-index:2; background: var(--color-surface-2); color: var(--color-text-muted); font-size: var(--font-xs); letter-spacing: .025em; text-transform: uppercase; }
  .sort{display:inline-flex;align-items:center;gap:8px;min-height:28px;padding:0;border:0;background:none;color:inherit;font:inherit;text-transform:inherit;letter-spacing:inherit;cursor:pointer}.sort span{opacity:.5}th[aria-sort=ascending],th[aria-sort=descending]{color:var(--color-accent)}.sort:hover{color:var(--color-text)}.sort:focus-visible{outline:2px solid var(--color-accent);outline-offset:4px}
  tbody tr:last-child td { border-bottom: 0; }
  tbody tr:hover { background: color-mix(in srgb, var(--color-surface-2) 60%, transparent); }
  tr.interactive{cursor:pointer}
  .numeric { text-align: right; font-variant-numeric: tabular-nums; }
  td.empty { padding: var(--space-8); color: var(--color-text-muted); text-align: center; }
  @media (max-width: 520px) { .secondary { display: none; } }
</style>
