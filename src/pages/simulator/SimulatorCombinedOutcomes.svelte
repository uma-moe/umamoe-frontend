<script lang="ts">
  import Button from '@/components/Button.svelte';
  import ChartFrame from '@/components/ChartFrame.svelte';
  import SelectField from '@/components/SelectField.svelte';
  import StatStrip from '@/components/StatStrip.svelte';
  import LazyEChartsSurface from '@/components/charts/LazyEChartsSurface.svelte';
  import InspectPopover from '@/components/InspectPopover.svelte';
  import Icon from '@/components/Icon.svelte';
  import {theme} from '@/stores/theme';
  import {simulatorFinishDistributions,simulatorHeadToHead,simulatorResults} from './simulator-results';
  import {distributionChart} from './distribution-chart';
  import type {MonteCarloResult} from './simulator-repository';
  import type {SimulatorUma} from './simulator-uma';
  let {result,umas,source=0,comparison=$bindable('auto'),view=$bindable('time'),onselect}:{result:MonteCarloResult;umas:SimulatorUma[];source?:number;sample?:number;comparison?:string;view?:string;onselect:(sample:number)=>void}=$props();
  let expanded=$state(false);
  const metrics=$derived(simulatorResults(result,umas.length));
  const opponent=$derived(comparison==='auto'||Number(comparison)===source||!umas[Number(comparison)]?metrics.find(row=>row.source!==source)!.source:Number(comparison));
  $effect(()=>{if(Number(comparison)===source||comparison!=='auto'&&!umas[Number(comparison)])comparison='auto';});
  const selectedMetric=$derived(metrics.find(row=>row.source===source)!);
  const distribution=$derived(simulatorFinishDistributions(result,umas.length,[source,opponent]));
  const selected=$derived(distribution.runners.find(row=>row.source===source)!);
  const paired=$derived(simulatorHeadToHead(result,source,opponent));
  const colors=$derived($theme==='dark'?['#69b7ee','#e69c72']:['#287caf','#ad622f']);
  const min=$derived(view==='paired'?paired.min:view==='place'?1:distribution.min);
  const max=$derived(view==='paired'?paired.max:view==='place'?umas.length:distribution.max);
  const series=$derived((view==='paired'?[{source,bins:paired.bins,mean:paired.mean}]:view==='place'?[source,opponent].map(index=>({source:index,bins:metrics.find(row=>row.source===index)!.finishes,mean:undefined})):[source,opponent].map(index=>distribution.runners.find(row=>row.source===index)!)).map((row,index)=>({name:umas[row.source]!.name,color:colors[index]!,mean:row.mean,values:row.bins.map(count=>count/result.runs*100)})));
  const option=$derived({...distributionChart(series,min,max,view==='place'?'':'s',$theme==='dark',view==='place'),dataZoom:expanded?[{type:'inside',filterMode:'none'},{type:'slider',bottom:0,height:16}]:[]});
  const title=$derived(view==='place'?'Finish position distribution':view==='paired'?'Head-to-head comparison':'Finish time distribution');
  const description=$derived(view==='paired'?'Paired finish-time differences. Negative values mean '+umas[source]!.name+' finishes faster.':view==='place'?'Share of races finishing in each position.':'Observed finishes across '+result.runs+' races. Lower times are faster.');
  const typical=$derived(selected.samples.reduce((best,next)=>Math.abs(next.time-selected.median)<Math.abs(best.time-selected.median)?next:best));
  const signed=(value:number)=>(value>0?'+':'')+value.toFixed(3);
</script>
<section class="combined" aria-label="Combined finish times">
  <ChartFrame plain surface id="simulator-outcome-distribution" {title} {description} expandable bind:expanded legend={series.map(row=>({label:row.name,color:row.color}))}>
    {#snippet titleActions()}<InspectPopover label="How to read outcomes">{#snippet trigger()}<span class="guide"><Icon name="info" size={16}/></span>{/snippet}<h3>Reading the distribution</h3><p>Curves connect observed bin frequencies. They are not a fitted normal distribution. Dashed lines mark each runner’s mean.</p><p>The middle 80% describes race-to-race spread. Win-rate intervals describe sampling uncertainty. Head-to-head differences pair the runners within the same race.</p></InspectPopover>{/snippet}
    <div class="chart-filters"><SelectField id="outcome-view" label="Distribution" bind:value={view} options={[{value:'time',label:'Finish time'},{value:'place',label:'Placement'},{value:'paired',label:'Head-to-head'}]}/><SelectField id="outcome-opponent" label="Compare against" bind:value={comparison} options={[{value:'auto',label:umas[metrics.find(row=>row.source!==source)!.source]!.name+' (top contender)'},...umas.flatMap((uma,index)=>index===source?[]:[{value:String(index),label:uma.name}])]}/></div>
    <div class="runner-metrics"><StatStrip presentation="inline" label="Selected runner outcomes" items={view==='paired'?[
      {id:'ahead',label:'Finish ahead',value:paired.rate.toFixed(1),unit:'%'},{id:'gap',label:'Mean difference',value:signed(paired.mean),unit:'s'},
      {id:'interval',label:'95% win-rate interval',value:paired.interval[0].toFixed(1)+'–'+paired.interval[1].toFixed(1),unit:'%'}
    ]:[{id:'wins',label:'Win chance',value:selectedMetric.winRate.toFixed(1),unit:'%'},{id:'top3',label:'Top 3',value:selectedMetric.top3.toFixed(1),unit:'%'},{id:'mean',label:'Mean finish',value:selected.mean.toFixed(3),unit:'s'},{id:'place',label:'Average place',value:selectedMetric.place?.toFixed(2)??'—'}]}/></div>
    <LazyEChartsSurface {option} label={title} height={expanded?440:280} zoomable={expanded} dismissTouchTooltip/>
    <div class="chart-note"><span>{view==='paired'?paired.ahead+' / '+result.runs+' races finished ahead · Mean difference '+signed(paired.mean)+' s':view==='place'?'All '+result.runs+' sampled races':'Middle 80%: '+selected.p10.toFixed(3)+'–'+selected.p90.toFixed(3)+' s'}</span>{#if view!=='place'}<span>Dashed line: mean</span>{/if}</div>
    <div class="sample-actions"><span>Watch a sampled race</span>{#each [{label:'Fastest',entry:selected.samples[0]!},{label:'Typical',entry:typical},{label:'Slowest',entry:selected.samples.at(-1)!}] as item}<Button variant="secondary" size="sm" onclick={()=>onselect(item.entry.sample)}>{item.label}<span class="sample-time">{item.entry.time.toFixed(2)} s</span></Button>{/each}</div>
  </ChartFrame>
</section>
<style>
  .combined{min-width:0}.chart-filters{display:grid;grid-template-columns:minmax(140px,.7fr) minmax(180px,1fr);gap:14px;margin-bottom:16px;max-width:570px}.runner-metrics{padding:0 0 14px;border-bottom:1px solid var(--border-subtle);margin-bottom:12px}.chart-note{display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;font-size:11px;line-height:1.5;color:var(--text-secondary);padding:4px 0 14px}.sample-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding-top:14px;border-top:1px solid var(--border-subtle)}.sample-actions>span{font-size:11px;color:var(--text-secondary);margin-right:auto}.sample-time{margin-left:6px;font-size:10px;color:var(--text-secondary)}.guide{display:flex;color:var(--text-secondary)}@media(max-width:600px){.chart-filters{grid-template-columns:1fr;gap:10px}.sample-actions>span{width:100%}.sample-time{display:none}}
</style>
