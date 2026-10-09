<script lang="ts">
  import Spinner from '@/components/Spinner.svelte';
  import { onDestroy } from 'svelte';
  import ChartFrame from '@/components/ChartFrame.svelte';
  import SelectField from '@/components/SelectField.svelte';
  import Tabs from '@/components/Tabs.svelte';
  import SegmentedControl from '@/components/SegmentedControl.svelte';
  import Artwork from '@/components/Artwork.svelte';
  import Button from '@/components/Button.svelte';
  import TextField from '@/components/TextField.svelte';
  import type { Summary,Requirement,Contexts } from './hakuraku-types';
  import { cmGet,snapshotPath,pct,number,styleNames,styleOrder } from './cm-data';
  import { compositionQuery } from './hakuraku-query';
  import { portrait } from './analysis-view';
  import {virtualScroll,type VirtualRange} from '@/lib/virtual-scroll';
  import CmFieldExplorer from './CmFieldExplorer.svelte';
  import CmComposition from './CmComposition.svelte';
  import UmaChartPoint from './UmaChartPoint.svelte';
  let {data,colors,onteams,colorblind=false,view=$bindable('overview'),selected=$bindable('')}:{data:Summary;colors:Record<number,string>;colorblind?:boolean;view?:string;selected?:string;onteams:(slots:Requirement[])=>void}=$props();
  let sort=$state('pop'),minPop=$state('3'),hidden=$state<number[]>([]),descending=$state(true),range=$state<VirtualRange>({start:0,end:0});
  let search=$state(''),expanded=$state(false),hovered=$state('');
  let context=$state<Contexts>(),error=$state(''),attempt=$state(0);
  const matching=$derived(data.pairs.filter(p=>(p.name+' '+p.outfit+' '+p.card).toLowerCase().includes(search.trim().toLowerCase())));
  const sorted=$derived([...matching].sort((a,b)=>(sort==='name'?a.name.localeCompare(b.name):sort==='players'?a.owners-b.owners:sort==='pop'?a.pop-b.pop:sort==='team'?a.team-b.team:a.individual-b.individual)*(descending?-1:1)));
  function order(key:string){descending=sort===key?!descending:key!=='name';sort=key;}
  const breakdownRows=$derived(sorted);
  const pair=$derived(data.pairs.find(p=>p.key===selected)??[...data.pairs].sort((a,b)=>b.pop-a.pop)[0]);
  const visible=$derived(matching.filter(p=>p.stylePop*100>=Number(minPop)&&!hidden.includes(p.style)));
  const inspected=$derived(visible.find(p=>p.key===(hovered||pair?.key))??visible.find(p=>p.key===pair?.key)??visible[0]);
  const xMin=$derived(Math.min(1/9,...visible.map(p=>p.individual))*.85),xMax=$derived(Math.max(1/9,...visible.map(p=>p.individual))*1.15);
  const yMin=$derived(Math.min(1/3,...visible.map(p=>p.team))*.85),yMax=$derived(Math.max(1/3,...visible.map(p=>p.team))*1.15);
  const maxPop=$derived(Math.max(.001,...visible.map(p=>p.pop)));
  let chartWidth=$state(620),resizeFrame=0;
  function resizeChart(next:number){if(next<=0||next===chartWidth)return;cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>chartWidth=next);}
  onDestroy(()=>cancelAnimationFrame(resizeFrame));
  const x=(n:number)=>55+(n-xMin)/(xMax-xMin)*(chartWidth-80),y=(n:number)=>345-(n-yMin)/(yMax-yMin)*300;
  $effect(()=>{
    const id=data.snapshotId,key=pair?.key;attempt;context=undefined;error='';
    if(!key)return;
    const controller=new AbortController();
    cmGet<Contexts>(snapshotPath(id,'characters/'+key.replace(':','-')),controller.signal,id).then(value=>{if(!controller.signal.aborted)context=value;}).catch(e=>{if(!controller.signal.aborted)error=e.message;});
    return ()=>controller.abort();
  });
</script>
<div class="uma-views"><Tabs compact label="Uma data display" items={[{id:'overview',label:'Overview'},{id:'field',label:'Running-style table'},{id:'ranking',label:'Performance ranges'}]} bind:value={view} variant="pills"/></div>
<div hidden={view!=='overview'}>
<div class="uma-grid">
  <aside class="roster">  <ChartFrame plain surface id="cm-uma-breakdown" title="Uma Breakdown" description="Select a runner to connect its results, role, and team compositions.">
    {#snippet titleActions()}<SegmentedControl compact label="Uma breakdown ordering" value={sort} onchange={value=>{sort=value;descending=true;}} options={[{value:'pop',label:'Most used'},{value:'winRate',label:'Top win%'}]}/>{/snippet}
    <TextField id="cm-uma-search" type="search" label="Find an Uma" placeholder="Name, outfit, or card ID" prefixIcon="search" bind:value={search}/>
    <div class="row-head"><button onclick={()=>order('name')}>Uma · style {sort==='name'?(descending?'↓':'↑'):'↕'}</button><button onclick={()=>order('winRate')}>Win% {sort==='winRate'?(descending?'↓':'↑'):'↕'}</button><button onclick={()=>order('team')}>Team% {sort==='team'?(descending?'↓':'↑'):'↕'}</button></div>
    <div class="breakdown-scroll"><div class="breakdown-list" use:virtualScroll={{items:breakdownRows,key:p=>p.key,root:'closest',estimate:68,searchText:p=>p.name+' '+p.outfit+' '+styleNames[p.style],onrange:r=>range=r}}>{#each breakdownRows.slice(range.start,range.end) as p,index (p.key)}<button data-virtual-index={range.start+index} class="uma-row" aria-pressed={pair?.key===p.key} class:active={pair?.key===p.key} onclick={()=>selected=p.key}><Artwork src={portrait(p.card)} alt="" size="sm"/><span class="name">{p.name}<small style:color={colors[p.style]??'#69b7ee'}>{styleNames[p.style]} · {p.outfit}</small><small class="player-count">{number(p.owners)} players · {pct(p.pop)} field</small><i class="usage-track"><i style:width={p.pop/maxPop*100+'%'} style:background={colors[p.style]}></i></i></span><strong>{pct(p.individual)}</strong><span class="owners">{pct(p.team)}</span></button>{/each}</div></div>
    {#if !sorted.length}<p>No Umas match this search.</p><Button variant="secondary" size="sm" onclick={()=>search=''}>Clear search</Button>{/if}
  </ChartFrame>
</aside>
  <div class="bubble-panel">
  <ChartFrame plain surface id="cm-uma-bubble" title="Individual vs. team win rate" description="Own win rate (horizontal) · Team win rate (vertical) · Circle size: field share." expandable bind:expanded>
    {#snippet actions()}<div class="bubble-filter"><span aria-hidden="true">Min. style share</span><SelectField hideLabel id="cm-bubble-min" label="Minimum style share" bind:value={minPop} options={[{value:'1',label:'≥1%'},{value:'3',label:'≥3%'},{value:'5',label:'≥5%'},{value:'0',label:'All'}]}/></div>{/snippet}
    <div class="legend">{#each styleOrder as id}<button aria-pressed={!hidden.includes(id)} class:muted={hidden.includes(id)} onclick={()=>hidden=hidden.includes(id)?hidden.filter(x=>x!==id):[...hidden,id]}><i style:background={colors[id]}></i>{styleNames[id]}</button>{/each}</div>
    {#if expanded}<p class="pan-hint">Scroll horizontally to explore the full chart.</p>{/if}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard users need to scroll the expanded chart.) -->
    <div class="chart-scroll" bind:clientWidth={()=>chartWidth,resizeChart} class:expanded tabindex={expanded?0:undefined} role="region" aria-label="Uma chart; scroll horizontally in expanded view">
    {#if visible.length}<svg viewBox={`0 0 ${chartWidth} 410`} class="bubble" role="group" aria-label="Individual versus team win rate. Select an Uma to inspect its data.">
      {#each [0,.25,.5,.75,1] as f}<line x1="50" x2={chartWidth-20} y1={y(yMin+f*(yMax-yMin))} y2={y(yMin+f*(yMax-yMin))} class="grid"/><text x="44" y={y(yMin+f*(yMax-yMin))+4} text-anchor="end">{pct(yMin+f*(yMax-yMin))}</text><text x={x(xMin+f*(xMax-xMin))} y="383" text-anchor="middle">{pct(xMin+f*(xMax-xMin))}</text>{/each}
      <line x1={x(1/9)} x2={x(1/9)} y1="25" y2="365" class="baseline"/><line x1="50" x2={chartWidth-20} y1={y(1/3)} y2={y(1/3)} class="baseline"/>
      <text class="baseline-label" x={x(1/9)+5} y="30">11.1% neutral Uma</text><text class="baseline-label" x={chartWidth-22} y={y(1/3)-7} text-anchor="end">33.3% neutral team</text>
      <text x={chartWidth/2} y="403" text-anchor="middle">Individual win rate</text><text transform="translate(12 195) rotate(-90)" text-anchor="middle">Team win rate</text>
      {#each [...visible].sort((a,b)=>b.pop-a.pop) as p}{@const r=10+17*Math.sqrt(p.pop/maxPop)}
        <UmaChartPoint x={x(p.individual)} y={y(p.team)} {r} image={portrait(p.card)} color={colors[p.style]??'#69b7ee'} selected={pair?.key===p.key} onselect={()=>selected=p.key} onhover={active=>hovered=active?p.key:''} label={'Inspect '+p.name+' '+p.outfit+' '+styleNames[p.style]+': individual '+pct(p.individual)+', team '+pct(p.team)+', corpus share '+pct(p.pop)+', style share '+pct(p.stylePop)+', '+number(p.owners)+' players'}/>
      {/each}
    </svg>{:else}<div class="empty"><strong>No Umas match these chart filters.</strong><Button variant="secondary" size="sm" onclick={()=>{hidden=[];minPop='0';search='';}}>Reset chart filters</Button></div>{/if}
    </div>
    {#if inspected}<section class="inspection" aria-label="Uma chart details"><div class="inspection-heading"><Artwork src={portrait(inspected.card)} alt="" size="sm"/><div><strong>{inspected.name}</strong><small>{inspected.outfit} · <span style:color={colors[inspected.style]}>{styleNames[inspected.style]}</span></small></div><Button variant="secondary" size="sm" onclick={()=>{expanded=false;onteams([{card:inspected.card,chara:inspected.chara,style:inspected.style},{},{}]);}}>Find teams</Button></div><dl><div><dt>Individual win rate</dt><dd>{pct(inspected.individual)}</dd><small>{pct(inspected.individualCI[0])}–{pct(inspected.individualCI[1])} estimate</small></div><div><dt>Team win rate</dt><dd>{pct(inspected.team)}</dd><small>{pct(inspected.teamCI[0])}–{pct(inspected.teamCI[1])} CI</small></div><div><dt>Players</dt><dd>{number(inspected.owners)}</dd><small>{pct(inspected.stylePop)} of this style</small></div><div><dt>Corpus share</dt><dd>{pct(inspected.pop)}</dd><small>{number(inspected.runnerExposures)} entries</small></div></dl></section>{/if}
  </ChartFrame>
  </div>

</div>
<ChartFrame plain surface compact id="cm-synergy" title="Teams with this Uma">
  {#snippet actions()}<SelectField hideLabel id="cm-synergy-uma" label="Uma and style" value={pair?.key??''} onchange={value=>selected=value} options={[...data.pairs].sort((a,b)=>b.owners-a.owners).map(p=>({value:p.key,label:p.name+' · '+p.outfit+' · '+styleNames[p.style]}))}/>{/snippet}
  {#if error}<p role="alert">{error} <Button size="sm" variant="secondary" onclick={()=>attempt++}>Retry</Button></p>{:else if context}<CmComposition rows={context.rows.filter(r=>r.owners>=5)} {colors} onselect={row=>onteams(compositionQuery(row.key,pair))}/>{:else}<Spinner size={40} centered minHeight="clamp(280px, 50dvh, 540px)" label="Loading composition data…"/>{/if}
</ChartFrame>
</div>
{#if view!=='overview'}<CmFieldExplorer {data} {colors} {colorblind} {view} bind:selected onfind={onteams}/>{/if}
<style>
.uma-views{display:flex;min-width:0;margin-bottom:12px}.row-head button{border:0;background:none;color:inherit;font:inherit;text-align:right;cursor:pointer;padding:6px 0;white-space:nowrap}.row-head button:first-child{text-align:left}.row-head button:hover{color:var(--accent-primary)}
.uma-grid{display:grid;grid-template-columns:minmax(0,.85fr) minmax(0,1.15fr);gap:14px;align-items:stretch;margin-bottom:14px}.roster{min-width:0;position:relative;min-height:350px}.roster>:global(.chart-frame){position:absolute;inset:0;height:100%;min-height:0}.roster :global(.plot){min-height:0;overflow:visible}
.row-head{display:grid;grid-template-columns:1fr 45px 45px;gap:8px;font-size:9px;color:var(--text-secondary);padding:4px 0 8px;text-align:right}.breakdown-scroll{flex:1;min-height:0;overflow:auto;scrollbar-gutter:stable;padding-right:8px;scrollbar-width:thin;scrollbar-color:var(--border-secondary) transparent;overscroll-behavior:contain}.breakdown-scroll::-webkit-scrollbar{width:7px}.breakdown-scroll::-webkit-scrollbar-thumb{background:var(--border-secondary);border-radius:5px;min-height:28px}
.uma-row{display:flex;gap:9px;align-items:center;width:100%;border:0;border-bottom:1px solid var(--border-subtle);background:transparent;color:var(--color-text);padding:8px 2px;cursor:pointer;font:inherit;font-size:11px;text-align:left}.uma-row.active,.uma-row:hover{background:var(--cm-tint)}.uma-row.active .name{color:var(--accent-primary)}.uma-row :global(.art){width:34px;height:42px;border:0;background:transparent}.name{flex:1;min-width:0;font-weight:550}.name small{display:block;font-weight:400;font-size:9px;margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.usage-track{display:block;width:100%;height:3px;background:var(--surface-2);margin-top:5px;border-radius:2px;overflow:hidden}.usage-track>i{display:block;height:100%}.name .player-count{font-size:9px;color:var(--text-secondary);margin-top:3px}.uma-row strong{width:38px;text-align:right;font-size:12px;font-weight:550;font-variant-numeric:tabular-nums}.owners{width:38px;text-align:right;font-size:11px;font-variant-numeric:tabular-nums;color:var(--text-secondary)}
.legend{display:flex;gap:6px 12px;flex-wrap:wrap}.legend button{border:0;background:transparent;color:var(--color-text);font:inherit;font-size:10px;display:flex;gap:5px;align-items:center;cursor:pointer;padding:3px 0;min-height:26px}.legend i{width:6px;height:6px;border-radius:50%}.legend .muted{opacity:.3;text-decoration:line-through}
.bubble-panel{display:contents}.bubble-filter{display:flex;align-items:center;gap:8px;min-width:0}.bubble-filter>span{font-size:11px;color:var(--text-secondary);white-space:nowrap}.bubble-filter>:global(.field){width:80px}
.bubble-panel :global(.chart-frame.surface:not(.compact) figcaption){display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:4px 12px;padding-bottom:0;border-bottom:0}
.bubble-panel :global(.chart-heading){display:contents}.bubble-panel :global(.title-row){grid-column:1;grid-row:1;min-height:32px}.bubble-panel :global(.chart-tools){grid-column:2;grid-row:1;flex-wrap:nowrap}
.bubble-panel :global(.chart-frame.surface .chart-heading>p){grid-column:1 / -1;grid-row:2;max-width:none;margin:0;font-size:11px;line-height:1.5}.bubble-panel :global(.chart-tools>.ui-button){min-height:32px;padding-inline:8px;font-size:11px}
@container chart-frame (max-width:520px){.bubble-panel :global(.chart-frame.surface:not(.compact) figcaption){grid-template-columns:minmax(0,1fr)}.bubble-panel :global(.title-row){min-height:0}.bubble-panel :global(.chart-tools){grid-column:1;grid-row:2;justify-content:space-between}.bubble-panel :global(.chart-frame.surface .chart-heading>p){grid-row:3}}
.chart-scroll{overflow:auto;min-width:0}.chart-scroll.expanded .bubble{min-width:620px}.bubble{display:block;width:100%;height:auto;max-height:410px}.bubble .baseline-label{font-size:9px}.bubble text{font-family:inherit;font-size:11px;fill:var(--text-secondary)}.grid{stroke:var(--border-subtle);stroke-opacity:.65}.baseline{stroke:var(--text-secondary);stroke-dasharray:5 4;stroke-opacity:.7}
.inspection{background:var(--cm-tint);padding:14px;border-radius:var(--radius-md)}.inspection-heading{display:flex;gap:12px;align-items:center}.inspection-heading>div{flex:1;min-width:0}.inspection strong{font-size:14px;font-weight:600}.inspection small{display:block;font-size:10px;color:var(--text-secondary);margin-top:5px}.inspection dl{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:14px 0 0}.inspection dt{font-size:10px;color:var(--text-secondary)}.inspection dd{font-size:21px;font-weight:600;letter-spacing:-.04em;font-variant-numeric:tabular-nums;margin:7px 0 0}.inspection dl small{font-size:9px}
.empty{min-height:300px;display:grid;place-content:center;gap:14px;text-align:center;font-size:12px;color:var(--text-secondary)}.pan-hint{display:none}p{font-size:11px;line-height:1.7;color:var(--text-secondary)}
@media(max-width:1300px){.uma-grid{grid-template-columns:minmax(0,.85fr) minmax(0,1.15fr);gap:18px}.inspection dl{grid-template-columns:repeat(4,minmax(0,1fr))}.uma-row :global(.art){width:28px;height:36px}.uma-row{gap:6px}}
@media(max-width:900px){.uma-grid{grid-template-columns:1fr;gap:18px}.roster{position:static;min-height:0;padding:0}.roster>:global(.chart-frame){position:static;height:auto}.breakdown-scroll{flex:none;max-height:min(480px,65dvh)}.inspection dl{grid-template-columns:repeat(4,minmax(0,1fr))}.uma-row :global(.art){width:36px;height:44px}.uma-row{font-size:12px;gap:12px}.uma-row strong,.owners{width:55px}.row-head{grid-template-columns:1fr 55px 55px;gap:12px}}
@media(max-width:600px){.inspection{padding:18px 14px}.inspection dl{grid-template-columns:1fr 1fr}.inspection-heading{flex-wrap:wrap}.inspection dd{font-size:24px}.pan-hint{display:block}.bubble{min-height:240px}}
</style>
