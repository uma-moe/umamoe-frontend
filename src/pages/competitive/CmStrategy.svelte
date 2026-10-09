<script lang="ts">
  import {virtualScroll,type VirtualRange} from '@/lib/virtual-scroll';
  import DataTable from '@/components/DataTable.svelte';
  import ChartFrame from '@/components/ChartFrame.svelte';
  import SelectField from '@/components/SelectField.svelte';
  import SegmentedControl from '@/components/SegmentedControl.svelte';
  import Artwork from '@/components/Artwork.svelte';
  import Button from '@/components/Button.svelte';
  import type { Summary, Requirement } from './hakuraku-types';
  import { pct,number,styleOrder,styleNames } from './cm-data';
  import { compositionQuery } from './hakuraku-query';
  import { portrait } from './analysis-view';
  import CmSaturationChart from './CmSaturationChart.svelte';
  import CmComposition from './CmComposition.svelte';
  let { data, colors, scope='all', onteams, onstyle }: {data:Summary;colors:Record<number,string>;scope?:string;onteams:(slots:Requirement[])=>void;onstyle?:(style:string)=>void}=$props();
  let saturation=$state('self'),minimum=$state('0.01'),repMin=$state('.01'),metric=$state('team');
  let repDescending=$state(true);
  function orderReps(key:string){repDescending=metric===key?!repDescending:key!=='name';metric=key;}
  let showRates=$state(false),repRanges=$state<Record<number,VirtualRange>>({});
  const representativeStyles=$derived(scope==='all'?[1,2,3,4,5,6]:[Number(scope)]);
  const scopedStyles=$derived(scope==='all'?styleOrder:[Number(scope)]);
  const breakdown=$derived(scopedStyles.map(id=>data.styles.find(s=>s.style===id)).filter(s=>!!s));
  const fieldInsight=$derived([...breakdown].filter(row=>row.owners>=30&&row.pop>0).sort((a,b)=>(b.winShare-b.pop)-(a.winShare-a.pop))[0]);
  const barMax=$derived(Math.max(.01,...breakdown.flatMap(s=>[s.winShare,s.pop])));
  const rows=$derived(data.archetypes.filter(r=>(scope==='all'||r.key.split('-').includes(scope))&&r.owners>=Math.ceil(data.meta.populationOwners*Number(minimum))));
  const colMax=(id:number)=>Math.max(1,data.rooms.average[id-1]??0,...data.rooms.rows.map(r=>r.counts[id-1]??0));
  const cellColor=(id:number,count:number)=>'color-mix(in srgb, '+colors[id]+' '+(count?15+count/colMax(id)*60:0)+'%, transparent)';
</script>
<div class="style-filter"><span>Running style</span><SegmentedControl compact label="Running style" value={scope} onchange={value=>onstyle?.(value)} options={[{value:'all',label:'All styles'},...styleOrder.map(id=>({value:String(id),label:styleNames[id]!}))]}/></div>
<div class="analysis-grid" class:focused={scope!=='all'}>
  <div class="top-panels">
  <section class="style-overview"><ChartFrame plain surface id="cm-style" title={scope==='all'?'Style Breakdown':styleNames[Number(scope)]+' · style overview'} description="Win share and simulated field share.">
    {#snippet titleActions()}{#if scope==='all'}<Button variant="ghost" size="sm" onclick={()=>showRates=!showRates}>{showRates?'Hide rates & players':'Show rates & players'}</Button>{/if}{/snippet}
    <div class="breakdown-key"><span>Running style</span><span><i></i> Field <i class="win-key"></i> Wins</span><span>Win share</span></div>
    <div class="breakdown">{#each breakdown as row}<div class="style-row">
      <h4><i style:background={colors[row.style]}></i>{#if onstyle}<button class="style-link" onclick={()=>onstyle?.(String(row.style))}>{styleNames[row.style]} ↗</button>{:else}{styleNames[row.style]}{/if}</h4>
      <div class="share-tracks"><div class="track"><i style:width={row.pop/barMax*100+'%'} class="muted"></i></div><div class="track"><i style:width={row.winShare/barMax*100+'%'} style:background={colors[row.style]}></i></div></div>
      <div class="share-readout"><strong>{pct(row.winShare)}</strong><small>{pct(row.pop)} field</small></div>
      {#if showRates||scope!=='all'}<dl class="style-facts"><div><dt>Individual win rate</dt><dd>{pct(row.individual)}</dd></div><div><dt>Associated team win rate</dt><dd>{pct(row.team)}</dd></div><div><dt>Distinct players</dt><dd>{number(row.owners)}</dd></div><div><dt>Average per room</dt><dd>{(data.rooms.average[row.style-1]??0).toFixed(2)} / 9</dd></div></dl>{/if}
      {#if scope!=='all'}<p class="scope-interval">95% intervals: individual {pct(row.individualCI[0],2)}–{pct(row.individualCI[1],2)} · team {pct(row.teamCI[0],2)}–{pct(row.teamCI[1],2)}</p>{/if}
    </div>{/each}</div>
    {#if scope==='all'&&fieldInsight&&fieldInsight.winShare>fieldInsight.pop}<p class="field-insight"><i style:background={colors[fieldInsight.style]}></i><span><strong>{styleNames[fieldInsight.style]}</strong> entries account for <strong>{pct(fieldInsight.winShare)}</strong> of wins from <strong>{pct(fieldInsight.pop)}</strong> of the field.<small>+{((fieldInsight.winShare-fieldInsight.pop)*100).toFixed(1)} percentage points · {number(fieldInsight.owners)} players</small></span></p>{/if}
    {#if scope==='6'}<p class="role-note">Debuffers are grouped by Hakuraku’s build classification. Their individual win rate does not measure their effect on teammates.</p>{/if}
  </ChartFrame></section>
  <section class="saturation"><ChartFrame plain surface id="cm-saturation" title="Effects of style saturation" description="Per-Uma win rate by style count in a room. Buckets need at least 1% of races." expandable>
    {#snippet titleActions()}<SegmentedControl compact options={[{value:'self',label:'Same style'},{value:'field',label:'Other styles'}]} bind:value={saturation} label="Saturation view"/>{/snippet}
    {#if saturation==='self'}<CmSaturationChart series={scopedStyles.map(id=>({name:styleNames[id]!,color:colors[id]!,buckets:data.saturation[id]??[]}))} totalRaces={data.meta.populationRaces} label="Per-Uma win rate versus number of the same style"/>
    {:else}<div class="cross">{#each scopedStyles as subject}<div><h4 style:color={colors[subject]}>{styleNames[subject]} win%</h4><CmSaturationChart series={styleOrder.map(id=>({name:styleNames[id]!,color:colors[id]!,buckets:data.fieldSaturation[subject]?.[id]??[]}))} totalRaces={data.meta.populationRaces} label={styleNames[subject]+' win rate versus styles in the field'} small/></div>{/each}</div>{/if}
  </ChartFrame></section>
  </div>
  <div class="composition-panels">
  <section class="rooms"><ChartFrame plain surface id="cm-rooms" title="Room Composition" description={'All simulated rooms · Rooms with pace promotion: '+pct(data.rooms.noDisplayedFront)}>
    <div class="room-average-grid" aria-label="Average room composition">{#each styleOrder as id}<div style:--style-color={colors[id]}><small>{styleNames[id]!.split(' ')[0]}</small><strong>{(data.rooms.average[id-1]??0).toFixed(1)}</strong></div>{/each}<span>Average<br/>per room</span></div>
    <DataTable plain compact caption="Room compositions" fill sortKey="frequency" sortDirection="descending" columns={[...styleOrder.map(id=>({key:String(id),label:styleNames[id]!.split(' ')[0]!,numeric:true})),{key:'frequency',label:'Frequency',numeric:true}]} rows={data.rooms.rows.map(room=>Object.assign({frequency:room.frequency},Object.fromEntries(styleOrder.map(id=>[String(id),room.counts[id-1]??0]))))}>
      {#snippet cell(row,column)}{#if column.key==='frequency'}{pct(Number(row.frequency))}{:else}<span class="room-count" style:background={cellColor(Number(column.key),Number(row[column.key]))}>{row[column.key]||'—'}</span>{/if}{/snippet}
    </DataTable>
  </ChartFrame></section>
  <section class="representatives"><ChartFrame plain surface id="cm-representatives" title="Style Representatives" description="Team% counts wins by any teammate; Uma% counts this runner’s own wins. Select an Uma to inspect its captured builds.">
    {#snippet titleActions()}<SegmentedControl compact options={[{value:'team',label:'Team'},{value:'individual',label:'Personal'},{value:'pop',label:'Most used'}]} bind:value={metric} label="Representative metric"/>{/snippet}
    <div class="rep-filter"><span>Minimum style share</span><SegmentedControl compact label="Minimum style share" bind:value={repMin} options={[{value:'.005',label:'≥0.5%'},{value:'.01',label:'≥1%'},{value:'.02',label:'≥2%'},{value:'0',label:'All'}]}/></div>
    <!-- svelte-ignore a11y_no_noninteractive_tabindex (The bounded list is keyboard scrollable.) -->
    <div class="reps" role="region" aria-label="Running style representatives" tabindex="0">{#each representativeStyles as id}{@const pairs=data.pairs.filter(p=>p.style===id&&p.stylePop>=Number(repMin)).sort((a,b)=>(metric==='name'?a.name.localeCompare(b.name):metric==='players'?a.owners-b.owners:metric==='pop'?a.stylePop-b.stylePop:metric==='team'?a.team-b.team:a.individual-b.individual)*(repDescending?-1:1))}
      {#if pairs.length}<section><h4 style:color={colors[id]}>{styleNames[id]}</h4><div class="rep-columns">{#each [{key:'name',label:'Uma'},{key:'team',label:'Team%'},{key:'individual',label:'Uma%'},{key:'players',label:'Players'}] as column}<button class="rep-sort" onclick={()=>orderReps(column.key)}>{column.label} {metric===column.key?(repDescending?'↓':'↑'):'↕'}</button>{/each}</div><div class="rep-scroll"><div use:virtualScroll={{items:pairs,key:p=>p.key,root:'closest',estimate:36,searchText:p=>p.name+' '+p.outfit,onrange:r=>repRanges[id]=r}}>{#each pairs.slice(repRanges[id]?.start??0,repRanges[id]?.end??0) as pair,index (pair.key)}<button data-virtual-index={(repRanges[id]?.start??0)+index} title={pair.outfit+' · '+pct(pair.stylePop)+' style share'} onclick={()=>onteams([{card:pair.card,chara:pair.chara,style:id},{},{}])}><Artwork src={portrait(pair.card)} alt="" size="xs"/><span>{pair.name}</span><strong>{pct(pair.team)}</strong><strong>{pct(pair.individual)}</strong><small>{number(pair.owners)}</small></button>{/each}</div></div></section>{/if}
    {/each}</div>
    <p class="room-average">Each list scrolls independently · Player counts can overlap between Umas.</p>
  </ChartFrame></section>
  </div>
  <div class="full"><ChartFrame plain surface compact id="cm-compositions" title="Team compositions">
    {#snippet actions()}<div class="composition-filter"><span>Minimum player share</span><SelectField hideLabel id="cm-composition-min" label="Minimum player share" bind:value={minimum} options={[{value:'.005',label:'≥0.5%'},{value:'0.01',label:'≥1%'},{value:'.02',label:'≥2%'},{value:'.05',label:'≥5%'},{value:'0',label:'All'}]}/></div>{/snippet}
    <CmComposition {rows} {colors} onselect={row=>onteams(compositionQuery(row.key))}/>
  </ChartFrame></div>
</div>
<style>
.composition-filter{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--text-secondary)}.composition-filter :global(.field){width:88px}
.style-filter{display:flex;align-items:center;gap:12px;min-width:0;margin-bottom:12px}.style-filter>span,.rep-filter>span{flex:none;font-size:11px;color:var(--text-secondary)}.style-filter>:global(.segments){min-width:0}
.analysis-grid{display:grid;gap:14px;min-width:0}.top-panels{display:grid;grid-template-columns:minmax(0,.85fr) minmax(0,1.15fr);gap:14px;align-items:stretch}.composition-panels{height:clamp(500px,58dvh,680px);display:grid;grid-template-rows:minmax(0,1fr);grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:14px;align-items:stretch}.top-panels>section,.composition-panels>section,.full{min-width:0}.composition-panels>section{min-height:0}.top-panels>section>:global(.chart-frame),.composition-panels>section>:global(.chart-frame){height:100%}
.breakdown{display:grid;gap:0}.breakdown-key,.style-row{display:grid;grid-template-columns:116px minmax(45px,1fr) 68px;gap:12px;align-items:center}.breakdown-key{font-size:10px;color:var(--text-secondary);padding:0 0 10px;border-bottom:1px solid var(--border-subtle)}.breakdown-key>span:last-child{text-align:right}.breakdown-key>span:nth-child(2){display:flex;gap:4px;align-items:center;white-space:nowrap}.breakdown-key i{width:7px;height:3px;background:var(--text-secondary)}.breakdown-key .win-key{background:var(--accent-primary);margin-left:6px}.style-row{padding:7px 0;border-bottom:1px solid var(--border-subtle)}.share-tracks{display:grid;gap:5px}.share-readout{text-align:right}.share-readout strong{font-size:17px;letter-spacing:-.025em;font-weight:600;line-height:1.2}.share-readout small{display:block;font-size:10px;line-height:1.2;color:var(--text-secondary);margin-top:2px}.style-link{font:inherit;color:inherit;cursor:pointer;border:0;background:none;text-align:left;padding:0}.style-link:hover{color:var(--accent-primary)}
.field-insight{display:flex;gap:10px;font-size:11px;line-height:1.6;padding:10px 0 0;margin:4px 0 0}.field-insight>i{width:3px;flex:none;border-radius:2px}.field-insight small{display:block;color:var(--text-secondary);font-size:10px;margin-top:3px}
.style-facts{grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;margin:6px 0;font-size:10px}.style-facts>div{display:flex;justify-content:space-between;gap:8px}.style-facts dt{color:var(--text-secondary)}.style-facts dd{margin:0;font-variant-numeric:tabular-nums}.scope-interval,.role-note{font-size:11px;color:var(--text-secondary);line-height:1.6}.scope-interval{grid-column:1/-1;margin:0}.focused .reps,.focused .cross{grid-template-columns:1fr}.focused .reps{grid-template-rows:minmax(0,1fr)}
h4{margin:0;font-size:11px;font-weight:600;display:flex;gap:8px;align-items:center}h4 i{width:7px;height:7px;border-radius:50%}.track{height:6px;background:var(--surface-2);border-radius:2px;overflow:hidden}.track i{display:block;height:100%}.muted{background:var(--text-secondary);opacity:.35}.cross{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.rooms :global(.plot){gap:8px;min-height:0}.room-average-grid{flex:none}.rooms :global(.table-wrap){min-height:0}.rooms :global(th),.rooms :global(td){padding:3px 5px}.room-count{display:block;min-width:26px;padding:4px 2px;text-align:center;border-radius:3px;font-weight:600}.room-average-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr)) 68px;gap:4px;align-items:center}.room-average-grid>div{display:grid;gap:5px;text-align:center;padding:7px 2px;background:color-mix(in srgb,var(--style-color) 13%,transparent);border-radius:4px}.room-average-grid small{font-size:9px;color:var(--text-secondary)}.room-average-grid strong{font-size:15px;font-variant-numeric:tabular-nums}.room-average-grid>span{font-size:10px;color:var(--text-secondary);text-align:right}
.representatives :global(.plot){min-height:0;overflow:visible}.rep-filter{flex:none;display:flex;align-items:center;justify-content:flex-start;gap:10px;margin-bottom:8px}.rep-filter>:global(.segments){min-width:0}.reps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr));gap:12px 14px;flex:1;min-height:0}.reps>section{display:flex;flex-direction:column;min-width:0;min-height:0}.rep-scroll{flex:1;min-height:0;overflow:auto;scrollbar-gutter:stable;padding-right:8px;scrollbar-width:thin;scrollbar-color:var(--border-secondary) transparent;overscroll-behavior:contain}.rep-scroll::-webkit-scrollbar{width:7px}.rep-scroll::-webkit-scrollbar-thumb{background:var(--border-secondary);border-radius:5px;min-height:28px}.rep-columns{display:grid;grid-template-columns:1fr 42px 42px 38px;gap:5px;margin-bottom:3px;text-align:right;padding-right:15px}.rep-columns .rep-sort{display:block;padding:4px 0;border:0;background:none;color:var(--text-secondary);font:inherit;font-size:9px;min-height:25px;text-align:right;cursor:pointer}.rep-columns .rep-sort:first-child{text-align:left}.rep-columns .rep-sort:hover{color:var(--accent-primary)}
.reps .rep-scroll button{display:grid;grid-template-columns:26px minmax(0,1fr) 42px 42px 38px;align-items:center;gap:5px;width:100%;padding:5px 0;background:transparent;border:0;border-bottom:1px solid var(--border-subtle);color:var(--color-text);font:inherit;font-size:11px;cursor:pointer;text-align:left}.reps .rep-scroll button:hover{background:var(--surface-2)}.reps button>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.reps strong{font-size:11px;font-weight:600;text-align:right;font-variant-numeric:tabular-nums}.reps small{font-size:10px;color:var(--text-secondary);text-align:right}.reps :global(.art){width:26px;height:26px}.room-average{font-size:10px;color:var(--text-secondary);line-height:1.6;margin:8px 0 0}
@container chart-frame (max-width:800px){.reps{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(3,minmax(0,1fr))}.focused .reps{grid-template-columns:1fr;grid-template-rows:minmax(0,1fr)}}
@media(max-width:1000px){.top-panels,.composition-panels{grid-template-columns:1fr}.composition-panels{height:auto}.rooms :global(.table-wrap){flex:none;max-height:440px}.representatives :global(.plot){height:480px}.style-filter{align-items:start}.style-filter>span{display:none}.style-filter>:global(.segments){width:100%}.style-facts{grid-template-columns:1fr 1fr}}
@media(max-width:600px){.composition-filter>span{display:none}.analysis-grid{gap:12px}.breakdown-key,.style-row{grid-template-columns:106px minmax(40px,1fr) 62px;gap:8px}.cross{grid-template-columns:1fr}.reps{grid-template-columns:1fr;grid-template-rows:none;flex:none;gap:16px}.reps>section{height:210px}.representatives :global(.plot){height:auto}.rep-scroll{max-height:none}.rep-filter{flex-wrap:wrap}.reps .rep-scroll button{grid-template-columns:30px minmax(0,1fr) 46px 46px 40px;gap:8px;font-size:12px;padding:6px 0}.rep-columns{grid-template-columns:1fr 46px 46px 40px;gap:8px}.reps :global(.art){width:30px;height:30px}.room-average-grid{grid-template-columns:repeat(6,minmax(0,1fr)) 50px}.room-average-grid small{font-size:8px}}
</style>



