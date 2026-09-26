<script lang="ts">
  import DataTable from '@/components/DataTable.svelte';
  import SelectField from '@/components/SelectField.svelte';
  import type { SaturationBucket } from './hakuraku-types';
  import { pct,number } from './cm-data';
  let { series, totalRaces, label, small=false }: { series:{name:string;color:string;buckets:SaturationBucket[]}[]; totalRaces:number; label:string; small?:boolean }=$props();
  let hidden=$state<string[]>([]);
  const filtered=$derived(series.filter(s=>!hidden.includes(s.name)).map(s=>({...s,buckets:s.buckets.filter(b=>b.races>=Math.max(1,totalRaces*.01)&&b.entries>0)})));
  let selectedCount=$state('');
  const counts=$derived([...new Set(filtered.flatMap(s=>s.buckets.map(b=>b.x)))].sort((a,b)=>a-b));
  const inspectedCount=$derived(counts.includes(Number(selectedCount))?Number(selectedCount):counts[0]);
  const readout=$derived(filtered.map(s=>({...s,bucket:s.buckets.find(b=>b.x===inspectedCount)})).filter(s=>s.bucket));
  const points=$derived(filtered.flatMap(s=>s.buckets));
  const min=$derived(points.length?Math.min(...points.map(b=>b.x)):1),max=$derived(points.length?Math.max(...points.map(b=>b.x)):2);
  const yMax=$derived(Math.ceil(Math.max(1/9,...points.map(b=>Math.max(b.rate,b.ci[1])))/.05)*.05);
  const x=(n:number)=>42+(n-min)/(max-min||1)*480;
  const y=(n:number)=>178-n/yMax*158;
  function inspect(event:PointerEvent){if(small||!counts.length)return;const rect=(event.currentTarget as SVGSVGElement).getBoundingClientRect();const coordinate=(event.clientX-rect.left)/rect.width*560;selectedCount=String(counts.reduce((nearest,count)=>Math.abs(x(count)-coordinate)<Math.abs(x(nearest)-coordinate)?count:nearest,counts[0]!));}
</script>
<figure aria-label={label} class:small>
  {#if !small}<div class="series-controls" aria-label="Visible running styles">{#each series as item}<button aria-pressed={!hidden.includes(item.name)} onclick={()=>hidden=hidden.includes(item.name)?hidden.filter(name=>name!==item.name):[...hidden,item.name]}><i style:background={item.color}></i>{item.name}</button>{/each}</div>{/if}
  <svg viewBox="0 0 560 228" role="img" aria-label={label} onpointermove={inspect} onpointerdown={inspect}>
    {#if !small&&inspectedCount!==undefined}<line class="cursor" x1={x(inspectedCount)} x2={x(inspectedCount)} y1="20" y2="178"/>{/if}
    {#each [0,.25,.5,.75,1] as tick}<line x1="42" x2="522" y1={y(tick*yMax)} y2={y(tick*yMax)} class="grid"/><text x="36" y={y(tick*yMax)+4} text-anchor="end">{Math.round(tick*yMax*100)}%</text>{/each}
    <line x1="42" x2="522" y1={y(1/9)} y2={y(1/9)} class="baseline"/><text x="526" y={y(1/9)+3}>1/9</text>
    {#each Array.from(new Set(points.map(b=>b.x))).sort((a,b)=>a-b) as count}<text x={x(count)} y="196" text-anchor="middle">{count}</text>{/each}
    {#each filtered as s}
      <polyline points={s.buckets.map(b=>x(b.x)+','+y(b.rate)).join(' ')} stroke={s.color} fill="none" stroke-width="2"/>
      {#each s.buckets as b}{#if !small&&b.x===inspectedCount}<line x1={x(b.x)} x2={x(b.x)} y1={y(b.ci[0])} y2={y(b.ci[1])} stroke={s.color} stroke-width="2"/><line x1={x(b.x)-4} x2={x(b.x)+4} y1={y(b.ci[0])} y2={y(b.ci[0])} stroke={s.color}/><line x1={x(b.x)-4} x2={x(b.x)+4} y1={y(b.ci[1])} y2={y(b.ci[1])} stroke={s.color}/>{/if}<circle cx={x(b.x)} cy={y(b.rate)} r="3.5" fill={s.color}><title>{s.name}: {b.x} in room · {pct(b.rate)} per Uma · {b.races.toLocaleString()} races</title></circle>{/each}
    {/each}
    <text x="282" y="218" text-anchor="middle" class="axis-label">Count in room</text>
  </svg>
  {#if !small&&points.length}<div class="readout"><div class="readout-heading"><SelectField id={label.replaceAll(' ','-')+'-count'} label="Inspect room count" value={String(inspectedCount)} onchange={value=>selectedCount=value} options={counts.map(count=>({value:String(count),label:count+' in room'}))}/><span>Per-Uma win rate<br/>95% confidence interval</span></div><div class="readout-values">{#each readout as row}<div><span><i style:background={row.color}></i>{row.name}</span><strong>{pct(row.bucket!.rate)}</strong><small>{pct(row.bucket!.ci[0],2)}–{pct(row.bucket!.ci[1],2)}</small></div>{/each}</div></div>{/if}
  {#if !points.length}<p>Select a style with enough data to show its results.</p>{/if}
  {#if points.length}<details><summary>Inspect values</summary><DataTable plain compact caption={label+' values'} maxHeight={300} columns={[{key:'name',label:'Style'},{key:'x',label:'In room',numeric:true},{key:'rate',label:'Win rate',numeric:true},{key:'lower',label:'95% interval',numeric:true},{key:'races',label:'Races',numeric:true}]} rows={filtered.flatMap(s=>s.buckets.map(b=>({name:s.name,color:s.color,x:b.x,rate:b.rate,lower:b.ci[0],upper:b.ci[1],races:b.races})))}>
    {#snippet cell(row,column)}{#if column.key==='name'}<i style:background={String(row.color)}></i>{row.name}{:else if column.key==='rate'}{pct(Number(row.rate))}{:else if column.key==='lower'}{pct(Number(row.lower))}–{pct(Number(row.upper))}{:else}{number(Number(row[column.key]))}{/if}{/snippet}
  </DataTable></details>{/if}
</figure>
<style>
figure{margin:0;min-width:0;display:grid;gap:12px}.small{display:block}svg{width:100%;display:block;min-height:180px;max-height:310px}.small svg{min-height:130px}text{fill:var(--text-secondary);font-size:12px;font-family:inherit}.axis-label{font-size:11px}.small text{font-size:10px}.grid{stroke:var(--border-subtle)}.baseline{stroke:var(--text-secondary);stroke-dasharray:4 3}.cursor{stroke:var(--text-secondary);stroke-dasharray:3 4;opacity:.35}
.series-controls{display:flex;flex-wrap:wrap;gap:4px 12px}.series-controls button{display:flex;gap:5px;align-items:center;min-height:28px;border:0;background:none;color:var(--color-text);font:inherit;font-size:11px;cursor:pointer;padding:0}.series-controls [aria-pressed=false]{opacity:.4;text-decoration:line-through}
.readout{padding-top:12px;border-top:1px solid var(--border-subtle)}.readout-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}.readout-heading>:global(.field){width:160px}.readout-heading>span{font-size:10px;color:var(--text-secondary);text-align:right;line-height:1.6}.readout-values{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.readout-values>div{display:grid;gap:3px;font-variant-numeric:tabular-nums}.readout-values span{font-size:10px;color:var(--text-secondary)}.readout-values strong{font-size:19px;font-weight:550;letter-spacing:-.025em}.readout-values small{font-size:9px;color:var(--text-secondary)}
p{text-align:center;color:var(--text-secondary);font-size:12px}summary{padding:6px 0;font-size:11px;color:var(--text-secondary);cursor:pointer}i{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:4px}
</style>


