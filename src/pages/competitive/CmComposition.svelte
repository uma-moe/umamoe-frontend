<script lang="ts">
  import DataTable from '@/components/DataTable.svelte';
  import type { TeamRate } from './hakuraku-types';
  import { pct,number,styleNames } from './cm-data';
  let { rows, colors, onselect }: {rows:TeamRate[]; colors:Record<number,string>;onselect:(row:TeamRate)=>void}=$props();
  const entries=$derived(rows.map(row=>({key:row.key,name:row.key.split('-').map(id=>styleNames[Number(id)]??id).join(' / '),rate:row.team,lower:row.teamCI[0],upper:row.teamCI[1],owners:row.owners})));
</script>
<div class="composition-table">
<DataTable plain compact caption="Team composition performance" maxHeight={470} sortKey="rate" sortDirection="descending" columns={[{key:'name',label:'Style composition'},{key:'rate',label:'Team win%',numeric:true},{key:'lower',label:'95% confidence interval',numeric:true},{key:'owners',label:'Players',numeric:true}]} rows={entries} emptyMessage="No compositions meet this player threshold.">
  {#snippet cell(row,column)}
    {#if column.key==='name'}<button class="composition" onclick={()=>{const selected=rows.find(r=>r.key===row.key);if(selected)onselect(selected);}}>{#each String(row.key).split('-').map(Number) as id,index}{#if index}<span class="slash">/</span>{/if}<span><i style:background={colors[id]}></i>{styleNames[id]}</span>{/each}<span class="arrow">↗</span></button>
    {:else if column.key==='rate'}<strong>{pct(Number(row.rate))}</strong>
    {:else if column.key==='lower'}<span class="interval-cell"><span class="interval" role="img" aria-label={pct(Number(row.lower),2)+'–'+pct(Number(row.upper),2)+' confidence interval; neutral baseline 33.3%'}><i class="baseline"></i><i class="range" style:left={Number(row.lower)*100+'%'} style:width={(Number(row.upper)-Number(row.lower))*100+'%'}></i><i class="point" style:left={Number(row.rate)*100+'%'}></i></span><small>{pct(Number(row.lower))}–{pct(Number(row.upper))}</small></span>
    {:else}{number(Number(row.owners))}{/if}
  {/snippet}
</DataTable>
<p>Dashed marker: 33.3% neutral team win rate. Select a composition to inspect captured teams.</p>
</div>
<style>
.composition-table{min-width:0}.composition-table :global(table){font-size:11px}.composition-table :global(th){font-size:9px}.composition-table :global(td){padding-block:7px}.composition{display:flex;gap:7px;align-items:center;width:100%;padding:0;border:0;background:none;color:var(--color-text);font:inherit;font-size:11px;text-align:left;cursor:pointer;min-height:26px}.composition>span:not(.slash):not(.arrow){display:flex;align-items:center;gap:5px;white-space:nowrap}.composition i{width:6px;height:6px;border-radius:50%;flex:none}.slash{color:var(--text-secondary);opacity:.5}.arrow{margin-left:auto;color:var(--text-secondary);padding-left:8px}.composition:hover{color:var(--accent-primary)}strong{font-size:17px;letter-spacing:-.03em;font-weight:550}.interval-cell{display:flex;align-items:center;gap:14px}.interval{position:relative;height:22px;display:block;min-width:100px;flex:1;background:linear-gradient(var(--border-subtle),var(--border-subtle)) center/100% 1px no-repeat}.interval i{position:absolute}.baseline{left:33.333%;height:100%;border-left:1px dashed var(--text-secondary);opacity:.5}.range{top:9px;height:4px;background:var(--accent-primary);min-width:1px}.point{top:8px;width:7px;height:7px;border-radius:50%;background:var(--accent-primary);transform:translateX(-50%)}small{font-size:10px;color:var(--text-secondary);min-width:78px}p{font-size:10px;color:var(--text-secondary);margin:14px 0 0;line-height:1.7}
@media(max-width:600px){.composition-table :global(td){padding-inline:8px}.composition{font-size:10px}.interval-cell{gap:8px}.interval{min-width:75px}strong{font-size:15px}}
</style>


