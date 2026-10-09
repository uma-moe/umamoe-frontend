<script lang="ts">
  import { onMount } from 'svelte';
  import type { ParsedRaceCapture } from '@/lib/race/race-capture-parser';
  import { raceFrameAtTime } from '@/lib/race/race-replay';
  import { diagnosticHorse,modeDuration,lastSpurtResult,runnerHpResult,raceMetricHelp } from '@/lib/race/race-diagnostics';
  import { runningStyleName,formatRaceTime } from '@/lib/race/race-display';
  import { loadSkillCatalog,skillPointTotal,type SkillCatalogEntry } from '@/lib/catalog/skill-catalog';
  import { portrait,stats } from '@/pages/competitive/analysis-view';
  import DataTable from '@/components/DataTable.svelte';
  import Artwork from '@/components/Artwork.svelte';
  import StatStrip from '@/components/StatStrip.svelte';
  import InspectPopover from '@/components/InspectPopover.svelte';
  import Icon from '@/components/Icon.svelte';
  import LastSpurtResult from './LastSpurtResult.svelte';
  let {capture,selectedIndex,oninspect}:{capture:ParsedRaceCapture;selectedIndex?:number;oninspect:(index:number)=>void}=$props();
  let catalog=$state.raw(new Map<number,SkillCatalogEntry>());
  onMount(()=>{void loadSkillCatalog().then(v=>catalog=v).catch(()=>{});});
  const n=(v:unknown,digits=2)=>typeof v==='number'&&Number.isFinite(v)?v.toFixed(digits):'—';
  const rows=$derived([...capture.runners].sort((a,b)=>(a.result?.finishOrder??99)-(b.result?.finishOrder??99)).map((r,place)=>{
    const h=diagnosticHorse(capture,r.index),result=r.result,hpResult=runnerHpResult(capture,r.index);
    const end=result?.finishTimeRaw&&result.finishTimeRaw>0?result.finishTimeRaw:result?.finishTime;
    const exhausted=capture.frames.find(f=>(f.horses[r.index]?.hp??1)<=0);
    const previousRunner=capture.runners.find(other=>other.result?.finishOrder===(result?.finishOrder??0)-1),previous=previousRunner?.result;
    const previousTime=previous?.finishTimeRaw??previous?.finishTime;
    const priorFinish=previousTime===undefined?undefined:raceFrameAtTime(capture.frames,previousTime);
    const recordedGap=priorFinish&&previousRunner?Math.max(0,(priorFinish.horses[previousRunner.index]?.distance??0)-(priorFinish.horses[r.index]?.distance??0)):undefined;
    const spurtResult=lastSpurtResult(capture,r.index),flags=capture.detailed?.annotations.flags;
    return {id:r.index,place:result?.finishOrder??place+1,gate:r.index+1,name:r.name,time:end??'—',gap:h?(h.finishDistanceToPrevious??'—'):(recordedGap??'—'),
      style:runningStyleName(result?.runningStyle),delay:result?.startDelayTime!==undefined?result.startDelayTime*1000:'—',
      late:h?.lostStartAccelerationFrame?'Lost acceleration frame':(result?.startDelayTime??0)>=.08?'Late start':h?'Normal':'',
      spurt:spurtResult.delay??'—',
      hp:hpResult.finish??'—',startHp:hpResult.start??'—',deficit:h?.hpDeficit??'—',exhausted:h?(h.hpExhaustedDistance??'—'):(exhausted?.horses[r.index]?.distance??'—'),
      duel:modeDuration(h,flags,['dueling'])??'—',downhill:modeDuration(h,flags,['downhill'])??'—',downhillLate:h&&flags?[2,3,4].reduce((sum,phase)=>sum+(modeDuration(h,flags,['downhill'],phase)??0),0):'—',
      paceUp:modeDuration(h,flags,['positionKeepSpeedUp','positionKeepOvertake','positionKeepPaceUp','positionKeepPaceUpEx'])??'—',paceDown:modeDuration(h,flags,['positionKeepPaceDown'])??'—',
      loss:h?.worldTransformDistanceLoss??'—',rushed:h?.temptationSpans?.reduce((n,s)=>n+s.endTime-s.startTime,0)??'—',
      blocked:h?.frontBlockSpans?.reduce((n,s)=>n+s.endTime-s.startTime,0)??'—',popularity:h?.popularity??(Number(r.raw.popularity)||'—'),
      sp:skillPointTotal(catalog,r.skillIds)??'—'};
  }));
  const hasModes=$derived(rows.some(row=>typeof row.duel==='number'||typeof row.downhill==='number'||typeof row.paceUp==='number'));
  const hasLoss=$derived(rows.some(row=>typeof row.loss==='number'));
  const hasIncidents=$derived(rows.some(row=>typeof row.blocked==='number'||typeof row.rushed==='number'));
  function inspect(id:number){oninspect(id);}
</script>
<section class="results" aria-label="Detailed race results">
<header><div class="results-title"><h2>Race results</h2><InspectPopover label="Reading race results">{#snippet trigger()}<span class="help"><Icon name="info" size={15}/></span>{/snippet}<h3>Reading race results</h3><p>Compare finish times, the gap to the previous finisher, last-spurt delay, selected speed and remaining HP. Delayed spurts and speed reductions are highlighted. Delay is measured from the first spurt check; a speed reduction compares the selected speed with the full-spurt target. Select a runner to inspect their race below.</p><p>Start delay, build stats and starting HP are shown for each runner. Mode durations, rushing and course loss appear when the capture includes those measurements. Missing measurements are not treated as zero.</p></InspectPopover></div></header>
<div class="results-context"><span>Select one of {capture.runners.length} runners to inspect their race</span>{#if !hasModes&&!hasLoss&&!hasIncidents}<span>Recorded results (additional telemetry requires detailed simulation)</span>{/if}</div>
<DataTable columnHelp={raceMetricHelp} plain compact caption="Race results" {rows} rowKey="id" onrowclick={row=>inspect(Number(row.id))} columns={[
  {key:'place',label:'Finish',numeric:true},{key:'name',label:'Runner'},
  {key:'time',label:'Time / gap',numeric:true},{key:'delay',label:'Start delay',numeric:true},
  {key:'spurt',label:'Spurt delay',numeric:true},{key:'hp',label:'HP result',numeric:true},
  ...(hasModes?[{key:'duel',label:'Race modes (s)',numeric:true,sortable:false}]:[]),
  ...(hasLoss?[{key:'loss',label:'Course loss (m)',numeric:true}]:[]),
  ...(hasIncidents?[{key:'blocked',label:'Incidents (s)',numeric:true,sortable:false}]:[]),
  {key:'sp',label:'Build',numeric:true,sortable:false}
]}>
{#snippet cell(row,col)}{@const r=capture.runners.find(r=>r.index===Number(row.id))!}
  {#if col.key==='name'}<button class="runner-name" class:focused={selectedIndex===r.index} aria-label={'Inspect '+r.name} aria-pressed={selectedIndex===r.index} onclick={()=>inspect(r.index)}><Artwork src={portrait(r.cardId)} alt="" size="xs"/><span><strong>{r.name}</strong><small>Gate {row.gate}, {row.style}</small></span><Icon name="arrow-right" size={14}/></button>
  {:else if col.key==='place'}<strong class="finish" class:winner={row.place===1}>{row.place}</strong>
  {:else if col.key==='time'}<strong class="finish-time">{formatRaceTime(typeof row.time==='number'?row.time:undefined)}</strong><small>{#if row.place===1}Winner{:else if row.gap!=='—'}+{n(row.gap,1)} m<span class="gap-context"> to previous</span>{/if}</small>
  {:else if col.key==='delay'}<span class:warning={row.late==='Late start'||row.late==='Lost acceleration frame'}>{typeof row.delay==='number'?n(row.delay,1)+' ms':'—'}</span>{#if row.late==='Late start'||row.late==='Lost acceleration frame'}<small class="warning">{row.late}</small>{/if}
  {:else if col.key==='spurt'}<LastSpurtResult result={lastSpurtResult(capture,r.index)}/>
  {:else if col.key==='hp'}<span class:warning={typeof row.exhausted==='number'}>{typeof row.exhausted==='number'?'Empty at '+n(row.exhausted,0)+' m':typeof row.hp==='number'?n(row.hp,0)+' HP left':'—'}</span>{#if typeof row.startHp==='number'}<small>Started with {n(row.startHp,0)} HP{#if typeof row.deficit==='number'&&row.deficit>0}, {n(row.deficit,0)} short{/if}</small>{/if}
  {:else if col.key==='duel'}<span class="mode-value"><span>Duel</span><b>{n(row.duel)}</b></span><span class="mode-value" title={'Downhill before late race: '+(typeof row.downhill==='number'&&typeof row.downhillLate==='number'?n(row.downhill-row.downhillLate):'—')+' s'}><span>Downhill</span><b>{n(row.downhill)} <small class="inline">({n(row.downhillLate)} late)</small></b></span><span class="mode-value"><span>Pace ↑ / ↓</span><b>{n(row.paceUp)} / {n(row.paceDown)}</b></span>
  {:else if col.key==='blocked'}<span class="mode-value"><span>Blocked</span><b>{n(row.blocked)}</b></span><span class="mode-value"><span>Rushed</span><b>{n(row.rushed)}</b></span>
  {:else if col.key==='sp'}<div class="build-cell"><div class="result-stats"><StatStrip items={stats(r)} label={r.name+' build stats'} presentation="values" compact/></div><small>{#if typeof row.sp==='number'}{Number(row.sp).toLocaleString()} SP{/if}{#if typeof row.popularity==='number'} (Popularity {row.popularity}){/if}</small></div>
  {:else}{typeof row[col.key]==='number'&&['duel','downhill','loss','blocked','rushed'].includes(col.key)?n(row[col.key]):row[col.key]}{/if}
{/snippet}
</DataTable>
</section>
<style>
.results{--control-height:32px;min-width:0;padding:16px;background:var(--surface-1);border-radius:var(--radius-lg)}header,.results-title{display:flex;align-items:center;gap:8px}header{justify-content:space-between;gap:12px;flex-wrap:wrap}h2{font-size:17px;margin:0}h3{font-size:13px;margin:0}p{font-size:11px;color:var(--text-secondary);line-height:1.6}.help{width:24px;height:24px;display:grid;place-items:center;color:var(--text-secondary)}.results-context{display:flex;justify-content:space-between;gap:6px 16px;flex-wrap:wrap;margin:6px 0 12px;font-size:11px;color:var(--text-secondary)}
.results :global(table){font-size:12px}.results :global(th){font-size:11px;text-transform:none;letter-spacing:0;font-weight:500}.results :global(th),.results :global(td){padding:8px 12px}.results :global(th:first-child),.results :global(td:first-child){width:40px;padding-inline:6px 12px}.results :global(th:nth-child(2)){width:23%}.results :global(.sort){gap:5px}.results :global(tbody tr:has(.runner-name.focused)){background:var(--color-accent-soft)}.results :global(tbody tr:has(.runner-name.focused) td:first-child){box-shadow:inset 2px 0 var(--accent-primary)}
small{display:block;color:var(--text-secondary);font-size:10px;margin-top:3px;line-height:1.4}.runner-name{width:100%;display:flex;align-items:center;gap:8px;border:0;padding:0;background:none;color:var(--text-primary);cursor:pointer;text-align:left;font-size:12px;min-width:180px}.runner-name>span{flex:1}.runner-name strong{display:block;white-space:normal;font-weight:650}.runner-name :global(svg){opacity:0;color:var(--text-secondary);flex:none}.runner-name:hover,.runner-name.focused{color:var(--accent-primary)}.runner-name:hover :global(svg),.runner-name.focused :global(svg){opacity:1}.runner-name:focus-visible{outline:2px solid var(--accent-primary);outline-offset:4px}.finish{font-size:14px;font-weight:600}.finish.winner{color:var(--accent-primary)}.finish-time{font-size:13px;font-weight:600}.warning{color:var(--accent-warning)}
.build-cell{display:inline-grid;gap:2px;min-width:0}.build-cell>small{text-align:right}.result-stats{position:relative;display:inline-grid;grid-template-columns:repeat(5,max-content);gap:8px;align-items:center;text-align:left}.result-stats :global(.stats-container),.result-stats :global(.stats){display:contents}.result-stats :global(.values dd){font-size:11px}.result-stats :global(img){width:12px;height:12px}.mode-value{display:flex;justify-content:space-between;gap:10px;font-size:10px;line-height:1.5}.mode-value>span{color:var(--text-secondary)}.mode-value b{font-weight:500}.inline{display:inline;font-size:9px;margin:0}
@media(max-width:1400px){.result-stats{grid-template-columns:repeat(3,max-content);gap:2px 8px}.results :global(th),.results :global(td){padding-inline:8px}.results :global(th:nth-child(2)){width:auto}}
@media(max-width:800px){.results{padding:12px}.results-context{font-size:10px}.results :global(th),.results :global(td){padding:7px 8px}.runner-name{min-width:130px;gap:6px}.runner-name :global(svg){display:none}.gap-context{display:none}}
</style>
